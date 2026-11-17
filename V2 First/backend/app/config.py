"""Application configuration for the Study Stream 2.0 backend.

The backend is a local-only service. It must bind exclusively to 127.0.0.1
and only accept connections from the trusted local application origins.

Per-launch authentication: the Tauri desktop shell generates a random token
at startup, passes it to this backend via the STUDYSTREAM_AUTH_TOKEN
environment variable, and hands the same token to the webview frontend via
the `get_auth_token` command. The token never touches disk and dies with the
process tree.

If the token is missing (e.g. the backend was started outside the shell),
the backend fails closed: every /api/v1 request and WebSocket connection is
rejected. A warning is logged at startup so the cause is obvious in logs.
"""

from __future__ import annotations

import hmac
import os
from dataclasses import dataclass

HOST = "127.0.0.1"
DEFAULT_PORT = 47831

# Origins allowed to call the API. Restricted to local development and
# Tauri application origins only. Never add wildcard origins.
LOCAL_ORIGINS = (
    "http://localhost:5173",        # Vite dev server (dashboard)
    "http://127.0.0.1:5173",
    "tauri://localhost",            # Tauri 2 (macOS/Linux scheme)
    "http://tauri.localhost",       # Tauri 2 (Windows WebView2 scheme)
)


def _read_env() -> tuple[int, str | None]:
    """Read launch-time overrides supplied by the desktop shell."""
    port_raw = os.environ.get("STUDYSTREAM_PORT", "")
    port = int(port_raw) if port_raw.isdigit() and port_raw != "0" else DEFAULT_PORT
    token = os.environ.get("STUDYSTREAM_AUTH_TOKEN") or None
    return port, token


@dataclass(frozen=True)
class Settings:
    host: str = HOST
    port: int = DEFAULT_PORT
    database_url: str = os.environ.get(
        "STUDYSTREAM_DATABASE_URL", "sqlite:///./studystream.db"
    )
    cors_origins: tuple[str, ...] = LOCAL_ORIGINS
    auth_token: str | None = None

    def token_matches(self, supplied: str | None) -> bool:
        """Constant-shape comparison; missing token never matches."""
        if self.auth_token is None or supplied is None:
            return False
        # Constant-time compare avoids leaking the token through timing.
        return hmac.compare_digest(self.auth_token.encode(), supplied.encode())


_launch_port, _launch_token = _read_env()
settings = Settings(port=_launch_port, auth_token=_launch_token)

if settings.auth_token is None:
    # Fail closed (requests will be rejected) but make the cause visible.
    import logging

    logging.getLogger("studystream2").warning(
        "STUDYSTREAM_AUTH_TOKEN is not set; all API/WebSocket requests "
        "will be rejected (fail closed). Start the backend via the desktop "
        "shell or export the variable before launch."
    )
