# Veritas Plane TMA — Architecture Spec

**Status:** Draft for Leo's review before squad assignment. Werner-authored,
grounded in facts verified live against Plane's actual source/API on
Halcyon (2026-07-14) — not assumed from docs.

## 1. Problem

Katya (Content Producer) and Anna (Social Media Manager) work in Plane
(`plane.techlevity.co.uk`, workspace `veritas`) from a browser. There's no
Telegram-native way to check/update Veritas work on mobile. This project
builds a Telegram Mini App (TMA) that lets a small, known set of humans
(Katya, Anna, Ed, Werner) view and act on Plane issues from inside
Telegram.

Explicitly NOT trying to solve: this does not replace Plane's web UI, does
not add new Plane features, and does not attempt full parity with Plane's
desktop experience. Scope is a focused mobile companion: view issues, see
detail/comments, comment back, change status/labels on the two things a
human actually does from a phone.

## 2. Why this build, not the retired Kanban TMA

A different, Hermes-Kanban-backed TMA was built and left unshipped
2026-07-13 (Axel/Hugo/Kai via Leo). Retired 2026-07-14: Hermes's Kanban
has no human-account model, so that build was reinventing multiuser auth
from scratch. Plane already has real accounts + roles for every human who
needs this. Full retirement writeup: `memory/veritas-project-knowledge.md`
(Werner's workspace). Two pieces were salvaged into this project's
scaffold (`auth/telegram_init_data.py`, `frontend/src/telegram/*`) — see
this project's README for what's real vs. stub in that scaffold.

## 3. Verified facts (checked live, not assumed)

- **Plane's `v1/` public API** (`plane/api/urls/*.py` on the live
  `plane-app-api-1` container) uses `APIKeyAuthentication` +
  `IsAuthenticated` — i.e. a bearer-style `X-Api-Key` header maps directly
  to a Plane user's own `APIToken`. No OAuth, no session cookie needed for
  this surface. Confirmed relevant endpoints exist:
  - `workspaces/<slug>/projects/<project_id>/issues/` (list/create)
  - `workspaces/<slug>/projects/<project_id>/issues/<pk>/` (detail/update)
  - `workspaces/<slug>/projects/<project_id>/issues/<issue_id>/comments/`
    (list/create) and `.../comments/<pk>/` (detail/update)
  - `workspaces/<slug>/projects/<project_id>/labels/` (list)
  - `workspaces/<slug>/issues/search/` (cross-project search)
- **Each person already has (or can get) their own Plane API token** —
  `werner-cto@techlevity.com` (Admin) has one already
  (`plane_api_6564689f98ed438286ec703c6eb88ee0`); `kiro-bot@techlevity.com`
  has one; Katya/Anna/Ed do not have personal tokens yet as far as this
  spec's author has confirmed — creating one per human is the same
  Django-shell pattern already used for the others (see
  `memory/plane-setup.md`), no new mechanism needed.
- **Telegram Mini App `initData` HMAC validation** — algorithm confirmed
  against Telegram's documented scheme and already implemented + tested
  in this project's scaffold (`auth/telegram_init_data.py`).
- **Existing infra to build on:** MinIO (artifact storage, unrelated but
  same host), Cloudflare tunnel `cloudflared-halcyon` (token-managed, API
  token in `memory/cloudflare-credentials.md`), the pattern for adding a
  new public route is already proven 4x this week (plane/veritasmain/
  veritasboard/veritas-storage).

## 4. Architecture

```
Telegram client
    |  (opens Mini App, Telegram injects initData)
    v
Frontend (React/Vite/TS, static bundle)
    |  POST /auth/telegram-login { initData }
    v
Backend (new — Python or Node, TBD by whoever builds it; FastAPI matches
         existing MCAT Coach precedent if Python is preferred)
    |  1. validate_init_data(initData, bot_token)   [scaffold: real, tested]
    |  2. resolve_plane_identity(telegram_user_id)   [scaffold: stub map]
    |  3. mint short-lived session (cookie or token) [NOT YET DESIGNED]
    v
Backend, on subsequent authenticated requests from the frontend:
    |  proxies to Plane's v1/ API using THAT PERSON'S OWN Plane token
    |  (never a shared service token — Plane's own audit log then
    |   correctly attributes actions to the human, not "the bot")
    v
Plane v1/ REST API (plane-app-api-1, already live, already proven)
```

**Deployment target:** Halcyon (same host as Plane + MinIO — avoids a new
cross-host network hop for every Plane API call). Backend + frontend
static files fronted by a new Caddy instance (or reuse existing patterns),
new Cloudflare tunnel route, e.g. `veritas-tma.techlevity.co.uk`.

## 5. Open architecture decisions (need a call before/during build)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Backend language/framework | Python/FastAPI vs Node/Express | FastAPI — matches MCAT Coach precedent already in the org, and `telegram_init_data.py` is already Python |
| 2 | Session mechanism (step 3 above) | Stateless HMAC-signed token (no DB, like the retired build's `BasicAuthProvider` pattern) vs. a small SQLite session table | Stateless HMAC token — zero new infra, matches the "no DB" posture already used for Plane/MinIO auth elsewhere in this project |
| 3 | Live updates | Poll on open + pull-to-refresh only (simplest) vs. SSE fed by the existing Plane→Hermes webhook vs. new Plane webhook dedicated to this app | Poll-only for v1 — no one's asked for real-time yet; add SSE later only if usage shows it's actually needed |
| 4 | Scope: which Plane project(s) visible in the TMA | Content Factory only vs. Content Factory + Internal Ops | Content Factory only for v1 — Internal Ops is Werner↔Kiro technical coordination, not Katya/Anna's domain |
| 5 | Write scope: what actions the TMA allows | Read-only vs. comment-only vs. comment + status/label change | Comment + status/label change — matches what a phone-based check-in is actually for; full issue editing stays on the Plane web UI |

## 6. Non-goals (explicit, to prevent scope creep)

- Not building push notifications (Telegram bot messages on Plane events)
  in v1 — that's the existing Plane↔Hermes webhook sync's job already, not
  this app's.
- Not building issue creation from the TMA in v1 — reduces surface area;
  add later if requested.
- Not attempting offline support / PWA installability — Telegram Mini
  Apps run inside Telegram's WebView; this isn't a standalone PWA.

## 7. Security notes carried forward from the retired build's review

- `initData` validation MUST reject requests older than 5 minutes
  (replay protection) — already implemented in the scaffold, keep as-is.
- Never trust a client-supplied Telegram user id from anywhere except the
  HMAC-validated `user` object inside `initData`.
- Per-person Plane tokens, not a shared service token, for correct audit
  attribution and to bound blast radius if one token leaks.
- The Telegram→Plane identity map (`telegram_user_map.py`) is a static,
  hand-maintained file for a known small headcount — do not build OAuth
  or a self-registration flow for this; that's solving a problem that
  doesn't exist at this scale.
- Whatever reverse proxy fronts this: path-whitelist + rate-limit on the
  `/auth/*` endpoint specifically (brute-force/DoS surface), same posture
  as the retired build's Caddy config (kept as reference, not reused
  verbatim — see this project's README).
