# Local pgw-web Integration Setup

## Overview

This documents how to run the Parents Gateway (pgw-web) backend locally so the Teacher Workspace Go BFF proxies to real API responses instead of mock fixtures.

## Architecture

```
Browser → Vite (5173) → Go BFF (3000) → pgw-web (3001) → MySQL (3306/3307)
                                                        → Redis (6379)
```

All services run locally. pgw-web runs inside Docker (Node 24) because the project requires Node 24.x and is incompatible with Node 25+.

## Prerequisites

- Docker Desktop running
- The following repos cloned as siblings:
  - `tw-pg-experiment/` (this repo)
  - `pgw-web/`
  - `pgw-db-migration/`

## Setup (first time)

### 1. Build pgw-db-migration dist

pgw-web depends on `@pgw/db-migration` as an npm package. The Docker build copies the built dist into the container.

```bash
cd ../pgw-db-migration
npm ci
npm run build   # produces dist/
```

### 2. Start infrastructure + pgw-web

```bash
cd ../tw-pg-experiment
docker compose up -d
```

This starts:

- MySQL master (port 3306) + replica (port 3307) with replication
- Redis (port 6379)
- pgw-web Express server (port 3001, Node 24)

Wait for the init container to finish configuring replication:

```bash
docker compose logs mysql-init
# Look for: "Replication configured" and "Replica_IO_Running: Yes"
```

### 3. Seed the database

```bash
cd ../pgw-db-migration
cp .env.example .env
npm run db:reset
```

This runs ~285 migrations and seeds test data (staff, schools, announcements, etc.).

### 4. Fix staff inactivity timestamps

The seeded data has old `lastLoginAt` dates, which causes the inactivity check to reject logins. Update them:

```bash
docker exec pgw-mysql-master mysql -u pg-local -piloveida pgdb \
  -e "UPDATE pg_staff SET lastLoginAt = NOW() WHERE loginId IS NOT NULL AND isActivated = 1;"
```

### 5. Verify pgw-web is running

```bash
docker logs pgw-web | grep "Running express"
# Should show: Running express server on http://localhost:3001, port 3001

curl -s http://localhost:3001/api/configs | head -c 100
# Should return JSON config data
```

## Daily development

### Start services

```bash
docker compose up -d          # MySQL, Redis, pgw-web
pnpm dev                      # Go BFF (port 3000) + Vite (port 5173)
```

### Login (get session cookies)

Open this URL in your browser:

```
http://localhost:3001/api/web/2/staff/identity/login/BypassMIMS?loginId=PGU00032@hq.moe.gov.sg&type=mims
```

This creates a session cookie for staff user "KIT KAT" (admin at SANDWICH PRIMARY SCHOOL). The cookie is set for `localhost` and works across ports, so requests from the browser to port 3000 (Go BFF) will include it.

### Available test staff

| loginId                 | Name           | Role  | Login Type |
| ----------------------- | -------------- | ----- | ---------- |
| PGU00032@hq.moe.gov.sg  | KIT KAT        | admin | mims       |
| PGU00051@hq.moe.gov.sg  | Lynn Yeo       | admin | mims       |
| H9999999Z@hq.moe.gov.sg | HEYTALIA STAFF | staff | mims       |
| moe-pg-test01@tp.edu.sg | BP STAFF 1     | admin | ad         |

For `ad` type staff, use the AD bypass endpoint instead:

```
http://localhost:3001/api/web/2/staff/identity/login/ad/tp/bypass?loginId=moe-pg-test01@tp.edu.sg&type=ad
```

### Stop services

```bash
docker compose down            # stop containers, keep data
docker compose down -v         # stop and wipe all data (need to re-seed)
```

## TW configuration

The `.env` file in this repo controls mock vs proxy mode:

```bash
# Mock mode (default) — serves static JSON fixtures
TW_PG_MOCK=true

# Proxy mode — forwards to local pgw-web
TW_PG_MOCK=false
TW_PG_BASE_URL=http://localhost:3001
TW_PG_TIMEOUT_MS=10000
```

## How the proxy works

In proxy mode, the Go BFF's `proxy.go` uses `httputil.ReverseProxy` to forward all `/api/*` requests to pgw-web. The `director` function:

