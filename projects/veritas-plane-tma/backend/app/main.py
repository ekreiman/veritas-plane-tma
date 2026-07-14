"""Veritas Plane TMA backend — FastAPI service.

TLV-2679 scope: ONE endpoint, `POST /auth/telegram-login`. Validates a
Telegram Mini App `initData` string, resolves the caller's Plane identity,
and mints a stateless HMAC-signed session token. No DB, no session store.

Downstream tickets (TLV-2680+) will add the Plane-proxy endpoints that
call `verify_session_token()` on every request; that helper already
exists in `auth/session_token.py` for them to import.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from app.config import TelegramBotTokenNotConfigured, get_telegram_bot_token
from auth.session_token import (
    DEFAULT_TTL_SECONDS,
    SessionSecretNotConfigured,
    mint_session_token,
)
from auth.telegram_init_data import InvalidCredentialsError, validate_init_data
from auth.telegram_user_map import UnknownTelegramUser, resolve_plane_identity

logger = logging.getLogger("veritas_tma.auth")

app = FastAPI(title="Veritas Plane TMA — Auth Backend", version="0.1.0")


class TelegramLoginRequest(BaseModel):
    initData: str = Field(..., min_length=1)


class TelegramLoginResponse(BaseModel):
    session_token: str
    display_name: str
    expires_in_seconds: int


@app.post(
    "/auth/telegram-login",
    response_model=TelegramLoginResponse,
    status_code=status.HTTP_200_OK,
)
def telegram_login(request: TelegramLoginRequest) -> TelegramLoginResponse:
    """Validate initData, resolve Plane identity, mint a session token.

    Failure modes (per TLV-2679 acceptance criteria):
      - initData fails HMAC/expiry/shape validation -> 401
      - initData is valid but the Telegram user has no mapped Plane
        identity -> 403
      - server misconfiguration (missing bot token or session secret,
        both required env vars with no fallback) -> 500, logged, no
        internal detail leaked to the client
    """
    try:
        bot_token = get_telegram_bot_token()
    except TelegramBotTokenNotConfigured:
        logger.exception("telegram-login: bot token not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="server misconfigured",
        )

    try:
        validated = validate_init_data(request.initData, bot_token=bot_token)
    except InvalidCredentialsError as exc:
        # Never log the raw initData (contains PII: name, username). Log
        # only that validation failed and why (coarse), per the module's
        # own "can't be used as an oracle" design.
        logger.info("telegram-login: initData validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired initData",
        )

    try:
        identity = resolve_plane_identity(validated.user_id)
    except UnknownTelegramUser:
        # Log only the Telegram user id (not a secret, needed to debug
        # onboarding gaps) — never log names/usernames from initData.
        logger.info(
            "telegram-login: telegram_user_id=%s has no mapped Plane identity",
            validated.user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="no Plane identity mapped for this Telegram user",
        )

    try:
        token = mint_session_token(
            telegram_user_id=validated.user_id,
            plane_email=identity.plane_email,
            plane_token_ref=identity.plane_token_env_var,
        )
    except SessionSecretNotConfigured:
        logger.exception("telegram-login: session secret not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="server misconfigured",
        )

    logger.info(
        "telegram-login: session minted for telegram_user_id=%s plane_email=%s",
        validated.user_id,
        identity.plane_email,
    )
    return TelegramLoginResponse(
        session_token=token,
        display_name=identity.display_name,
        expires_in_seconds=DEFAULT_TTL_SECONDS,
    )
