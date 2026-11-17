"""Tests for per-launch authentication (Phase 1 Priority 2)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import WS_AUTH_CLOSE_CODE, app
from tests.conftest import TEST_TOKEN

PROTECTED_PATH = "/api/v1/health"


def test_health_rejected_without_token() -> None:
    client = TestClient(app)
    response = client.get(PROTECTED_PATH)
    assert response.status_code == 401


def test_health_accepted_with_header_token() -> None:
    client = TestClient(app)
    response = client.get(PROTECTED_PATH, headers={"X-Auth-Token": TEST_TOKEN})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_accepted_with_bearer_token() -> None:
    client = TestClient(app)
    response = client.get(
        PROTECTED_PATH, headers={"Authorization": f"Bearer {TEST_TOKEN}"}
    )
    assert response.status_code == 200


def test_health_rejected_with_wrong_token() -> None:
    client = TestClient(app)
    response = client.get(PROTECTED_PATH, headers={"X-Auth-Token": "wrong-token"})
    assert response.status_code == 401


def test_control_socket_query_param_auth() -> None:
    client = TestClient(app)
    with client.websocket_connect(f"/ws/control?token={TEST_TOKEN}") as ws:
        ws.send_text("ping")
        reply = ws.receive_json()
        assert reply["type"] == "ack"
        assert reply["received"] == "ping"


def test_control_socket_first_message_auth() -> None:
    client = TestClient(app)
    with client.websocket_connect("/ws/control") as ws:
        ws.send_json({"type": "auth", "token": TEST_TOKEN})
        assert ws.receive_json() == {"type": "auth_ok"}
        ws.send_text("ping")
        assert ws.receive_json()["received"] == "ping"


def test_control_socket_rejects_bad_query_token() -> None:
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/control?token=wrong-token") as ws:
            ws.send_text("ping")
            ws.receive_json()
    assert exc_info.value.code == WS_AUTH_CLOSE_CODE


def test_control_socket_rejects_non_auth_first_message() -> None:
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/control") as ws:
            ws.send_text("ping")
            ws.receive_json()
    assert exc_info.value.code == WS_AUTH_CLOSE_CODE
