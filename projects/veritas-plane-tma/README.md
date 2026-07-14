# Veritas Plane TMA — salvage scaffold

**Status: scaffold only. Not a working app.** This is the salvaged/adapted
starting point for a Telegram Mini App that controls Veritas's Plane
workspace, built from pieces reused out of an unshipped Hermes Kanban TMA
build (Axel/Hugo/Kai, 2026-07-13) that was retired 2026-07-14 in favor of
Plane once Plane went live — see `memory/veritas-project-knowledge.md` in
Werner's workspace for the full retirement rationale.

## Why this exists

The retired Kanban build was solving a real problem — Katya/Anna need a
mobile-friendly way to interact with Veritas work from Telegram — but
against the wrong backend. Hermes's Kanban has no human-account model;
building one from scratch would have duplicated what Plane already does
(real accounts, real workspace roles, already live). This scaffold keeps
the genuinely backend-agnostic pieces from that build and drops everything
that was Hermes-Kanban-specific.

## What's real vs. what's a stub

| Piece | Status |
|---|---|
| `auth/telegram_init_data.py` | **Real, extracted verbatim** (logic unchanged) from the retired build's `TelegramAuthProvider`. Validates Telegram `initData` HMAC-SHA256 per Telegram's documented Mini App scheme. Backend-agnostic — no Hermes dependency. |
| `auth/telegram_user_map.py` | **New, stub data.** The lookup table (`_TELEGRAM_TO_PLANE`) is empty — needs real Telegram user IDs + each person's own Plane API token filled in before this works. Deliberately a static map, not OAuth — headcount is small and known. |
| `frontend/src/telegram/*` | **Real, extracted verbatim** from the retired build's Hugo-built frontend. Pure Telegram WebApp SDK integration (theme bridging, native BackButton/MainButton/haptics, SDK typings) — no Kanban-specific content, works for any Mini App. |
| `frontend/src/App.tsx` | **Stub.** Proves the auth handshake shape (POST `initData` to a backend endpoint) but that backend endpoint doesn't exist yet. No Plane views (issue list, task detail, comments) are built. |
| Backend service | **Does not exist.** Needs to be built: an HTTP endpoint that calls `validate_init_data()` + `resolve_plane_identity()`, mints some short-lived session, then proxies subsequent requests to Plane's REST API using that person's own Plane API token. |
| Reverse proxy / Cloudflare route | **Not started.** The retired build's Caddy config (Kai) was written against a different upstream (Hermes dashboard on :9119) and can't be reused directly — keep its security posture (path whitelist, rate limiting on auth endpoints, `frame-ancestors` CSP for Telegram embedding, dropped `Server` header) as a reference, write a fresh Caddyfile once the backend exists. |

## What was deliberately NOT carried forward

- Hermes's `DashboardAuthProvider` ABC and in-process session store — no
  Hermes dashboard session is being minted here at all; Plane's own
  accounts are the identity system.
- Hugo's Kanban-shaped API client (`api/client.ts`, `types.ts`) and the
  WebSocket live-update client (`api/ws.ts`) — Hermes's Kanban has a
  native WebSocket push; Plane doesn't expose an equivalent. If live
  updates matter, this needs either polling or a webhook-fed
  server-sent-events layer built against Plane's existing
  Plane→Hermes webhook (see `veritas-project-knowledge.md`), not a
  straight port of the old WS client.
- Kai's Caddyfile itself (not just the posture) — hardcoded to Hermes's
  `/api/plugins/kanban/*` paths and `localhost:9119` upstream, neither of
  which apply here.

## Next steps, in order

1. Fill in `auth/telegram_user_map.py` with real Telegram IDs + per-person
   Plane API tokens for whoever needs access (Katya, Anna, Ed, Werner —
   confirm the actual list first).
2. Build the backend endpoint `App.tsx` already expects
   (`POST /auth/telegram-login`) — validate initData, resolve identity,
   mint a session, set it as a cookie or return a token.
3. Decide the session mechanism for step 2. The retired build's
   `BasicAuthProvider` (stateless HMAC-signed tokens, no DB) is a clean
   reference pattern if a lightweight, infra-free session is wanted here
   too — see Werner's notes for the source if needed.
4. Build the actual Plane-backed views: issue list (scoped to whichever
   Plane project/workspace), task detail + comments, using Plane's
   `v1/` REST API with the resolved user's own token.
5. Write a fresh Caddyfile (or equivalent) once the backend has a real
   port to front, reusing Kai's security defaults (whitelist, rate limit,
   Telegram embedding headers) rather than his exact paths.
6. Add a Cloudflare tunnel route once ready to test for real, same
   pattern as the existing `plane.techlevity.co.uk` /
   `veritas-storage.techlevity.co.uk` routes.
