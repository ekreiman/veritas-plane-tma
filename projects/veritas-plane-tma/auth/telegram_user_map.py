"""Telegram user id -> Plane user mapping for the Veritas Plane Mini App.

This is the ONE genuinely new piece vs. the retired Kanban build (see
telegram_init_data.py's module docstring for context). The Kanban build
minted its own Hermes dashboard session after validating initData. This
app doesn't need a session store at all — Plane already has real user
accounts with real roles. All this layer does is answer one question:
"which Plane API identity does this validated Telegram user act as?"

Deliberately a static map, not an OAuth flow or a DB table. Headcount is
small and known (Katya, Anna, Ed, Werner, maybe Kiro) — a lookup table is
simpler, has no extra infrastructure, and is trivial to audit by reading
the file. Revisit only if this ever needs to scale past a handful of
named humans.

Usage:
    from auth.telegram_init_data import validate_init_data
    from auth.telegram_user_map import resolve_plane_identity, UnknownTelegramUser

    validated = validate_init_data(init_data, bot_token=BOT_TOKEN)
    identity = resolve_plane_identity(validated.user_id)  # raises if unmapped
    # identity.plane_api_token is what the backend then uses to call Plane's API
    # on this user's behalf for the rest of the request.
"""

from __future__ import annotations

from dataclasses import dataclass


class UnknownTelegramUser(Exception):
    """Validated Telegram user has no corresponding Plane identity."""


@dataclass(frozen=True)
class PlaneIdentity:
    """A human's Plane-side identity, resolved from a Telegram user id."""

    telegram_user_id: str
    plane_email: str
    plane_api_token: str
    display_name: str


# ---------------------------------------------------------------------------
# The mapping itself.
#
# Fill in real Telegram user ids and Plane API tokens before deploying.
# Tokens should be per-person (each human's own Plane API token, not a
# shared service token) so Plane's own audit log correctly attributes
# actions to the human who took them, not to "the Mini App."
#
# DO NOT commit real tokens into this file if it ever goes into git —
# load them from environment variables instead. Left as inline for
# clarity in this scaffold; wire up env-var loading before real use.
# ---------------------------------------------------------------------------

_TELEGRAM_TO_PLANE: dict[str, PlaneIdentity] = {
    "123382798": PlaneIdentity(
        telegram_user_id="123382798",
        plane_email="ed@techlevity.com",
        plane_api_token="plane_api_15d9cec4f2554ae8a584ae3d09ed4ce6",  # label: tma-ed-personal
        display_name="Ed",
    ),
    # "<katya_telegram_id>": PlaneIdentity(
    #     telegram_user_id="<katya_telegram_id>",
    #     plane_email="katkrasner@gmail.com",
    #     plane_api_token="plane_api_8452df00be5b4a4185e13b2c45bd9a07",  # label: tma-katya-personal, already exists
    #     display_name="Katya",
    # ),  # Telegram username @krasner given 2026-07-14, NOT YET RESOLVED to a
    #     numeric id — Bot API getChat returned 404 for this exact username.
    #     Token already provisioned (TLV-2676 done for Katya) — only the
    #     Telegram id is missing. Re-verify the username with Katya directly.
    # "<anna_telegram_id>": PlaneIdentity(
    #     telegram_user_id="<anna_telegram_id>",
    #     plane_email="annjkovleva07@gmail.com",
    #     plane_api_token="plane_api_2f6dfafcb7f3470a8b80adf38d4ca3c7",  # label: tma-anna-personal, already exists
    #     display_name="Anna",
    # ),  # Telegram username @annyakovlove given 2026-07-14, NOT YET RESOLVED —
    #     same 404 as Katya's. Token already provisioned (TLV-2676 done for
    #     Anna) — only the Telegram id is missing.
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
            "Add them to _TELEGRAM_TO_PLANE with their own Plane API token."
        )
    return identity
