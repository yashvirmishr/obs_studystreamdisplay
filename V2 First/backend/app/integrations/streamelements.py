"""Provider integration clients (Phase 5).

StreamElements' Astro gateway authenticates subscriptions with a token
copied from the SE dashboard (JWT or overlay token). The token's signature
is verified by the gateway itself — this module only reads the UNVERIFIED
claims to learn the room id, then lets the gateway's subscribe ack be the
sole proof of a valid credential.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any

GATEWAY = "wss://astro.streamelements.com/"

#: Topic used to prove a credential works. `overlays:read` scope; cheap,
#: always-available, and its ack format is the documented one.
PROBE_TOPIC = "channel.activities"


class StreamElementsAuthError(RuntimeError):
    """The credential was rejected, unusable, or the gateway is unreachable."""


def decode_claims(jwt: str) -> dict[str, Any]:
    """Read a JWT's payload WITHOUT verifying it (the gateway does that).

    Raises ValueError on anything that is not shaped like a JWT.
    """
    try:
        payload = jwt.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception as exc:
        raise ValueError("not shaped like a JWT") from exc


def validate_claims(claims: dict[str, Any]) -> None:
    """Local pre-checks that save a pointless gateway round trip."""
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)):
        raise StreamElementsAuthError("token carries no expiry claim")
    if exp <= time.time():
        raise StreamElementsAuthError(
            "token is expired — copy a fresh JWT from the StreamElements dashboard"
        )


async def verify_token(jwt: str, *, topic: str = PROBE_TOPIC) -> dict[str, str]:
    """Open the Astro gateway, subscribe with the token, return on the ack.

    The ONLY trust decision is the gateway's own `response` — we never
    treat locally-decoded claims as proof of anything.
    """
    claims = decode_claims(jwt)
    validate_claims(claims)
    room = str(claims.get("channel") or "")
    if not room:
        raise StreamElementsAuthError("token claims carry no channel id")

    import websockets

    async with websockets.connect(GATEWAY, open_timeout=15) as ws:
        await ws.recv()  # server `welcome`
        await ws.send(
            json.dumps(
                {
                    "type": "subscribe",
                    "data": {
                        "topic": topic,
                        "room": room,
                        "token": jwt,
                        "token_type": "jwt",
                    },
                }
            )
        )
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            raw = await asyncio.wait_for(ws.recv(), timeout=15)
            msg = json.loads(raw) if isinstance(raw, str) else raw
            kind = msg.get("type") if isinstance(msg, dict) else None
            if kind == "response":
                data = msg.get("data", {})
                if "subscribed" in str(data.get("message", "")).lower():
                    return {
                        "provider": str(claims.get("provider", "unknown")),
                        "channel": room,
                        "role": str(claims.get("role", "unknown")),
                        "expires_at": str(claims.get("exp", "")),
                    }
                raise StreamElementsAuthError(
                    f"gateway refused the subscription: {data.get('message', data)}"
                )
            if kind in ("error", "unauthorized", "forbidden"):
                raise StreamElementsAuthError(f"gateway error: {msg}")
        raise StreamElementsAuthError("gateway did not answer the subscription in time")
