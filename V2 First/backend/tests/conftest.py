"""Test fixtures for the Study Stream 2.0 backend tests.

The launch token is read from the environment at import time, so the test
token must be set before `app.main` is imported. pytest imports conftest
before collecting test modules, which makes this the right place.
"""

from __future__ import annotations

import os
import tempfile

TEST_TOKEN = "test-launch-token-0123456789abcdef"

os.environ.setdefault("STUDYSTREAM_AUTH_TOKEN", TEST_TOKEN)

# Route every test at a throwaway database so API tests can freely create /
# wipe rows without touching the real studystream.db.
_TMP = tempfile.mkdtemp(prefix="studystream-test-")
os.environ.setdefault("STUDYSTREAM_DATABASE_URL", f"sqlite:///{_TMP}/test.db")

# Create the schema in the throwaway database at import time (before any app
# module opens a connection).
from app.database import Base, engine  # noqa: E402
from app import models  # noqa: E402,F401  (register models on Base.metadata)

Base.metadata.create_all(engine)
