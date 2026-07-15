"""Veritas Plane TMA backend — FastAPI service.

TLV-2679 scope: `POST /auth/telegram-login`. Validates a Telegram Mini
App `initData` string, resolves the caller's Plane identity, and mints a
stateless HMAC-signed session token. No DB, no session store.

TLV-2680 scope: the Plane-proxy endpoints below. Every one calls
`verify_session_token()` (via the `authenticated_plane_token` dependency
in `app/deps.py`) before doing anything else, then proxies to Plane's
v1/ REST API using THAT PERSON'S OWN Plane token — never a shared
service token — via `app/plane_client.py`'s `plane_request()`.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from app.config import TelegramBotTokenNotConfigured, get_telegram_bot_token
from app.deps import AuthenticatedRequest, authenticated_plane_token
from app.plane_client import plane_request
from auth.session_token import (
    DEFAULT_TTL_SECONDS,
    SessionSecretNotConfigured,
    mint_session_token,
)
from auth.telegram_init_data import InvalidCredentialsError, validate_init_data
from auth.telegram_user_map import UnknownTelegramUser, resolve_plane_identity

logger = logging.getLogger("veritas_tma.auth")
plane_logger = logging.getLogger("veritas_tma.plane")

app = FastAPI(title="Veritas Plane TMA — Backend", version="0.2.0")

# PATCH /issues/{issue_id} whitelist (ACP §5 decision #5: status + label
# change only — full issue editing stays on the Plane web UI). Any other
# field in the request body is rejected with 400, not silently dropped.
_ISSUE_PATCH_ALLOWED_FIELDS = {"state", "labels"}


class IssueCommentCreateRequest(BaseModel):
    comment_html: str = Field(..., min_length=1)


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


# ---------------------------------------------------------------------------
# TLV-2680: Plane-proxy endpoints.
#
# Every endpoint below depends on `authenticated_plane_token`, which
# verifies the session token (401 on missing/tampered/expired) and
# resolves the caller's OWN Plane API token before any Plane call is made
# (app/deps.py). None of these endpoints touch a DB or session store —
# stateless proxy, matching TLV-2679's posture.
# ---------------------------------------------------------------------------


@app.get("/api/projects/{project_id}/issues")
def list_issues(
    project_id: str,
    auth: AuthenticatedRequest = Depends(authenticated_plane_token),
) -> Any:
    """List work items in a project."""
    return plane_request(
        "GET",
        f"projects/{project_id}/issues/",
        plane_token=auth.plane_token,
    )


@app.get("/api/projects/{project_id}/issues/{issue_id}")
def get_issue(
    project_id: str,
    issue_id: str,
    auth: AuthenticatedRequest = Depends(authenticated_plane_token),
) -> Any:
    """Get a single work item's detail."""
    return plane_request(
        "GET",
        f"projects/{project_id}/issues/{issue_id}/",
        plane_token=auth.plane_token,
    )


@app.get("/api/projects/{project_id}/issues/{issue_id}/comments")
def list_issue_comments(
    project_id: str,
    issue_id: str,
    auth: AuthenticatedRequest = Depends(authenticated_plane_token),
) -> Any:
    """List comments on a work item."""
    return plane_request(
        "GET",
        f"projects/{project_id}/issues/{issue_id}/comments/",
        plane_token=auth.plane_token,
    )


@app.post("/api/projects/{project_id}/issues/{issue_id}/comments", status_code=status.HTTP_201_CREATED)
def create_issue_comment(
    project_id: str,
    issue_id: str,
    body: IssueCommentCreateRequest,
    auth: AuthenticatedRequest = Depends(authenticated_plane_token),
) -> Any:
    """Add a comment to a work item.

    Comment body is never logged (PII-conscious posture from TLV-2679) —
    only the fact that a comment was created, with issue_id, not content.
    """
    result = plane_request(
        "POST",
        f"projects/{project_id}/issues/{issue_id}/comments/",
        plane_token=auth.plane_token,
        json_body={"comment_html": body.comment_html},
    )
    plane_logger.info(
        "create_issue_comment: comment added to issue_id=%s by plane_email=%s",
        issue_id,
        auth.identity.plane_email,
    )
    return result


@app.patch("/api/projects/{project_id}/issues/{issue_id}")
def update_issue(
    project_id: str,
    issue_id: str,
    body: dict[str, Any],
    auth: AuthenticatedRequest = Depends(authenticated_plane_token),
) -> Any:
    """Update a work item's state and/or labels ONLY.

    Whitelists exactly `state` (Plane state id) and `labels` (list of
    Plane label ids) — matches Plane's own `IssueSerializer` field names
    (confirmed against the live API server, TLV-2680). Any other field in
    the request body -> 400, not silently dropped. Full issue editing
    stays on the Plane web UI per ARCHITECTURE.md §5 decision #5.
    """
    disallowed = set(body.keys()) - _ISSUE_PATCH_ALLOWED_FIELDS
    if disallowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "only 'state' and 'labels' may be updated; "
                f"disallowed field(s): {sorted(disallowed)}"
            ),
        )
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="request body must include 'state' and/or 'labels'",
        )

    return plane_request(
        "PATCH",
        f"projects/{project_id}/issues/{issue_id}/",
        plane_token=auth.plane_token,
        json_body=body,
    )


@app.get("/api/projects/{project_id}/labels")
def list_labels(
    project_id: str,
    auth: AuthenticatedRequest = Depends(authenticated_plane_token),
) -> Any:
    """List labels available in a project."""
    return plane_request(
        "GET",
        f"projects/{project_id}/labels/",
        plane_token=auth.plane_token,
    )
