# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A unified platform that consolidates teacher-facing applications into day-to-day workflows.

## Tech Stack

- Go 1.26.1
- PNPM 10
- TypeScript 6.0
- React 19
- Vite 7
- Tailwind CSS 4

## Architecture

- Monorepo: Go backend + React frontend
- Config via environment variables with `TW_` prefix (see `.env.example`)
- Go HTTP server uses standard library `net/http` — no framework

## Build & Run Commands

### Go

```bash
go build -o build/tw ./server/cmd/tw       # Build binary
go run ./server/cmd/tw                     # Run directly
go test ./...                              # Run all tests
go test ./path/to/pkg                      # Run single package tests
go test -run TestName ./path/to/pkg        # Run a specific test
golangci-lint run                          # Static analysis
```

### Frontend

```bash
pnpm install                        # Install dependencies
pnpm dev                            # Run Vite dev server
pnpm build                          # Build production bundle
pnpm lint                           # Run ESLint
pnpm format                         # Run Prettier
```

## Running locally

Two modes, toggled by `TW_PG_MOCK`. Create a root-level dotenv file at the
repo root (the loader reads it from cwd; all env files are gitignored by
policy — see `.gitignore`) with at minimum:

```sh
TW_ENV=development
TW_LOG_LEVEL=info

# Mock mode (default) — Go BFF serves fixtures from server/internal/pg/fixtures
# and stubs writes. Flip to false + set TW_PG_BASE_URL to proxy real PGW.
TW_PG_MOCK=true
TW_PG_BASE_URL=https://pg.moe.edu.sg
TW_PG_TIMEOUT_MS=10000

TW_SERVER_PORT=3000
TW_SERVER_READ_HEADER_TIMEOUT=2s
TW_SERVER_READ_TIMEOUT=15s
TW_SERVER_WRITE_TIMEOUT=30s
TW_SERVER_IDLE_TIMEOUT=60s

TW_VITE_DEV_SERVER_URL=http://localhost:5173
TW_BUNDLE_DIRECTORY=dist

# Required only when TW_PG_MOCK=false.
TW_OTPAAS_HOST=https://otp.techpass.suite.gov.sg
TW_OTPAAS_ID=
TW_OTPAAS_NAMESPACE=
TW_OTPAAS_SECRET=
TW_OTPAAS_TIMEOUT=10s
```

**Designer / FE-only (default).** `TW_PG_MOCK=true` — no DB, Redis, or real PGW
creds required. Start both processes:

```bash
go run ./server/cmd/tw              # shell 1 — BFF on :3000
pnpm dev                            # shell 2 — Vite on :5173, proxies /api → :3000
```

**Owner / real PGW.** Set `TW_PG_MOCK=false`, point `TW_PG_BASE_URL` at a local
PGW (e.g. `http://localhost:3001`), and fill the `TW_OTPAAS_*` fields
(validated only in this mode). Start your local PGW stack, then the same two
commands above — the BFF reverse-proxies `/api/web/*` to the configured PGW.

## Formatting & Linting

- Go: `golangci-lint run` (gofmt + goimports)
- TS/JS: `pnpm lint` (ESLint), `pnpm format` (Prettier)
- Pre-commit: Husky + lint-staged runs Prettier and ESLint on staged files

## Test Conventions

### Go

#### Structure

- Parent test + subtests. Small pure functions get standalone tests without subtests

#### Naming

- Outcome first, optionally followed by scenario: `"returns error on timeout"`, `"rejects invalid key"`
- Table-driven subtests use just the distinguishing trait: `"missing XXX"`, `"wrong status code"`. The parent test name provides the verb context

#### Assertions

Use `want/got` style:

- Error checks: `t.Fatalf("want nil, got: %v", err)` or `t.Fatal("want: err, got: nil)`
- Field checks: `t.Errorf("want name: %q, got: %q", want, got)`
- Containment: `t.Errorf("want err containing %q, got: %v", substr, err)`
- When `got` isn't already captured, use an `if` initialiser: `if want, got := "XXX", resp.Header.Get("X-XXX"); want != got { ... }`

### TypeScript

- No frontend tests yet

## Commit Conventions

- Keep commit messages to a single summary line - no multi-line body/description. Details go in the PR description instead
- Use conventional commit format (e.g. `feat:`, `fix:`, `test:`, `docs:`)
- Use backticks around file names and variables names in commit message
- Be specific - name the things being changed rather than using vague descriptions
- Don't list implementation details (e.g. individual functions, internal mechanisms) - keep it high level
- Make logical, incremental commits rather than one large commit
- Always create a feature branch before starting work
