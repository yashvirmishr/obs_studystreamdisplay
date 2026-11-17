"""Study Stream 2.0 backend application.

Local-only FastAPI service. Binds exclusively to 127.0.0.1 and accepts
requests only from trusted local/Tauri origins. WebSocket clients connect
via /ws/control (desktop dashboard — subscribes to `*`) and
/ws/overlay/{scene_name} (OBS Browser Sources — subscribes to `*`).

Per-launch auth: every /api/v1/* HTTP request requires the launch token
(see app.security.auth). /ws/control authenticates via the `token` query
parameter or a first {"type": "auth"} message; invalid connections are
closed with code 4401. /ws/overlay/{scene_name} authenticates via the
`token` query parameter only.
"""

from __future__ import annotations

import json
import logging

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.schemas import ObsOverlayUrl
from app.api.health import router as health_router
from app.api.study import router as study_router
from app.api.events import router as events_router
from app.api.settings import router as settings_router
from app.api.integrations import router as integrations_router
from app.api.scenes import router as scenes_router
from app.config import settings
from app.events.bus import bus
from app.security.auth import LaunchAuthMiddleware, overlay_token_for, overlay_token_matches_scene, supplied_ws_token
from app.security import auth as _auth


def ensure_for(scene_name: str) -> None:
    """Generate the persistent token for a known scene."""
    overlay_token_for(scene_name)


def _token_matches_any(supplied: str | None, scene_name: str | None = None) -> bool:
    """Accept launch token or this scene's overlay token (fallback: global overlay)."""
    from app.security import auth as _auth

    if _auth.token_matches(supplied):
        return True
    if scene_name is not None:
        return _auth.overlay_token_matches_scene(scene_name, supplied)
    # No scene context: allow the single global overlay token if it exists.
    return _auth.overlay_token_matches(supplied)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("studystream2")

app = FastAPI(
    title="Study Stream 2.0 Backend",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# Auth first (innermost) so its 401 responses are wrapped by CORS below and
# remain readable from the allowed dev origins.
app.add_middleware(LaunchAuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Auth-Token"],
)

app.include_router(health_router)
app.include_router(study_router)
app.include_router(events_router)
app.include_router(settings_router)
app.include_router(integrations_router)
app.include_router(scenes_router)


@app.get("/api/v1/obs/overlay-url", response_model=ObsOverlayUrl)
def overlay_url(scene: str = "study") -> dict:
    """Return the full overlay URL for an OBS Browser Source.

    Authenticated by the launch token. The returned URL uses a scene-specific
    overlay token (generated once, persisted in app_settings). Each scene's
    token is independent — leaking one does not expose any other scene.
    """
    from app.security import auth as _auth
    token = _auth.overlay_token_for(scene)
    return {
        "scene": scene,
        "token": token,
        "url": f"http://127.0.0.1:{settings.port}/overlay/{quote(scene, safe='')}?token={token}",
        "note": "Paste this URL into an OBS Browser Source (1920x1080, transparent, no custom CSS). Token is independent of the launch token and survives backend restarts. Scene name in the URL is case-insensitive on WS lookup.",
    }


@app.on_event("startup")
def _generate_overlay_tokens_on_boot() -> None:
    """Create persistent per-scene overlay tokens on first launch.

    These are independent of the launch token; each OBS Browser Source
    authenticates with its own scene-specific credential.
    """
    try:
        for name in ("Study", "Please Wait"):
            ensure_for(name)
    except Exception:
        logger.exception("Overlay token generation skipped")

WS_AUTH_CLOSE_CODE = 4401


def _auth_message_token(message: str) -> str | None:
    """Extract a token from a first-message auth payload, if present."""
    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict) and payload.get("type") == "auth":
        token = payload.get("token")
        return token if isinstance(token, str) else None
    return None


