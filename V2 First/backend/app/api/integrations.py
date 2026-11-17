"""Integration registry backed by the `integrations` table.

Rows for the four providers are seeded disconnected by migration 0003 —
presence in the registry is not a fake connection. State changes honestly:

- POST /connect    → streamelements performs a REAL handshake against the
  Astro gateway with the pasted JWT and stores it in the OS credential
  vault. Every other provider still returns 501 (no handshake implemented).
- POST /disconnect → works for real: status becomes `disconnected` AND any
  stored credential is purged from the vault.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.schemas import (
    ConnectRequest,
    IntegrationConnectResponse,
    IntegrationInfo,
)
from app.database import SessionLocal
from app.events import INTEGRATION_PROVIDERS
from app.models import Integration

router = APIRouter(prefix="/api/v1/integrations")

PROVIDER_DETAILS = {
    "twitch": {
        "name": "Twitch",
        "detail": "Chat · follows · subs · cheers · raids (EventSub WebSocket)",
        "scopes": ["moderator:read:followers", "channel:read:subscriptions", "bits:read", "user:read:chat"],
    },
    "kick": {
        "name": "Kick",
        "detail": "Chat · KICKs via StreamElements Astro — direct API requires a public HTTPS webhook",
        "scopes": ["stream:read", "channel:read:subscriptions"],
    },
    "streamelements": {
        "name": "StreamElements",
        "detail": "Astro WebSocket gateway — channel.chat · channel.activities · channel.tips",
        "scopes": ["overlays:read", "activities:read", "tips:read"],
    },
    "youtube": {
        "name": "YouTube (Now Playing)",
        "detail": "Manifest V3 browser extension reads active media (Media Session API, MAIN world)",
        "scopes": ["no OAuth scopes — extension posts to local API"],
    },
}


def _row_to_dict(row: Integration) -> dict:
    meta = PROVIDER_DETAILS.get(row.provider, {"name": row.provider, "detail": "", "scopes": []})
    return {
        "provider": row.provider,
        "name": meta["name"],
        "detail": meta["detail"],
        "scopes": meta["scopes"],
        "status": row.status,
        "account_name": row.account_name,
        "last_connected_at": row.last_connected_at.isoformat() if row.last_connected_at else None,
        "last_error": row.last_error,
    }


@router.get("", response_model=list[IntegrationInfo])
def list_integrations() -> list[dict]:
    with SessionLocal() as db:
        rows = db.scalars(select(Integration).order_by(Integration.provider)).all()
        if rows:
            return [_row_to_dict(r) for r in rows]
        # Not seeded yet (fresh dev DB): return the known providers disconnected.
        return [
            {
                "provider": provider,
                "name": meta["name"],
                "detail": meta["detail"],
                "scopes": meta["scopes"],
                "status": "disconnected",
                "account_name": None,
                "last_connected_at": None,
                "last_error": None,
            }
            for provider, meta in PROVIDER_DETAILS.items()
        ]


@router.post("/{provider}/connect", response_model=IntegrationConnectResponse)
async def connect(provider: str, body: ConnectRequest | None = None) -> dict:
    """Connect a provider.

    streamelements is the implemented handshake: the pasted JWT is verified
    against the real Astro gateway (its subscribe ack is the only proof we
    trust), then stored in the OS credential vault. The token never lands in
    SQLite, logs, or the response. Other providers stay an honest 501.
    """
    if provider not in INTEGRATION_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"unknown provider: {provider}")

    if provider != "streamelements":
        raise HTTPException(
            status_code=501,
            detail=(
                "OAuth handshake for this provider is not implemented yet. Token storage "
                "IS ready (OS credential vault — `keyring`, Windows Credential Manager). "
                "Connecting needs the provider's developer credentials on your machine; "
                "the handshake ships in Phase 5. No fake connections are made."
            ),
        )

    token = (body.token.strip() if body and body.token else "")
    if not token:
        raise HTTPException(
            status_code=400,
            detail="StreamElements needs the JWT copied from its dashboard (avatar menu → channel).",
        )

    from app.integrations.streamelements import (
        StreamElementsAuthError,
        decode_claims,
        validate_claims,
        verify_token,
    )
    from app.security import vault

    try:
        validate_claims(decode_claims(token))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"that is not a JWT: {exc}") from exc
    except StreamElementsAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        info = await verify_token(token)
    except StreamElementsAuthError as exc:
        _set_row(provider, "error", last_error=str(exc)[:500])
        raise HTTPException(status_code=400, detail=f"StreamElements rejected the token: {exc}") from exc

    try:
        vault.set_token(provider, token)
    except Exception as exc:
        _set_row(provider, "error", last_error=f"credential vault unavailable: {exc}")
        raise HTTPException(
            status_code=500,
            detail="The OS credential vault refused the token; nothing was stored and the connection was NOT marked connected.",
        ) from exc

    account_name = f"SE channel {info['channel']} (linked {info['provider']})"
    now = datetime.now(timezone.utc)
    _set_row(provider, "connected", account_name=account_name, last_connected_at=now)
    return {
        "provider": provider,
        "status": "connected",
        "account_name": account_name,
        "last_connected_at": now.isoformat(),
        "verified": True,
        "gateway": "wss://astro.streamelements.com",
        "credential_store": "OS credential vault (keyring)",
    }


def _set_row(
    provider: str,
    status: str,
    *,
    account_name: str | None = None,
    last_connected_at: datetime | None = None,
    last_error: str | None = None,
) -> None:
    """Write integration state honestly (get-or-create, then commit)."""
    with SessionLocal() as db:
        row = db.scalars(select(Integration).where(Integration.provider == provider)).first()
        if row is None:
            from app.models import Integration as IntegrationModel

            row = IntegrationModel(provider=provider, status=status)
            db.add(row)
        else:
            row.status = status
        if account_name is not None:
            row.account_name = account_name
        if last_connected_at is not None:
            row.last_connected_at = last_connected_at
        if last_error is not None:
            row.last_error = last_error
        db.commit()


@router.post("/{provider}/disconnect")
def disconnect(provider: str) -> dict:
    """Honest disconnect: the row goes disconnected AND any stored OAuth
    credential is purged from the OS vault. `credential_purged` reports what
    actually happened so the UI never claims a secret was erased when it
    wasn't."""
    if provider not in INTEGRATION_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"unknown provider: {provider}")
    with SessionLocal() as db:
        row = db.scalars(select(Integration).where(Integration.provider == provider)).first()
        if row is None:
            from app.models import Integration as IntegrationModel

            row = IntegrationModel(provider=provider, status="disconnected")
            db.add(row)
        else:
            row.status = "disconnected"
            row.account_name = None
            row.last_connected_at = None
        db.commit()

    credential_purged: bool | None = None
    try:
        from app.security import vault

        credential_purged = vault.delete_token(provider)
    except Exception:
        import logging

        logging.getLogger("studystream2").warning(
            "vault purge failed for provider %s; credential may persist", provider,
            exc_info=True,
        )
    return {"provider": provider, "status": "disconnected", "credential_purged": credential_purged}
