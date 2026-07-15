"""FastAPI dependencies shared by the Plane-proxy endpoints (TLV-2680).

Every proxied endpoint depends on `authenticated_plane_token`, which:
  1. Reads `Authorization: Bearer <session_token>` from the request
  2. Calls `verify_session_token()` (TLV-2679) — 401 on missing/tampered/
     expired token, per the ARCHITECTURE.md security notes
  3. Resolves the token payload's `plane_token_ref` back to a
     `PlaneIdentity` via `telegram_user_map` and reads that human's own
     Plane API token from its env var

Deliberately does NOT re-verify the Telegram user is still in the map on
every request beyond what `resolve_plane_identity` already does — the
session token's `telegram_user_id` is itself already HMAC-verified at
mint time (TLV-2679), so re-resolving here just re-derives the identity
(and catches the case where a human is removed from the map after their
token was minted, which correctly 403s on the next request).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from auth.session_token import InvalidSessionTokenError, SessionPayload, verify_session_token
from auth.telegram_user_map import (
    PlaneIdentity,
    PlaneTokenNotConfigured,
    UnknownTelegramUser,
    resolve_plane_identity,
)

logger = logging.getLogger("veritas_tma.auth")


@dataclass(frozen=True)
class AuthenticatedRequest:
    """The verified session + resolved Plane identity for one request."""

    session: SessionPayload
    identity: PlaneIdentity
    plane_token: str


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing or malformed Authorization header",
        )
    token = authorization[len("Bearer "):].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing or malformed Authorization header",
        )
    return token


def authenticated_plane_token(
    authorization: str | None = Header(default=None),
) -> AuthenticatedRequest:
    """Verify the session token and resolve the caller's own Plane token."""
    session_token = _extract_bearer_token(authorization)

    try:
        session = verify_session_token(session_token)
    except InvalidSessionTokenError as exc:
        logger.info("plane-proxy: session token rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired session token",
        ) from exc

    try:
        identity = resolve_plane_identity(session.telegram_user_id)
    except UnknownTelegramUser as exc:
        logger.info(
            "plane-proxy: telegram_user_id=%s no longer mapped", session.telegram_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="no Plane identity mapped for this Telegram user",
        ) from exc

    try:
        plane_token = identity.resolve_token()
    except PlaneTokenNotConfigured as exc:
        logger.exception(
            "plane-proxy: Plane token env var not configured for telegram_user_id=%s",
            session.telegram_user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="server misconfigured",
        ) from exc

    return AuthenticatedRequest(session=session, identity=identity, plane_token=plane_token)
