"""Scene layout persistence for the Overlay Studio.

Widgets are stored in the `widgets` table keyed by (scene_id, instance_name).
PUT replaces the full placement set atomically. Geometry is clamped to the
canvas; anything outside [0,1] would corrupt OBS scaling, so we clamp rather
than reject — the editor echoes back the clamped result.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models import Scene, Widget
from app.api.schemas import LayoutResponse, LayoutUpdate, Placement, SceneList

router = APIRouter(prefix="/api/v1/scenes")


def _get_scene_or_404(db, name: str) -> Scene:
    scene = db.scalars(select(Scene).where(Scene.name == name)).first()
    if scene is None:
        raise HTTPException(status_code=404, detail=f"unknown scene: {name}")
    return scene


def _row_to_placement(row: Widget) -> dict:
    import json as _json

    cfg = _json.loads(row.config_json or "{}")
    return {
        "instance_name": row.instance_name,
        "widget_type": row.widget_type,
        "position_x": row.position_x,
        "position_y": row.position_y,
        "width": row.width,
        "height": row.height,
        "z_index": row.z_index,
        "visible": row.visible,
        "locked": row.locked,
        "opacity": float(cfg.get("opacity", 1.0)),
        "label": str(cfg.get("label", "")),
        "variant": str(cfg.get("variant", "chip")),
    }


# Public alias — app.overlay_snapshot reuses this mapping for the WS snapshot.
row_to_placement = _row_to_placement


@router.get("", response_model=SceneList)
def list_scenes() -> dict:
    """All persisted scenes, ordered by name.

    Drives the OBS overlay URL picker in the dashboard: the OBS URL is
    scene-specific, so the UI must know which scenes exist. Returns honest
    rows from SQLite (seeded: Study / Please Wait); never invents scenes.
    """
    with SessionLocal() as db:
        rows = db.scalars(select(Scene).order_by(Scene.name)).all()
    return {
        "scenes": [
            {
                "name": r.name,
                "is_active": r.is_active,
                "canvas_width": r.canvas_width,
                "canvas_height": r.canvas_height,
            }
            for r in rows
        ]
    }


@router.get("/{scene_name}/layout", response_model=LayoutResponse)
def get_layout(scene_name: str) -> dict:
    with SessionLocal() as db:
        scene = _get_scene_or_404(db, scene_name)
        rows = db.scalars(
            select(Widget).where(Widget.scene_id == scene.id).order_by(Widget.z_index, Widget.id)
        ).all()
        placements = [_row_to_placement(r) for r in rows]
        return {"scene": scene.name, "placements": placements if rows else None}


@router.put("/{scene_name}/layout", response_model=LayoutResponse)
def put_layout(scene_name: str, body: LayoutUpdate) -> dict:
    import json as _json

    from app.overlay_snapshot import broadcast_layout
    from app.widget_types import canonical_widget_type

    with SessionLocal() as db:
        scene = _get_scene_or_404(db, scene_name)
        db.execute(delete(Widget).where(Widget.scene_id == scene.id))
        for item in body.placements:
            row = Widget(
                scene_id=scene.id,
                # Normalise to the registry id the same way geometry is clamped:
                # the editor echoes back the normalised result (module docstring).
                widget_type=canonical_widget_type(item.widget_type),
                instance_name=item.instance_name,
                position_x=min(max(item.position_x, 0.0), 1 - item.width),
                position_y=min(max(item.position_y, 0.0), 1 - item.height),
                width=min(item.width, 1.0),
                height=min(item.height, 1.0),
                z_index=item.z_index,
                visible=item.visible,
                locked=item.locked,
                config_json=_json.dumps({"opacity": item.opacity, "label": item.label, "variant": item.variant}),
            )
            db.add(row)
        scene.updated_at = datetime.now(timezone.utc)
        db.commit()
        rows = db.scalars(
            select(Widget).where(Widget.scene_id == scene.id).order_by(Widget.z_index, Widget.id)
        ).all()
        placements = [_row_to_placement(r) for r in rows]
        # Live-update any OBS sources already pointed at this scene; they
        # re-render from this envelope without a page reload.
        broadcast_layout(scene.name, placements)
        return {"scene": scene.name, "placements": placements}
