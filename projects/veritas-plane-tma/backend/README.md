# Veritas Plane TMA — Backend

Implements TLV-2679 (Telegram Mini App `initData` -> Plane identity ->
stateless session token) and TLV-2680 (Plane API proxy: issues, comments,
labels). See `../README.md` and `../ARCHITECTURE.md` for full project
context.

## What this service does

**Auth (`POST /auth/telegram-login`, TLV-2679):**

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

**Plane proxy (`/api/projects/{project_id}/...`, TLV-2680):**

Every proxy endpoint depends on `app/deps.py`'s `authenticated_plane_token`,
which verifies the session token (`Authorization: Bearer <token>`) via
`verify_session_token()` and resolves the caller's OWN Plane API token
(never a shared service token) before any Plane call happens. Outbound
calls go through `app/plane_client.py`'s `plane_request()` — the single
choke point that maps Plane's HTTP errors to clean `HTTPException`s.

| Method | Path | Plane target |
|---|---|---|
| GET | `/api/projects/{project_id}/issues` | list work items |
| GET | `/api/projects/{project_id}/issues/{issue_id}` | work item detail |
| GET | `/api/projects/{project_id}/issues/{issue_id}/comments` | list comments |
| POST | `/api/projects/{project_id}/issues/{issue_id}/comments` | create comment (`comment_html`) |
| PATCH | `/api/projects/{project_id}/issues/{issue_id}` | update `state` and/or `labels` ONLY — any other field is a 400 |
| GET | `/api/projects/{project_id}/labels` | list labels |

What this service explicitly does NOT do (out of scope): serve the
frontend, real-time updates (poll-only per ARCHITECTURE.md §5), issue
creation, full issue editing beyond state/labels.

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
| `PLANE_TOKEN_<NAME>` | One per mapped human in `auth/telegram_user_map.py` (e.g. `PLANE_TOKEN_WERNER`). Read lazily by the TLV-2680 Plane-proxy endpoints, one per authenticated request — never a shared service token. |

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

47 tests total (12 from TLV-2679 + 35 from TLV-2680), covering:

- TLV-2679: valid/expired/tampered initData, unmapped user, session
  token round-trip and tamper/expiry rejection (see module docstring in
  `tests/test_telegram_login.py`)
- TLV-2680 (`tests/test_plane_proxy.py`): every endpoint 401s on
  missing/tampered/expired session token; 403 when the Telegram user is
  no longer mapped; PATCH whitelists `state`/`labels` and 400s on any
  other field or an empty body; the resolved user's own Plane token is
  what's sent upstream (never a shared/admin token); Plane 4xx passthrough
  vs 5xx/network-error -> 502; missing `PLANE_TOKEN_*` env var -> 500

Plane itself is never called for real in the test suite — `httpx.request`
is monkeypatched in `test_plane_proxy.py` so these stay true unit tests.
A one-off live smoke test against `plane.techlevity.co.uk` was run
manually during TLV-2680 development (not checked in) to confirm the
real wiring (list issues, list labels, 401/400 paths) before delivery.

Tests use `tests/fixtures.py` to build syntactically valid, correctly
HMAC-signed `initData` strings against a test bot token — no real
Telegram bot credentials needed to run the suite.

## Architecture notes / decisions made while building this

### TLV-2679 (auth)

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

### TLV-2680 (Plane proxy)

- **`app/plane_client.py`'s `plane_request()` is the single choke point**
  for every outbound Plane call — one function, `(method, path,
  plane_token, json_body?)`, that builds the URL, sets `X-Api-Key`, and
  maps Plane's HTTP status codes to `HTTPException`s. No prior
  `plane_request()`/`create_kanban_task()` helper existed to reuse (the
  sibling `veritas-cron-digest-buttons` project has only a SPEC.md, no
  code yet) — this is a fresh thin wrapper built to the same convention
  Werner described.
- **`app/deps.py`'s `authenticated_plane_token` dependency** is the one
  place session verification + identity resolution + token lookup
  happens, shared by all 6 endpoints — not duplicated per-endpoint.
- **PATCH field names match Plane's actual `IssueSerializer`** (`state`,
  `labels`), confirmed by reading the live API server's serializer
  source on Halcyon (`docker exec plane-app-api-1 cat
  /code/plane/api/serializers/issue.py`) rather than assuming the AC's
  informal wording (`state_id`/`label_ids`) mapped 1:1 to Plane's wire
  format. Whitelist enforcement rejects any other field with 400 before
  Plane is ever called.
- **Comment creation uses `comment_html`** (confirmed against the same
  live serializer source and a live `GET .../comments/` response) — the
  TMA is expected to send simple HTML, not a rich `comment_json` doc
  structure.
- **5xx and network errors from Plane both map to 502**, never leaking
  upstream internals to the TMA client; 4xx is passed through as-is
  since those are caller-facing (validation/permission/not-found), safe
  to relay.
- **Comment bodies are never logged** — only `issue_id` + the acting
  human's `plane_email` on successful comment creation, matching
  TLV-2679's PII-conscious logging posture.
