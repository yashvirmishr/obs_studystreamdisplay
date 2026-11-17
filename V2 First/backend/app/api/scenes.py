"""Scene layout persistence for the Overlay Studio.

Widgets are stored in the `widgets` table keyed by (scene_id, instance_name).
PUT replaces the full placement set atomically. Geometry is clamped to the
canvas; anything outside [0,1] would corrupt OBS scaling, so we clamp rather
than reject — the editor echoes back the clamped result.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models import Scene, Widget

router = APIRouter(prefix="/api/v1/scenes")


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


@router.get("/{scene_name}/layout")
def get_layout(scene_name: str) -> dict:
    with SessionLocal() as db:
        scene = _get_scene_or_404(db, scene_name)
        rows = db.scalars(
            select(Widget).where(Widget.scene_id == scene.id).order_by(Widget.z_index, Widget.id)
        ).all()
        placements = [_row_to_placement(r) for r in rows]
        return {"scene": scene.name, "placements": placements if rows else None}


@router.put("/{scene_name}/layout")
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
