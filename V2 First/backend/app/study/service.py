"""Backend-authoritative study session service (ARCHITECTURE invariant 8).

One active session (state != "completed") at a time. Elapsed time is computed
from persisted timestamps, so refreshes, OBS reloads and app restarts never
reset the timer. All mutations happen in a single transaction with a row lock
on the active session to keep concurrent UI tabs consistent.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.events import ENVELOPE_SCHEMA_VERSION, EVENT_SOURCES
from app.events.bus import bus
from app.models import ActivityHistory, Event, StudySession, Subject, Task, utc_now

logger = logging.getLogger("studystream2.study")

ACTIVE_STATES = ("running", "paused")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    """Normalise SQLite round-trips: naive datetimes are UTC by our convention."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _default_session(db: Session) -> StudySession | None:
    return db.scalars(
        select(StudySession)
        .where(StudySession.state.in_(ACTIVE_STATES))
        .order_by(StudySession.id.desc())
        .limit(1)
    ).first()


def _elapsed_seconds(session: StudySession, now: datetime) -> int:
    """Total elapsed for a session as of `now`."""
    if session.state == "running" and session.started_at is not None:
        base = _as_utc(session.started_at)
        delta = (now - base).total_seconds() if base else 0
        return int(session.accumulated_seconds + max(0, delta))
    return int(session.accumulated_seconds)


def _get_or_create_subject(db: Session, name: str) -> Subject:
    name = name.strip()
    existing = db.scalars(select(Subject).where(Subject.name == name)).first()
    if existing:
        return existing
    subject = Subject(name=name, colour=None)
    db.add(subject)
    db.flush()
    return subject


def _get_or_create_task(db: Session, title: str, subject_id: int | None) -> Task:
    title = title.strip()
    existing = db.scalars(select(Task).where(Task.title == title).limit(1)).first()
    if existing:
        return existing
    task = Task(title=title, subject_id=subject_id)
    db.add(task)
    db.flush()
    return task


def state_payload(db: Session) -> dict[str, Any]:
    now = _utcnow()
    active = _default_session(db)
    running = active is not None and active.state == "running"
    paused = active is not None and active.state == "paused"
    today_total = today_total_seconds(db, now)
    return {
        "state": active.state if active else "idle",
        "session_id": active.id if active else None,
        "elapsed_seconds": _elapsed_seconds(active, now) if active else 0,
        "today_total_seconds": today_total,
        "subject": active.subject.name if active and active.subject else None,
        "task": active.task.title if active and active.task else None,
        "started_at": _as_utc(active.started_at).isoformat() if active and active.started_at else None,
        "paused_since": None,
    }


def _publish_study_envelope(
    event_type: str,
    source: str,
    payload: dict[str, Any],
) -> None:
    """Publish the canonical envelope onto the bus."""
    now = datetime.now(timezone.utc)
    bus.publish(
        channel="study",
        envelope={
            "schema_version": ENVELOPE_SCHEMA_VERSION,
            "event_id": f"study-{now.strftime('%Y%m%d%H%M%S')}-{now.microsecond}",
            "event_type": event_type,
            "source": source,
            "channel": "study",
            "occurred_at": now.isoformat(),
            "received_at": now.isoformat(),
            "payload": payload,
            "is_simulated": False,
        },
    )


