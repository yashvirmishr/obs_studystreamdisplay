"""SQLite database engine and session management.

SQLite is configured with WAL mode, foreign key enforcement and a busy
timeout so concurrent access from the backend is safe and reliable.
"""

from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Declarative base for all Study Stream 2.0 models."""


def _configure_sqlite(dbapi_connection, connection_record) -> None:
    """Apply required SQLite pragmas to every new connection.

    SQLAlchemy's `connect` event passes (dbapi_connection, connection_record);
    both must be accepted or the first real connection raises TypeError.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    future=True,
)

event.listen(engine, "connect", _configure_sqlite)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_session():
    """FastAPI dependency yielding a database session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
