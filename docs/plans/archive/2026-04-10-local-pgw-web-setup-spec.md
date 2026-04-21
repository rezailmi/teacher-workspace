# Local pgw-web Integration Setup

## Goal

Run the Parents Gateway (pgw-web) backend locally so the Teacher Workspace Go BFF proxies to it instead of using mock fixtures, enabling end-to-end testing with real data.

## Architecture

```
Browser → Vite (5173) → Go BFF (3000) → pgw-web Express (PORT) → MySQL (3306/3307)
                                                                → Redis (6379)
```

### What changes in TW repo

- `docker-compose.yml` at repo root: MySQL master/replica + Redis containers
- Config change: `TW_PG_MOCK=false`, `TW_PG_BASE_URL=http://localhost:3001`
- Setup guide documenting the full steps

### What stays untouched

- pgw-web repo — run as-is, no code modifications
- pgw-db-migration repo — run as-is
- Go BFF code — proxy.go already supports this, config-only change

## Infrastructure (docker-compose.yml)

A single docker-compose in the TW repo providing:

| Service       | Image               | Port | Credentials                            |
| ------------- | ------------------- | ---- | -------------------------------------- |
| MySQL master  | mysql:8.0           | 3306 | `pg-local` / `LOCAL_DEV_REPLACED`      |
| MySQL replica | mysql:8.0           | 3307 | `pg-local-read` / `LOCAL_DEV_REPLACED` |
| Redis         | redis:7.0.15-alpine | 6379 | none                                   |

Database name: `pgdb`. Master-slave replication configured to match pgw-db-migration's `db-up.sh` behavior.

## pgw-web Environment (manual .env)

Since 1Password CLI is not available, a manual `.env` is created for pgw-web with:

- **Database:** Local MySQL connection configs (writer on 3306, reader on 3307)
- **Redis:** `redis://localhost:6379`, TLS disabled
- **Auth bypass:** `SHOULD_BYPASS_SINGPASS=true`, `SHOULD_BYPASS_2FA=true`, `NODE_ENV=local`
- **Encryption keys:** Random generated strings (non-empty, for app startup)
- **External services:** Empty or dummy values (not needed for core API testing)

## Setup Steps

### One-time setup

1. From TW repo: `docker compose up -d` (starts MySQL + Redis)
2. In `pgw-db-migration/`: `cp .env.example .env` then `npm run db:reset` (creates DB, runs ~285 migrations, seeds test data)
3. In `pgw-web/`: Create manual `.env` with local connection details + bypass flags
4. In `pgw-web/`: `npm ci && npm start`

### Daily dev

1. `docker compose up -d` (if containers not running)
2. `npm start` in pgw-web
3. `pnpm dev` in TW repo (Go BFF + Vite)

### TW config

- `TW_PG_MOCK=false`
- `TW_PG_BASE_URL=http://localhost:3001`
- `TW_PG_TIMEOUT_MS=10000`

## Identity / Auth Consideration

The Go BFF proxy injects `X-TW-Staff-ID` via the `director` function in `proxy.go`. With pgw-web auth bypassed, the bypass assigns a staff identity differently. Need to verify:

- How the bypass resolves the authenticated user
- Whether `X-TW-Staff-ID` header is honoured or ignored by pgw-web
- May need a small alignment tweak on either side

## Scope

### What will work

- All GET/POST/PUT/DELETE endpoints: announcements, consent forms, meetings (PTM), groups, school data, account/notification preferences
- Session/auth bypass (no Singpass/2FA)
- Real seeded data from MySQL

### What won't work (acceptable)

- File uploads (requires AWS S3)
- Push notifications (requires Firebase)
- Messaging (requires Sendbird)
- Google Calendar integration
- Email sending (requires SendGrid)

## Future

Once the local setup is stable, the next phase is modifying the pgw-web backend itself. Running pgw-web directly (not in Docker) supports this — changes are immediate with the dev server's hot reload.
