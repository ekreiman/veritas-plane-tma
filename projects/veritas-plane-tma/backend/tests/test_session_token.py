"""Unit tests for auth/session_token.py: mint/verify contract.

Covers the 5th required acceptance test explicitly at the module level:
"verify_session_token() accepts valid, rejects tampered/expired" — plus
the "no hardcoded fallback secret" requirement.
"""

from __future__ import annotations

import pytest

from auth.session_token import (
    InvalidSessionTokenError,
    SessionSecretNotConfigured,
    get_session_secret,
    mint_session_token,
    verify_session_token,
)


def test_verify_accepts_valid_token() -> None:
    token = mint_session_token(
        telegram_user_id="700000001",
        plane_email="werner-cto@techlevity.com",
        plane_token_ref="PLANE_TOKEN_WERNER",
    )

    payload = verify_session_token(token)

    assert payload.telegram_user_id == "700000001"
    assert payload.plane_email == "werner-cto@techlevity.com"
    assert payload.plane_token_ref == "PLANE_TOKEN_WERNER"
    assert not payload.is_expired()


def test_verify_rejects_tampered_payload() -> None:
    token = mint_session_token(
        telegram_user_id="700000001",
        plane_email="werner-cto@techlevity.com",
        plane_token_ref="PLANE_TOKEN_WERNER",
    )
    payload_part, _, signature_part = token.partition(".")
    tampered = payload_part + "AAAA" + "." + signature_part

    with pytest.raises(InvalidSessionTokenError):
        verify_session_token(tampered)


def test_verify_rejects_tampered_signature() -> None:
    token = mint_session_token(
        telegram_user_id="700000001",
        plane_email="werner-cto@techlevity.com",
        plane_token_ref="PLANE_TOKEN_WERNER",
    )
    payload_part, _, signature_part = token.partition(".")
    flipped = ("B" if signature_part[0] != "B" else "C") + signature_part[1:]
    tampered = payload_part + "." + flipped

    with pytest.raises(InvalidSessionTokenError):
        verify_session_token(tampered)


def test_verify_rejects_expired_token() -> None:
    token = mint_session_token(
        telegram_user_id="700000001",
        plane_email="werner-cto@techlevity.com",
        plane_token_ref="PLANE_TOKEN_WERNER",
        ttl_seconds=10,
        now=1_000_000,
    )

    with pytest.raises(InvalidSessionTokenError):
        # 100s after mint, well past the 10s TTL.
        verify_session_token(token, now=1_000_100)


def test_verify_rejects_malformed_token() -> None:
    with pytest.raises(InvalidSessionTokenError):
        verify_session_token("not-a-valid-token")

    with pytest.raises(InvalidSessionTokenError):
        verify_session_token("")


def test_get_session_secret_raises_without_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TMA_SESSION_SECRET", raising=False)

    with pytest.raises(SessionSecretNotConfigured):
        get_session_secret()


def test_mint_raises_without_configured_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TMA_SESSION_SECRET", raising=False)

    with pytest.raises(SessionSecretNotConfigured):
        mint_session_token(
            telegram_user_id="700000001",
            plane_email="werner-cto@techlevity.com",
            plane_token_ref="PLANE_TOKEN_WERNER",
        )
