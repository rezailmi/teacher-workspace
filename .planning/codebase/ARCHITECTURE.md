<!-- refreshed: 2026-04-28 -->

# Architecture

**Analysis Date:** 2026-04-28

## System Overview

```text
┌─────────────────────────┐    ┌────────────────────────────┐    ┌────────────────────────┐
│ Browser (React 19 SPA)  │    │ Go BFF (server/cmd/tw)     │    │ Parents Gateway (PGW)  │
│ Vite dev :5173          │    │ net/http on :3000          │    │ real upstream OR       │
│ React Router routes     │◄──►│ /api/web /api/files /api/  │◄──►│ embedded fixtures      │
│ web/api/client.ts       │    │ configs                    │    │ (TW_PG_MOCK toggle)    │
│ uses /api/web/2/staff/* │    │ index.html SSR shim,       │    │                        │
│                         │    │ Vite proxy in dev          │    │ OTPaaS for real auth   │
└─────────────────────────┘    └────────────────────────────┘    └────────────────────────┘
        ▲                              ▲ ▲
        │ Vite dev proxy in :5173 ─────┘ │
        │ forwards /api/{web,files,configs} to :3001 (BFF)
        └─ HTML/JS/CSS served by Go in dev (proxied to Vite) or from `dist/` in prod.
```

## Component Responsibilities

| Component             | Responsibility                                           | File                                       |
| --------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Entry binary          | Boot config, slog JSON, signal-aware shutdown            | `server/cmd/tw/main.go`                    |
| Config loader         | `dotenv` struct binding + `Validate()`                   | `server/internal/config/config.go`         |
| HTTP handler          | Routes OTP, PG, `Index` (HTML/Vite proxy/static)         | `server/internal/handler/handler.go`       |
| PG mux                | Mock vs proxy dispatch                                   | `server/internal/pg/handler.go`            |
| PG mock               | Embedded fixtures + JSON stubs                           | `server/internal/pg/mock.go`               |
| PG proxy              | Reverse-proxy `/api/*` with staff-id header              | `server/internal/pg/proxy.go`              |
| Template executor     | Dev fetches index.html from Vite, prod parses bundle     | `server/internal/htmlutil/executor.go`     |
| Request-ID middleware | UUID per request + scoped slog logger                    | `server/internal/middleware/request_id.go` |
| OTP handler           | Request/verify OTP via OTPaaS HMAC                       | `server/internal/handler/otp.go`           |
| SPA bootstrap         | Mounts router, Sonner Toaster                            | `web/main.tsx`                             |
| Router                | Lazy route components, nested under `RootLayout`         | `web/App.tsx`                              |
| API client            | typed fetch, envelope unwrap, error taxonomy             | `web/api/client.ts`                        |
| Mappers               | PG wire shape ↔ TW domain shape                          | `web/api/mappers.ts`                       |
| Domain types          | TW shapes (`PGAnnouncementPost`, `PGConsentFormPost`, …) | `web/data/mock-pg-announcements.ts`        |
| Post-kind registry    | Kind→loader/memoKey dispatch                             | `web/data/posts-registry.ts`               |
| Containers            | Route-mounted views with `loader`/`Component` exports    | `web/containers/*.tsx`                     |

## Pattern Overview

**Overall:** BFF + SPA. Single Go binary serves the React bundle (or proxies Vite) and brokers all calls to PGW. Frontend treats the BFF as the only origin, calling `/api/web/2/staff/*`, `/api/files/*`, `/api/configs`.

**Key Characteristics:**

- BFF terminates auth (OTPaaS HMAC) and injects an `X-TW-Staff-ID` header upstream (`server/internal/pg/proxy.go:42-50`); browsers never see PGW directly.
- Mock mode (`TW_PG_MOCK=true`, default) registers fixture-backed `http.HandlerFunc`s instead of the reverse proxy — same wire shape, no PGW creds required.
- Frontend has zero global store: React Router data loaders own fetch + revalidation; module-scope memos cache `/api/configs`.
- Domain types (`PGAnnouncementPost`, `PGConsentFormPost`) live in `web/data/mock-pg-announcements.ts` and are produced by `web/api/mappers.ts`. Containers never read PG envelope shapes directly.
- Error taxonomy is encoded as `PGError` subclasses (`web/api/errors.ts`); containers branch on `instanceof`.

## Layers

**Backend (`server/`)**

- `cmd/tw` — `main.go` is the only `main`; wires config → handler → http.Server with `errgroup` shutdown.
- `internal/config` — strongly-typed env binding via `dotenv` struct tags.
- `internal/handler` — top-level mux registration + `Index` route (dev: proxy Vite assets / WS; prod: serve `dist/assets/*` + render `index.html`).
- `internal/pg` — domain handler with two register modes (mock/proxy) and a context key for `StaffIDFromContext`.
- `internal/htmlutil` — `TemplateExecutor` interface; dev impl re-fetches Vite, prod parses once.
- `internal/middleware` — `RequestID` injects request-scoped slog logger via context.
- `pkg/dotenv`, `pkg/require` — small reusable helpers used by `cmd/tw`.

