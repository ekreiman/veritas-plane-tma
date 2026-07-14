"""Shared test fixtures for building valid/tampered Telegram initData."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

TEST_BOT_TOKEN = "123456:test-bot-token-not-real"

# Matches the placeholder fixture entry in auth/telegram_user_map.py.
MAPPED_TELEGRAM_USER_ID = "700000001"
UNMAPPED_TELEGRAM_USER_ID = "999999999"


def _compute_hash(bot_token: str, data_check_string: str) -> str:
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()


def build_init_data(
    *,
    user_id: str = MAPPED_TELEGRAM_USER_ID,
    first_name: str = "Werner",
    last_name: str = "CTO",
    username: str = "werner_cto",
    auth_date: int | None = None,
    bot_token: str = TEST_BOT_TOKEN,
    tamper_hash: bool = False,
) -> str:
    """Build a syntactically valid, correctly-signed initData string.

    Set `auth_date` explicitly to build expired/future fixtures. Set
    `tamper_hash=True` to corrupt the signature for negative tests.
    """
    if auth_date is None:
        auth_date = int(time.time())

    user_obj = {
        "id": int(user_id),
        "first_name": first_name,
        "last_name": last_name,
        "username": username,
    }
    fields = {
        "auth_date": str(auth_date),
        "query_id": "AAHtest_query_id",
        "user": json.dumps(user_obj, separators=(",", ":")),
    }

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    computed_hash = _compute_hash(bot_token, data_check_string)
    if tamper_hash:
        # Flip the last hex char so it's a different, still-well-formed hash.
        computed_hash = computed_hash[:-1] + ("0" if computed_hash[-1] != "0" else "1")

    fields["hash"] = computed_hash
    return urlencode(fields)
