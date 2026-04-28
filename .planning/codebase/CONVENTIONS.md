# Coding Conventions

**Analysis Date:** 2026-04-28

## Naming Patterns

**Files**

- Frontend: components in `PascalCase.tsx` (e.g. `SchedulePickerDialog.tsx`, `PostsView.tsx`); hooks/helpers/data/api in `camelCase.ts` (e.g. `useAutoSave.ts`, `mock-pg-announcements.ts`, `mappers.ts`). Tests are colocated `*.test.ts(x)`.
- Backend: lowercased package directories (`server/internal/handler`, `server/internal/middleware`, `server/internal/pg`, `server/pkg/require`, `server/pkg/dotenv`); files are short snake-case-ish lowercase (`request_id.go`, `mock_files_test.go`, `otp.go`).

**Functions**

- TypeScript: `camelCase` for functions and methods (`mapAnnouncementSummary`, `toPGCreatePayload`, `withTimeout`). Exported React components are `PascalCase`.
- Go: `MixedCaps` for exported (`RequestID`, `LoggerFromContext`, `Equal`, `NoError`); lower `mixedCaps` for unexported (`newRequestID`, `parse`, `attempt`).

**Variables**

- TS: `camelCase` locals; module-scope mutable caches use plain `let` with descriptive names (`configsPromise`, `configsLoadedAt` in `web/api/client.ts`). `SCREAMING_SNAKE_CASE` reserved for true constants (`API_BASE`, `DEFAULT_WRITE_TIMEOUT_MS`, `EMPTY_CONFIG`, `CONFIGS_STALE_MS`, `PG_STATUS_BADGE`).
- Go: `mixedCaps`; constants `MixedCaps` exported, lower unexported (`requestIDHeader`).

**Types**

- TS types/interfaces are `PascalCase` (`PGAnnouncementPost`, `PGApiCreateDraftPayload`, `ReminderConfig`).
- ID values use **branded string types** in `web/data/mock-pg-announcements.ts`, e.g.:
  ```ts
  export type AnnouncementId = string & { readonly __brand: 'AnnouncementId' };
  export type ConsentFormId = `cf_${string}` & { readonly __brand: 'ConsentFormId' };
  export type ConsentFormDraftId = `cfDraft_${string}` & { readonly __brand: 'ConsentFormDraftId' };
  ```
  Discriminated unions carry a `kind` literal (`kind: 'announcement' | 'form'`) on `PGAnnouncementPost` / `PGConsentFormPost`.
- Domain constants and their presentation maps are colocated (e.g. `PGStatus` + `PG_STATUS_BADGE` in the same module).
- Go: exported types `MixedCaps`; `ctxKey*` private struct types per context key (`ctxKeyRequestID struct{}`, `ctxKeyLogger struct{}`).

## Code Style

**Formatting**

- Frontend: `oxfmt` (Prettier-compatible). Settings from `.oxfmtrc.json`: `printWidth: 100`, `tabWidth: 2`, `singleQuote: true`, `trailingComma: 'all'`, `sortImports: true`, Tailwind class sort enabled (stylesheet `./web/App.css`, `cn(...)` recognised).
- Backend: `gofmt` + `goimports`, both as formatters under `golangci-lint` v2 (`.golangci.yaml`). Rewrite rule converts `interface{}` → `any`.

**Linting**

- Frontend: `oxlint` (`.oxlintrc.json`) with the `correctness` category set to `error` plus an explicit allow-list. Notable rules: `typescript/no-explicit-any: error`, `typescript/use-unknown-in-catch-callback-variable: error`, `typescript/consistent-type-definitions`, `typescript/consistent-type-assertions`, `react/rules-of-hooks: error`, `eslint/no-console: warn`. Plugins: `typescript`, `react`, `import`. Ignores `**/build/**`, `**/dist/**`, `**/node_modules/**`.
- Backend: `golangci-lint run` (also exposed as `pnpm golint`).