1. Rewrites the request URL to the target host
2. Strips `X-Forwarded-For` and `X-Real-IP` headers
3. Injects `X-TW-Staff-ID` from request context (when TW auth is implemented)

Session cookies from pgw-web pass through the proxy transparently — the browser sets them for `localhost` which covers both port 3000 and 3001.

## How the Docker setup works

### pgw-web in Docker

pgw-web requires Node 24.x (incompatible with Node 25+ due to `buffer-equal-constant-time` dependency). The Dockerfile:

1. Uses `node:24-slim` base image
2. Removes `@pgw/rn-storybook` (private GitLab registry, only used by frontend)
3. Copies `@pgw/db-migration` dist directly into `node_modules/`
4. Builds only the server bundle (skips client webpack — we don't need pgw-web's frontend)
5. Env vars are loaded from `pgw-web.env.example` at runtime via `env_file` in docker-compose

### Private registry bypass

pgw-web depends on two `@pgw` scoped packages from a private GitLab registry (`sgts.gitlab-dedicated.com`). Access normally requires 1Password CLI to generate an `.npmrc` with auth tokens. The Docker build bypasses this:

- `@pgw/db-migration` — copied from the local `pgw-db-migration` repo's built `dist/`
- `@pgw/rn-storybook` — removed from package.json (only used by the React frontend, not the Express server)

### MySQL replication

The docker-compose mirrors pgw-db-migration's `db-up.sh` setup:

- Master (port 3306): read-write, user `pg-local`
- Replica (port 3307): read-only, user `pg-local-read`
- An init container configures binary-log replication between them

---

## Known issues and considerations

### Things that need PG team help

1. **`X-TW-Staff-ID` header is not used by pgw-web.** The Go BFF proxy injects this header for authenticated staff, but pgw-web's middleware ignores it — it only trusts its own session cookies. For TW to work without requiring users to log in through pgw-web directly, pgw-web would need middleware that accepts `X-TW-Staff-ID` from trusted internal IPs and creates a session context from it. This is the main integration point that needs PG team involvement.

2. **Session cookie coupling.** Currently the browser must log in to pgw-web directly (port 3001) to get session cookies, then those cookies happen to work for the Go BFF (port 3000) because both are on `localhost`. In production, TW and pgw-web will be on different domains, so cookies won't be shared. The proxy needs its own auth mechanism — either the `X-TW-Staff-ID` header approach above, or a service-to-service auth token.

3. **Staff data mismatch.** pgw-web's seeded data has its own set of staff/schools. TW will eventually have its own user model. The mapping between TW users and PG staff IDs needs to be defined.

4. **`lastLoginAt` inactivity check.** After every `db:reset`, staff accounts are flagged as inactive because the seeded `lastLoginAt` is too old. The PG team could either update the seeders to use recent dates, or make the inactivity check configurable for local dev.

### Things we skipped (acceptable for local dev)

- **File uploads** — requires AWS S3 credentials. File endpoints will fail.
- **Push notifications** — requires Firebase. Not relevant for web testing.
- **Sendbird messaging** — requires Sendbird API token.
- **Google Calendar** — requires API key.
- **Email sending** — requires SendGrid.
- **WOGAA analytics** — placeholder URLs provided for CSP to not crash; no actual analytics.
- **Common services API** — dummy AWS credentials provided; API gateway calls will fail but server starts.
- **Mobile endpoints** — RSA keys are dummy values; mobile auth flows won't work.

### Other notes

- The `pgw-web.env.example` in this repo is a complete `.env` for pgw-web that works without 1Password CLI. It uses dummy encryption keys (32 bytes for AES-256-CBC), generous rate limits, and all auth bypass flags enabled.
- The proxy was simplified from individual route registration to a catch-all `/api/{path...}` pattern because Go 1.22+'s ServeMux rejects ambiguous wildcard routes (e.g., `announcements/{postId}/readStatus` vs `announcements/drafts/{id}`).
- Rebuilding the pgw-web Docker image is needed when pgw-web source code changes: `docker compose build pgw-web && docker compose up -d pgw-web`.
