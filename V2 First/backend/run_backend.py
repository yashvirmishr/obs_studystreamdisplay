"""Development entry point for the Study Stream 2.0 backend.

Binds exclusively to 127.0.0.1. In the packaged desktop application the
Tauri shell launches the backend itself (PyInstaller sidecar, Phase 1
Priority 1/3); this script is for development and testing only.

The Tauri shell supplies STUDYSTREAM_AUTH_TOKEN and STUDYSTREAM_PORT as
environment variables. Without a token the backend starts but fails closed:
every /api/v1 request and WebSocket connection is rejected (see app.config).
"""

from __future__ import annotations

import logging

import uvicorn

from app.config import settings


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("studystream2")

    # Fresh installs have no schema and no seed rows; applying migrations
    # here guarantees both before the first request is served. Failure is
    # fatal on purpose: the desktop shell reports the early exit with the
    # log path, which is honest and diagnosable.
    from app.migrate import upgrade_head

    try:
        upgrade_head()
    except Exception:
        logger.exception(
            "database migration failed; refusing to start against an unmigrated database"
        )
        raise SystemExit(1)

    logger.info(
        "Starting backend on %s:%s (auth token: %s)",
        settings.host,
        settings.port,
        "configured" if settings.auth_token else "MISSING (fail closed)",
    )
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
