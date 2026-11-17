"""Apply pending Alembic migrations to the configured database.

The packaged desktop app ships its database per-user and there is no manual
"run alembic upgrade head" step in an installer, so the backend applies
migrations itself before serving traffic. Without this, a fresh install
starts against an empty SQLite file (or a read-only directory) and every
endpoint except /health fails — the backend boots but the app is unusable.

Called from run_backend.py before uvicorn starts. Any failure raises, and
the caller converts that into process exit 1: the desktop shell then reports
"backend exited during startup" with the backend log path — a visible,
diagnosable failure — instead of serving a broken API.

Development behaves the same: pointing at the dev database, already at head,
this is a no-op.
"""

from __future__ import annotations

import logging
import os
import sys


def _script_location() -> str:
    """Locate the migrations directory in the bundle or on disk."""
    bundled_root = getattr(sys, "_MEIPASS", None)
    if bundled_root:  # PyInstaller one-file bundle: datas are extracted here
        bundled = os.path.join(bundled_root, "migrations")
        if os.path.isdir(bundled):
            return bundled
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "migrations"
    )


def upgrade_head() -> None:
    from alembic import command
    from alembic.config import Config

    logger = logging.getLogger("studystream2")
    cfg = Config()
    # env.py reads STUDYSTREAM_DATABASE_URL via app.config; script_location
    # is all the bootstrap needs. No ini file required.
    cfg.set_main_option("script_location", _script_location())
    logger.info("applying database migrations (alembic upgrade head)")
    command.upgrade(cfg, "head")
    logger.info("database is up to date")
