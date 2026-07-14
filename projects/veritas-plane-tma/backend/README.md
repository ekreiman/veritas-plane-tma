# Veritas Plane TMA — Auth Backend

Implements TLV-2679: Telegram Mini App `initData` -> Plane identity ->
stateless session token. First real backend service for this project
(see `../README.md` and `../ARCHITECTURE.md` for full project context).

## What this service does

One endpoint: `POST /auth/telegram-login`.

1. Validates the Telegram Mini App `initData` string (HMAC-SHA256 per
   Telegram's documented scheme, 5-minute replay window) via
   `auth/telegram_init_data.py` — reused verbatim from the project's
   scaffold, do not modify.
2. Resolves the validated Telegram user id to a Plane identity via
   `auth/telegram_user_map.py` — a static, hand-maintained lookup table.
3. Mints a stateless HMAC-SHA256-signed session token (no DB, no session
   table) via `auth/session_token.py`. The token payload carries a
   *reference* to the Plane API token (an env var name), never the token
   itself.

What this service explicitly does NOT do (out of scope for this ticket):
proxy any Plane API calls, handle live updates, serve the frontend. Those
land in later tickets (TLV-2680+) and will call `verify_session_token()`
from `auth/session_token.py`, already built here for that purpose.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt   # includes pytest + httpx for tests
```

Copy `.env.example` to `.env` and fill in real values (never commit `.env`):

```bash
cp .env.example .env
```

Required env vars (no hardcoded fallbacks exist for any of these — the
service raises a clear error at request time if they're missing):

| Var | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Used to validate initData HMACs. |
| `TMA_SESSION_SECRET` | HMAC signing secret for session tokens. Generate with `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `PLANE_TOKEN_<NAME>` | One per mapped human in `auth/telegram_user_map.py` (e.g. `PLANE_TOKEN_WERNER`). Only read when a downstream ticket actually proxies a Plane call — this service never reads them itself. |

## Running locally

```bash
source .venv/bin/activate
export TELEGRAM_BOT_TOKEN=... TMA_SESSION_SECRET=...
uvicorn app.main:app --reload --port 8123
```

```bash
curl -X POST http://127.0.0.1:8123/auth/telegram-login \
  -H "Content-Type: application/json" \
  -d '{"initData": "<raw initData string from Telegram WebApp.initData>"}'
```

## Testing

```bash
source .venv/bin/activate
python3 -m pytest -v
```

12 tests, covering the 5 required acceptance scenarios plus the explicit
"Plane token never reaches the client" and "no hardcoded secret fallback"
checks:

- valid initData -> 200 + session token issued
- expired initData (>5min) -> 401
- tampered HMAC -> 401
- unmapped Telegram user -> 403 (`UnknownTelegramUser`)
- `verify_session_token()` accepts valid tokens, rejects tampered/expired
  ones (both at the module level and round-tripped through the live
  HTTP-issued token)

Tests use `tests/fixtures.py` to build syntactically valid, correctly
HMAC-signed `initData` strings against a test bot token — no real
Telegram bot credentials needed to run the suite.

## Architecture notes / decisions made while building this

- **Plane tokens never leave the server.** `telegram_user_map.py`'s
  `PlaneIdentity` stores an env var *name*
  (`plane_token_env_var`), not the token value. `resolve_token()` reads
  the real secret lazily and is not called anywhere in this ticket's auth
  flow — only the env var *name* goes into the session token payload
  (`plane_token_ref`). This satisfies the acceptance criterion that Plane
  API tokens are never returned to the client.
- **`_TELEGRAM_TO_PLANE` has one dev/test fixture entry**, not the real
  roster — the delivery brief explicitly scoped real Katya/Anna/Ed/Werner
  entries to TLV-2677. The fixture's Telegram id (`700000001`) is a
  placeholder; swap in Werner's real numeric Telegram id when known,
  without changing the file's shape.
- **No hardcoded secrets anywhere** — `TELEGRAM_BOT_TOKEN` and
  `TMA_SESSION_SECRET` both raise a typed, caught exception
  (`TelegramBotTokenNotConfigured`, `SessionSecretNotConfigured`) if
  unset, mapped to a 500 at the HTTP layer. No default value exists for
  either in code.
- **Logging is PII-conscious.** `telegram_init_data.py`'s own docstring
  flags initData as containing name/username; `app/main.py` never logs
  the raw initData string or the decoded name/username fields, only the
  (non-secret) Telegram user id when useful for debugging onboarding
  gaps.
