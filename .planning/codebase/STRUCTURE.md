# Codebase Structure

**Analysis Date:** 2026-04-28

## Directory Layout

```
teacher-workspace/
├── server/                          # Go BFF
│   ├── cmd/tw/                      # main package: boot, signals, http.Server
│   │   └── main.go
│   ├── internal/
│   │   ├── config/                  # dotenv-bound Config + Validate()
│   │   ├── handler/                 # top-level mux: Index, OTP, mounts pg.Handler
│   │   ├── htmlutil/                # TemplateExecutor (dev fetch / prod parse)
│   │   ├── middleware/              # Chain + RequestID (per-request slog logger)
│   │   └── pg/                      # PGW domain: mock | proxy
│   │       ├── handler.go           # Mock-vs-proxy switch
│   │       ├── identity.go          # ctx key for staff identity
│   │       ├── mock.go              # All `/api/web/2/staff/*` mock routes
│   │       ├── proxy.go             # Reverse proxy + director
│   │       └── fixtures/            # //go:embed JSON fixtures (40 files)
│   └── pkg/                         # Reusable helpers (dotenv, require)
├── web/                             # React 19 SPA
│   ├── main.tsx                     # ReactDOM root + Sonner Toaster
│   ├── App.tsx                      # createBrowserRouter + lazy routes
│   ├── App.css
│   ├── index.html
│   ├── api/                         # BFF/PGW client edge
│   │   ├── client.ts                # fetch helpers, endpoint exports, configs cache
│   │   ├── types.ts                 # PGApi* wire shapes
│   │   ├── mappers.ts               # PG ↔ TW domain (PGAnnouncementPost etc.)
│   │   └── errors.ts                # PGError taxonomy
│   ├── components/
│   │   ├── ui/                      # shadcn primitives (badge, button, dialog, …)
│   │   ├── posts/                   # Post-domain widgets (PostCard, RichTextEditor, …)
│   │   ├── comms/                   # Recipient/staff/student selectors
│   │   ├── Sidebar/                 # App shell sidebar (Provider+Trigger+Items)
│   │   ├── AppCard.tsx
│   │   └── ChunkErrorBoundary.tsx
│   ├── containers/                  # Route views — each exports loader + Component
│   │   ├── RootLayout.tsx           # Outer shell (sidebar + Outlet)
│   │   ├── HomeView.tsx
│   │   ├── PostsView.tsx            # /posts list
│   │   ├── PostDetailView.tsx       # /posts/:id
│   │   ├── CreatePostView.tsx       # /posts/new and /posts/:id/edit
│   │   ├── createPostValidation.ts  # CreatePost-specific validation
│   │   ├── ComponentsView.tsx
│   │   ├── SessionExpiredView.tsx
│   │   └── StudentsView.tsx
│   ├── data/                        # Domain shapes + per-kind dispatch
│   │   ├── mock-pg-announcements.ts # PGAnnouncementPost / PGConsentFormPost / PGPost
│   │   └── posts-registry.ts        # POST_REGISTRY (kind → loader/memoKeys)
│   ├── helpers/                     # Pure utils (Tiptap, attachments, dates, CSV)
│   ├── hooks/                       # useAutoSave, useUnsavedChangesGuard, useIsMobile
│   ├── lib/                         # Runtime utils (notify, cn, validation-errors)
│   ├── public/                      # Static assets served by Vite
│   └── test/                        # Vitest setup (`setup.ts`)
├── docs/
│   ├── architecture/                # backend RFCs (028), frontend RFC (027), design notes
│   ├── audits/                      # PG-backend contract audit
│   ├── plans/                       # Dated implementation plans
│   ├── references/                  # pg-context.md, pg-api-contract.md, pg-specs.md
│   ├── brainstorms/, ideation/, setup/, screenshots/
│   ├── design-system.md
│   └── README.md
├── todos/                           # Captured task notes
├── build/, dist/                    # Go binary and Vite output (gitignored)
├── docker/, docker-compose.yml      # Container scaffolding
├── .planning/codebase/              # (this file + ARCHITECTURE.md)
├── vite.config.ts, vitest.config.ts
├── tsconfig.json, tsconfig.app.json, tsconfig.node.json
├── package.json, pnpm-lock.yaml, pnpm-workspace.yaml
├── go.mod, go.sum, .golangci.yaml
├── CLAUDE.md, DESIGN.md, TODOS.md
└── .env.example, pgw-web.env.example
```

## Directory Purposes

- **`server/cmd/tw/`** — Sole Go `main`. Boot order: slog handler → `config.Default` → `dotenv.Load` → `Validate` → `handler.New` → `http.Server` under `errgroup`. Don't add a second binary unless you genuinely need it; prefer extending the handler.
- **`server/internal/config/`** — Single `Config` struct with `dotenv:"TW_*"` tags and `Validate()`. Add a new env var by adding a field; update `Default()` and `validate()` if it's required.
- **`server/internal/handler/`** — Top-level mux (`handler.go`), Vite-aware `Index` (`index.go`), and OTPaaS handlers (`otp.go`). Mounts `pg.New(&cfg.PG).Register(mux)`.
- **`server/internal/pg/`** — All PGW-shape routes. `mock.go` (~400 lines) groups handlers by domain (`registerMockAnnouncements`, `registerMockConsentForms`, `registerMockPTM`, `registerMockGroups`, `registerMockSchool`, `registerMockMessageGroups`, `registerMockHQDownloads`, `registerMockAccount`, `registerMockHeyTalia`, `registerMockFiles`, `registerMockPlatform`). Fixtures embedded via `//go:embed fixtures`.
- **`server/internal/middleware/`** — Composable `Middleware` type and `Chain`. Today only `RequestID`; new global concerns (auth, RBAC) belong here.
- **`server/internal/htmlutil/`** — Strategy interface for HTML rendering. Dev fetches `index.html` from Vite each request; prod parses once at startup.
- **`server/pkg/`** — Reusable, no-`internal` import-allowed helpers (`dotenv`, `require`).
- **`web/api/`** — Single ingress for all network IO. `client.ts` exports the named functions every container imports (`loadPostsList`, `createAnnouncement`, …). `mappers.ts` translates wire ↔ domain shapes. `errors.ts` defines `PGError` subclasses.
- **`web/containers/`** — Route-level views. Each file exports `loader` and a default React component (per `App.tsx` lazy routes). Heavy pages (`CreatePostView` ~1.3k LoC) own their reducers + validation in colocated files.
- **`web/components/`** — Stateless or near-stateless UI. `ui/` is the shadcn primitive set; everything else is domain-grouped.
- **`web/data/`** — Domain types and registries. `mock-pg-announcements.ts` is the canonical `PGPost` shape; `posts-registry.ts` is the kind dispatch.
- **`web/helpers/`** — Pure functions; no React imports. Tiptap, attachment validation, CSV export, dates.
- **`web/hooks/`** — Generic React hooks (autosave, unsaved-changes guard, viewport).
- **`web/lib/`** — Runtime non-pure utilities — toast wrapper, `cn` (clsx+tailwind-merge), validation-error → field-path mapping.
- **`docs/architecture/`** — RFCs and architectural notes. Reference before non-trivial changes (`backend-rfc-028.md`, `frontend-rfc-027.md`, `pg-bff-design.md`).
- **`docs/references/pg-api-contract.md`** & **`pg-context.md`** — Authoritative PGW contract; consult before changing wire shapes.

## Key File Locations

**Entry Points**

- Backend: `server/cmd/tw/main.go`
- Frontend: `web/main.tsx` → `web/App.tsx`

**Configuration**

- Go: `server/internal/config/config.go` (with `Default()` + `Validate()`)
- Frontend build: `vite.config.ts`, `tsconfig.app.json`
- Tests: `vitest.config.ts`, `web/test/setup.ts`
- Lint: `.golangci.yaml`, `.oxlintrc.json`, `.oxfmtrc.json`, `.lintstagedrc.js`

**Core Logic**

- Routing: `web/App.tsx`
- Sidebar shell: `web/components/Sidebar/Sidebar.tsx`
- API client + endpoints: `web/api/client.ts`
- Wire ↔ domain mappers: `web/api/mappers.ts`
- Mock fixtures registry: `server/internal/pg/mock.go`
- Reverse proxy: `server/internal/pg/proxy.go`
- Post domain types: `web/data/mock-pg-announcements.ts`
- Post create/edit: `web/containers/CreatePostView.tsx` + `createPostValidation.ts`

**Testing**

- Go tests live next to code: `*_test.go` (e.g. `server/internal/handler/otp_test.go`).
- Frontend tests are colocated: `*.test.ts(x)` (e.g. `web/api/client.test.ts`, `web/components/posts/SchedulePickerDialog.test.tsx`, `web/containers/PostsView.test.tsx`).

## Naming Conventions

**Files**

- React components: PascalCase `.tsx` (`PostCard.tsx`, `SchedulePickerDialog.tsx`).
- Hooks: `use*.ts` (`useAutoSave.ts`).
- shadcn primitives: kebab-case (`drop-down-menu.tsx`, `radio-group.tsx`) — preserves upstream naming, do not rename.
- Helpers/lib: lower-camel `.ts` (`exportCsv.ts`, `dateTime.ts`, `validation-errors.ts`).
- Containers: `<Name>View.tsx` for routed pages.
- Tests: `<sibling>.test.ts(x)`.
- Go: lower-snake (`request_id.go`, `mock_files_test.go`); package == directory name.

**Directories**

- Frontend: lowercase plural for buckets (`components/`, `containers/`, `helpers/`); PascalCase only when the directory exports a single composite component (`Sidebar/`).
- Backend: lowercase package names; one package per directory.

**Symbols**

- Domain types prefixed `PG` (`PGPost`, `PGAnnouncementPost`, `PGStatus`).
- Wire types prefixed `PGApi` (`PGApiAnnouncementDetail`, `PGApiCreateConsentFormPayload`).
- Errors: `PG*Error` subclasses of `PGError`.
- Branded IDs: `AnnouncementId`, `ConsentFormId`, `AnnouncementDraftId`, `ConsentFormDraftId` (declared in `mock-pg-announcements.ts`).

## Where to Add New Code

**New post-domain UI widget** → `web/components/posts/<Name>.tsx`. Keep it stateless or take state via props; if it needs server data, lift fetching to the container.

**New shadcn primitive** → `web/components/ui/<name>.tsx` (kebab-case) and re-export from `web/components/ui/index.ts`.

**New route** → add a child entry in `web/App.tsx` with `lazy: () => import('./containers/<View>')`. Inside the new container, export a `loader` and the `Component` (default). Register matching mock data in `server/internal/pg/mock.go` if it needs new endpoints.

**New PG-shaped endpoint (mock)** → add an `mux.HandleFunc` line inside the matching `registerMock<Domain>` block in `server/internal/pg/mock.go`. Add the JSON fixture under `server/internal/pg/fixtures/` and reference it via `serveFixture(...)`. The proxy variant needs no changes — it forwards everything under `/api/{path...}`.

**New PG wire shape** → declare in `web/api/types.ts` (`PGApi*`). If containers need a normalized form, add a mapper in `web/api/mappers.ts` and a domain type in `web/data/mock-pg-announcements.ts`. Then export a typed function from `web/api/client.ts`.

**New post kind** → add a literal to `PGPost['kind']` in `web/data/mock-pg-announcements.ts`, then satisfy the new slot in `POST_REGISTRY` (`web/data/posts-registry.ts`); compile errors will guide the rest.

**New BFF endpoint outside PG** → register on the mux inside `(*Handler).Register` in `server/internal/handler/handler.go`. Use `middleware.LoggerFromContext(r.Context())` for request-scoped logging.

**New utility (pure)** → `web/helpers/<name>.ts` (no React imports). With React deps → `web/hooks/` if it's a hook, else `web/lib/`.

**New env var** → add a field with `dotenv:"TW_*"` tag to the right struct in `server/internal/config/config.go`, set a default in `Default()`, and (if required) extend `Validate()`. Document in `.env.example`.

**New error category** → subclass `PGError` in `web/api/errors.ts`, then map a `resultCode` in `handleErrorResponse` (`web/api/client.ts:103+`). Containers branch on `instanceof`.

**New cross-cutting middleware** → `server/internal/middleware/<concern>.go`, then add to `middleware.Chain(...)` in `server/cmd/tw/main.go:69-72`.

**Test placement**

- Frontend: colocate `<file>.test.ts(x)` next to the unit under test.
- Go: same package, `_test.go` suffix; use parent test + subtests, `want/got` style (see `CLAUDE.md`).

## Special Directories

- **`server/internal/pg/fixtures/`** — Source of truth for mock-mode JSON. Field names must match real PGW so `unwrapEnvelope` and mappers stay shape-compatible.
- **`docs/plans/`** — Dated, numbered implementation plans (`YYYY-MM-DD-NNN-<slug>-plan.md`). Look here before starting work; many plans encode the "why" missing from code comments.
- **`docs/audits/`** — Authoritative analyses (e.g. `pg-backend-contract.md`); read before changing wire shapes or status mappings.
- **`docs/references/`** — `pg-context.md`, `pg-api-contract.md`, `pg-specs.md`, `pg-team-asks.md`. PGW behaviour reference.
- **`todos/`** — Captured tasks; `TODOS.md` at repo root is the index. Don't promote ad-hoc TODOs here without a plan ref.
- **`.planning/codebase/`** — Generated codebase maps (this file + `ARCHITECTURE.md`). Refresh, don't hand-edit beyond the templates.
- **`build/`, `dist/`** — Output artifacts (Go binary, Vite bundle). Gitignored.
- **`.compound-engineering/`, `.context/`, `.claude/`** — Local agent state; gitignored.

---

_Structure analysis: 2026-04-28_
