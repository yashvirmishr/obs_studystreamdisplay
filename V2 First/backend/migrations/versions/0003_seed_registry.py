"""seed scenes + disconnected integrations (no fake connections)

Revision ID: 0003_seed_registry
Revises: 0002_core_tables
Create Date: 2026-11-14

Seeds the two scene rows (Study / Please Wait) and one disconnected
integrations row per provider. Seeding `disconnected` rows is registry
plumbing, not data fabrication: nothing here claims a live connection.
"""

from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "0003_seed_registry"
down_revision = "0002_core_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)

    bind.execute(
        sa.text(
            "INSERT INTO scenes (name, canvas_width, canvas_height, is_active, created_at, updated_at) "
            "VALUES (:n, 1920, 1080, :a, :now, :now)"
        ),
        [
            {"n": "Study", "a": True, "now": now},
            {"n": "Please Wait", "a": False, "now": now},
        ],
    )

    bind.execute(
        sa.text(
            "INSERT INTO integrations (provider, status, scopes_json, created_at, updated_at) "
            "VALUES (:p, 'disconnected', '[]', :now, :now)"
        ),
        [{"p": p, "now": now} for p in ("twitch", "kick", "streamelements", "youtube")],
    )


def downgrade() -> None:
    op.execute("DELETE FROM integrations WHERE provider IN ('twitch','kick','streamelements','youtube')")
    op.execute("DELETE FROM widgets WHERE scene_id IN (SELECT id FROM scenes WHERE name IN ('Study','Please Wait'))")
    op.execute("DELETE FROM scenes WHERE name IN ('Study','Please Wait')")
