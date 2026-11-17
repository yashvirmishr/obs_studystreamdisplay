"""Widget registry endpoint.

Widget rows store the registry id in ``widgets.widget_type``; this endpoint
is how the frontend learns the catalog of widget types that ship in this
build. The dashboard previously kept two hand-maintained copies of the
registry (Studio's label map and the Widgets page's toggle ids), which is
how the `daily_goal`/`goal_ring` drift happened. One source of truth: this.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import WidgetRegistryResponse
from app.widget_types import WIDGET_REGISTRY

router = APIRouter(prefix="/api/v1/widgets")


@router.get("/registry", response_model=WidgetRegistryResponse)
def widget_registry() -> dict:
    """All widget types shipping in this build (ids, names, presentation)."""
    return {"widgets": WIDGET_REGISTRY}
