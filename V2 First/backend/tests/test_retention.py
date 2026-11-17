"""Event retention: old rows pruned, recent kept, disabled honored.

ActivityHistory rows must survive pruning untouched — they carry the
human-readable record the user still wants after the raw event is gone.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.database import SessionLocal
from app.models import ActivityHistory, Event
from app.retention import prune_old_events
from sqlalchemy import delete, select


@pytest.fixture(autouse=True)
def _clean_rows():
    yield
    with SessionLocal() as db:
        db.execute(
            delete(Event).where(Event.event_id.like("ret-%"))
        )
        db.execute(
            delete(ActivityHistory).where(ActivityHistory.title.like("ret-%"))
        )
        db.commit()


def test_prune_old_events_keeps_history_and_recent():
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        db.add(
            Event(
                event_id="ret-old-1",
                event_type="stream.follow",
                source="test",
                channel=None,
                occurred_at=now - timedelta(days=45),
                received_at=now - timedelta(days=45),
                is_simulated=True,
                payload_json='{"username":"oldviewer"}',
            )
        )
        db.add(
            Event(
                event_id="ret-new-1",
                event_type="stream.follow",
                source="test",
                channel=None,
                occurred_at=now,
                received_at=now,
                is_simulated=False,
                payload_json='{"username":"newviewer"}',
            )
        )
        event_fk = db.scalar(
            select(Event.id).where(Event.event_id == "ret-old-1")
        )
        db.add(
            ActivityHistory(
                event_id=event_fk,
                kind="event",
                title="ret-history-row",
                detail=None,
                occurred_at=now - timedelta(days=45),
            )
        )
        db.commit()

        pruned = prune_old_events(db, 30)
        db.commit()
        assert pruned == 1

        remaining = {
            r.event_id
            for r in db.scalars(
                select(Event).where(Event.event_id.in_(("ret-old-1", "ret-new-1")))
            ).all()
        }
        assert remaining == {"ret-new-1"}

        history_rows = db.scalars(
            select(ActivityHistory).where(ActivityHistory.title == "ret-history-row")
        ).all()
        assert len(history_rows) == 1
        # event_id was SET NULL on the FK when the raw event was pruned.
        assert history_rows[0].event_id is None


def test_prune_disabled_with_zero():
    with SessionLocal() as db:
        assert prune_old_events(db, 0) == 0
        assert prune_old_events(db, -1) == 0
