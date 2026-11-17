"""Per-launch authentication for the Study Stream 2.0 backend.

Decisions:
- Every /api/v1/* endpoint requires the launch token (set by the Tauri shell
  at process launch; never on disk, never in argv).
- WebSocket /ws/control authenticates with the launch token via query param
  or a first {"type": "auth", "token": "..."} message.
- WebSocket /ws/overlay/{scene_name} authenticates with either the launch
  token OR the scene-specific overlay token (generated once, persisted in
  app_settings so OBS Browser Sources survive backend restarts).
"""

from __future__ import annotations

import hmac
import json
import typing

from app.config import settings

_TOKEN_HEADER = "x-auth-token"
_BEARER_PREFIX = "bearer "


def _supplied_http_token(headers: list[tuple[bytes, bytes]]) -> str | None:
    header_map = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in headers}
    token = header_map.get(_TOKEN_HEADER)
    if token:
        return token.strip()
    authorization = header_map.get("authorization", "").strip()
    if authorization.lower().startswith(_BEARER_PREFIX):
        return authorization[len(_BEARER_PREFIX):].strip()
    return None


def supplied_ws_token(query_string: bytes) -> str | None:
    from urllib.parse import parse_qs

    params = parse_qs(query_string.decode("latin-1"))
    values = params.get("token")
    return values[0] if values else None


def token_matches(supplied: str | None) -> bool:
    """Constant-time comparison against the launch token."""
    if not supplied or not settings.auth_token:
        return False
    return hmac.compare_digest(settings.auth_token.encode(), supplied.encode())


def overlay_token_matches(supplied: str | None) -> bool:
    """Constant-time comparison against the persisted overlay token."""
    if not supplied:
        return False
    try:
        from app.database import SessionLocal
        from app.models import AppSetting

        with SessionLocal() as db:
            row = db.get(AppSetting, "overlay_token")
            if row is None:
                return False
            return hmac.compare_digest(row.value.encode(), supplied.encode())
    except Exception:
        return False


def overlay_token_for(scene_name: str) -> str:
    """Return (creating if absent) the overlay token for a specific scene.

    Each OBS scene gets its own independent 256-bit credential, stored in
    app_settings under a per-scene key. This means leaking one scene's
    Browser-Source URL does not expose any other scene.
    """
    normalised = scene_name.strip().lower().replace(" ", "_")
    key = f"overlay_token:{normalised}"
    from app.database import SessionLocal
    from app.models import AppSetting

    with SessionLocal() as db:
        row = db.get(AppSetting, key)
        if row is not None:
            return row.value
        import secrets
        token = secrets.token_hex(32)
        db.add(AppSetting(key=key, value=token))
        db.commit()
        return token


def overlay_token_matches_scene(scene_name: str, supplied: str | None) -> bool:
    """Constant-time comparison against this scene's overlay token."""
    if not supplied:
        return False
    normalised = scene_name.strip().lower().replace(" ", "_")
    key = f"overlay_token:{normalised}"
    try:
        from app.database import SessionLocal
        from app.models import AppSetting

        with SessionLocal() as db:
            row = db.get(AppSetting, key)
            if row is None:
                return False
            return hmac.compare_digest(row.value.encode(), supplied.encode())
    except Exception:
        return False


def ensure_global_overlay_token() -> str:
    """Generate a single global overlay token if none exists (compat shim)."""
    from app.database import SessionLocal
    from app.models import AppSetting
    import secrets

    with SessionLocal() as db:
        row = db.get(AppSetting, "overlay_token")
        if row is not None:
            return row.value
        token = secrets.token_hex(32)
        db.add(AppSetting(key="overlay_token", value=token))
        db.commit()
        return token


def overlay_token_matches(supplied: str | None) -> bool:
    """Constant-time comparison against the global overlay token (if any)."""
    if not supplied:
        return False
    try:
        from app.database import SessionLocal
        from app.models import AppSetting

        with SessionLocal() as db:
            row = db.get(AppSetting, "overlay_token")
            if row is None:
                return False
            return hmac.compare_digest(row.value.encode(), supplied.encode())
    except Exception:
        return False


async def _reject_http(send: typing.Any, status: int) -> None:
    body = json.dumps({"detail": "Unauthorized"}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": body,
        }
    )


class LaunchAuthMiddleware:
    """Rejects unauthenticated /api/v1/* HTTP requests with 401.

    WebSocket scopes pass through unmodified; WS endpoints enforce tokens
    inside their own handlers.
    """

    def __init__(self, app: typing.Any) -> None:
        self.app = app

    async def __call__(self, scope: typing.Any, receive: typing.Any, send: typing.Any) -> None:
        if scope["type"] == "http" and scope.get("path", "").startswith("/api/v1/"):
            if scope.get("method") == "OPTIONS":
                await self.app(scope, receive, send)
                return
            token = _supplied_http_token(scope.get("headers", []))
            if not token_matches(token):
                await _reject_http(send, 401)
                return
        await self.app(scope, receive, send)
