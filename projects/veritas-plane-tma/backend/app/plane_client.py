"""Thin wrapper for calling Plane's v1/ REST API on behalf of a human.

TLV-2680 scope. Every call here is made with ONE mapped human's own Plane
API token (`X-Api-Key` header) — never a shared service token — so
Plane's own audit log attributes the action to the human, per
ARCHITECTURE.md §4/§7. Callers pass in `plane_token` resolved from
`PlaneIdentity.resolve_token()`; this module never resolves a token
itself and never logs one.

`plane_request()` is the single choke point for every outbound Plane
call: it builds the URL, sets headers, maps Plane's HTTP errors to
`HTTPException`s the FastAPI layer can return as-is, and never logs
request/response bodies (comment bodies + tokens are both PII/secret-
adjacent — see README's "PII-conscious logging" precedent from TLV-2679).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx
from fastapi import HTTPException, status

logger = logging.getLogger("veritas_tma.plane")

PLANE_BASE_URL = "https://plane.techlevity.co.uk/api/v1"
WORKSPACE_SLUG = "veritas"

# Plane's documented rate limit for personal API tokens (60/min) — keep
# our own request timeout comfortably under typical p99 latency without
# hanging a client request indefinitely.
_REQUEST_TIMEOUT_SECONDS = 15.0


def _workspace_path(path: str) -> str:
    """Build the full Plane v1 URL for a workspace-relative path."""
    return f"{PLANE_BASE_URL}/workspaces/{WORKSPACE_SLUG}/{path.lstrip('/')}"


def plane_request(
    method: str,
    path: str,
    *,
    plane_token: str,
    json_body: Optional[dict[str, Any]] = None,
    params: Optional[dict[str, Any]] = None,
) -> Any:
    """Make one authenticated call to Plane's v1/ API and return parsed JSON.

    `path` is workspace-relative, e.g. "projects/<id>/issues/". `method`
    is an HTTP verb string ("GET", "POST", "PATCH"). Raises `HTTPException`
    on any failure — callers can let it propagate straight to FastAPI:

      - Plane 4xx -> passed through with the same status code + detail
        (safe: these are caller-facing validation/permission errors, not
        internal leakage)
      - Plane 5xx -> mapped to 502 (Plane is the upstream dependency;
        never expose 5xx internals to the TMA client)
      - network/timeout error -> 502
    """
    url = _workspace_path(path)
    try:
        response = httpx.request(
            method,
            url,
            headers={"X-Api-Key": plane_token},
            json=json_body,
            params=params,
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        # Never log plane_token. Path is safe (no secrets/PII in URLs here).
        logger.warning("plane_request: network error calling %s %s: %s", method, path, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="upstream Plane API request failed",
        ) from exc

    if response.status_code >= 500:
        logger.warning(
            "plane_request: Plane returned %s for %s %s", response.status_code, method, path
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="upstream Plane API error",
        )

    if response.status_code >= 400:
        # Passthrough: Plane's 4xx bodies are caller-facing (validation,
        # permission, not-found) and safe to relay as-is.
        try:
            detail: Any = response.json()
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)

    if response.status_code == status.HTTP_204_NO_CONTENT or not response.content:
        return None

    return response.json()
