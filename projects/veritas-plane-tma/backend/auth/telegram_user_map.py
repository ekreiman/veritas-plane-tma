"""Telegram user id -> Plane identity mapping (backend service copy).

Same static-map pattern as the project-root scaffold
(`../auth/telegram_user_map.py`) — deliberately not OAuth, not a DB table.
Headcount is small and known (Katya, Anna, Ed, Werner) so a lookup table
is simpler and trivially auditable.

Difference from the scaffold: Plane API tokens are NEVER stored inline
here. Each entry names the environment variable that holds that person's
token at runtime (`plane_token_env_var`), and `PlaneIdentity.resolve_token()`
reads it lazily. This satisfies the "no secrets in code" gate for
TLV-2679 — the scaffold's own docstring already flagged inline tokens as
"wire up env-var loading before real use"; this is that wiring.

Usage:
    from auth.telegram_init_data import validate_init_data
    from auth.telegram_user_map import resolve_plane_identity, UnknownTelegramUser

    validated = validate_init_data(init_data, bot_token=BOT_TOKEN)
    identity = resolve_plane_identity(validated.user_id)  # raises if unmapped
    # identity.plane_token_env_var names the env var; the backend resolves
    # the actual token from it only when it needs to call Plane's API
    # (TLV-2680), never returning the token itself to the client.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


class UnknownTelegramUser(Exception):
    """Validated Telegram user has no corresponding Plane identity."""


class PlaneTokenNotConfigured(Exception):
    """A mapped identity's Plane token env var is unset on this host."""


@dataclass(frozen=True)
class PlaneIdentity:
    """A human's Plane-side identity, resolved from a Telegram user id."""

    telegram_user_id: str
    plane_email: str
    plane_token_env_var: str  # name of the env var holding the real token
    display_name: str

    def resolve_token(self) -> str:
        """Read the actual Plane API token from its configured env var.

        Only called server-side when actually proxying a Plane API call
        (TLV-2680) — the token itself never crosses into a client-visible
        response or a session token payload.
        """
        token = os.environ.get(self.plane_token_env_var)
        if not token:
            raise PlaneTokenNotConfigured(
                f"env var {self.plane_token_env_var} is not set on this host"
            )
        return token


# ---------------------------------------------------------------------------
# The mapping itself.
#
# Real roster (Katya, Anna, Ed, Werner) lands via TLV-2677. Until then this
# holds ONE dev/test fixture entry to validate the auth flow end-to-end, per
# the TLV-2679 delivery brief. The Telegram id below is a placeholder —
# Werner's real numeric Telegram id is not yet confirmed; swap it in TLV-2677
# without changing the shape of this file.
# ---------------------------------------------------------------------------

_TELEGRAM_TO_PLANE: dict[str, PlaneIdentity] = {
    "700000001": PlaneIdentity(
        telegram_user_id="700000001",  # placeholder — real id TBD (TLV-2677)
        plane_email="werner-cto@techlevity.com",
        plane_token_env_var="PLANE_TOKEN_WERNER",
        display_name="Werner (dev fixture)",
    ),
}


def resolve_plane_identity(telegram_user_id: str) -> PlaneIdentity:
    """Look up the Plane identity for a validated Telegram user id.

    Raises UnknownTelegramUser if this Telegram user has no mapped Plane
    identity — the caller should treat this as a 403, not silently fall
    back to some default/shared identity.
    """
    identity = _TELEGRAM_TO_PLANE.get(telegram_user_id)
    if identity is None:
        raise UnknownTelegramUser(
            f"Telegram user {telegram_user_id} has no mapped Plane identity. "
            "Add them to _TELEGRAM_TO_PLANE with their own Plane API token env var."
        )
    return identity
