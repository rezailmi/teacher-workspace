# Absorbing MOE SDT into TW — Implementation Plan

## Context

TW (Teacher Workspace, this repo) is consolidating teacher-facing apps behind a single Go + Vite-React shell. PG (Parents Gateway) is already absorbed using a BFF pattern: Go reverse-proxy, Valkey session storage, MIMS SSO translation, `/api/{path...}` proxied to pgw-web, frontend restructured per RFC-027. The next app on the roadmap is **MOE SDT** — a student welfare / development dashboard at `/Users/shin/Desktop/projects/moe-diva-sdt/`. The user wants SDT absorbed using "the same approach" as PG.

**What's different this time** (vs the PG absorption):

1. **Frontend stack mismatch.** SDT's frontend is Next.js 16 full-stack (React 19, Tailwind 4, Zustand, TanStack Query, RHF+Zod). TW is a Vite SPA. "Restructure into `/web/apps/sdt/`" is a port, not a move — components transfer, SSR does not.
2. **Auth divergence.** PG talks MIMS SSO. SDT talks **TECHPASS OTP → NestJS-issued JWT cookie**. However, TW itself already integrates TECHPASS via `TW_OTPAAS_*` config ([config.go:49-56](../server/internal/config/config.go#L49-L56), [config.go:77-82](../server/internal/config/config.go#L77-L82)) — so the handshake is less alien than it looks: both sides already trust TECHPASS.
3. **Two backends in SDT, only one is real.** NestJS (`packages/backend/`, 26 modules, ~14 endpoints, canonical OpenAPI at `packages/backend/docs/openapi.yml`) is the API. Next.js `/api/*` has only `/health` and `/superset` glue — ignored.
4. **Second DB flavour.** SDT uses Postgres 17 + Prisma. It stays private to NestJS — **TW Go never opens a Postgres connection for SDT**. Postgres only appears in `docker-compose.yml` because NestJS needs it to serve locally, same reason MySQL is there for pgw-web.
5. **Superset (embedded analytics) is out of scope.** Placeholder UI for now.

**Intended outcome**: land the SDT scaffolding + one concrete read-only slice (`GET /master-list`) end-to-end, so the pattern is proven and remaining modules can be ported iteratively. Auth translation is stubbed in the first phases and real in Phase 4 once SDT team ships `/internal/session/issue`.

## Recommended Approach

### Route prefix

PG already owns `/api/{path...}` in TW's mux ([proxy.go:29-32](../server/internal/pg/proxy.go#L29-L32)). SDT cannot share that. Use **`/sdt/api/{path...}`** in TW; proxy director strips `/sdt` so NestJS sees its native `/api/*` routes. This also cleanly namespaces future apps (e.g. `/xyz/api/*`).

### Architecture (dev)

```
 Browser
   │
   │  TW session cookie (unchanged)
   ▼
 TW Go server (host, port 3000)
   ├─ /api/*        → httputil.ReverseProxy → pgw-web (container :3001)
   ├─ /sdt/api/*    → httputil.ReverseProxy → sdt-nestjs (container :3100)
   └─ /*            → Vite dev server / built bundle
                        │
                        ▼
              NestJS ──► Postgres 17 (private, TW Go never touches)
              pgw-web ──► MySQL master/replica + Redis (shared Valkey)
```

Divergences from PG noted inline: different prefix, different identity header (`X-TW-Staff-Email` not `X-TW-Staff-ID`), different upstream port, Postgres instead of MySQL.

### First slice

**`GET /sdt/api/master-list`** → NestJS `GET /master-list` (openapi.yml). Rendered at TW route `/sdt/master-lists` as a simple table.

Justification:
- Pure GET, no writes → no CSRF territory yet.
- No user scoping → decouples slice from Phase 4 auth translation.
- No path/query params → mock fixture is one JSON file, proxy is one mux line.
- Master lists are the dropdown source for most downstream SDT modules (offences, counsellings, late-comings), so proving this first de-risks every later port.

### Phased rollout

- **Phase 0 — Scaffolding + mock fixtures.** All TW-side files exist, `TW_SDT_MOCK=true`, `/sdt/api/master-list` returns fixture JSON. `web/apps/sdt/pages/MasterListsPage.tsx` renders against fixture. No SDT containers yet. Shippable independently.
- **Phase 1 — Real NestJS wired.** Add `sdt-postgres` + `sdt-nestjs` to compose. Stub NestJS auth middleware to accept `X-TW-Staff-Email` (dev only — precedent: pgw-web CSRF stub at [docker/pgw-web/](../docker/pgw-web/)). `TW_SDT_MOCK=false`. Same `MasterListsPage` now renders real DB data.
- **Phase 2 — More read modules.** Port `GET /classes`, `GET /students/{id}`, `GET /groups`, `GET /auth/me`. Generate TS types from `openapi.yml` via `openapi-typescript`. Still read-only.
- **Phase 3 — Writes.** `POST /students` (filter/sync), `POST /groups`, `DELETE /groups/{id}`. SDT doesn't use CSRF today (JWT cookie only per openapi.yml), so this phase is strictly easier than PG Phase 3.
- **Phase 4 — Real auth translation.** SDT team ships `POST /internal/session/issue`. TW adds `server/internal/sdt/session.go` — on TW login it POSTs the user's email + service token, stores returned `Set-Cookie` in Valkey under `sdt:session:<tw_session_id>`, injects on every proxied request. Remove the dev header stub.
- **Phase 5 — SSE for `GET /jobs/{id}`.** Set `FlushInterval=-1` on ReverseProxy, add integration test.
- **Phase N — Superset.** Explicitly deferred.

### Auth translation (Phase 4)

TW and SDT already both trust TECHPASS OTP. The blocker is that SDT's JWT cookie is minted by NestJS after its own OTP dance; there's no TW-facing endpoint that says "I trust this email, give me a session."

Recommended: **SDT team adds `POST /internal/session/issue`** — accepts `X-TW-Service-Token` (pre-shared secret) + `{ email }` body, returns the same `Set-Cookie: sdt_session=<jwt>` the OTP flow would. Alternatives (shared JWT signing key; OTP replay) rejected — one leaks crypto material outside SDT's trust boundary; the other needs a worse bypass.

File `docs/SDT-TEAM-ASKS.md` (TW repo) with three asks: (a) the `/internal/session/issue` endpoint, (b) production IP allowlist / CORS update, (c) JWT TTL + refresh semantics.

## Critical Files

### New in TW (this repo)

**Go backend** — mirrors [server/internal/pg/](../server/internal/pg/) one-for-one:
- [server/internal/sdt/handler.go](../server/internal/sdt/handler.go) — `Handler{cfg *config.SDTConfig}`, `Register(mux)` switches mock vs proxy. Model: [server/internal/pg/handler.go](../server/internal/pg/handler.go).
- [server/internal/sdt/proxy.go](../server/internal/sdt/proxy.go) — `ReverseProxy`. Director rewrites `/sdt/api/<rest>` → `/api/<rest>`, injects `X-TW-Staff-Email` (Phase 0/1) or `Cookie: sdt_session=<jwt>` (Phase 4+). Model: [server/internal/pg/proxy.go](../server/internal/pg/proxy.go) — note the extra path-strip step.
- [server/internal/sdt/identity.go](../server/internal/sdt/identity.go) — `StaffEmailFromContext` / `WithStaffEmail` context plumbing. Model: [server/internal/pg/identity.go](../server/internal/pg/identity.go).
- [server/internal/sdt/mock.go](../server/internal/sdt/mock.go) — `//go:embed fixtures`, per-endpoint `HandleFunc`. Model: [server/internal/pg/mock.go](../server/internal/pg/mock.go).
- [server/internal/sdt/session.go](../server/internal/sdt/session.go) — Phase 4 only. Valkey-backed JWT cookie cache.
- [server/internal/sdt/fixtures/master_list.json](../server/internal/sdt/fixtures/master_list.json) — Phase 0 seed (plus `auth_me.json`, `classes.json`, `groups.json`, `health_live.json`, `health_ready.json` as Phases 1-2 land).

**Config** — extend [server/internal/config/config.go](../server/internal/config/config.go):
- Add `SDTConfig` struct alongside `PGConfig`. Fields: `Mock bool`, `BaseURL string`, `APIPrefix string`, `TimeoutMS int`, `CookieName string`, `SessionKeyPrefix string`, `DevStaffEmail string`.
- Add `SDT SDTConfig `dotenv:",squash"`` to `Config`.
- Add defaults in `Default()` (mock on, base URL `http://localhost:3100`, timeout 10000ms, cookie name `sdt_session`).
- `.env.example` additions: `TW_SDT_MOCK`, `TW_SDT_BASE_URL`, `TW_SDT_API_PREFIX`, `TW_SDT_TIMEOUT_MS`, `TW_SDT_COOKIE_NAME`, `TW_SDT_SESSION_KEY_PREFIX`, `TW_SDT_DEV_STAFF_EMAIL`.

**Registration** — one line in `server/internal/handler/handler.go` alongside PG registration (path to confirm during implementation).

**Frontend** — new `web/apps/sdt/` per RFC-027 ([plans/2026-03-30-prod-migration-design.md](./2026-03-30-prod-migration-design.md)):
- [web/apps/sdt/routes.tsx](../web/apps/sdt/routes.tsx) — route array mounted under `/sdt` by the platform shell.
- [web/apps/sdt/api/client.ts](../web/apps/sdt/api/client.ts) — fetch wrapper, `credentials: 'include'`, base URL `/sdt/api`.
- [web/apps/sdt/api/types.ts](../web/apps/sdt/api/types.ts) — hand-written Phase 0/1; replaced by `openapi-typescript` output in Phase 2.
- [web/apps/sdt/api/master-list.ts](../web/apps/sdt/api/master-list.ts) — `useMasterLists()` TanStack Query hook.
- [web/apps/sdt/pages/MasterListsPage.tsx](../web/apps/sdt/pages/MasterListsPage.tsx) — first slice UI.
- [web/apps/sdt/pages/DashboardPage.tsx](../web/apps/sdt/pages/DashboardPage.tsx), [web/apps/sdt/pages/SupersetPlaceholder.tsx](../web/apps/sdt/pages/SupersetPlaceholder.tsx) — placeholders.
- [web/apps/sdt/layout/SdtLayout.tsx](../web/apps/sdt/layout/SdtLayout.tsx) — app chrome inside TW shell.

**Docker** — extend [docker-compose.yml](../docker-compose.yml):
- `sdt-postgres`: `postgres:17`, named volume `sdt_pg_data`, env `POSTGRES_USER/PASSWORD/DB=sdt`, health check.
- `sdt-nestjs`: `build.context: ..` + `dockerfile: tw-pg-experiment/docker/sdt-nestjs/Dockerfile` (new), port `3100:3000`, env overrides `DATABASE_URL=postgres://sdt-postgres:5432/sdt`, `CORS_ORIGINS=http://localhost:3000` (TW host), depends on `sdt-postgres` healthy.
- Reuse existing `redis` service (no new Valkey container).
- New [docker/sdt-nestjs/Dockerfile](../docker/sdt-nestjs/Dockerfile) — builds NestJS from the sibling `../moe-diva-sdt/packages/backend/` checkout (precedent: [docker/pgw-web/Dockerfile](../docker/pgw-web/Dockerfile)). Includes dev-only auth-middleware stub that trusts `X-TW-Staff-Email`.

**Docs**:
- [docs/SDT-CONTEXT.md](../docs/SDT-CONTEXT.md) — equivalent of [docs/PG-CONTEXT.md](../docs/PG-CONTEXT.md): what SDT is, what modules exist, which are in scope.
- [docs/SDT-BFF-DESIGN.md](../docs/SDT-BFF-DESIGN.md) — equivalent of [docs/PG-BFF-DESIGN.md](../docs/PG-BFF-DESIGN.md).
- [docs/SDT-TEAM-ASKS.md](../docs/SDT-TEAM-ASKS.md) — the three coordination asks.

### Reused (not modified)

- [server/internal/pg/](../server/internal/pg/) — architectural reference only.
- [docker/pgw-web/](../docker/pgw-web/) — reference for how to build a sibling monorepo's service inside TW's compose.
- [plans/2026-03-30-prod-migration-design.md](./2026-03-30-prod-migration-design.md) — RFC-027 frontend layout rules.
- [plans/2026-03-30-pg-gaps.md](./2026-03-30-pg-gaps.md) — useful as a shape for a future `SDT-GAPS.md` module-coverage tracker.

### Not touched

- [server/internal/pg/](../server/internal/pg/), [web/apps/pg/](../web/apps/pg/) (if present), MySQL, pgw-web container — all untouched.
- SDT source at `/Users/shin/Desktop/projects/moe-diva-sdt/` — untouched. All TW-side changes only. SDT-team asks filed separately.

## Verification

**Phase 0 (scaffolding + mocks)** — run on the host:

```bash
go build ./...                                   # build passes
go run ./cmd/tw                                  # starts on :3000 with TW_SDT_MOCK=true
curl -s http://localhost:3000/sdt/api/master-list | jq '.'   # returns fixture JSON
pnpm dev                                         # Vite on :5173
# Browser: http://localhost:3000/sdt/master-lists → table renders with fixture rows
golangci-lint run                                # clean
go test ./server/internal/sdt/...                # unit tests for handler mock + proxy director
```

**Phase 1 (real NestJS)** — add SDT containers, flip mock off:

```bash
docker compose up -d sdt-postgres sdt-nestjs
docker compose ps                                # both healthy
curl -s -H "X-TW-Staff-Email: dev@moe.edu.sg" http://localhost:3100/api/master-list | jq '.'   # direct
TW_SDT_MOCK=false go run ./cmd/tw
curl -s http://localhost:3000/sdt/api/master-list | jq '.'   # same data via TW
# Browser: /sdt/master-lists renders identical rows with mock off
```

**Phase 4 (auth translation)** — after SDT team ships `/internal/session/issue`:

```bash
# Log in to TW through MIMS/TECHPASS as normal
# Open devtools, watch Network tab on /sdt/master-lists
# Confirm: TW proxied request carries Cookie: sdt_session=<jwt> (not X-TW-Staff-Email)
# Confirm: Valkey has key matching TW_SDT_SESSION_KEY_PREFIX + <tw_session_id>
redis-cli KEYS 'sdt:session:*'
```

**Cross-cutting**:

```bash
go test ./... && pnpm lint && pnpm format --check
```

## Non-goals

- DB consolidation. SDT's Postgres stays private to NestJS.
- Modifying NestJS source. All SDT-side changes are team asks.
- Superset. Placeholder UI only.
- Porting SDT's Next.js `/api/*` routes. Orphaned, not needed.
- SSR. TW is a Vite SPA.
- Shared component extraction into `web/shared/*`. Platform-team concern per RFC-027, post-absorption.
- Production Dockerfile / deploy changes for TW itself. Dev-loop only for Phase 0.
- Designing the JWT service-to-service protocol beyond the `/internal/session/issue` ask.

## Open risks

1. **Phase 4 blocks on SDT team.** Phases 0-3 route around via `X-TW-Staff-Email` dev stub. No hard dependency until Phase 4.
2. **OpenAPI coverage gap.** 26 NestJS modules but ~14 documented endpoints. Confirm module↔endpoint mapping before Phase 2 or expect surprises.
3. **Next.js→Vite port volume.** ~15-30 non-trivial components and ~10 forms estimated. Tailwind 4 and React 19 should drop in; verify TW's Tailwind config parity in Phase 0.
4. **JWT TTL unknown.** If SDT tokens don't sliding-refresh, Phase 4 silent re-auth fires often — need clarification before Phase 4.
5. **Two upstream services in one compose.** Ops surface grows (Postgres + MySQL + Redis + pgw-web + sdt-nestjs). Acceptable for dev; document clearly.
