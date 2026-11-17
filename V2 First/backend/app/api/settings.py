"""Generic key/value application settings with a strict allowlist.

Only keys on the allowlist can be read or written. Values are strings in the
database; callers opt into the type they need. This is the backing store for
widget enable/disable and the study goal.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.database import SessionLocal
from app.models import AppSetting

router = APIRouter(prefix="/api/v1/settings")

# key -> (decode(str)->Any, encode(Any)->str)
ALLOWLIST: dict[str, tuple[Any, Any]] = {
    "study_goal_hours": (
        lambda v: int(v),
        lambda v: str(int(v)),
    ),
    "enabled_widgets": (
        lambda v: json.loads(v) if v else [],
        lambda v: json.dumps(list(v)),
    ),
    "theme_accent": (lambda v: v, lambda v: str(v)),
    "schema_marker": (lambda v: v, lambda v: str(v)),
}


class SettingsUpdate(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


@router.get("")
def read_settings(keys: str | None = None) -> dict[str, Any]:
    requested = [k.strip() for k in keys.split(",")] if keys else list(ALLOWLIST)
    unknown = [k for k in requested if k not in ALLOWLIST]
    if unknown:
        raise HTTPException(status_code=422, detail=f"unknown settings keys: {unknown}")
    with SessionLocal() as db:
        rows = {
            row.key: row.value
            for row in db.scalars(select(AppSetting).where(AppSetting.key.in_(requested))).all()
        }
    out: dict[str, Any] = {}
    for key in requested:
        raw = rows.get(key)
        if raw is not None:
            out[key] = ALLOWLIST[key][0](raw)
        else:
            out[key] = None
    return out


@router.put("")
def update_settings(body: SettingsUpdate) -> dict[str, Any]:
    unknown = [k for k in body.values if k not in ALLOWLIST]
    if unknown:
        raise HTTPException(status_code=422, detail=f"unknown settings keys: {unknown}")
    result: dict[str, Any] = {}
    with SessionLocal() as db:
        for key, value in body.values.items():
            if value is None:
                # null clears the preference — the row is removed so every
                # reader falls back to its backend-default interpretation
                # (e.g. enabled_widgets absent ⇒ all widgets enabled).
                row = db.get(AppSetting, key)
                if row is not None:
                    db.delete(row)
                result[key] = None
                continue
            raw = ALLOWLIST[key][1](value)
            row = db.get(AppSetting, key)
            if row is None:
                row = AppSetting(key=key, value=raw)
                db.add(row)
            else:
                row.value = raw
            result[key] = ALLOWLIST[key][0](raw)
        db.commit()

    # Widget enablement changes apply live: connected overlays re-filter
    # their placements the moment the preference commits (same seam as
    # layout PUT → overlay.layout_updated).
    if "enabled_widgets" in body.values:
        from app.overlay_snapshot import broadcast_widgets

        broadcast_widgets()
    return result
