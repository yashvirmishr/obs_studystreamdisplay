"""SQLAlchemy models for Study Stream 2.0.

Phase 1 contains the initial `app_settings` table. The remaining tables
below are the core Phase 4/6 groundwork (scenes/widgets for the widget
engine, integrations, the event engine tables, and the study/media tables),
all created by the single additive migration `0002_core_tables`. Schema
changes happen only through new Alembic migrations — never by editing
existing ones.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AppSetting(Base):
    """Global application preference stored as a key/value pair."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class Scene(Base):
    """An OBS-bound overlay canvas holding an ordered set of widgets."""

    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    canvas_width: Mapped[int] = mapped_column(Integer, default=1920, nullable=False)
    canvas_height: Mapped[int] = mapped_column(Integer, default=1080, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    # ORM-level cascade mirrors the DB-level ON DELETE CASCADE so removing a
    # scene through a session also removes its widget instances.
    widgets: Mapped[list["Widget"]] = relationship(
        back_populates="scene", cascade="all, delete-orphan", passive_deletes=True
    )


class Widget(Base):
    """A single widget instance placed on a scene canvas.

    Layout positions are normalised floats (0..1 of the canvas) per
    ARCHITECTURE invariant 5, so a layout survives canvas resolution changes.
    """

    __tablename__ = "widgets"
    __table_args__ = (
        CheckConstraint("position_x >= 0 AND position_x <= 1", name="ck_widgets_position_x"),
        CheckConstraint("position_y >= 0 AND position_y <= 1", name="ck_widgets_position_y"),
        CheckConstraint("width >= 0 AND width <= 1", name="ck_widgets_width"),
        CheckConstraint("height >= 0 AND height <= 1", name="ck_widgets_height"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False
    )
    # Registry key of the widget type (shared/widget defs), not a per-instance name.
    widget_type: Mapped[str] = mapped_column(String(64), nullable=False)
    instance_name: Mapped[str] = mapped_column(String(128), nullable=False)
    position_x: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    position_y: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    width: Mapped[float] = mapped_column(Float, default=0.25, nullable=False)
    height: Mapped[float] = mapped_column(Float, default=0.25, nullable=False)
    z_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    config_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    scene: Mapped["Scene"] = relationship(back_populates="widgets")


class Integration(Base):
    """Connection state for one provider account (one row per provider).

    OAuth secrets never live here — only status and metadata. Tokens belong
    to the OS credential vault (CODING_STANDARDS rule 3).
    """

    __tablename__ = "integrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="disconnected", nullable=False)
    account_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    scopes_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    last_connected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class Event(Base):
    """Persisted normalised event envelope (shared/event-schemas/v1).

    `payload_json` stores the envelope `payload` object as JSON text; the
    envelope fields are flattened into columns for querying and dedup.
    """

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    channel: Mapped[str | None] = mapped_column(String(128), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class EventRule(Base):
    """Display/animation rule applied to incoming events by type."""

    __tablename__ = "event_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    min_threshold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    display_text_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    animation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sound_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class Subject(Base):
    """A study subject (e.g. "Mathematics") grouping tasks and sessions."""

    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    colour: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class Task(Base):
    """A study task, optionally attached to a subject."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    subject: Mapped["Subject | None"] = relationship()


class StudySession(Base):
    """Backend-authoritative study timer state (ARCHITECTURE invariant 8).

    `accumulated_seconds` is the running total so a paused session can be
    resumed across dashboard refreshes and app restarts.
    """

    __tablename__ = "study_sessions"
    __table_args__ = (
        # Mirrors migration 0004_study_session_index; declared here so
        # metadata.create_all (tests, fresh dev DBs) matches the migrated
        # schema exactly.
        Index("ix_study_sessions_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True
    )
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    state: Mapped[str] = mapped_column(String(16), default="idle", nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accumulated_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    subject: Mapped["Subject | None"] = relationship()
    task: Mapped["Task | None"] = relationship()


class ActivityHistory(Base):
    """Human-readable history entry (follows, donations, study milestones).

    Kept separate from `events` so it survives event retention pruning; if a
    source event is deleted the history row stays with a null `event_id`.
    """

    __tablename__ = "activity_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    event: Mapped["Event | None"] = relationship()
