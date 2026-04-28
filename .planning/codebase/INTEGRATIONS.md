# External Integrations

**Analysis Date:** 2026-04-28

## APIs & External Services

### Parents Gateway (PGW) — primary upstream

- Base URL: `TW_PG_BASE_URL` (default `https://pg.moe.edu.sg`); request timeout `TW_PG_TIMEOUT_MS` (default 10000ms).
- Routing: `server/internal/pg/handler.go` dispatches based on `TW_PG_MOCK`. When false, `server/internal/pg/proxy.go` builds an `httputil.ReverseProxy` over a custom transport (`ResponseHeaderTimeout`) and forwards every `/api/{path...}` (GET/POST/PUT/DELETE) verbatim — pgw-web owns its own routing.
- Identity propagation: the proxy director strips `X-Forwarded-For` / `X-Real-IP`, forbids browser-supplied `X-TW-Staff-ID`, and re-injects the staff ID resolved via `pg.StaffIDFromContext` (`server/internal/pg/identity.go`). PGW must whitelist the BFF IP and trust `X-TW-Staff-ID`.
- Response envelope: pgw wraps payloads as `{body, resultCode, message, metadata}`. The frontend client unwraps via `unwrapEnvelope` in `web/api/client.ts`; mock fixtures are raw.
- Mock mode (default): `server/internal/pg/mock.go` registers ~80 routes covering announcements, consent forms, PTM meetings, groups, school data, message groups, HQ downloads, account/notification prefs, HeyTalia chat, files, and platform feature flags. Fixtures embedded at compile time via `//go:embed fixtures` from `server/internal/pg/fixtures/` (39 JSON files including `announcements.json`, `consent_forms.json`, `meetings.json`, `users_me.json`, `feature_flags.json`).
- Files subsystem (`/api/files/2/*`): mock simulates pgw's presigned-S3 upload flow; `preUploadValidation` returns `presignedUrl` pointing at `/api/files/2/mockUpload` so dev round-trips locally with no external S3.
- HeyTalia (AI chat): mocked stub returns `"mocked — HeyTalia disabled in experiment."`; real upstream is PGW.

### OTPaaS — TechPass OTP service (auth)

- Host: `TW_OTPAAS_HOST` (default `https://otp.techpass.suite.gov.sg`); timeout `TW_OTPAAS_TIMEOUT` (default 10s). Validation only runs when `TW_PG_MOCK=false`.
- Endpoints called by `server/internal/handler/otp.go`:
  - `POST {host}/otp` — request a flow ID for an email
  - `PUT  {host}/otp/{flow_id}` — verify the 6-digit PIN
- Auth header: `Authorization: Bearer <hmac>` where `<hmac>` is `base64(namespace:id:hex(hmac_sha256(secret, id)))` built by `buildAuthToken`. Also sends `X-App-Id`, `X-App-Namespace`.
- Email allow-list: production accepts only `@schools.gov.sg`; non-production also accepts `@tech.gov.sg` (`isAllowedEmail`).

## Data Storage

**Databases:**

- BFF (`server/`) holds zero persistent storage. The OTP flow uses an in-memory map (`var store = make(map[string]map[string]string)` in `server/internal/handler/otp.go`) — process-local and ephemeral.
- The companion local PGW stack (`docker-compose.yml`) runs MySQL 8.0 master + replica (ports 3306/3307, database `pgdb`, user `pg-local`). Owned by pgw-web, not by this repo.

**File Storage:**

- Production file uploads go through pgw's presigned-S3 contract (`/api/files/2/preUploadValidation`); the BFF only proxies. Mock mode redirects uploads to its own `/api/files/2/mockUpload`.

**Caching:**

- Local PGW stack runs Redis 7.0.15-alpine on port 6379 (used by pgw-web). The TW BFF itself does not cache.

## Authentication & Identity

**Auth Provider:**

