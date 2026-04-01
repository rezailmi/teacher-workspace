# PG Integration Approach — TW BFF Proxy

**Status:** Planning
**Date:** 2026-04-01
**Context:** TW integrates PG (Parents Gateway) as an app. The PG team owns `pgw-web` — we cannot modify it.

---

## Constraint

We cannot touch `pgw-web`. The PG backend is a black box: Node/Express, MySQL, Redis, MIMS SSO session auth, CSRF middleware on all write routes.

---

## Approach: TW BFF as Reverse Proxy

TW backend (Go) acts as an HTTP reverse proxy to the real pgw-web. No changes to pgw-web. TW handles its own session/auth, then silently maintains a PG session on behalf of each logged-in user.

```
Browser
  ↓  TW session cookie
TW BFF (Go)
  ↓  PG session cookie (stored in TW Valkey session)
pgw-web (Node/Express) — unchanged
  ↓
MySQL / Redis
```

---

## Auth Translation: MIMS → PG Session

Both TW and PG authenticate via MIMS SSO. The user logs in once — TW establishes both a TW session and a PG session using the same MIMS artifact.

### Login Flow

```
1. User hits TW Login
2. TW redirects → MIMS SSO
3. MIMS redirects back → TW with artifact token
4. TW calls its own MIMS callback
   → creates TW session in Valkey
5. TW calls PG's MIMS callback URL with same artifact:
   GET https://<pg-host>/api/web/v2/staff/identity/login/MIMScallback?...
   → PG returns Set-Cookie: <pg_session_cookie>
6. TW extracts PG session cookie value
   → stores in TW Valkey session under key pg_session_cookie
7. User is now logged into both TW and PG silently
```

### Per-Request Proxy Flow

```
1. TW frontend calls: GET /teachers/announcements.json
2. TW BFF validates TW session
3. TW BFF retrieves pg_session_cookie from Valkey
4. TW BFF rewrites request:
   - Strip /teachers prefix
   - Attach Cookie: <pg_session_cookie>
   - Forward to pgw-web: GET https://<pg-host>/api/web/2/staff/announcements
5. pgw-web validates session, returns JSON
6. TW BFF returns JSON to browser
```

---

## CSRF Handling for Write Operations

PG requires `X-XSRF-TOKEN` header on POST/PUT/DELETE. Cookie `XSRF-TOKEN` is set by PG on any GET request.

### Strategy

On initial proxy GET (e.g. GET /announcements), TW BFF:
1. Captures `Set-Cookie: XSRF-TOKEN=<value>` from PG response
2. Stores CSRF token in TW Valkey session alongside PG session cookie

On subsequent POST/PUT/DELETE proxy calls:
1. TW BFF attaches both:
   - `Cookie: <pg_session_cookie>; XSRF-TOKEN=<csrf_token>`
   - `X-XSRF-TOKEN: <csrf_token>`

---

## PG Session Expiry Handling

PG sessions are ~30 min. On any 401 response from pgw-web:

```
1. TW BFF receives 401 from pgw-web
2. TW BFF checks if user still has valid TW session
3. If yes: re-run step 5 from login flow (silent re-auth with stored MIMS artifact)
   → get new PG session cookie, update Valkey
   → retry original request once
4. If MIMS artifact has also expired: return 401 to browser → TW triggers full re-login
```

---

## Mock Mode (Local Development)

When `TW_PG_MOCK=true`, the proxy module serves fixture JSON instead of forwarding to pgw-web. No real PG environment needed.

```
TW_PG_MOCK=true      → serve fixtures from server/internal/pg/fixtures/
TW_PG_MOCK=false     → proxy to TW_PG_BASE_URL
```

Fixture files match PG API response shapes exactly (see `PG-API-CONTRACT.md`).

```
server/internal/pg/
  proxy.go            — HTTP reverse proxy, attaches PG cookie
  session.go          — MIMS artifact → PG session exchange, Valkey storage
  csrf.go             — CSRF token capture and injection
  mock.go             — fixture file server (dev only)
  routes.go           — registers all /teachers/* proxy routes on TW mux
  fixtures/
    session_current.json
    configs.json
    announcements_list.json
    announcement_detail.json
    consent_forms_list.json
    consent_form_detail.json
    ptm_list.json
    ptm_detail.json
    ptm_timeslots.json
    groups_assigned.json
    groups_custom_list.json
    school_staff.json
    school_students.json
    school_groups.json
    notification_preferences.json
```

---

## Route Mapping Convention

RFC-028 convention: TW BFF strips the app base path before forwarding to app service.

| TW frontend calls | TW BFF forwards to pgw-web |
|---|---|
| `GET /teachers/announcements.json` | `GET /api/web/2/staff/announcements` |
| `GET /teachers/consentForms.json` | `GET /api/web/2/staff/consentForms` |
| `GET /teachers/meetings.json` | `GET /api/web/2/staff/ptm` |
| `GET /teachers/groups/assigned.json` | `GET /api/web/2/staff/groups/assigned` |
| `POST /teachers/announcements` | `POST /api/web/2/staff/announcements` |

Full mapping in `PG-API-CONTRACT.md`.

---

## Environment Variables

| Var | Description | Default |
|---|---|---|
| `TW_PG_BASE_URL` | pgw-web base URL | `https://pg.moe.edu.sg` |
| `TW_PG_MOCK` | Serve fixture JSON instead of proxying | `true` (local), `false` (prod) |
| `TW_PG_MIMS_CALLBACK_PATH` | PG's MIMS callback endpoint path | `/api/web/v2/staff/identity/login/MIMScallback` |
| `TW_PG_SESSION_KEY` | Valkey key prefix for PG session storage | `pg_session` |
| `TW_PG_TIMEOUT_MS` | Proxy request timeout | `10000` |

---

## Build Phases

### Phase 1 — Mock + Read (unblocks all frontend work)

- [ ] Fixture JSON files for all read endpoints
- [ ] Mock handler in Go (`TW_PG_MOCK=true`)
- [ ] TW frontend calls TW BFF routes, gets fixture data
- [ ] All PG module UIs renderable: Announcements, Forms, Meetings, Groups, Reports, Account

### Phase 2 — Proxy + Auth (integration with real PG)

- [ ] MIMS → PG session exchange on TW login
- [ ] Proxy handler with PG cookie injection
- [ ] PG session stored in Valkey per TW session
- [ ] GET routes all proxying correctly

### Phase 3 — Write Operations

- [ ] CSRF token capture on first GET
- [ ] POST/PUT/DELETE proxy with CSRF injection
- [ ] PG session expiry + silent re-auth on 401

### Phase 4 — File Operations

- [ ] File upload: proxy `/api/files/2/preUploadValidation` and `/postUploadVerification`
- [ ] File download: proxy `/api/files/2/handleDownloadAttachment`
- [ ] S3 presigned URLs pass through unchanged (client calls S3 directly)

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| MIMS artifact is single-use (can't exchange twice) | High | Check with MIMS team. If single-use: establish PG session first, then TW session from same redirect. |
| PG rotates session cookie names | Medium | Env var for cookie name, monitor PG deploys |
| PG adds IP allowlisting | Medium | TW server IP must be allowlisted in PG WAF |
| PG CSRF double-cookie pattern changes | Low | Monitor PG release notes |
| pgw-web returns 302 redirect on expired session (not 401) | Medium | Proxy must detect redirects to PG login as auth failures |

---

## What We Are NOT Building

- No new endpoints added to pgw-web
- No service-to-service JWT between TW and PG (would require pgw-web changes)
- No shared database access
- No PG data replicated into TW database
