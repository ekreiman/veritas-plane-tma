"""Tests for the Plane-proxy endpoints (TLV-2680 acceptance criteria).

Required by the delivery brief:
  1. All 6 endpoints implemented
  2. Every endpoint calls verify_session_token() first; 401 on
     missing/tampered/expired token, for every endpoint
  3. PATCH whitelists state + labels only; 400 on any other field
  4. Shared Plane token never used; the resolved user's own token is
     what gets used in the outbound call
  5. Plane API errors mapped cleanly (4xx passthrough, 502 on Plane 5xx)

Plane itself is never called for real in tests — `httpx.request` is
monkeypatched so these are true unit tests of the proxy logic, not an
integration test against the live plane.techlevity.co.uk host.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

import pytest
from fastapi.testclient import TestClient

from app.main import app
from auth.session_token import mint_session_token
from tests.fixtures import MAPPED_TELEGRAM_USER_ID

client = TestClient(app)

PROJECT_ID = "ed4a8d2e-4186-4e58-8dbb-0d4432efe50f"
ISSUE_ID = "893d7c24-322c-4f35-8f7a-e5592245faf2"

# All 6 required endpoints — (method, path, extra kwargs for client call).
PROXY_ENDPOINTS: list[tuple[str, str, dict[str, Any]]] = [
    ("GET", f"/api/projects/{PROJECT_ID}/issues", {}),
    ("GET", f"/api/projects/{PROJECT_ID}/issues/{ISSUE_ID}", {}),
    ("GET", f"/api/projects/{PROJECT_ID}/issues/{ISSUE_ID}/comments", {}),
    (
        "POST",
        f"/api/projects/{PROJECT_ID}/issues/{ISSUE_ID}/comments",
        {"json": {"comment_html": "<p>hi</p>"}},
    ),
    (
        "PATCH",
        f"/api/projects/{PROJECT_ID}/issues/{ISSUE_ID}",
        {"json": {"state": "some-state-id"}},
    ),
    ("GET", f"/api/projects/{PROJECT_ID}/labels", {}),
]


def _valid_session_token(*, plane_token_ref: str = "PLANE_TOKEN_WERNER") -> str:
    return mint_session_token(
        telegram_user_id=MAPPED_TELEGRAM_USER_ID,
        plane_email="werner-cto@techlevity.com",
        plane_token_ref=plane_token_ref,
    )


def _expired_session_token() -> str:
    return mint_session_token(
        telegram_user_id=MAPPED_TELEGRAM_USER_ID,
        plane_email="werner-cto@techlevity.com",
        plane_token_ref="PLANE_TOKEN_WERNER",
        ttl_seconds=-1,
    )


@dataclass
class _FakePlaneResponse:
    status_code: int
    _json: Any = None
    _text: str = ""
    content: bytes = b"{}"

    def json(self) -> Any:
        if self._json is None:
            raise ValueError("no json")
        return self._json

    @property
    def text(self) -> str:
        return self._text


@pytest.fixture(autouse=True)
def plane_token_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLANE_TOKEN_WERNER", "plane_api_werner_real_token_do_not_leak")


class _CapturingHttpxRequest:
    """Patches httpx.request to capture calls and return a canned response."""

    def __init__(self, response: _FakePlaneResponse) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def __call__(self, method: str, url: str, **kwargs: Any) -> _FakePlaneResponse:
        self.calls.append({"method": method, "url": url, **kwargs})
        return self.response


@pytest.fixture
def capture_plane_call(monkeypatch: pytest.MonkeyPatch):
    def _install(response: _FakePlaneResponse) -> _CapturingHttpxRequest:
        capturer = _CapturingHttpxRequest(response)
        monkeypatch.setattr("app.plane_client.httpx.request", capturer)
        return capturer

    return _install


# ---------------------------------------------------------------------------
# AC 1 + AC 4: all 6 endpoints work with a valid session and use the
# resolved user's own Plane token (never a shared/hardcoded one).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("method,path,kwargs", PROXY_ENDPOINTS)
def test_endpoint_succeeds_with_valid_session_and_uses_own_token(
    method: str, path: str, kwargs: dict[str, Any], capture_plane_call
) -> None:
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={"ok": True}))
    token = _valid_session_token()

    resp = client.request(
        method, path, headers={"Authorization": f"Bearer {token}"}, **kwargs
    )

    assert resp.status_code in (200, 201)
    assert len(capturer.calls) == 1
    call = capturer.calls[0]
    assert call["headers"]["X-Api-Key"] == "plane_api_werner_real_token_do_not_leak"
    # The shared/service Plane token used elsewhere in this project (e.g.
    # ed@techlevity.com's admin token) must never appear here.
    assert "plane_api_a4c46842ca544e11817bc5a2ca74b74d" not in call["headers"]["X-Api-Key"]


# ---------------------------------------------------------------------------
# AC 2: every endpoint 401s on missing/tampered/expired session token.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("method,path,kwargs", PROXY_ENDPOINTS)
def test_endpoint_401s_on_missing_authorization(
    method: str, path: str, kwargs: dict[str, Any], capture_plane_call
) -> None:
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={}))

    resp = client.request(method, path, **kwargs)

    assert resp.status_code == 401
    assert not capturer.calls  # Plane must never be called without valid auth.


@pytest.mark.parametrize("method,path,kwargs", PROXY_ENDPOINTS)
def test_endpoint_401s_on_tampered_session_token(
    method: str, path: str, kwargs: dict[str, Any], capture_plane_call
) -> None:
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={}))
    token = _valid_session_token()
    tampered = token[:-1] + ("0" if token[-1] != "0" else "1")

    resp = client.request(
        method, path, headers={"Authorization": f"Bearer {tampered}"}, **kwargs
    )

    assert resp.status_code == 401
    assert not capturer.calls


@pytest.mark.parametrize("method,path,kwargs", PROXY_ENDPOINTS)
def test_endpoint_401s_on_expired_session_token(
    method: str, path: str, kwargs: dict[str, Any], capture_plane_call
) -> None:
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={}))
    token = _expired_session_token()

    resp = client.request(
        method, path, headers={"Authorization": f"Bearer {token}"}, **kwargs
    )

    assert resp.status_code == 401
    assert not capturer.calls


def test_endpoint_403s_when_telegram_user_no_longer_mapped(capture_plane_call) -> None:
    """A session minted for a user later removed from the map -> 403, not
    a fallback to some default identity."""
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={}))
    token = mint_session_token(
        telegram_user_id="999999999",  # not in _TELEGRAM_TO_PLANE
        plane_email="ghost@example.com",
        plane_token_ref="PLANE_TOKEN_GHOST",
    )

    resp = client.get(
        f"/api/projects/{PROJECT_ID}/issues", headers={"Authorization": f"Bearer {token}"}
    )

    assert resp.status_code == 403
    assert not capturer.calls


# ---------------------------------------------------------------------------
# AC 3: PATCH whitelists state + labels only; 400 on any other field.
# ---------------------------------------------------------------------------


def test_patch_issue_accepts_state_and_labels(capture_plane_call) -> None:
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={"id": ISSUE_ID}))
    token = _valid_session_token()

    resp = client.patch(
        f"/api/projects/{PROJECT_ID}/issues/{ISSUE_ID}",
        headers={"Authorization": f"Bearer {token}"},
        json={"state": "state-id-123", "labels": ["label-id-1", "label-id-2"]},
    )

    assert resp.status_code == 200
    assert len(capturer.calls) == 1
    assert capturer.calls[0]["json"] == {
        "state": "state-id-123",
        "labels": ["label-id-1", "label-id-2"],
    }


@pytest.mark.parametrize(
    "body",
    [
        {"name": "renamed issue"},
        {"description_html": "<p>new</p>"},
        {"state": "ok-field", "priority": "urgent"},
        {"assignees": ["some-user-id"]},
    ],
)
def test_patch_issue_rejects_disallowed_fields_400(
    body: dict[str, Any], capture_plane_call
) -> None:
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={}))
    token = _valid_session_token()

    resp = client.patch(
        f"/api/projects/{PROJECT_ID}/issues/{ISSUE_ID}",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
    )

    assert resp.status_code == 400
    assert not capturer.calls  # Plane must never see the rejected fields.


def test_patch_issue_rejects_empty_body_400(capture_plane_call) -> None:
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={}))
    token = _valid_session_token()

    resp = client.patch(
        f"/api/projects/{PROJECT_ID}/issues/{ISSUE_ID}",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )

    assert resp.status_code == 400
    assert not capturer.calls


# ---------------------------------------------------------------------------
# AC 5: Plane API errors mapped cleanly.
# ---------------------------------------------------------------------------


def test_plane_4xx_passed_through(capture_plane_call) -> None:
    capturer = capture_plane_call(
        _FakePlaneResponse(status_code=404, _json={"detail": "not found"})
    )
    token = _valid_session_token()

    resp = client.get(
        f"/api/projects/{PROJECT_ID}/issues/{ISSUE_ID}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == {"detail": "not found"}
    assert len(capturer.calls) == 1


def test_plane_5xx_mapped_to_502(capture_plane_call) -> None:
    capture_plane_call(_FakePlaneResponse(status_code=503, _text="upstream down"))
    token = _valid_session_token()

    resp = client.get(
        f"/api/projects/{PROJECT_ID}/issues",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 502


def test_plane_network_error_mapped_to_502(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    def _raise_network_error(*args: Any, **kwargs: Any) -> Any:
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr("app.plane_client.httpx.request", _raise_network_error)
    token = _valid_session_token()

    resp = client.get(
        f"/api/projects/{PROJECT_ID}/issues",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# AC: no hardcoded secrets — missing PLANE_TOKEN_* env var -> 500, not a
# silent fallback to some default token.
# ---------------------------------------------------------------------------


def test_missing_plane_token_env_var_500s(
    monkeypatch: pytest.MonkeyPatch, capture_plane_call
) -> None:
    monkeypatch.delenv("PLANE_TOKEN_WERNER", raising=False)
    capturer = capture_plane_call(_FakePlaneResponse(status_code=200, _json={}))
    token = _valid_session_token()

    resp = client.get(
        f"/api/projects/{PROJECT_ID}/issues",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 500
    assert not capturer.calls
