"""Runtime configuration for the Veritas Plane TMA backend.

All secrets come from the environment. No hardcoded fallbacks for
anything security-sensitive (bot token, session secret) — per Werner's
technical standards and the TLV-2679 acceptance criteria.
"""

from __future__ import annotations

import os

# Telegram bot token used to validate initData HMACs. Required at request
# time by validate_init_data(); read lazily (not at import time) so tests
# can inject their own bot_token without needing this env var set.
TELEGRAM_BOT_TOKEN_ENV_VAR = "TELEGRAM_BOT_TOKEN"


class TelegramBotTokenNotConfigured(Exception):
    """TELEGRAM_BOT_TOKEN is unset. Required to validate initData."""


def get_telegram_bot_token() -> str:
    token = os.environ.get(TELEGRAM_BOT_TOKEN_ENV_VAR)
    if not token:
        raise TelegramBotTokenNotConfigured(
            f"{TELEGRAM_BOT_TOKEN_ENV_VAR} is not set. Get it from the Telegram "
            "bot's @BotFather registration and set it in the environment."
        )
    return token
