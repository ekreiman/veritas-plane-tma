"""Pytest fixtures: env setup so tests never rely on hardcoded secrets."""

from __future__ import annotations

import pytest

from tests.fixtures import TEST_BOT_TOKEN

TEST_SESSION_SECRET = "test-session-secret-do-not-use-in-prod-" + "a" * 20


@pytest.fixture(autouse=True)
def configured_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every test runs with a real (test-only) bot token + session secret.

    Individual tests that need to exercise the "unset" path use
    monkeypatch.delenv() themselves after this fixture runs.
    """
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TEST_BOT_TOKEN)
    monkeypatch.setenv("TMA_SESSION_SECRET", TEST_SESSION_SECRET)
