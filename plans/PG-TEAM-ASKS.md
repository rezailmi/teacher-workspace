# PG Team Asks — pgw-web Changes + Open Questions

**From:** TW Platform Team  
**To:** PG Team (Grace / Scott)  
**Date:** 2026-04-07 (open questions expanded 2026-04-15)  
**Context:** TW BFF proxies all PG staff requests through a reverse proxy. The ideal integration requires three minimal pgw-web changes; without them, TW has to carry session + CSRF state on behalf of every browser (described in [PG-BFF-DESIGN.md](PG-BFF-DESIGN.md) as fallback mode). This doc is the shortest path to removing that fallback.

**Related docs:**

- [PG-BFF-DESIGN.md](PG-BFF-DESIGN.md) — TW-side integration design (covers both the ideal and fallback paths)
- [PG-CONTEXT.md](PG-CONTEXT.md) — project orientation
- [RFC-028-backend-architecture.md](RFC-028-backend-architecture.md) — BFF architecture rationale

---

## What TW BFF does

TW handles its own teacher authentication. When a teacher makes a request through TW, the TW BFF:

1. Validates the teacher's TW session
2. Forwards the request to pgw-web at the same path
3. Attaches a single header identifying the teacher

TW's server IP is fixed — all proxied requests come from the same IP.

---

## Required changes to pgw-web

### 1. IP allowlist

Allowlist TW's server IP in pgw-web's WAF / firewall.

| Environment | TW Server IP                |
| ----------- | --------------------------- |
| Staging     | TBD — confirm with TW infra |
| Production  | TBD — confirm with TW infra |

Requests from this IP should be routed to pgw-web normally.

---

### 2. Trust `X-TW-Staff-ID` header

For requests originating from TW's allowlisted IP, accept the following header as the authenticated staff identity:

```
X-TW-Staff-ID: <staffId>
```

- `staffId` is an integer matching pgw-web's existing staff records
- Skip session cookie validation for requests from the allowlisted IP that carry this header
- If the header is absent or the staffId does not exist, return `401`

**Security note:** Because this header is only trusted from the allowlisted IP, browser clients cannot spoof it. TW strips any incoming `X-TW-Staff-ID` header from the browser before forwarding.

---

### 3. No CSRF required for allowlisted requests

CSRF protection is a browser-to-server concern. TW BFF is a server-to-server caller. For requests from the allowlisted IP, skip CSRF token validation on POST / PUT / DELETE routes.

---

## What does NOT change

- pgw-web session cookie auth for direct browser access (existing PG app users) — unchanged
- All existing pgw-web endpoints, response shapes, business logic — unchanged
- No new endpoints needed on pgw-web

---

## Questions for PG team

The ideal integration above removes an entire layer of TW-side code (PG session cookie storage, CSRF capture-and-replay, silent MIMS re-auth). Until the three changes ship, TW maintains that layer as fallback. These questions are the shortest path to unblocking the ideal; #10 clarifies whether we should continue investing in the fallback or plan to delete it.

### Blocking for the ideal design

1. **Staging pgw-web base URL** — what do we point `TW_PG_BASE_URL` at for integration testing in staging?
2. **IP allowlist timing** — when can TW's staging IP be allowlisted in pgw-web's WAF? Production IP?
3. **Service-to-service trust** — is there an existing platform primitive (signed header, mTLS, shared secret) we should plug into, or does this get built fresh between TW and PG?
4. **CSRF skip for allowlisted IP** — can this be a middleware config / env flag, or does it need a code change in pgw-web? (Today pgw-web has no env flag for this — checked `pgw-web.env.example`.)
5. **Trust `X-TW-Staff-ID` from allowlisted IP** — same question as #4, and: if the header is absent from an allowlisted-IP request, should pgw-web fall back to its cookie session or always return 401?

### Operational — would unblock us sooner

6. **CSRF dev-bypass env flag** — any way to disable CSRF for local-dev testing short of the full allowlist? Would unblock TW writes immediately without waiting for infra changes.
7. **MIMS artifact reuse policy** — is the MIMS SSO artifact single-use? If yes, TW must establish the PG session before the TW session on MIMS redirect, since we can't exchange the same artifact twice. (Flagged as high-severity risk in [PG-BFF-DESIGN.md](PG-BFF-DESIGN.md) Risks.)
8. **Session-cookie name stability** — how does TW learn when pgw-web rotates its session cookie name? Changelog we can subscribe to, or is cookie-name env-var + deploy coordination expected?
9. **`-4031` redirect behavior** — the 302 to `/error/-4031` on auth failure breaks our JSON-only envelope assumption (see [docs/pg-audit-findings.md](../docs/pg-audit-findings.md) §Error handling). Is the 302 intentional? Can it be a regular JSON error response like the other `-40xx` codes?

### Strategic

10. **If asks #1–5 are rejected** — will PG team accept TW's capture-and-replay (PG session + CSRF cookie stored per TW user in Valkey) as a permanent arrangement? We need to know whether to invest in Valkey-backed storage as long-lived infrastructure or throwaway scaffolding.
