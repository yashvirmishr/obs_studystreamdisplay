"""Event bus + overlay WebSocket contract tests."""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.events.bus import bus, MAX_QUEUE
from app.main import app
from tests.conftest import TEST_TOKEN
from app.database import SessionLocal
from sqlalchemy import select
from app.models import Scene
from datetime import datetime, timezone

AUTH = {"x-auth-token": TEST_TOKEN}


@pytest.fixture(autouse=True)
def _seed_study_scene():
    """The overlay socket resolves the scene name against SQLite."""
    with SessionLocal() as db:
        if db.scalars(select(Scene).where(Scene.name == "Study")).first() is None:
            now = datetime.now(timezone.utc)
            db.add(Scene(name="Study", is_active=True, created_at=now, updated_at=now))
        db.commit()


def test_bus_publish_subscribe():
    q = bus.subscribe("study")
    try:
        delivered = bus.publish("study", {"schema_version": 1, "event_id": "b1", "event_type": "study.session.started", "source": "test", "channel": "study", "occurred_at": "t", "received_at": "t", "payload": {}, "is_simulated": False})
        assert delivered == 1
        envelope = asyncio.run(asyncio.wait_for(q.get(), timeout=1))
        assert envelope["event_id"] == "b1"
    finally:
        bus.unsubscribe("study", q)


def test_bus_wildcard_subscriber():
    q = bus.subscribe("*")
    try:
        delivered = bus.publish("events", {"schema_version": 1, "event_id": "b2", "event_type": "stream.follow", "source": "test", "channel": "events", "occurred_at": "t", "received_at": "t", "payload": {}, "is_simulated": True})
        assert delivered >= 1
        got = asyncio.run(asyncio.wait_for(q.get(), timeout=1))
        assert got["event_id"] == "b2"
    finally:
        bus.unsubscribe("*", q)


def test_bus_unsubscribe_stops_delivery():
    q = bus.subscribe("study")
    bus.unsubscribe("study", q)
    delivered = bus.publish("study", {"schema_version": 1, "event_id": "b3", "event_type": "study.session.started", "source": "test", "channel": "study", "occurred_at": "t", "received_at": "t", "payload": {}, "is_simulated": False})
    assert delivered == 0


def test_overlay_ws_rejects_missing_token():
    with TestClient(app) as client:
        with pytest.raises(Exception):
            with client.websocket_connect("/ws/overlay/Study") as ws:
                ws.receive_text()


def test_overlay_ws_rejects_unknown_scene():
    with TestClient(app) as client:
        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws/overlay/NoSuchScene?token={TEST_TOKEN}") as ws:
                ws.receive_text()


def test_overlay_ws_receives_test_event():
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/overlay/Study?token={TEST_TOKEN}") as ws:
            # Bootstrap frames arrive on connect: hello snapshot, then layout.
            hello = json.loads(ws.receive_text())
            assert hello["event_type"] == "overlay.hello"
            assert "study" in hello["payload"]
            layout = json.loads(ws.receive_text())
            assert layout["event_type"] == "overlay.layout"

            r = client.post(
                "/api/v1/events/test",
                json={"type": "stream.follow", "username": "bus_roundtrip"},
                headers=AUTH,
            )
            assert r.status_code == 201
            envelope = json.loads(ws.receive_text())
            assert envelope["event_type"] == "stream.follow"
            assert envelope["payload"]["username"] == "bus_roundtrip"
            assert envelope["is_simulated"] is True


def test_overlay_hello_carries_real_state():
    """Hello snapshot must contain live study state — never mock values."""
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/overlay/Study?token={TEST_TOKEN}") as ws:
            hello = json.loads(ws.receive_text())
            payload = hello["payload"]
            assert payload["scene"] == "Study"
            assert payload["study"]["state"] == "idle"
            assert payload["study"]["elapsed_seconds"] == 0
            assert payload["recent_events"] == [] or isinstance(payload["recent_events"], list)
            assert payload["recent_sessions"] == [] or isinstance(payload["recent_sessions"], list)
            # Goal may be unset (None) or a configured int — never a default
            # invented by the backend.
            assert payload["goal"]["study_goal_hours"] is None or isinstance(
                payload["goal"]["study_goal_hours"], int
            )
            # Global widget enablement: None (default, all enabled) or an
            # explicit registry-id list — never invented by the backend.
            assert payload["enabled_widgets"] is None or (
                isinstance(payload["enabled_widgets"], list)
                and all(isinstance(w, str) for w in payload["enabled_widgets"])
            )


def test_overlay_hello_carries_enabled_widgets():
    """The Widgets-page preference rides in hello so the overlay can filter
    placements: explicit list on connect, None again after clearing."""
    with TestClient(app) as client:
        r = client.put(
            "/api/v1/settings",
            json={"values": {"enabled_widgets": ["study_timer", "clock"]}},
            headers=AUTH,
        )
        assert r.status_code == 200
        with client.websocket_connect(f"/ws/overlay/Study?token={TEST_TOKEN}") as ws:
            payload = json.loads(ws.receive_text())["payload"]
            assert payload["enabled_widgets"] == ["study_timer", "clock"]

        # Clearing (null) restores the backend default: nothing enabled-off.
        r = client.put(
            "/api/v1/settings",
            json={"values": {"enabled_widgets": None}},
            headers=AUTH,
        )
        assert r.status_code == 200
        with client.websocket_connect(f"/ws/overlay/Study?token={TEST_TOKEN}") as ws:
            payload = json.loads(ws.receive_text())["payload"]
            assert payload["enabled_widgets"] is None


