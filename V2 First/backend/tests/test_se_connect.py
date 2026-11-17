"""Connect-endpoint tests for the StreamElements handshake (no network).

The live gateway round trip is verified separately against the real
dashboard-copied JWT (see PROGRESS_LOG); these tests pin the pure logic
and the honest failure modes.
"""

from __future__ import annotations

import base64
import json
import os
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.integrations.streamelements import (
    StreamElementsAuthError,
    decode_claims,
    validate_claims,
)
from app.models import Integration

AUTH = {"x-auth-token": os.environ.get("STUDYSTREAM_AUTH_TOKEN", "test-launch-token-0123456789abcdef")}


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def _fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    return f"{header}.{payload}.sig"


def _claims(exp: int) -> dict:
    return {"iss": "citadel", "exp": exp, "channel": "67adcbd8c9f465394f8c7f47", "role": "owner", "provider": "twitch"}


def test_decode_claims_reads_payload():
    claims = decode_claims(_fake_jwt(_claims(int(time.time()) + 3600)))
    assert claims["channel"] == "67adcbd8c9f465394f8c7f47"
    assert claims["role"] == "owner"


def test_decode_claims_rejects_garbage():
    with pytest.raises(ValueError):
        decode_claims("not-a-jwt")


def test_validate_claims_accepts_future_expiry():
    validate_claims(_claims(int(time.time()) + 3600))  # must not raise


def test_validate_claims_rejects_expired():
    with pytest.raises(StreamElementsAuthError, match="expired"):
        validate_claims(_claims(int(time.time()) - 60))


def test_validate_claims_rejects_missing_expiry():
    with pytest.raises(StreamElementsAuthError, match="no expiry"):
        validate_claims({"channel": "x"})


def test_connect_streamelements_requires_a_token(client: TestClient):
    """No body -> honest friendly 400; malformed body -> FastAPI 422. Row never connected."""
    r = client.post("/api/v1/integrations/streamelements/connect", headers=AUTH)
    assert r.status_code == 400, r.text
    assert "JWT" in r.json()["detail"]
    r = client.post("/api/v1/integrations/streamelements/connect", json={}, headers=AUTH)
    assert r.status_code == 422
    with SessionLocal() as db:
        row = db.scalars(select(Integration).where(Integration.provider == "streamelements")).first()
        assert row is None or row.status != "connected"


def test_connect_other_providers_still_501(client: TestClient):
    """Only SE has a handshake; twitch stays an honest 501."""
    r = client.post("/api/v1/integrations/twitch/connect", headers=AUTH)
    assert r.status_code == 501
    assert "not implemented" in r.json()["detail"]
