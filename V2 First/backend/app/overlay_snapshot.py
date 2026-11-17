"""Snapshot + layout envelopes pushed to overlay sockets at connect time.

The overlay page only holds a per-scene token — never the launch token — so it
cannot call the /api/v1 HTTP API (those requests would 401 by design). Every
piece of data the overlay renders therefore arrives over its own authenticated
WebSocket:

* ``overlay.hello``  — current study state, configured goal, global widget
  enablement, recent events and recent completed sessions (real rows from the
  DB; empty lists are honest empty states, never placeholders or mock data).
* ``overlay.layout`` — the scene's widget placements (or ``None`` when the
  scene has none saved yet).

When Overlay Studio saves a layout, ``PUT /scenes/{name}/layout`` broadcasts
``overlay.layout_updated`` on the bus; when the Widgets page changes global
enablement, ``PUT /settings`` broadcasts ``overlay.widgets_updated`` — both so
connected OBS sources live-update without a page reload.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from app.api.settings import ALLOWLIST
from app.database import SessionLocal
from app.events import ENVELOPE_SCHEMA_VERSION
from app.models import AppSetting, Event, Scene, Widget
from app.study import service as study_service


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _envelope(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": ENVELOPE_SCHEMA_VERSION,
        "event_id": f"overlay-{event_type}-{_now_iso()}",
        "event_type": event_type,
        "source": "backend",
        "channel": "overlay",
        "occurred_at": _now_iso(),
        "received_at": _now_iso(),
        "payload": payload,
        "is_simulated": False,
    }


def read_enabled_widgets(db) -> list[str] | None:
    """Global widget enablement (Widgets page) from app_settings.

    None/absent ⇒ every placed widget renders; an explicit list restricts
    which types reach the stream surface. Returns None on undecodable rows
    so a corrupt value can never hide every widget.
    """
    row = db.get(AppSetting, "enabled_widgets")
    if row is None:
        return None
    decode = ALLOWLIST["enabled_widgets"][0]
    try:
        return [str(w) for w in decode(row.value)]
    except (ValueError, TypeError):
        return None


def build_hello_envelope(scene_name: str) -> dict[str, Any]:
    """Current backend state as one envelope, sent right after WS accept."""
    with SessionLocal() as db:
        study = study_service.state_payload(db)
        goal_rows = db.scalars(
            select(Event).order_by(Event.received_at.desc()).limit(12)
        ).all()
        recent_events = [_event_brief(row) for row in goal_rows]
        recent_sessions = study_service.history(limit=8)

        goal_row = db.get(AppSetting, "study_goal_hours")
        goal_hours: int | None = None
        if goal_row is not None:
            decode = ALLOWLIST["study_goal_hours"][0]
            try:
                goal_hours = decode(goal_row.value)
            except (ValueError, TypeError):
                goal_hours = None

        enabled_widgets = read_enabled_widgets(db)

    return _envelope(
        "overlay.hello",
        {
            "scene": scene_name,
            "study": study,
            "goal": {"study_goal_hours": goal_hours},
            "enabled_widgets": enabled_widgets,
            "recent_events": recent_events,
            "recent_sessions": recent_sessions,
        },
    )


def _event_brief(row: Event) -> dict[str, Any]:
    import json

    return {
        "event_id": row.event_id,
        "event_type": row.event_type,
        "source": row.source,
        "occurred_at": row.occurred_at.isoformat() if row.occurred_at else None,
        "received_at": row.received_at.isoformat() if row.received_at else None,
        "is_simulated": bool(row.is_simulated),
        "payload": json.loads(row.payload_json or "{}"),
    }


def build_layout_envelope(scene_name: str) -> dict[str, Any]:
    """The scene's saved placements (or None) as one envelope."""
    from app.api.scenes import row_to_placement

    with SessionLocal() as db:
        scene = db.scalars(
            select(Scene).where(Scene.name == scene_name)
        ).first()
        # The WS route resolves scenes case-insensitively; mirror that here so
        # the layout sent always belongs to the scene the socket authenticated.
        if scene is None:
            scene = db.scalars(
                select(Scene).where(func.lower(Scene.name) == scene_name.lower())
            ).first()
        if scene is None:
            return _envelope("overlay.layout", {"scene": scene_name, "placements": None})
        rows = db.scalars(
            select(Widget).where(Widget.scene_id == scene.id).order_by(Widget.z_index, Widget.id)
        ).all()
        placements = [row_to_placement(r) for r in rows] if rows else None

    return _envelope("overlay.layout", {"scene": scene.name, "placements": placements})


def broadcast_layout(scene_name: str, placements: list[dict[str, Any]]) -> int:
    """Publish a layout update so live overlays re-render without reload."""
    from app.events.bus import bus

    return bus.publish(
        channel="overlay",
        envelope=_envelope("overlay.layout_updated", {"scene": scene_name, "placements": placements}),
    )


def broadcast_widgets() -> int:
    """Publish the current global widget enablement to live overlays.

    Called by PUT /settings whenever ``enabled_widgets`` changes, so a
    disabled widget type vanishes from the stream surface immediately —
    no OBS refresh needed.
    """
    from app.events.bus import bus

    with SessionLocal() as db:
        enabled = read_enabled_widgets(db)
    return bus.publish(
        channel="overlay",
        envelope=_envelope("overlay.widgets_updated", {"enabled_widgets": enabled}),
    )