**Frontend (`web/`)**

- `main.tsx` → `App.tsx` (router) → `containers/RootLayout.tsx` (sidebar shell) → child `containers/<View>.tsx`.
- `api/` — `client.ts` (fetch helpers + endpoint exports), `types.ts` (PG wire shapes), `mappers.ts` (wire ↔ domain), `errors.ts` (taxonomy).
- `data/` — domain shapes & registry (`mock-pg-announcements.ts`, `posts-registry.ts`).
- `components/` — split by surface: `posts/`, `comms/`, `Sidebar/`, `ui/` (shadcn primitives).
- `helpers/` — pure utilities (Tiptap, attachments, dates, CSV, `assertNever`).
- `hooks/` — cross-cutting hooks (`useAutoSave`, `useUnsavedChangesGuard`, `useIsMobile`).
- `lib/` — runtime utilities (toast wrapper `notify`, `cn`, validation-error mapping).

## Data Flow

### Primary Request Path (list view)

1. User navigates to `/posts` → `App.tsx:23` lazy-loads `containers/PostsView.tsx`.
2. React Router calls the route's exported `loader` → `loadPostsList()` + `loadConsentPostsList()` + `getConfigs()` in parallel (`web/containers/PostsView.tsx:76`).
3. `loadPostsList` issues `GET /api/web/2/staff/announcements` (own) and `…/shared` via `fetchApi` (`web/api/client.ts:163`, `web/api/client.ts:500`).
4. Vite dev proxy forwards `/api/web` to `localhost:3001` (`vite.config.ts:18`); BFF route hits `registerMockAnnouncements` (`server/internal/pg/mock.go:56`) and serves `fixtures/announcements.json`.
5. `unwrapEnvelope<T>` strips `{body, resultCode}` if present (real PGW), passes raw fixture through unchanged (`web/api/client.ts:64`).
6. Mappers (`web/api/mappers.ts:55+`) translate to `PGAnnouncementPost`. `mergeAndDedup` joins own + shared.
7. Component consumes `useLoaderData()`, renders rows. Mutations call `mutateApi` which routes through the same client → `useRevalidator()` invalidates the loader.

### Mock vs real-PGW path

- Mock: `pg.New(cfg).Register(mux)` calls `registerMock` → all `/api/web/2/staff/*`, `/api/files/2/*`, `/api/feature/2/*`, `/api/configs` mapped to `serveFixture` / `jsonStub` / `noContent`. Fixtures are `//go:embed fixtures` (`server/internal/pg/mock.go:11`).
- Real: `registerProxy` mounts a `httputil.ReverseProxy` on `GET/POST/PUT/DELETE /api/{path...}`; `director` strips spoofable headers, sets `X-TW-Staff-ID` from context. Errors return `502 {"error":"pg_unavailable"}` (`server/internal/pg/proxy.go:54`).

**State Management:**

- React Router loaders are the source of truth for route data; revalidation via `useRevalidator()` after mutations.
- Module-scope cache: `configsPromise` + `configsLoadedAt` for `/api/configs` with a 15-min TTL (`web/api/client.ts:370-391`).
- Per-form local state inside `CreatePostView.tsx` uses `useReducer` with explicit autosave (`useAutoSave` hook); no Redux, no Zustand.
- Toasts via Sonner — wrapped by `~/lib/notify` and triggered from `client.ts` for generic failures.

## Key Abstractions

- **`PGError` taxonomy** (`web/api/errors.ts`): `PGSessionExpiredError`, `PGNotFoundError`, `PGCsrfError`, `PGRedirectError`, `PGValidationError`, `PGTimeoutError`. Containers `instanceof`-check; `client.ts:103-132` is the single translation site.
- **Envelope unwrap** (`unwrapEnvelope`): tolerates raw mock fixtures and `{body, resultCode}` real PG payloads — production code can call either with one fetch helper.
- **`POST_REGISTRY`** (`web/data/posts-registry.ts`): kind-keyed dispatch (`announcement` | `form`) for loaders + memo keys; `satisfies Record<PGPost['kind'], …>` enforces exhaustiveness so a new kind is a compile error.
- **CSRF retry** (`mutateApi`, `postMultipart`): one-shot replay after `-4013`, then surfaces `PGCsrfError`.
- **`withTimeout`** (`web/api/client.ts:200-233`): caller `AbortSignal` ⊕ client-side timeout with disambiguating `didTimeout()` flag — yields `PGTimeoutError` distinct from caller aborts.
- **`TemplateExecutor` interface** (`server/internal/htmlutil/executor.go`): swap dev fetcher vs prod parsed template behind one method.
- **`StaffIDFromContext` / `WithStaffID`** (`server/internal/pg/identity.go`): typed context key. Today populated by a stub; auth middleware will plug in.
- **Embedded fixtures** (`//go:embed fixtures`): mock mode ships in the binary so designer setups need zero filesystem state.

