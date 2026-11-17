"""Event-log retention.

Every provider envelope, webhook event and test event lands in the `events`
table and lives forever unless pruned — the table only ever grows. The
dashboard and overlays only ever read the newest rows, so old rows are dead
weight; but they are the user's history, so pruning is explicit and
configurable, not silent.

Rules:
* `STUDYSTREAM_EVENT_RETENTION_DAYS` (default 30; `0` disables) is read at
  backend startup and applied once, before uvicorn serves a single request.
* `activity_history` rows are never touched — they carry the human-readable
  record and survive pruning by design (event_id is SET NULL on the FK).
* Retention failure is logged and NOT fatal: this is hygiene, not
  correctness. The backend still starts.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.models import Event


def prune_old_events(db, days: int) -> int:
    """Delete events older than `days`. Returns the number pruned."""
    if days <= 0:
        logging.getLogger("studystream2").info(
            "event retention disabled (STUDYSTREAM_EVENT_RETENTION_DAYS=%d)", days
        )
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = db.execute(delete(Event).where(Event.received_at < cutoff))
    return result.rowcount or 0
