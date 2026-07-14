"""Telegram Mini App initData validation — extracted and adapted from the
unshipped veritas-hermes Kanban TMA build (Axel/backend-engineer, 2026-07-13).

SOURCE: originally plugins/dashboard_auth/telegram/__init__.py in that
build, written against Hermes's DashboardAuthProvider ABC. That build was
retired 2026-07-14 in favor of a Plane-backed Mini App (Plane already
solves the multiuser human-account problem the Kanban build was
reinventing). This file keeps ONLY the backend-agnostic validation core —
the crypto logic doesn't care what system the session ultimately maps to.

What changed vs. the original:
  - Removed the DashboardAuthProvider subclass, the in-process session
    store, and the Hermes plugin register() entry point — all Hermes-
    specific plumbing that has no equivalent in a Plane-backed app.
  - validate_init_data() and its helpers are unchanged in logic (same
    algorithm, same constant-time comparisons, same auth_date window).
  - Downstream of validate_init_data(), the caller is expected to look up
    validated.user_id in a small static Telegram-id -> Plane-user mapping
    (see USER_MAP below) rather than minting a Hermes dashboard session.

Validation performed by validate_init_data(), per Telegram's documented
Mini App data-validation scheme:
  https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

  1. Parse initData (a URL-encoded query string).
  2. Build the data_check_string — every key except 'hash', sorted
     alphabetically, joined as "key=value" by "\\n".
  3. secret_key = HMAC-SHA256(key="WebAppData", msg=bot_token).
  4. computed = HMAC-SHA256(key=secret_key, msg=data_check_string).
  5. Constant-time compare `computed` against the 'hash' field.
  6. Reject when auth_date is older than _AUTH_DATE_MAX_AGE (300s) or
     implausibly in the future (clock-skew / tamper signal).
  7. Extract the trusted user object from the 'user' field — never trust
     a client-supplied user id from anywhere else in the payload.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Optional
from urllib.parse import parse_qsl

logger = logging.getLogger(__name__)


class InvalidCredentialsError(Exception):
    """initData failed validation (bad hash, expired, malformed)."""


# Telegram's documented key-derivation constant for Mini App initData.
_WEBAPP_DATA_CONST = b"WebAppData"

# Reject initData whose auth_date is older than this many seconds. Bounds
# a captured-initData replay while tolerating clock skew and round-trip
# latency from client to server.
_AUTH_DATE_MAX_AGE = 300  # 5 minutes


class ValidatedInitData:
    """The trusted result of validating a Telegram initData string.

    Only constructed by validate_init_data() after the HMAC and auth_date
    checks pass — every field here is derived from data the bot token
    authenticated. user_id is the ONLY user id the caller should trust.
    """

    __slots__ = ("user_id", "first_name", "last_name", "username", "auth_date")

    def __init__(
        self,
        *,
        user_id: str,
        first_name: str,
        last_name: str,
        username: str,
        auth_date: int,
    ) -> None:
        self.user_id = user_id
        self.first_name = first_name
        self.last_name = last_name
        self.username = username
        self.auth_date = auth_date

    @property
    def display_name(self) -> str:
        """"first_name last_name" collapsed, falling back to @username/id."""
        name = " ".join(p for p in (self.first_name, self.last_name) if p).strip()
        if name:
            return name
        if self.username:
            return f"@{self.username}"
        return self.user_id


def _build_data_check_string(pairs: list[tuple[str, str]]) -> str:
    """Telegram's data_check_string for the given decoded initData pairs.

    Every field except 'hash' is included, sorted alphabetically by key,
    rendered as "key=value" and joined by a single "\\n".
    """
    filtered = [(k, v) for (k, v) in pairs if k != "hash"]
    filtered.sort(key=lambda kv: kv[0])
    return "\n".join(f"{k}={v}" for (k, v) in filtered)


def _compute_hash(bot_token: str, data_check_string: str) -> str:
    """Expected initData hash (lowercase hex) for the given bot_token."""
    secret_key = hmac.new(
        _WEBAPP_DATA_CONST, bot_token.encode("utf-8"), hashlib.sha256
    ).digest()
    return hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def validate_init_data(
    init_data: str,
    *,
    bot_token: str,
    max_age_seconds: int = _AUTH_DATE_MAX_AGE,
    now: Optional[int] = None,
) -> ValidatedInitData:
    """Validate a raw Telegram initData string; return the trusted fields.

    Raises InvalidCredentialsError on ANY failure (bad/absent hash,
    tampered payload, missing/expired auth_date, malformed user object).
    The message is intentionally coarse so this can't be used as an
    oracle; log the specific reason at DEBUG for operators.

    `now` is injectable for deterministic tests; defaults to wall-clock.
    """
    if not init_data:
        raise InvalidCredentialsError("empty initData")

    pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=False)
    fields = dict(pairs)

    supplied_hash = fields.get("hash", "")
    if not supplied_hash:
        logger.debug("tma: initData missing 'hash' field")
        raise InvalidCredentialsError("invalid initData")

    data_check_string = _build_data_check_string(pairs)
    expected_hash = _compute_hash(bot_token, data_check_string)

    if not hmac.compare_digest(expected_hash, supplied_hash.lower()):
        logger.debug("tma: initData hash mismatch")
        raise InvalidCredentialsError("invalid initData")

    auth_date_raw = fields.get("auth_date", "")
    try:
        auth_date = int(auth_date_raw)
    except (TypeError, ValueError):
        logger.debug("tma: initData missing/invalid 'auth_date'")
        raise InvalidCredentialsError("invalid initData")
    current = int(time.time()) if now is None else int(now)
    age = current - auth_date
    if age > max_age_seconds:
        logger.debug("tma: initData expired (age=%ss > %ss)", age, max_age_seconds)
        raise InvalidCredentialsError("initData expired")
    if age < -max_age_seconds:
        logger.debug("tma: initData auth_date in the future (age=%ss)", age)
        raise InvalidCredentialsError("invalid initData")

    user_raw = fields.get("user", "")
    if not user_raw:
        logger.debug("tma: initData missing 'user' object")
        raise InvalidCredentialsError("invalid initData")
    try:
        user_obj = json.loads(user_raw)
    except (ValueError, TypeError):
        logger.debug("tma: initData 'user' is not valid JSON")
        raise InvalidCredentialsError("invalid initData")
    if not isinstance(user_obj, dict):
        raise InvalidCredentialsError("invalid initData")

    user_id = str(user_obj.get("id", "")).strip()
    if not user_id:
        logger.debug("tma: initData user object missing 'id'")
        raise InvalidCredentialsError("invalid initData")

    return ValidatedInitData(
        user_id=user_id,
        first_name=str(user_obj.get("first_name", "") or ""),
        last_name=str(user_obj.get("last_name", "") or ""),
        username=str(user_obj.get("username", "") or ""),
        auth_date=auth_date,
    )