- Use OTPaaS via TechPass for staff sign-in. Flow: request OTP (`POST /otp/request`) → set `session_id` cookie (32 random bytes, base64url, `HttpOnly`, `SameSite=Lax`, `Secure` in production) → verify PIN (`POST /otp/verify`).
- Session storage today is an in-memory map keyed by `session_id` mapping to `{otp_flow_id}` — not durable across restarts. Comment in `server/internal/pg/identity.go` notes "When TW auth middleware lands, it will call WithStaffID to inject the real session identity."
- Staff identity is forwarded to PGW via the `X-TW-Staff-ID` header (set by the proxy director, never trusted from client).

## Monitoring & Observability

**Error Tracking:**

- None integrated. Frontend surfaces errors via `web/lib/notify.ts` (sonner toasts) and typed `PGError` subclasses in `web/api/errors.ts`.

**Logs:**

- Backend uses `log/slog` with JSON handler and RFC3339 timestamps (`server/cmd/tw/main.go`). Level controlled by `TW_LOG_LEVEL` (default `info`).
- Request correlation: `server/internal/middleware/request_id.go` injects a request ID into the context; loggers retrieved via `middleware.LoggerFromContext`.
- Proxy errors return `502 {"error":"pg_unavailable"}` and are logged with path/method/err in `proxyErrorHandler`.

## CI/CD & Deployment

**Hosting:**

- No production hosting manifest committed. Production mode serves `dist/` directly from the Go binary (`server/internal/handler/handler.go`).

**CI Pipeline:**

- `.github/workflows/ci.yaml` runs three jobs on every PR (`pull_request: branches: ['*']`): `format` (`pnpm format`), `lint` (`pnpm lint --format=github`), and `go-lint` (`golangci/golangci-lint-action@v9`, `version: v2.11`). Concurrency cancels in-progress runs per ref.
- `.github/workflows/sast.yml` runs CodeQL on PRs and pushes to `main` for both `javascript-typescript` and `go` (matrix, `fail-fast: false`).
- Pre-commit (Husky) runs `pnpm lint-staged`: `oxlint --fix` for JS/TS, `oxfmt --write` for JS/TS/MD/HTML/CSS/JSON/YAML.

## Environment Configuration

**Required env vars** (loaded by `server/pkg/dotenv` from cwd; defined in `server/internal/config/config.go`):

- `TW_ENV` — `development` | `production`
- `TW_LOG_LEVEL` — slog level (default `info`)
- `TW_VITE_DEV_SERVER_URL` — required in development; must be http/https with host
- `TW_BUNDLE_DIRECTORY` — required in production; must exist on disk
- `TW_SERVER_PORT`, `TW_SERVER_READ_TIMEOUT`, `TW_SERVER_READ_HEADER_TIMEOUT`, `TW_SERVER_WRITE_TIMEOUT`, `TW_SERVER_IDLE_TIMEOUT`
- `TW_PG_MOCK` (bool), `TW_PG_BASE_URL`, `TW_PG_TIMEOUT_MS`
- `TW_OTPAAS_HOST`, `TW_OTPAAS_ID`, `TW_OTPAAS_NAMESPACE`, `TW_OTPAAS_SECRET`, `TW_OTPAAS_TIMEOUT` — validated only when `TW_PG_MOCK=false`

**Local PGW stack** (when running real upstream via `docker-compose.yml`):

- `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD_READ` — required by `pgw-web` and MySQL containers
- `pgw-web.env.example` template shipped at repo root for the pgw-web container's own env

**Secrets location:**

- All `.env*` files are gitignored by policy (per CLAUDE.md). Templates live at `.env.example` (BFF) and `pgw-web.env.example` (companion stack). No secrets are committed. `.npmrc` references the `@flow` GitLab registry — token must be provided out-of-band by the developer's environment.

## Webhooks & Callbacks

**Incoming:**

- None. The BFF exposes only `POST /otp/request`, `POST /otp/verify`, the `/api/{path...}` proxy/mock surface (`server/internal/pg/mock.go` + `proxy.go`), and `GET /` for the SPA shell (`server/internal/handler/handler.go` `Register`).

**Outgoing:**

- OTPaaS: `POST {host}/otp`, `PUT {host}/otp/{flow_id}` from `server/internal/handler/otp.go`.
- PGW: every `/api/*` request from the SPA when `TW_PG_MOCK=false`, via the reverse proxy.

---

_Integration audit: 2026-04-28_
