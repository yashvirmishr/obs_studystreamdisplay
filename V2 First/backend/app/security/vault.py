"""OS credential vault for provider OAuth tokens (CODING_STANDARDS rule 3).

Secrets never live in SQLite, config files, or the environment. The only
sanctioned store is the OS credential vault — on Windows this is the
Credential Manager via `keyring` (`win32ctypes` backend), on macOS the Keychain.

**Fail-loud contract.** If the credential backend is unreachable or a write
fails, `CredentialVaultError` propagates — we never silently drop or skip a
secret. Callers decide what that means for the flow they drive ("OAuth
connect failed, see log" — never "silently not connected").

Used by the OAuth connect/callback handlers (Phase 5) and by
`POST /api/v1/integrations/{provider}/disconnect`, which must leave nothing
behind on a disconnected provider.
"""

from __future__ import annotations

import logging
import re

SERVICE = "studystream2"

_PROVIDER_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")

_logger = logging.getLogger("studystream2")


class CredentialVaultError(RuntimeError):
    """The OS credential vault is unreachable or rejected the operation."""


def vault_key(provider: str) -> str:
    """Canonical storage key for a provider token (or a fixed probe)."""
    value = (provider or "").strip().lower()
    if not _PROVIDER_RE.match(value):
        raise ValueError(f"invalid provider for vault key: {provider!r}")
    return f"oauth:{value}"


def _keyring():
    try:
        import keyring

        return keyring
    except Exception as exc:  # pragma: no cover - import failure is environment-dependent
        raise CredentialVaultError(f"credential vault dependency unavailable: {exc}") from exc


def set_token(provider: str, token: str) -> None:
    """Store (or overwrite) a provider token in the OS vault."""
    if not isinstance(token, str) or not token.strip():
        raise ValueError("token must be a non-empty string")
    keyring = _keyring()
    try:
        keyring.set_password(SERVICE, vault_key(provider), token)
    except Exception as exc:
        raise CredentialVaultError(f"vault write failed for {provider!r}: {exc}") from exc


def get_token(provider: str) -> str | None:
    """Read a provider token; None when none is stored."""
    keyring = _keyring()
    try:
        return keyring.get_password(SERVICE, vault_key(provider))
    except Exception as exc:
        raise CredentialVaultError(f"vault read failed for {provider!r}: {exc}") from exc


def token_stored(provider: str) -> bool:
    """True when a token for this provider exists in the vault."""
    return get_token(provider) is not None


def delete_token(provider: str) -> bool:
    """Remove the provider token. Returns True when something was deleted,
    False when nothing was stored."""
    keyring = _keyring()
    key = vault_key(provider)
    try:
        before = keyring.get_password(SERVICE, key)
    except Exception as exc:
        raise CredentialVaultError(f"vault read failed for {provider!r}: {exc}") from exc
    if before is None:
        return False
    try:
        keyring.delete_password(SERVICE, key)
    except Exception as exc:
        raise CredentialVaultError(f"vault delete failed for {provider!r}: {exc}") from exc
    return True


def probe() -> bool:
    """Round-trip canary against the real OS vault. False when the backend
    is unusable. Writes a throwaway entry and always cleans it up."""
    key = vault_key("vault-probe")
    try:
        _keyring().set_password(SERVICE, key, "probe")
        ok = _keyring().get_password(SERVICE, key) == "probe"
    except Exception:
        ok = False
    finally:
        try:
            _keyring().delete_password(SERVICE, key)
        except Exception:
            _logger.warning("credential vault probe left a throwaway entry behind")
    return ok
