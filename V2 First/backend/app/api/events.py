"""Events and activity endpoints.

GET  /api/v1/activity/recent — newest events (real rows; test events carry
                               is_simulated=True end to end)
POST /api/v1/events/test     — explicitly simulated event, never confused
                               with real platform traffic
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.database import SessionLocal
from app.events import ENVELOPE_SCHEMA_VERSION
from app.events.bus import bus
from app.models import ActivityHistory, Event

router = APIRouter(prefix="/api/v1")


class TestEventBody(BaseModel):
    type: Literal[
        "stream.follow",
        "stream.cheer",
        "stream.subscription",
        "stream.gift_subscription",
        "stream.raid",
        "donation.tip",
    ] = "stream.follow"
    username: str = Field(default="test_user", min_length=1, max_length=32)
    message: str | None = Field(default=None, max_length=500)
    amount: float | None = Field(default=None, ge=0.01, le=100000)
    currency: str = Field(default="USD", pattern="^[A-Za-z]{3}$")
    bits: int | None = Field(default=None, ge=1, le=1000000)


TEST_EVENT_DEFAULTS: dict[str, dict] = {
    "stream.follow": {"username": "test_user"},
    "stream.cheer": {"username": "test_user", "bits": 100},
    "stream.subscription": {"username": "test_user"},
    "stream.gift_subscription": {"username": "test_gifter"},
    "stream.raid": {"username": "test_raider", "bits": None},
    "donation.tip": {"username": "test_donor", "amount": 5.0, "currency": "USD"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _event_to_dict(row: Event) -> dict:
    payload = json.loads(row.payload_json or "{}")
    return {
        "event_id": row.event_id,
        "event_type": row.event_type,
        "source": row.source,
        "occurred_at": (row.occurred_at.isoformat() if row.occurred_at else None),
        "received_at": (row.received_at.isoformat() if row.received_at else None),
        "is_simulated": bool(row.is_simulated),
        "payload": payload,
    }


@router.get("/activity/recent")
def activity_recent(limit: int = 50) -> list[dict]:
    with SessionLocal() as db:
        rows = db.scalars(
            select(Event).order_by(Event.received_at.desc()).limit(max(1, min(limit, 200)))
        ).all()
        return [_event_to_dict(r) for r in rows]


@router.post("/events/test", status_code=201)
def create_test_event(body: TestEventBody) -> dict:
    now = _now()
    event_id = f"test-{uuid.uuid4().hex[:16]}"

    payload: dict = {
        "schema_version": ENVELOPE_SCHEMA_VERSION,
        "username": body.username.strip(),
        "platform": "streamelements" if body.type != "stream.raid" else "twitch",
        "via": "test",
    }
    if body.type == "stream.cheer":
        payload["bits"] = body.bits if body.bits is not None else 100
        if body.message:
            payload["message"] = body.message
    elif body.type == "donation.tip":
        payload["donor_name"] = body.username.strip()
        payload["amount"] = float(body.amount) if body.amount is not None else 5.0
        payload["currency"] = body.currency.upper()
        if body.message:
            payload["message"] = body.message
    elif body.type == "stream.raid":
        payload["from_channel"] = body.username.strip()
        payload["viewers"] = 25
    elif body.type == "stream.gift_subscription":
        payload["gifter"] = body.username.strip()
        payload["gift_count"] = 5

    with SessionLocal() as db:
        event = Event(
            event_id=event_id,
            event_type=body.type,
            source="test",
            channel=None,
            occurred_at=now,
            received_at=now,
            payload_json=json.dumps(payload),
            is_simulated=True,
        )
        db.add(event)
        db.add(
            ActivityHistory(
                event_id=None,
                kind="test",
                title=f"Test {body.type.replace('stream.', '').replace('donation.', '')}",
                detail=body.username,
                occurred_at=now,
            )
        )
        db.commit()
        db.refresh(event)
        # Publish onto the in-process bus so live consumers (overlay, control socket)
        # see the synthetic event immediately.
        bus.publish(
            channel="events",
            envelope={
                "schema_version": ENVELOPE_SCHEMA_VERSION,
                "event_id": event_id,
                "event_type": body.type,
                "source": "test",
                "channel": "events",
                "occurred_at": now.isoformat(),
                "received_at": now.isoformat(),
                "payload": payload,
                "is_simulated": True,
            },
        )
        return _event_to_dict(event)
