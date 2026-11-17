"""Tests for the Phase 1 backend."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import TEST_TOKEN


def test_health_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/health", headers={"X-Auth-Token": TEST_TOKEN})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "studystream2-backend"


def test_control_socket_echo() -> None:
    client = TestClient(app)
    with client.websocket_connect(f"/ws/control?token={TEST_TOKEN}") as ws:
        ws.send_text("ping")
        reply = ws.receive_json()
        assert reply["type"] == "ack"
        assert reply["received"] == "ping"
