"""API contract tests for the live endpoints (study, events, settings, scenes).

All requests authenticate with the launch token from conftest. Tests
run against a throwaway SQLite database (see conftest.py).
"""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import TEST_TOKEN

AUTH = {"x-auth-token": TEST_TOKEN}
BAD = {"x-auth-token": "definitely-wrong"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _wipe_active_sessions():
    from app.study.service import delete_all_sessions

    delete_all_sessions()


def test_unauthenticated_requests_rejected(client: TestClient):
    assert client.get("/api/v1/study/state").status_code == 401
    assert client.get("/api/v1/activity/recent").status_code == 401
    assert client.post("/api/v1/study/start", json={}).status_code == 401


def test_study_full_lifecycle(client: TestClient):
    _wipe_active_sessions()

    # Start
    r = client.post("/api/v1/study/start", json={"subject": "Linear Algebra II", "task": "Eigenvectors"}, headers=AUTH)
    assert r.status_code == 201, r.text
    state = r.json()
    assert state["state"] == "running"
    assert state["subject"] == "Linear Algebra II"
    assert state["elapsed_seconds"] >= 0

    # Second start must conflict
    assert client.post("/api/v1/study/start", json={}, headers=AUTH).status_code == 409

    # Pause freezes elapsed
    time.sleep(1.1)
    r = client.post("/api/v1/study/pause", headers=AUTH)
    assert r.status_code == 200
    paused_elapsed = r.json()["elapsed_seconds"]
    time.sleep(1.1)
    r2 = client.get("/api/v1/study/state", headers=AUTH)
    assert r2.json()["elapsed_seconds"] == paused_elapsed

    # Resume then stop
    assert client.post("/api/v1/study/resume", headers=AUTH).json()["state"] == "running"
    r = client.post("/api/v1/study/stop", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["state"] == "idle"

    # Stop again must conflict (nothing active)
    assert client.post("/api/v1/study/stop", headers=AUTH).status_code == 409

    # History retains the completed session
    history = client.get("/api/v1/study/history", headers=AUTH).json()
    assert len(history) >= 1
    assert history[0]["subject"] == "Linear Algebra II"
    assert history[0]["seconds"] > 0

    # Today's total includes at least the seconds we just studied
    state = client.get("/api/v1/study/state", headers=AUTH).json()
    assert state["today_total_seconds"] >= history[0]["seconds"]

    # Regression: elapsed survives service re-import (persistence)
    from app.study import service as svc
    from app.database import SessionLocal

    _wipe_active_sessions()
    client.post("/api/v1/study/start", json={"subject": "Regression"}, headers=AUTH)
    time.sleep(1.1)
    with SessionLocal() as db:
        snapshot = svc.state_payload(db)
    assert snapshot["state"] == "running"
    assert snapshot["elapsed_seconds"] >= 1
    _wipe_active_sessions()


def test_pause_when_idle_conflicts(client: TestClient):
    _wipe_active_sessions()
    assert client.post("/api/v1/study/pause", headers=AUTH).status_code == 409
    assert client.post("/api/v1/study/resume", headers=AUTH).status_code == 409


def test_scenes_list_seeded(client: TestClient):
    """GET /api/v1/scenes returns the seeded Study + Please Wait rows."""
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.models import Scene
    from sqlalchemy import select

    with SessionLocal() as db:
        existing = {r.name for r in db.scalars(select(Scene)).all()}
        now = datetime.now(timezone.utc)
        for name in ("Study", "Please Wait"):
            if name not in existing:
                db.add(Scene(name=name, is_active=name == "Study", created_at=now, updated_at=now))
        db.commit()

    r = client.get("/api/v1/scenes", headers=AUTH)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()["scenes"]]
    assert "Study" in names and "Please Wait" in names
    assert all("is_active" in s and "canvas_width" in s for s in r.json()["scenes"])


def test_test_event_lifecycle(client: TestClient):
    r = client.post(
        "/api/v1/events/test",
        json={"type": "stream.follow", "username": "deep_test_viewer"},
        headers=AUTH,
    )
    assert r.status_code == 201, r.text
    event = r.json()
    assert event["is_simulated"] is True
    assert event["event_type"] == "stream.follow"
    assert event["source"] == "test"

    feed = client.get("/api/v1/activity/recent", headers=AUTH).json()
    assert any(e["event_id"] == event["event_id"] for e in feed)


def test_test_event_validation(client: TestClient):
    assert client.post(
        "/api/v1/events/test",
        json={"type": "not_a_type", "username": "x"},
        headers=AUTH,
    ).status_code == 422
    assert client.post(
        "/api/v1/events/test",
        json={"type": "stream.follow", "username": ""},
        headers=AUTH,
    ).status_code == 422


def test_settings_allowlist(client: TestClient):
    r = client.put("/api/v1/settings", json={"values": {"study_goal_hours": 4}}, headers=AUTH)
    assert r.json()["study_goal_hours"] == 4
    r = client.get("/api/v1/settings", params={"keys": "study_goal_hours"}, headers=AUTH)
    assert r.json()["study_goal_hours"] == 4
    assert client.put(
        "/api/v1/settings", json={"values": {"secret_thing": "nope"}}, headers=AUTH
    ).status_code == 422


def test_settings_null_clears_preference(client: TestClient):
    """PUT null removes the row so readers fall back to backend defaults."""
    key = "enabled_widgets"
    client.put("/api/v1/settings", json={"values": {key: ["study_timer", "clock"]}}, headers=AUTH)
    saved = client.get("/api/v1/settings", params={"keys": key}, headers=AUTH).json()
    assert saved[key] == ["study_timer", "clock"]

    r = client.put("/api/v1/settings", json={"values": {key: None}}, headers=AUTH)
    assert r.status_code == 200 and r.json()[key] is None
    cleared = client.get("/api/v1/settings", params={"keys": key}, headers=AUTH).json()
    assert cleared[key] is None


def test_today_total_excludes_other_days(client: TestClient):
    """C8: the today predicate filters in SQL — a completed session created
    yesterday must not inflate today's total (index range scan, no full scan)."""
    from datetime import timedelta

    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import StudySession
    from app.study.service import today_total_seconds, utc_now

    now = utc_now()
    with SessionLocal() as db:
        before = today_total_seconds(db, now)

        # Yesterday's completed hour — must be invisible to today's total.
        db.add(
            StudySession(
                state="completed",
                accumulated_seconds=3600,
                started_at=now - timedelta(days=1),
                ended_at=now - timedelta(days=1) + timedelta(seconds=3600),
                created_at=now - timedelta(days=1),
                updated_at=now - timedelta(days=1),
            )
        )
        db.commit()
        assert today_total_seconds(db, now) == before  # SQL predicate excluded it

        # Today's completed 20 minutes — must count in full.
        db.add(
            StudySession(
                state="completed",
                accumulated_seconds=1200,
                started_at=now - timedelta(seconds=1200),
                ended_at=now,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()
        assert today_total_seconds(db, now) == before + 1200

    # Re-query via the endpoint path (state payload uses the same helper).
    state = client.get("/api/v1/study/state", headers=AUTH).json()
    assert state["today_total_seconds"] >= 1200

    # Clean up the inserted rows so later tests see a stable DB.
    with SessionLocal() as db:
        for row in db.scalars(
            select(StudySession).where(
                StudySession.accumulated_seconds.in_((1200, 3600))
            )
        ).all():
            db.delete(row)
        db.commit()


def test_layout_roundtrip(client: TestClient):
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.models import Scene
    from sqlalchemy import select

    with SessionLocal() as db:
        if db.scalars(select(Scene).where(Scene.name == "Study")).first() is None:
            now = datetime.now(timezone.utc)
            db.add(Scene(name="Study", is_active=True, created_at=now, updated_at=now))
        if db.scalars(select(Scene).where(Scene.name == "Please Wait")).first() is None:
            now = datetime.now(timezone.utc)
            db.add(Scene(name="Please Wait", is_active=False, created_at=now, updated_at=now))
        db.commit()

    # Default: no placements saved yet -> null
    r = client.get("/api/v1/scenes/Study/layout", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["placements"] is None

    placement = {
        "instance_name": "w-timer",
        "widget_type": "study_timer",
        "position_x": 0.1,
        "position_y": 0.2,
        "width": 0.3,
        "height": 0.15,
        "z_index": 5,
        "visible": True,
        "locked": False,
        "opacity": 0.8,
        "label": "Study Timer",
        "variant": "timer",
    }
    r = client.put("/api/v1/scenes/Study/layout", json={"placements": [placement]}, headers=AUTH)
    assert r.status_code == 200, r.text
    saved = r.json()["placements"]
    assert len(saved) == 1
    assert saved[0]["opacity"] == pytest.approx(0.8)

    r = client.get("/api/v1/scenes/Study/layout", headers=AUTH)
    got = r.json()["placements"]
    assert got and got[0]["instance_name"] == "w-timer"

    # Edge values round-trip with type fidelity (REAL stays REAL, not TEXT)
    edge = {
        **placement,
        "instance_name": "w-edge",
        "position_x": 0.0,
        "position_y": 0.0,
        "width": 1.0,
        "height": 1.0,
        "z_index": 999,
        "opacity": 0.35,
        "locked": True,
        "visible": False,
    }
    r = client.put("/api/v1/scenes/Study/layout", json={"placements": [edge]}, headers=AUTH)
    assert r.status_code == 200
    ew = r.json()["placements"][0]
    assert ew["position_x"] == 0.0 and ew["width"] == 1.0 and ew["position_y"] == 0.0 and ew["height"] == 1.0
    assert ew["z_index"] == 999 and ew["opacity"] == pytest.approx(0.35)
    assert ew["locked"] is True and ew["visible"] is False

    # Out-of-range geometry is clamped, not corrupted
    placement2 = {**placement, "position_x": 0.95, "position_y": 0.95, "width": 0.5, "height": 0.5}
    r = client.put("/api/v1/scenes/Study/layout", json={"placements": [placement2]}, headers=AUTH)
    clamped = r.json()["placements"][0]
    assert clamped["position_x"] + clamped["width"] <= 1.0 + 1e-9
    assert clamped["position_y"] + clamped["height"] <= 1.0 + 1e-9

    # Geometry outside the schema is rejected, not silently accepted
    bad = {**placement, "width": 1.5}
    r = client.put("/api/v1/scenes/Study/layout", json={"placements": [bad]}, headers=AUTH)
    assert r.status_code == 422

    assert client.get("/api/v1/scenes/NoSuchScene/layout", headers=AUTH).status_code == 404
