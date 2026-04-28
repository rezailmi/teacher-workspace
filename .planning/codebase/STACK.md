# Technology Stack

**Analysis Date:** 2026-04-28

## Languages

**Primary:**

- Go 1.26.1 — backend BFF (`server/cmd/tw/main.go`, module `github.com/String-sg/teacher-workspace` per `go.mod`)
- TypeScript 6.0 — frontend application code (`web/`, `tsconfig.app.json` targets `ES2023`, `module: ESNext`, `jsx: react-jsx`)

**Secondary:**

- HTML/CSS — single entry `web/index.html`, Tailwind v4 stylesheet at `web/App.css`
- JSON — fixture-driven mock backend in `server/internal/pg/fixtures/`
- Shell — local infra scripts under `docker/`

## Runtime

**Environment:**

- Node.js 24 — pinned in `.github/workflows/ci.yaml` (`actions/setup-node@v6` with `node-version: 24`)
- Go 1.26.1 — pinned via `go.mod` and CI uses `go-version-file: 'go.mod'`

**Package Manager:**

- pnpm 10 — declared in `package.json` and pinned in CI (`pnpm/action-setup@v4`, `version: 10`)
- Lockfile: `pnpm-lock.yaml` present (frozen install enforced in CI via `pnpm install --frozen-lockfile`)
- Workspace: `pnpm-workspace.yaml` present
- Custom registry: `.npmrc` scopes `@flow` to `https://sgts.gitlab-dedicated.com/api/v4/projects/60257/packages/npm/`

## Frameworks

**Core (frontend):**

- React 19.2.3 + react-dom 19.2.3 — UI runtime (`web/main.tsx`, `web/App.tsx`)
- react-router 7.12.0 — client-side routing
- @flow/core 0.1.18 + @flow/icons 0.1.0 — internal MOE design system (private GitLab registry)
- @base-ui/react 1.4.0 + @radix-ui/colors 3.0.0 — primitive UI + color tokens
- Tailwind CSS 4.2.2 (via `@tailwindcss/vite`) — styling; configured through `web/App.css` (CSS-first config); class merging via `clsx` + `tailwind-merge`; helper `cn` defined under `web/lib/utils.ts`
- shadcn/ui — generator config in `components.json` (style `default`, base `slate`, alias `~/components/ui`, `lucide` icons)
- @tiptap/react 3.22.3 + starter-kit and extensions (`character-count`, `highlight`, `link`, `text-align`, `underline`) — rich text editor (with pinned `@tiptap/pm` 3.22.3 via `pnpm.overrides`)
- react-day-picker 9.14.0 — date pickers
- motion 12.27.1 — animations
- sonner 2.0.7 — toasts (wrapped by `web/lib/notify.ts`)
- class-variance-authority 0.7.1 — variant API for components
- lucide-react 1.8.0 — icon set

**Core (backend):**

- Standard library `net/http` — HTTP server and `httputil.NewSingleHostReverseProxy` for Vite dev passthrough (`server/cmd/tw/main.go`, `server/internal/handler/handler.go`)
- `golang.org/x/sync` v0.19.0 — `errgroup` for graceful shutdown
- `github.com/go-viper/mapstructure/v2` v2.5.0 — env decoding through `server/pkg/dotenv` with the `dotenv:` struct tag
- `embed` (stdlib) — fixture filesystem in `server/internal/pg/mock.go` (`//go:embed fixtures`)
- `log/slog` — structured JSON logging configured in `main.go`

**Testing:**

- Vitest 4.1.5 + @vitest/ui 4.1.5 — frontend unit tests (`vitest.config.ts`, `environment: 'jsdom'`, globals enabled, setup `web/test/setup.ts`)
- @testing-library/react 16.3.2, @testing-library/jest-dom 6.9.1, @testing-library/user-event 14.6.1 — component testing
- jsdom 29.0.2 — DOM simulator
- Go `testing` (stdlib) — package tests live alongside sources (e.g. `server/internal/handler/otp_test.go`, `server/internal/pg/mock_files_test.go`)

