# docs/

How this directory is organised. Each subfolder has one job — pick by intent.

| When you want to…                                                                         | Go to                          |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| Stand up the local pgw-web stack, run services                                            | [setup/](setup/)               |
| Understand the current state vs. PG (gap analyses)                                        | [audits/](audits/)             |
| Read a design decision, RFC, or cross-cutting doc (tokens, shims, architecture)           | [architecture/](architecture/) |
| Look up a long-lived reference (PG context, specs, API contract, BFF design, conventions) | [references/](references/)     |
| Read a recent feature/refactor plan, or look something up from the archive                | [plans/](plans/)               |

## What's in each folder

### setup/

Actionable how-tos for getting the repo running locally.

- [local-pgw-web.md](setup/local-pgw-web.md) — run pgw-web + MySQL + Redis in Docker, seed the DB, point the Go BFF at it.

### audits/

Point-in-time analyses of the gap between TW and PG. Snapshots of "what's missing right now" — expected to go stale as work lands.

- [pg-backend-contract.md](audits/pg-backend-contract.md) — TW FE/BFF types, mappers, auth flow, endpoints, error handling — measured against pgw-web's real contract (2026-04-15).
- [pg-fe-may-testing.md](audits/pg-fe-may-testing.md) — three-way gap analysis (production PG, design prototype, TW) scoped to the May announcement-form testing window (2026-04-16).

### architecture/

Long-lived design decisions. Unlike audits these are prescriptive ("here's how we build this") rather than descriptive ("here's the current delta").

- [frontend-rfc-027.md](architecture/frontend-rfc-027.md) — frontend architecture monolith.
- [backend-rfc-028.md](architecture/backend-rfc-028.md) — Go BFF architecture.
- [color-tokens.md](architecture/color-tokens.md) — semantic-token contract (stub — see plan `2026-04-18-001`).
- [sidebar-flow-shim.md](architecture/sidebar-flow-shim.md) — why `@flow/core/tailwind.no-reset.css` was replaced with a local shim and what the shim has to cover.

### references/

Evergreen reference material — long docs you look things up in, not things you read top-to-bottom.

- [pg-context.md](references/pg-context.md) — 50-line project orientation.
- [pg-specs.md](references/pg-specs.md) — full module-by-module FE spec.
- [pg-api-contract.md](references/pg-api-contract.md) — endpoint + response-shape reference (1300+ lines).
- [pg-bff-design.md](references/pg-bff-design.md) — TW BFF → pgw-web integration design (proxy, ideal/fallback states, mock mode).
- [pg-team-asks.md](references/pg-team-asks.md) — the three pgw-web changes PG team owns + ten open questions.
- [vibecode.md](references/vibecode.md) — repo-wide coding conventions for AI-assisted work.

### plans/

Completed feature and refactor plans. All files here have `status: completed` in frontmatter; they're kept as reviewable history, not as active backlog.

- [plans/](plans/) — recent completed plans (posts end-to-end, PG proxy wiring, design-match, color tokens, Posts UI primitives).
- [plans/archive/](plans/archive/) — superseded pre-implementation artifacts (older dated plans, the pgw-web spec+plan from the superpowers pipeline).

## Conventions

- **Plans use YAML frontmatter** (`status: {planned,in-progress,completed}`, `date`, `type`). Anything under `docs/plans/` without frontmatter belongs in `archive/`.
- **Audits are dated in the file.** They're expected to age out — write them, act on them, don't update them in place.
- **References don't carry dates** in their filenames. When the content is wrong, edit it; when it's structurally obsolete, replace it.
