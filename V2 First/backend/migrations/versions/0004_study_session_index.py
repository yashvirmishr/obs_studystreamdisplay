"""index study_sessions.created_at for today-totals queries

Revision ID: 0004_study_session_index
Revises: 0003_seed_registry
Create Date: 2026-11-15

`/api/v1/study/state` (polled every ~2 s by the dashboard and embedded in
every overlay hello) calls `today_total_seconds`, which previously loaded
EVERY running/paused/completed session row into Python and filtered by date
there. The row count grows once per completed session, forever — a slow leak
into the hottest endpoint. An index on created_at plus a SQL-level date
predicate turns it into an index range scan bounded by today's rows.
"""

from __future__ import annotations

from alembic import op

revision = "0004_study_session_index"
down_revision = "0003_seed_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_study_sessions_created_at",
        "study_sessions",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_study_sessions_created_at", table_name="study_sessions")
