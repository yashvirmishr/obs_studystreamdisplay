"""Pydantic response models for the public `/api/v1` surface.

These exist so `response_model=` on each endpoint does three jobs:

1. Completeness — the OpenAPI document describes real responses, so any
   consumer (or codegen) can trust it instead of a hand-maintained copy
   (which is exactly the drift the frontend's `AppSettings` / goal_ring id
   incident came from).
2. Runtime validation — FastAPI validates (and filters) declared
   responses on the way out; an endpoint that drifts from its contract
   raises instead of silently shipping a wrong payload.
3. Documentation — the Swagger UI stops showing `any` everywhere.

Convention: models mirror the dicts the services actually return. If an
endpoint emits a key, it is declared here — an undeclared key is silently
filtered by FastAPI, so when the service shape changes, change it here in
the same edit.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    api_version: str


class StudyState(BaseModel):
    """Backend-authoritative study timer snapshot.

    `seconds` is only present on stop responses; everything else nulls it.
    """

    state: str
    session_id: int | None = None
    elapsed_seconds: int
    today_total_seconds: int
    subject: str | None = None
    task: str | None = None
    started_at: str | None = None
    paused_since: str | None = None
    seconds: int | None = None


class HistoryEntry(BaseModel):
    id: int
    seconds: int
    subject: str | None = None
    task: str | None = None
    completed_at: str | None = None


class ActivityEvent(BaseModel):
    """Newest-first activity envelope projection (`/activity/recent`)."""

    event_id: str
    event_type: str
    source: str
    occurred_at: str | None = None
    received_at: str | None = None
    is_simulated: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)


class IntegrationInfo(BaseModel):
    provider: str
    name: str
    detail: str
    scopes: list[str] = Field(default_factory=list)
    status: str
    account_name: str | None = None
    last_connected_at: str | None = None
    last_error: str | None = None


class SceneInfo(BaseModel):
    name: str
    is_active: bool
    canvas_width: int
    canvas_height: int


class SceneList(BaseModel):
    scenes: list[SceneInfo]


class ObsOverlayUrl(BaseModel):
    scene: str
    token: str
    url: str
    note: str


# ── Layout / scenes (shared with the layout round-trip) ─────────────────────


class Placement(BaseModel):
    instance_name: str = Field(min_length=1, max_length=64)
    widget_type: str = Field(min_length=1, max_length=64)
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    width: float = Field(gt=0.0, le=1.0)
    height: float = Field(gt=0.0, le=1.0)
    z_index: int = Field(ge=0, le=999)
    visible: bool = True
    locked: bool = False
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)
    label: str = Field(default="", max_length=120)
    variant: str = Field(default="chip", max_length=32)


class LayoutUpdate(BaseModel):
    placements: list[Placement] = Field(default_factory=list, max_length=100)


class LayoutResponse(BaseModel):
    scene: str
    placements: list[Placement] | None = None