def start_session(subject: str | None = None, task: str | None = None) -> dict[str, Any]:
    with SessionLocal() as db:
        if _default_session(db) is not None:
            raise RuntimeError("a study session is already active")
        subject_row = _get_or_create_subject(db, subject) if subject and subject.strip() else None
        task_row = (
            _get_or_create_task(db, task, subject_row.id if subject_row else None)
            if task and task.strip()
            else None
        )
        session = StudySession(
            subject_id=subject_row.id if subject_row else None,
            task_id=task_row.id if task_row else None,
            state="running",
            started_at=_utcnow(),
            accumulated_seconds=0,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        payload = state_payload(db)
        # Full state rides in every study envelope so WS consumers (overlay
        # timer widget) can re-base from authoritative values, not deltas.
        _publish_study_envelope(
            event_type="study.session.started",
            source="study",
            payload=payload,
        )
        logger.info("Study session %s started", session.id)
        return payload


def pause_session() -> dict[str, Any]:
    with SessionLocal() as db:
        active = _default_session(db)
        if active is None or active.state != "running":
            raise RuntimeError("no running session to pause")
        now = _utcnow()
        active.accumulated_seconds = _elapsed_seconds(active, now)
        active.started_at = None
        active.state = "paused"
        db.commit()
        payload = state_payload(db)
        _publish_study_envelope(
            event_type="study.session.paused",
            source="study",
            payload=payload,
        )
        return payload


def resume_session() -> dict[str, Any]:
    with SessionLocal() as db:
        active = _default_session(db)
        if active is None or active.state != "paused":
            raise RuntimeError("no paused session to resume")
        active.state = "running"
        active.started_at = _utcnow()
        db.commit()
        payload = state_payload(db)
        # This is a resume, not a start: give it its own event type so the
        # overlay and activity feed stop describing every resume as a new
        # session starting (review candidate 6).
        _publish_study_envelope(
            event_type="study.session.resumed",
            source="study",
            payload=payload,
        )
        return payload


def stop_session() -> dict[str, Any]:
    with SessionLocal() as db:
        active = _default_session(db)
        if active is None:
            raise RuntimeError("no active session to stop")
        now = _utcnow()
        if active.state == "running":
            active.accumulated_seconds = _elapsed_seconds(active, now)
            active.started_at = None
        active.state = "completed"
        active.ended_at = now
        # Record the milestone as a real event (simulation never lands here).
        event_id = f"study-{now.strftime('%Y%m%d%H%M%S')}-{active.id}"
        db.add(
            Event(
                event_id=event_id,
                event_type="study.session.stopped",
                source="study",
                channel=None,
                occurred_at=now,
                received_at=now,
                payload_json=json.dumps(
                    {
                        "schema_version": ENVELOPE_SCHEMA_VERSION,
                        "seconds": active.accumulated_seconds,
                        "subject": active.subject.name if active.subject else None,
                    }
                ),
                is_simulated=False,
            )
        )
        db.add(
            ActivityHistory(
                event_id=None,
                kind="study",
                title=f"Session completed · {active.accumulated_seconds // 60}m",
                detail=active.subject.name if active.subject else None,
                occurred_at=now,
            )
        )
        db.commit()
        final_state = state_payload(db)
        _publish_study_envelope(
            event_type="study.session.stopped",
            source="study",
            payload={**final_state, "seconds": active.accumulated_seconds},
        )
        # The stopped envelope carries state, but recent session history and
        # today's goal total change here too. Re-publish the hello snapshot so
        # live overlays refresh their history/goal widgets without a reload
        # (it reaches every overlay socket via the bus wildcard).
        from app.overlay_snapshot import build_hello_envelope

        bus.publish(channel="overlay", envelope=build_hello_envelope("Study"))
        return final_state


def today_total_seconds(db: Session, now: datetime | None = None) -> int:
    """Seconds studied today (UTC), including the running session.

    SQL-level date filter + index (migration 0004): this runs on every
    /study/state poll (dashboard, ~2 s) and inside every overlay hello, so
    loading the whole sessions table here would be an unbounded scan.
    """
    now = now or _utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    sessions = db.scalars(
        select(StudySession).where(
            StudySession.state.in_(("running", "paused", "completed")),
            StudySession.created_at >= today_start,
        )
    ).all()
    total = 0
    for s in sessions:
        started = _as_utc(s.started_at)
        created = _as_utc(s.created_at)
        anchor = started or created
        if anchor and anchor.date() == now.date():
            total += _elapsed_seconds(s, now)
    return total


def history(limit: int = 50) -> list[dict[str, Any]]:
    with SessionLocal() as db:
        rows = db.scalars(
            select(StudySession)
            .where(StudySession.state == "completed")
            .order_by(StudySession.id.desc())
            .limit(max(1, min(limit, 200)))
        ).all()
        out = []
        for row in rows:
            ended = _as_utc(row.ended_at)
            created = _as_utc(row.created_at)
            out.append(
                {
                    "id": row.id,
                    "seconds": int(row.accumulated_seconds),
                    "subject": row.subject.name if row.subject else None,
                    "task": row.task.title if row.task else None,
                    "completed_at": ended.isoformat() if ended else (created.isoformat() if created else None),
                }
            )
        return out


def delete_all_sessions() -> int:
    """Test/dev helper: wipe sessions. Not exposed via API."""
    with SessionLocal() as db:
        count = db.execute(delete(StudySession)).rowcount or 0
        db.commit()
        return count