@app.websocket("/ws/control")
async def control_socket(websocket: WebSocket) -> None:
    """Application-wide control socket for the desktop dashboard.

    Phase 1 provides a minimal echo/acknowledgement protocol. Authentication:
    the client passes the launch token either as the `token` query parameter
    or as a first message {"type": "auth", "token": "..."}. Connections that
    fail to authenticate are closed with code 4401.
    """
    supplied = supplied_ws_token(websocket.scope.get("query_string", b""))
    await websocket.accept()
    try:
        if not settings.token_matches(supplied):
            # No valid query-param token: the first message must authenticate.
            first = await websocket.receive_text()
            supplied = _auth_message_token(first)
            if not settings.token_matches(supplied):
                await websocket.close(code=WS_AUTH_CLOSE_CODE, reason="unauthorized")
                return
            await websocket.send_json({"type": "auth_ok"})
        # Also subscribe the control socket to every envelope on the bus.
        # Dashboard can consume study transitions, test events, etc. once
        # Phase 5 widgets need them.
        q = bus.subscribe("*")
        try:
            import asyncio
            while True:
                # Watch both client input and bus envelopes.
                recv_task = asyncio.create_task(websocket.receive_text())
                get_task = asyncio.create_task(q.get())
                done, pending = await asyncio.wait(
                    {recv_task, get_task}, return_when=asyncio.FIRST_COMPLETED
                )
                for task in pending:
                    task.cancel()
                if recv_task in done:
                    try:
                        message = recv_task.result()
                    except WebSocketDisconnect:
                        raise
                    await websocket.send_json({"type": "ack", "received": message})
                if get_task in done:
                    envelope = get_task.result()
                    await websocket.send_json({"type": "event", "envelope": envelope})
        finally:
            bus.unsubscribe("*", q)
    except WebSocketDisconnect:
        logger.info("Control socket disconnected")


@app.websocket("/ws/overlay/{scene_name}")
async def overlay_socket(websocket: WebSocket, scene_name: str) -> None:
    """Event stream for OBS Browser Sources.

    Authentication: launch token OR this scene's persistent overlay token as
    `?token=...` query parameter.
    On accept the socket receives two bootstrap envelopes — `overlay.hello`
    (current study state, goal, recent events/sessions) and `overlay.layout`
    (this scene's saved placements) — then every bus envelope thereafter.
    The overlay only receives envelopes from channels {"*", "events", "study",
    "overlay"}; unknown scenes are rejected (close 1008). Any envelope
    delivered is in the normalised v1 envelope format; OBS renderers must
    implement that contract.
    """
    from sqlalchemy import func
    from sqlalchemy import select as _select
    from app.database import SessionLocal
    from app.models import Scene

    supplied = supplied_ws_token(websocket.scope.get("query_string", b""))
    if not _token_matches_any(supplied, scene_name=scene_name):
        # Accept first, then close with the specific code: closing an
        # unaccepted socket makes uvicorn answer with HTTP 403, which browsers
        # surface as close code 1006 ("abnormal") — the renderer could never
        # distinguish "bad token" from "backend down" (both would retry).
        await websocket.accept()
        await websocket.close(code=WS_AUTH_CLOSE_CODE, reason="unauthorized")
        return

    with SessionLocal() as db:
        scene = db.scalars(
            _select(Scene).where(func.lower(Scene.name) == scene_name.lower())
        ).first()
    if scene is None:
        await websocket.accept()
        await websocket.close(code=1008, reason="unknown scene")
        return

    await websocket.accept()
    q = bus.subscribe("*")
    try:
        # Handshake payload: everything the overlay renders arrives over this
        # socket (the page holds only its scene token, so /api/v1 HTTP would
        # 401 by design). Subscribe first, then snapshot, so nothing published
        # between snapshot and loop is lost.
        from app.overlay_snapshot import build_hello_envelope, build_layout_envelope

        await websocket.send_json(build_hello_envelope(scene.name))
        await websocket.send_json(build_layout_envelope(scene.name))
        while True:
            envelope = await q.get()
            await websocket.send_json(envelope)
    except WebSocketDisconnect:
        logger.info("Overlay %s disconnected", scene_name)
    finally:
        bus.unsubscribe("*", q)


# ── Overlay renderer (Phase 3): served by the backend ──────────────────────
# The OBS Browser Source points at /overlay/<scene_name>. The backend serves
# the Vite-built overlay bundle from overlay-dist/ so OBS and the desktop
# dashboard share the same widget modules and design tokens.
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from urllib.parse import quote

_OVERLAY_DIST = Path(__file__).resolve().parents[1] / "overlay-dist"

if _OVERLAY_DIST.is_dir():
    app.mount("/overlay/assets", StaticFiles(directory=_OVERLAY_DIST / "assets"), name="overlay-assets")

    @app.get("/overlay/{scene_name:path}")
    def overlay_page(scene_name: str) -> FileResponse:
        """Serve the overlay renderer entry for any scene path.

        The SPA resolves the actual scene from the URL; unknown scenes are
        handled by the frontend/WS layer (which knows about scenes)."""
        from pathlib import Path as _P

        index = _OVERLAY_DIST / "index.html"
        if not index.exists():
            raise HTTPException(status_code=503, detail="Overlay build not present; run `cd overlay && npm run build` first.")
        return FileResponse(index)
