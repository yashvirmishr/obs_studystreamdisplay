"""Schema tests for the core Phase 4/6 tables.

These tests exercise the SQLAlchemy models directly against a temporary
SQLite file database — no backend server involved. The file DB (not
:memory:) is used so the foreign-key PRAGMA and real disk round-trips are
exercised the same way the production engine behaves.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, delete, event as sa_event, insert, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.database import Base, _configure_sqlite

OCCURRED = datetime(2026, 11, 14, 12, 0, 0, tzinfo=timezone.utc)


def naive_utc(value: datetime) -> datetime:
    """SQLite stores DateTime(timezone=True) values as naive UTC strings."""
    return value.replace(tzinfo=None)


@pytest.fixture()
def engine(tmp_path: Path):
    """File-based SQLite engine with the production pragmas applied."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test_schema.db'}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    # The "connect" event passes (dbapi_connection, connection_record);
    # the production helper now takes both. Pass them straight through.
    sa_event.listen(
        engine, "connect", lambda dbapi_conn, record: _configure_sqlite(dbapi_conn, record)
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def _seed(session: Session) -> dict[str, object]:
    """Insert one row per table wired through real foreign keys."""
    scene = models.Scene(name="Default Scene", is_active=True)
    widget = models.Widget(
        scene=scene,
        widget_type="timer",
        instance_name="Timer Top Left",
        position_x=0.1,
        position_y=0.2,
        width=0.3,
        height=0.4,
        z_index=2,
        config_json=json.dumps({"format": "hh:mm:ss"}),
    )
    integration = models.Integration(
        provider="twitch",
        status="connected",
        account_name="studystream",
        scopes_json=json.dumps(["chat:read"]),
    )
    evt = models.Event(
        event_id="evt-0001",
        event_type="stream.follow",
        source="twitch",
        channel="studystream",
        occurred_at=OCCURRED,
        received_at=OCCURRED,
        payload_json=json.dumps({"username": "viewer1", "platform": "twitch"}),
    )
    rule = models.EventRule(
        event_type="stream.follow",
        min_threshold=1,
        display_text_template="{username} just followed",
        duration_seconds=5,
    )
    subject = models.Subject(name="Mathematics", colour="#7C3AED")
    task = models.Task(subject=subject, title="Chapter 4 exercises")
    study_session = models.StudySession(
        subject=subject,
        task=task,
        state="running",
        started_at=OCCURRED,
        accumulated_seconds=1200,
    )
    history = models.ActivityHistory(
        event=evt,
        kind="follow",
        title="New follower",
        detail="viewer1 followed on Twitch",
        occurred_at=OCCURRED,
    )
    session.add_all(
        [scene, widget, integration, evt, rule, subject, task, study_session, history]
    )
    session.flush()
    return {
        "scene": scene,
        "widget": widget,
        "integration": integration,
        "event": evt,
        "rule": rule,
        "subject": subject,
        "task": task,
        "session": study_session,
        "history": history,
    }


def test_round_trip_all_tables(engine) -> None:
    """Every table stores and returns its row with relationships intact."""
    with Session(engine) as session:
        _seed(session)
        session.commit()

    with Session(engine) as session:
        scene = session.scalars(
            select(models.Scene).where(models.Scene.name == "Default Scene")
        ).one()
        assert scene.is_active is True
        assert len(scene.widgets) == 1
        widget = scene.widgets[0]
        assert widget.widget_type == "timer"
        assert widget.position_x == pytest.approx(0.1)
        assert json.loads(widget.config_json)["format"] == "hh:mm:ss"
        assert isinstance(widget.created_at, datetime)

        integration = session.scalars(select(models.Integration)).one()
        assert integration.provider == "twitch"
        assert integration.status == "connected"
        assert json.loads(integration.scopes_json) == ["chat:read"]
        assert integration.account_name == "studystream"

        evt = session.scalars(
            select(models.Event).where(models.Event.event_id == "evt-0001")
        ).one()
        assert evt.occurred_at == naive_utc(OCCURRED)
        assert evt.received_at == naive_utc(OCCURRED)
        assert evt.is_simulated is False
        assert json.loads(evt.payload_json)["username"] == "viewer1"

        rule = session.scalars(select(models.EventRule)).one()
        assert rule.enabled is True
        assert rule.min_threshold == 1
        assert rule.duration_seconds == 5
        assert rule.sound_enabled is False

        subject = session.scalars(
            select(models.Subject).where(models.Subject.name == "Mathematics")
        ).one()
        assert subject.colour == "#7C3AED"

        task = session.scalars(select(models.Task)).one()
        assert task.subject_id == subject.id
        assert task.done is False

        study_session = session.scalars(select(models.StudySession)).one()
        assert study_session.state == "running"
        assert study_session.accumulated_seconds == 1200
        assert study_session.subject_id == subject.id
        assert study_session.task_id == task.id

        history = session.scalars(select(models.ActivityHistory)).one()
        assert history.event_id == evt.id
        assert history.kind == "follow"


def test_scene_delete_cascades_widgets(engine) -> None:
    """Deleting a scene removes its widgets at the DB level (ON DELETE CASCADE)."""
    with Session(engine) as session:
        _seed(session)
        session.commit()

    # Raw SQL delete exercises the DB-level FK action, not just ORM cascade.
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM scenes"))

    with engine.begin() as conn:
        widget_count = conn.execute(
            text("SELECT COUNT(*) FROM widgets")
        ).scalar_one()
        scene_count = conn.execute(text("SELECT COUNT(*) FROM scenes")).scalar_one()
    assert scene_count == 0
    assert widget_count == 0


def test_subject_delete_sets_task_subject_null(engine) -> None:
    """Deleting a subject keeps its task with subject_id NULL (ON DELETE SET NULL)."""
    with Session(engine) as session:
        rows = _seed(session)
        subject_id = rows["subject"].id
        session.commit()

    with engine.begin() as conn:
        conn.execute(delete(models.Subject).where(models.Subject.id == subject_id))

    with Session(engine) as session:
        task = session.scalars(select(models.Task)).one()
        assert task.subject_id is None


def test_unique_constraints_enforced(engine) -> None:
    """Duplicate scene names, providers, event_ids and rule types are rejected."""
    with pytest.raises(IntegrityError):
        with Session(engine) as session:
            session.add(models.Scene(name="Default Scene"))
            session.add(models.Scene(name="Default Scene"))
            session.commit()

    with pytest.raises(IntegrityError):
        with Session(engine) as session:
            session.add(models.Integration(provider="twitch"))
            session.add(models.Integration(provider="twitch"))
            session.commit()

    with pytest.raises(IntegrityError):
        with Session(engine) as session:
            session.add(
                models.Event(
                    event_id="dup",
                    event_type="stream.follow",
                    source="twitch",
                    occurred_at=OCCURRED,
                    received_at=OCCURRED,
                    payload_json="{}",
                )
            )
            session.add(
                models.Event(
                    event_id="dup",
                    event_type="stream.follow",
                    source="twitch",
                    occurred_at=OCCURRED,
                    received_at=OCCURRED,
                    payload_json="{}",
                )
            )
            session.commit()

    with pytest.raises(IntegrityError):
        with Session(engine) as session:
            session.add(models.EventRule(event_type="stream.follow"))
            session.add(models.EventRule(event_type="stream.follow"))
            session.commit()


def test_widget_geometry_check_constraints(engine) -> None:
    """Widget normalised geometry outside 0..1 is rejected (ARCHITECTURE invariant 5)."""
    with pytest.raises(IntegrityError):
        with Session(engine) as session:
            scene = models.Scene(name="Bad Widget Scene")
            session.add(scene)
            session.flush()
            conn = session.connection()
            conn.execute(
                insert(models.Widget.__table__).values(
                    scene_id=scene.id,
                    widget_type="timer",
                    instance_name="Out of range",
                    position_x=1.5,
                    position_y=0.0,
                    width=0.25,
                    height=0.25,
                )
            )
            session.commit()