def test_stop_republishes_hello_snapshot():
    """Stopping a session refreshes history/goal on live overlays (hello again)."""
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/overlay/Study?token={TEST_TOKEN}") as ws:
            json.loads(ws.receive_text())  # hello bootstrap
            json.loads(ws.receive_text())  # layout bootstrap

            r = client.post("/api/v1/study/start", json={"subject": "History"}, headers=AUTH)
            assert r.status_code == 201
            started = json.loads(ws.receive_text())
            assert started["event_type"] == "study.session.started"
            assert started["payload"]["state"] == "running"

            r = client.post("/api/v1/study/stop", headers=AUTH)
            assert r.status_code == 200
            stopped = json.loads(ws.receive_text())
            assert stopped["event_type"] == "study.session.stopped"
            # Full state rides on stop too (idle, seconds kept).
            assert stopped["payload"]["state"] == "idle"
            assert stopped["payload"]["seconds"] >= 0

            refreshed = json.loads(ws.receive_text())
            assert refreshed["event_type"] == "overlay.hello"
            assert refreshed["payload"]["study"]["state"] == "idle"
            assert refreshed["payload"]["recent_sessions"][0]["subject"] == "History"


def test_resume_is_not_labelled_as_start():
    """Resume publishes study.session.resumed (review candidate 6 fix)."""
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/overlay/Study?token={TEST_TOKEN}") as ws:
            json.loads(ws.receive_text())  # hello bootstrap
            json.loads(ws.receive_text())  # layout bootstrap

            client.post("/api/v1/study/start", json={"subject": "Physics"}, headers=AUTH)
            started = json.loads(ws.receive_text())
            assert started["event_type"] == "study.session.started"

            client.post("/api/v1/study/pause", headers=AUTH)
            paused = json.loads(ws.receive_text())
            assert paused["event_type"] == "study.session.paused"

            client.post("/api/v1/study/resume", headers=AUTH)
            resumed = json.loads(ws.receive_text())
            assert resumed["event_type"] == "study.session.resumed"
            assert resumed["payload"]["state"] == "running"

            client.post("/api/v1/study/stop", headers=AUTH)
            json.loads(ws.receive_text())  # stopped
            json.loads(ws.receive_text())  # refreshed hello


def test_settings_put_broadcasts_widgets_updated():
    """PUT /settings with enabled_widgets pushes overlay.widgets_updated to
    every live overlay socket — the Widgets page toggle applies without a
    page reload or OBS refresh."""
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/overlay/Study?token={TEST_TOKEN}") as ws:
            json.loads(ws.receive_text())  # hello bootstrap
            json.loads(ws.receive_text())  # layout bootstrap

            r = client.put(
                "/api/v1/settings",
                json={"values": {"enabled_widgets": ["clock"]}},
                headers=AUTH,
            )
            assert r.status_code == 200
            broadcast = json.loads(ws.receive_text())
            assert broadcast["event_type"] == "overlay.widgets_updated"
            assert broadcast["payload"]["enabled_widgets"] == ["clock"]

            # Restore the default (absent ⇒ all enabled).
            r = client.put(
                "/api/v1/settings",
                json={"values": {"enabled_widgets": None}},
                headers=AUTH,
            )
            assert r.status_code == 200
            broadcast = json.loads(ws.receive_text())
            assert broadcast["event_type"] == "overlay.widgets_updated"
            assert broadcast["payload"]["enabled_widgets"] is None


def test_overlay_layout_envelope_and_live_broadcast():
    """PUT layout → saved rows come back, broadcast reaches live sockets."""
    placements = [
        {
            "instance_name": "w-1",
            # Legacy slug from the studio's old label-slug bug must normalise.
            "widget_type": "youtube_now_playing",
            "position_x": 0.1, "position_y": 0.1, "width": 0.3, "height": 0.2,
            "z_index": 5, "visible": True, "locked": False,
            "opacity": 1.0, "label": "YouTube Now Playing", "variant": "media",
        },
    ]
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/overlay/Study?token={TEST_TOKEN}") as ws:
            json.loads(ws.receive_text())  # hello
            layout0 = json.loads(ws.receive_text())
            assert layout0["event_type"] == "overlay.layout"

            r = client.put(
                "/api/v1/scenes/Study/layout",
                json={"placements": placements},
                headers=AUTH,
            )
            assert r.status_code == 200
            saved = r.json()["placements"]
            assert saved[0]["widget_type"] == "now_playing"  # canonicalised

            broadcast = json.loads(ws.receive_text())
            assert broadcast["event_type"] == "overlay.layout_updated"
            assert broadcast["payload"]["scene"] == "Study"
            assert broadcast["payload"]["placements"][0]["widget_type"] == "now_playing"
            assert broadcast["payload"]["placements"][0]["label"] == "YouTube Now Playing"
