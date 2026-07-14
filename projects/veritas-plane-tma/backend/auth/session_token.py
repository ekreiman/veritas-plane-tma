"""Stateless HMAC-signed session tokens for the Veritas Plane TMA backend.

Pattern reference: the retired Kanban build's `BasicAuthProvider`
(HMAC-SHA256 over a payload, no DB, no session table) — see
`../ARCHITECTURE.md` §5 decision #2 and the TLV-2679 delivery brief.

Token shape: `base64url(payload_json).base64url(HMAC-SHA256(secret, payload_json))`

Payload fields:
    telegram_user_id  - str, the validated Telegram user id (never trusted
                         from anywhere else — see telegram_init_data.py)
    plane_email       - str, the resolved Plane identity's email (informational)
    plane_token_ref   - str, the NAME of the env var holding this person's
                         real Plane API token. The actual token is never
                         embedded in the session token — only a reference
                         to which server-side secret to use later (TLV-2680).
    expiry_ts         - int, unix seconds after which the token is invalid

Security notes:
  - HMAC-SHA256 over the exact JSON bytes that get shipped to the client;
    verification recomputes the HMAC over the same bytes and compares with
    `hmac.compare_digest` (constant-time) — no separate encoding step that
    could let payload and signature drift.
  - Secret comes from `TMA_SESSION_SECRET` env var only. No hardcoded
    fallback — `get_session_secret()` raises if it's unset, by design
    (TLV-2679 acceptance criteria: "TMA_SESSION_SECRET env var required,
    no hardcoded fallback").
  - Tampered payload OR tampered signature both fail the same way (raise
    InvalidSessionTokenError) — no oracle for which half was modified.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Optional

# Default session lifetime per the TLV-2679 brief ("short TTL — 24h is fine").
DEFAULT_TTL_SECONDS = 24 * 60 * 60

_ENV_SECRET_VAR = "TMA_SESSION_SECRET"


class SessionSecretNotConfigured(Exception):
    """TMA_SESSION_SECRET is unset. No hardcoded fallback exists — set it."""


class InvalidSessionTokenError(Exception):
    """Session token is malformed, tampered, or expired."""


@dataclass(frozen=True)
class SessionPayload:
    """Decoded, verified contents of a session token."""

    telegram_user_id: str
    plane_email: str
    plane_token_ref: str
    expiry_ts: int

    def is_expired(self, *, now: Optional[int] = None) -> bool:
        current = int(time.time()) if now is None else int(now)
        return current >= self.expiry_ts


def get_session_secret() -> str:
    """Read the HMAC signing secret from TMA_SESSION_SECRET.

    Raises SessionSecretNotConfigured if unset — callers must not fall
    back to a hardcoded value under any circumstance.
    """
    secret = os.environ.get(_ENV_SECRET_VAR)
    if not secret:
        raise SessionSecretNotConfigured(
            f"{_ENV_SECRET_VAR} is not set. Generate one with "
            "`python -c \"import secrets; print(secrets.token_hex(32))\"` "
            "and set it in the environment before starting the service."
        )
    return secret


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(secret: str, payload_bytes: bytes) -> bytes:
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()


def mint_session_token(
    *,
    telegram_user_id: str,
    plane_email: str,
    plane_token_ref: str,
    secret: Optional[str] = None,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
    now: Optional[int] = None,
) -> str:
    """Mint a stateless HMAC-signed session token.

    `plane_token_ref` must be an env var NAME, not a token value — the
    caller (the /auth/telegram-login handler) is responsible for passing
    `identity.plane_token_env_var`, never `identity.resolve_token()`.
    """
    if secret is None:
        secret = get_session_secret()
    current = int(time.time()) if now is None else int(now)
    payload = {
        "telegram_user_id": telegram_user_id,
        "plane_email": plane_email,
        "plane_token_ref": plane_token_ref,
        "expiry_ts": current + ttl_seconds,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    signature = _sign(secret, payload_bytes)
    return f"{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"


def verify_session_token(
    token: str,
    *,
    secret: Optional[str] = None,
    now: Optional[int] = None,
) -> SessionPayload:
    """Verify a session token's signature and expiry; return its payload.

    Raises InvalidSessionTokenError on ANY failure — malformed token,
    tampered payload, tampered signature, or expiry in the past. Used by
    this ticket's own tests and by downstream tickets (TLV-2680) that need
    to authenticate proxied Plane requests.
    """
    if secret is None:
        secret = get_session_secret()

    if not token or "." not in token:
        raise InvalidSessionTokenError("malformed session token")

    payload_part, _, signature_part = token.partition(".")
    try:
        payload_bytes = _b64url_decode(payload_part)
        signature = _b64url_decode(signature_part)
    except Exception as exc:  # noqa: BLE001 - any decode failure is invalid
        raise InvalidSessionTokenError("malformed session token") from exc

    expected_signature = _sign(secret, payload_bytes)
    if not hmac.compare_digest(expected_signature, signature):
        raise InvalidSessionTokenError("invalid session token signature")

    try:
        payload = json.loads(payload_bytes)
    except (ValueError, TypeError) as exc:
        raise InvalidSessionTokenError("malformed session token payload") from exc

    if not isinstance(payload, dict):
        raise InvalidSessionTokenError("malformed session token payload")

    try:
        result = SessionPayload(
            telegram_user_id=str(payload["telegram_user_id"]),
            plane_email=str(payload["plane_email"]),
            plane_token_ref=str(payload["plane_token_ref"]),
            expiry_ts=int(payload["expiry_ts"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidSessionTokenError("malformed session token payload") from exc

    current = int(time.time()) if now is None else int(now)
    if result.is_expired(now=current):
        raise InvalidSessionTokenError("session token expired")

    return result