## Entry Points

- Backend: `server/cmd/tw/main.go`
- Frontend: `web/main.tsx` → `web/App.tsx`
- Dev proxy: `vite.config.ts` (`/api/{web,files,configs}` → `:3001`)

## Architectural Constraints

- **Threading:** Go uses an `errgroup` to run `Listen+Serve` and signal-aware `Shutdown` concurrently (`server/cmd/tw/main.go:83-130`); request-scoped goroutines per `http.Handler`. React renders single-threaded; long work goes to loaders.
- **Global state (frontend):** only the configs cache (`configsPromise`, `configsLoadedAt`) and `mockAttachmentIDCounter` (server-side `atomic.Int64`). No Redux/Zustand/Jotai.
- **Mock vs real PGW contract:** flipping `TW_PG_MOCK=false` requires `TW_OTPAAS_*` and a reachable `TW_PG_BASE_URL`; the BFF reverse-proxies the same path space (`/api/{path...}`). Mock fixtures must keep field names and array-vs-object shapes identical to the real envelope so `unwrapEnvelope` and the mappers work in both modes.
- **OTPaaS secrets only validated when `!cfg.PG.Mock`** (`server/internal/config/config.go:118-121`); designers can run without secrets.
- **Server binds `[::1]:port`** (loopback-only in dev) — Vite is the public-facing dev server.
- **All writes are JSON via `mutateApi`**, except attachment uploads which go through the 3-leg `validateAttachmentUpload` → presigned POST → `verifyAttachmentUpload` flow (`web/api/client.ts:712-808`).

## Anti-Patterns

- **Containers reaching past the API layer:** none today; the rule is containers import from `~/api/client` only, never `fetch` directly. Preserve this when adding endpoints.
- **Bypassing mappers:** several inline comments warn that mock fixtures should not leak PG-only field names into containers. Always extend `mappers.ts` rather than reading `PGApi*` shapes from JSX.
- **Single-file mock router sprawl:** `server/internal/pg/mock.go` already groups by domain (`registerMockAnnouncements`, `registerMockPTM`, …) — keep new mocks in their domain block instead of appending at the bottom.
- **Hidden global state:** the configs cache works because TTL + drop-on-error are explicit; do not add module-scope mutables without that pattern (see `web/api/client.ts:370-391` as the template).
- **Implicit envelope handling:** never call `JSON.parse` directly on a response — always go through `fetchApi` / `fetchApiRoot` so `unwrapEnvelope` runs.

## Error Handling

**Strategy:** All HTTP failures funnel through `handleErrorResponse` (`web/api/client.ts:81-133`), which translates PGW's envelope into a typed `PGError` subclass and applies side-effects (redirect on session loss, toast on generic) before rethrowing. Validation errors throw silently so containers can render inline. Bare HTTP 404s are normalised to `PGNotFoundError` so route boundaries can render a "not found" page.

**Patterns:**

- `redirect: 'manual'` on every fetch so PG's `-4031` 302 surfaces as `PGRedirectError` (`web/api/client.ts:144-157`) instead of being silently followed into HTML.
- One-shot CSRF retry inside `mutateApi` and `postMultipart`; second `-4013` rethrows.
- `PGTimeoutError` (synthetic `resultCode -999`, `httpStatus 0`) distinguishes client-side timeouts from caller `AbortError`.
- BFF proxy errors return `502 {"error":"pg_unavailable"}` (`server/internal/pg/proxy.go:54`).

## Cross-Cutting Concerns

**Logging:** `slog` JSON handler in `server/cmd/tw/main.go:26-37`. `middleware.RequestID` derives a per-request logger keyed by `request_id`, retrieved via `LoggerFromContext` inside handlers.

**Validation:** `cfg.Validate()` joins per-field errors via `errors.Join`; `collectErrorMessages` flattens them for boot logging (`server/cmd/tw/main.go:141-155`). Frontend validation lives in `web/containers/createPostValidation.ts` and `web/lib/validation-errors.ts`, layered with Tiptap-aware text checks.

**Authentication:** OTPaaS HMAC flow only in real-PGW mode (`server/internal/handler/otp.go`). Mock mode short-circuits the session via `fixtures/session_current.json`. Future TW auth middleware will call `pg.WithStaffID(ctx, id)` so the proxy `director` can stamp `X-TW-Staff-ID`.

**CSP / headers:** `Content-Type` + `X-Content-Type-Options: nosniff` set on every JSON and HTML response; the proxy `director` deletes `X-Forwarded-For`, `X-Real-IP`, and any client-supplied `X-TW-Staff-ID` to prevent spoofing.

---

_Architecture analysis: 2026-04-28_
