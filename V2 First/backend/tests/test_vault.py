"""OS credential vault (Windows Credential Manager) round-trip tests.

These tests talk to the REAL credential store with a throwaway provider
name and always clean up. They must pass on this machine — a silent skip
would hide a broken secret path on a feature (OAuth tokens) whose whole
point is never-leaving-plaintext.
"""

from __future__ import annotations

import pytest

from app.security import vault

PROVIDER = "test_probe_studystream"


@pytest.fixture(autouse=True)
def _clean_probe():
    yield
    try:
        vault.delete_token(PROVIDER)
    except vault.CredentialVaultError:
        pass


def test_round_trip_and_delete():
    assert vault.delete_token(PROVIDER) is False  # nothing stored yet
    vault.set_token(PROVIDER, "vault-test-secret-0123456789")
    assert vault.token_stored(PROVIDER) is True
    assert vault.get_token(PROVIDER) == "vault-test-secret-0123456789"
    assert vault.delete_token(PROVIDER) is True
    assert vault.token_stored(PROVIDER) is False
    assert vault.delete_token(PROVIDER) is False


def test_overwrite_replaces():
    vault.set_token(PROVIDER, "first-secret")
    vault.set_token(PROVIDER, "second-secret")
    assert vault.get_token(PROVIDER) == "second-secret"


def test_provider_validation():
    with pytest.raises(ValueError):
        vault.vault_key("Bad Provider")
    with pytest.raises(ValueError):
        vault.vault_key("bad:provider")
    with pytest.raises(ValueError):
        vault.vault_key("")
    assert vault.vault_key("StreamElements") == "oauth:streamelements"


def test_probe_reports_backend_available():
    # The real round trip is the honest signal; on a machine with no usable
    # backend this property would be False and the OAuth path could not ship.
    assert vault.probe() is True