**TypeScript strictness** (`tsconfig.app.json`): `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, `verbatimModuleSyntax: true` (so type-only imports must be marked `import type`).

**Pre-commit (`.husky/pre-commit`):** `pnpm lint-staged`, which from `.lintstagedrc.js` runs `oxlint --fix` on JS/TS and `oxfmt --write` across JS/TS/MD/HTML/CSS/JSON/YAML.

## Import Organization

Path alias `~/*` → `web/*` (from `tsconfig.app.json`). Convention from `web/api/mappers.test.ts`, `web/api/client.ts`, etc.:

1. Third-party imports (`vitest`, `react`, `@testing-library/react`).
2. Blank line.
3. Cross-cutting workspace imports via the `~` alias (`~/data/...`, `~/lib/notify`).
4. Blank line.
5. Relative imports from the same module (`./mappers`, `./errors`).
6. `import type { ... }` for pure type imports (enforced by `verbatimModuleSyntax`).

`oxfmt`'s `sortImports` enforces ordering automatically; `eslint/no-redeclare` and `import` plugin rules catch ordering or duplicate-import bugs.

## Error Handling

**Frontend** — typed PG error hierarchy in `web/api/errors.ts`:

- Base: `PGError` (`name`, `resultCode`, `httpStatus`).
- Subclasses: `PGSessionExpiredError` (-401/-4012), `PGNotFoundError` (-404), `PGCsrfError` (-4013), `PGRedirectError` (-4031, with `location: string | null`), `PGValidationError` (-400/-4001/-4003/-4004, with `fieldPath`/`subCode`), `PGTimeoutError` (synthetic `resultCode: -999`, `httpStatus: 0`).

`web/api/client.ts` translates pgw's `{resultCode, error: {errorReason}}` envelope in `handleErrorResponse(res)` and applies side-effects before rethrowing — e.g. session expiry navigates to `/session-expired`; -429 toasts via `notify.error(...)` then throws. Validation errors are thrown silently so containers can render inline. Redirects use `redirect: 'manual'` and surface as `PGRedirectError` (never silently followed). CSRF errors are retried once via `refreshCsrfToken()`; a second consecutive `PGCsrfError` rethrows. Callers should prefer `instanceof` over inspecting `resultCode`.

Catch variables are typed `unknown` (per `typescript/use-unknown-in-catch-callback-variable: error`); narrow before reading.

**Backend** — standard library idioms. Errors are returned, not panicked; tests assert via `require.NoError(t, err)` / `require.HasError(t, err)`. The `server/pkg/require` helpers (see `require.go`) format failures as `\nwant: %v\n got: %v` to match the CLAUDE.md want/got convention.

## Logging

**Backend:** Go standard `log/slog` (used in `server/cmd/tw/main.go`, `server/internal/handler/otp.go`, `server/internal/middleware/request_id.go`, `server/internal/config/config.go`). Per-request loggers are derived in `RequestID` middleware:

```go
logger := slog.Default().With("request_id", id)
ctx = context.WithValue(ctx, ctxKeyLogger{}, logger)
```

Handlers retrieve via `middleware.LoggerFromContext(ctx)` (falls back to `slog.Default()`).

**Frontend:** thin Sonner wrapper at `web/lib/notify.ts`:

```ts
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
};
```

Direct `console.*` calls trigger `eslint/no-console` warnings.

## Comments

CLAUDE.md does not mandate "no comments" — and code reflects that. Substantial JSDoc / block comments are used to explain _why_ (rationale, ordering constraints, contract caveats), not _what_. Examples in `web/api/client.ts`:

- `withTimeout`: explains how the composed signal disambiguates timeout vs caller abort and why `dispose` matters.
- `uploadToPresignedUrl`: warns "the order here is load-bearing — do not reorder."
- `getConfigs`: documents the 15-minute TTL and the failure-cache reset.

Inline `// ─── Section ───` separators visually group related blocks. Go files mostly use short doc comments on exported identifiers, matching the Go community norm.

Don't add ceremonial comments restating the code (e.g. `// increment counter`); do add comments when behaviour is surprising or contractual.

## Function Design

**Size / parameters:** functions stay focused; multi-step flows compose smaller helpers (e.g. `mutateApi` calls `attempt` internally; `uploadAttachment` chains `validateAttachmentUpload` → `uploadToPresignedUrl` → `verifyAttachmentUpload`).

**Options bag:** functions taking optional configuration use a single trailing object with a default of `{}` and destructured defaults (e.g. `options: { signal?: AbortSignal; timeoutMs?: number } = {}` in `mutateApi`). `verifyAttachmentUpload` uses `{timeoutMs = 30_000, intervalMs = 500}: {...} = {}`.

**Return values:** TS APIs return narrow types tied to the call (`Promise<{announcementDraftId: number}>`); Go handlers follow `(value, error)` and HTTP-layer functions write directly to `http.ResponseWriter`.

**Numeric literals:** underscore separators (`30_000`, `60_000`, `15 * 60 * 1000`) for readability.

## Module Design

**Barrel files:** present where a folder defines a cohesive surface — `web/components/ui/index.ts` re-exports every shadcn-style primitive (`badge`, `button`, `dialog`, etc.), and `web/components/Sidebar/index.ts` exists too. Domain modules (`web/api/`, `web/data/`) prefer named exports per file rather than a single barrel.

**Module-scope state** is rare and explicit. `web/api/client.ts`'s `configsPromise` / `configsLoadedAt` is a deliberate per-session memoisation; the failure path resets the cache so transient errors don't ground feature flags for the whole session.

**Path aliases:** always import cross-cutting modules via `~/...` (e.g. `~/data/mock-pg-announcements`, `~/lib/notify`); use relative paths only for siblings.

**API surface:** in `web/api/client.ts`, exports are explicitly marked (write helpers like `createDraft`, `updateDraft`, composed loaders like `loadPostsList`); internal helpers (`fetchApi`, `mutateApi`, `withTimeout`) stay unexported.

---

_Convention analysis: 2026-04-28_