**Build/Dev:**

- Vite 8.0.7 — frontend dev server and bundler (`vite.config.ts`: `root: 'web'`, alias `~` → `web/`, build `outDir: '../dist'`)
- @vitejs/plugin-react 6.0.1 — React Fast Refresh
- @tailwindcss/vite 4.2.2 — Tailwind v4 plugin
- TypeScript 6.0.2 — type-check via `tsc -b`; project references `tsconfig.app.json` + `tsconfig.node.json`
- oxlint 1.59.0 — linter (config in `.oxlintrc.json`, categories `correctness: error`, plugins `typescript`, `react`, `import`)
- oxfmt 0.44.0 — formatter (config in `.oxfmtrc.json`, sortImports + sortTailwindcss with `cn` function recognition)
- golangci-lint v2.11 — Go static analysis (config in `.golangci.yaml`: `gofmt` rewrites `interface{}` → `any`, plus `goimports`)
- Husky 9.1.7 + lint-staged 16.4.0 — pre-commit runs `oxlint --fix` and `oxfmt --write` (`.husky/pre-commit`, `.lintstagedrc.js`)

## Key Dependencies

**Critical:**

- React 19.2.3 / react-dom 19.2.3 — application runtime
- Vite 8.0.7 — dev server proxies `/api/web`, `/api/files`, `/api/configs` to `http://localhost:3001`
- @flow/core 0.1.18 — design system; requires GitLab registry auth via `.npmrc`
- TypeScript 6.0.2 — strict mode via `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`
- @tiptap/react 3.22.3 (with `@tiptap/pm` override) — content authoring

**Infrastructure:**

- `golang.org/x/sync` v0.19.0 — concurrency primitives in BFF
- `github.com/go-viper/mapstructure/v2` v2.5.0 — env-to-struct decoder under `server/pkg/dotenv`
- pnpm overrides: `@tiptap/pm: 3.22.3` — keep ProseMirror peer aligned

## Configuration

**Environment:**

- Use environment variables prefixed `TW_`. Loader: `server/pkg/dotenv` reads from cwd at startup (`server/cmd/tw/main.go`).
- Defaults live in `config.Default()` at `server/internal/config/config.go`; validation runs at boot — invalid configs cause `os.Exit(1)`.
- Runtime mode is binary: `TW_PG_MOCK=true` (default) embeds JSON fixtures; `TW_PG_MOCK=false` reverse-proxies to PGW at `TW_PG_BASE_URL` and requires `TW_OTPAAS_*` credentials (validation gated by `cfg.PG.Mock`).
- Frontend reads no env directly — Vite proxy rewrites `/api/*` paths to the BFF on `:3001` (or `:3000` when running BFF directly per CLAUDE.md).

**Build:**

- Frontend: `tsc -b && vite build` produces `dist/` (consumed by Go in production via `htmlutil.NewProductionTemplateExecutor`).
- Backend: `go build -o build/tw ./server/cmd/tw`.
- Project tsconfig references: `tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`; path alias `~/*` → `./web/*`.

## Platform Requirements

**Development:**

- Use Go 1.26.1, Node 24, pnpm 10. Run `go run ./server/cmd/tw` (port 3000) and `pnpm dev` (Vite on 5173, proxies `/api` to 3000) per CLAUDE.md. Mock mode requires no DB or PGW credentials.
- Optional local PGW stack via `docker-compose.yml`: MySQL 8.0 master/replica, Redis 7.0.15-alpine, and `pgw-web` container on port 3001 (used only when `TW_PG_MOCK=false`).

**Production:**

- Single Go binary serves the built React bundle. `cfg.Environment == EnvironmentProduction` switches `handler.New` to `NewProductionTemplateExecutor` and serves `dist/assets/` via `http.FileServer`. No production hosting target is committed in this repo.

---

_Stack analysis: 2026-04-28_
