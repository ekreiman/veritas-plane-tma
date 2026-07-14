"""Tests for POST /auth/telegram-login (TLV-2679 acceptance criteria).

Required by the delivery brief:
  1. valid initData with test fixture -> session token issued
  2. expired initData (>5min old) -> 401
  3. tampered HMAC -> 401
  4. unknown Telegram user (not in map) -> 403 (UnknownTelegramUser)
  5. verify_session_token() accepts valid, rejects tampered/expired
     (covered here for the HTTP-issued token + separately in
     test_session_token.py for the unit-level contract)
"""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import app
from auth.session_token import verify_session_token
from tests.fixtures import (
    MAPPED_TELEGRAM_USER_ID,
    UNMAPPED_TELEGRAM_USER_ID,
    build_init_data,
)

client = TestClient(app)


def test_valid_init_data_issues_session_token() -> None:
    init_data = build_init_data(user_id=MAPPED_TELEGRAM_USER_ID)

    resp = client.post("/auth/telegram-login", json={"initData": init_data})

    assert resp.status_code == 200
    body = resp.json()
    assert body["session_token"]
    assert body["display_name"] == "Werner (dev fixture)"
    assert body["expires_in_seconds"] == 24 * 60 * 60

    # Round-trip: the issued token must itself verify correctly.
    payload = verify_session_token(body["session_token"])
    assert payload.telegram_user_id == MAPPED_TELEGRAM_USER_ID
    assert payload.plane_email == "werner-cto@techlevity.com"
    assert payload.plane_token_ref == "PLANE_TOKEN_WERNER"


def test_expired_init_data_rejected_401() -> None:
    stale_auth_date = int(time.time()) - 301  # 1s past the 5min window
    init_data = build_init_data(auth_date=stale_auth_date)

    resp = client.post("/auth/telegram-login", json={"initData": init_data})

    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower() or "invalid" in resp.json()["detail"].lower()


def test_tampered_hash_rejected_401() -> None:
    init_data = build_init_data(tamper_hash=True)

    resp = client.post("/auth/telegram-login", json={"initData": init_data})

    assert resp.status_code == 401


def test_unmapped_telegram_user_rejected_403() -> None:
    init_data = build_init_data(user_id=UNMAPPED_TELEGRAM_USER_ID)

    resp = client.post("/auth/telegram-login", json={"initData": init_data})

    assert resp.status_code == 403


def test_session_token_never_contains_raw_plane_token() -> None:
    """Explicit check for the acceptance criterion: Plane tokens never
    reach the client. The response and the decoded token payload must
    only ever carry a reference (env var name), never a token value."""
    init_data = build_init_data(user_id=MAPPED_TELEGRAM_USER_ID)

    resp = client.post("/auth/telegram-login", json={"initData": init_data})
    body = resp.json()

    assert "plane_api_token" not in body
    assert "plane_token" not in body

    payload = verify_session_token(body["session_token"])
    # plane_token_ref must be an env var NAME (no "plane_api_" secret shape),
    # not the token itself.
    assert payload.plane_token_ref == "PLANE_TOKEN_WERNER"
    assert not payload.plane_token_ref.startswith("plane_api_")
