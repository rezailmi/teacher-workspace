# Codebase Concerns

**Analysis Date:** 2026-04-28
**Branch under review:** `feat/posts-frontend`
**Sources:** `todos/001-033`, `TODOS.md`, `docs/audits/pgtw-1-12-parity-scope.md`, `docs/references/pg-team-asks.md`, in-source TODOs, file-size scan, recent commit log.

The repo is mid-flight on PGTW posts parity. 33 todos, ~30 closed in the last week, three still pending (one P1). Most remaining concerns are upstream-blocked (PGW infra not yet ready) or single-file refactors that the team has consciously deferred. The two highest-leverage fragility surfaces are (a) the kind-branching split between announcements and consent forms, which the team has only partially deduplicated, and (b) `web/api/client.ts`, which absorbed the U7/U8/U10 reliability fixes on top of an already-dense fetch layer.

---

## Tech Debt

### Kind-branch sprawl (announcements vs consent forms)

- Issue: Read-side `kind === 'form' ? … : …` ternaries scattered across at least 8 files. Write side funnels through `buildAnnouncementPayload` / `buildConsentFormPayload`; read side has no equivalent dispatcher. Adding a third kind (meetings/PTM is on the roadmap) means touching every site, and the binary ternaries will silently bucket the new kind into the announcement branch with no compile error. Todo 019 closed with an `assertNever`-based mitigation, but the registry-extraction option (architect's preference) was deferred.
- Files: `web/containers/CreatePostView.tsx` (~14 sites; lines 224, 441-475, 734, 812-901, 1141), `web/containers/PostsView.tsx`, `web/containers/PostDetailView.tsx`, `web/components/posts/PostCard.tsx`, `PostPreview.tsx`, `ReadTrackingCards.tsx`, `RecipientReadTable.tsx`.
- Impact: Extensibility tax on every roadmap item that touches list/detail rendering. Quietly correct today, fragile under "+1 kind".
- Fix approach: Promote `web/data/posts-registry.ts` to drive non-JSX branches (href, loaders, memo keys, date field). Keep `switch (post.kind)` + `assertNever` for JSX. (Todo 019 Option C.)

### Stringly-typed PG IDs and `as`-cast escape hatches

- Issue: Branded ID types (`AnnouncementId`, `ConsentFormId`, `AnnouncementDraftId`, `ConsentFormDraftId`) exist, but mapper output lines and one delete callsite still escape via `as` casts. Each cast is small in isolation; the pattern erodes the type guarantee the brands were introduced to provide.
- Files: `web/api/mappers.ts:68, 200, 363, 477` (mapper output casts), `web/containers/PostsView.tsx:235` (`row.id as AnnouncementId`), `web/containers/PostDetailView.tsx:81` (`parsed as AnnouncementId`).
- Impact: A typo in mapper construction or row plumbing rides through compile clean.
- Fix approach: Where the mapper's input is already validated (`isAnnouncementDraftId` / `isConsentFormId`), tighten the source field type; where it's freshly minted (`cf_${id}`), wrap in a single `brand()` helper so the assertion is auditable in one place.

### `web/api/client.ts` is now the load-bearing module (~810 lines)

- Issue: `client.ts` accumulated the `withTimeout` + CSRF retry + `unwrapEnvelope` + redirect interception + multipart upload composer plus all read/write functions. Eight commits in the last fortnight (U5–U10 + double-submit fix + `getConfigs` negative-cache fix) all landed here. Pure-fetch helpers and domain functions are interleaved; the file has no test for `withTimeout`, `refreshCsrfToken`, or the CSRF one-shot retry path beyond what `client.test.ts` (~306 lines) covers.
- Files: `web/api/client.ts` (808 lines).
- Impact: Every reliability tweak fights for context with every domain function. Reviewers cannot cleanly diff "transport" vs "domain" changes.
- Fix approach: Split into `web/api/transport.ts` (envelope, redirect, timeout, CSRF, multipart) and per-domain modules (`announcements.ts`, `consent-forms.ts`, `attachments.ts`, `session.ts`). Cover `withTimeout` and the CSRF retry happy/sad paths in `transport.test.ts`.

### Exemption registry is line-number-keyed

- Issue: `scripts/raw-color-exemptions.txt` pins exemptions by `path:line`. Any unrelated edit above line 221 in `entity-selector.tsx` shifts every subsequent exemption — produces false positives or, worse, silent false negatives where the exempted line moves and a new raw ref appears at the old number. Todo 003 P2, still pending.
- Files: `scripts/raw-color-exemptions.txt`, `scripts/check-raw-colors.sh`, plus 26 exempted lines across 6 source files.
- Impact: CI can break on rebases unrelated to color tokens; or worse, drift through unnoticed.
- Fix approach: Anchor-comment keying (todo 003 Option A) — `// raw-color-exempt: <reason-slug>` adjacent to the exempted line, script greps for the anchor.

### No ESLint guard on Flow DS wrapper imports

- Issue: `~/components/ui` wrappers apply project-specific styling defaults (pill radius, font-weight). The wrapper convention is documentation-only — devs can accidentally import `Button`, `Badge`, `Input`, `Tabs*`, `Table*`, `DropdownMenu*` directly from `@flow/core` and bypass overrides. Top-level `TODOS.md` already flags this.
- Files: any future `.tsx` touching listed primitives.
- Impact: Visual inconsistency creeps in silently.
- Fix approach: `no-restricted-imports` rule on the listed names, scoped exclusion for `web/components/Sidebar/*` which intentionally imports raw.

---

## Known Bugs / Pending TODOs

### 031 — P1 — Edit on a posted post creates a duplicate (PENDING)

- Files: `web/containers/PostDetailView.tsx:97-133` (Edit affordance shown for every status), `web/containers/CreatePostView.tsx:659-684` (`handleSendConfirm` dispatches on `state.kind` without an `isEditing` guard).
- Impact: A teacher editing a posted announcement and clicking Post fires `createAnnouncement` again — duplicate post, duplicate parent push notifications. PGW only allows narrow post-publish edits (`enquiryEmailAddress` for announcements, `updateDueDate` for consent forms).
- Surfaced via agent-browser (2026-04-20). Recommended fix: hide Edit on posted/open/closed; for posted announcements expose a separate "Update enquiry email" affordance bound to the narrow PUT.

### 032 — P3 — Mock detail handlers single-fixture (PARTIALLY FIXED)

- Status: The dispatching map (`announcementDetailByID`, `consentFormDetailByID`) has been added in `server/internal/pg/mock.go:17-30`, addressing the worst of the dogfooding gap. Remaining gap: per-status fixture coverage for consent forms is now in place (`consent_form_detail_draft.json`, `_scheduled.json`); verify these resolve and the todo can be closed.
- Files: `server/internal/pg/mock.go`, `server/internal/pg/fixtures/`.
- Impact: Dogfooding accuracy for status-branched detail rendering.

### 033 — P3 — Consent-form list fixture missing DRAFT/SCHEDULED rows (PENDING)

- Files: `server/internal/pg/fixtures/consent_forms.json` (only `cf_1038` OPEN + `cf_1039` CLOSED), `web/containers/PostsView.tsx:436-441` (`PostRowResponseCell` branches on status — untested for scheduled/draft on forms).
- Impact: "Posts with responses" tab cannot exercise scheduled/draft row rendering. The detail fixtures for those statuses already exist (per 032 fix); just the list fixture is asymmetric with announcements.
- Fix: Append two rows + bump `total` to 4. Pure data change, blocked on nothing.

### Pre-existing TODOs in source

- `web/components/posts/ShortcutsSection.tsx:36, 59` — feature flags PG hasn't named; we treat as always-available pending PG team confirmation.
- `web/api/mappers.ts:732` — Phase-2 contract ambiguity flagged as TODO; PG hasn't confirmed anchor semantics.
- `web/helpers/tiptap.ts:23` — Tiptap allowlist is intentionally tight; widening blocked on `pgw-web/src/server/utils/richTextUtil.ts` updates upstream.
- `server/internal/handler/otp.go:145, 246` — copy from Figma still missing; placeholder error messages in production OTP path.

---

## Security Considerations

### Auth gap in mock mode (acceptable; document) and stub identity in real mode

- `server/internal/pg/identity.go` defines `StaffIDFromContext` / `WithStaffID` but the comment states identity is "populated by a stub" pending TW auth middleware. `proxy.go:48` reads from context — if no middleware injects a staff ID, the proxy forwards no `X-TW-Staff-ID` header, which PGW (per `pg-team-asks.md` ask #5) should 401 in the ideal design — but pgw-web today still falls back to cookie session.
- Files: `server/internal/pg/identity.go`, `server/internal/pg/proxy.go:35-52`.
- Impact: Until the auth middleware lands, real-mode (`TW_PG_MOCK=false`) traffic effectively uses pgw-web's cookie session passthrough. The header-stripping (`r.Header.Del("X-TW-Staff-ID")` line 47) prevents browser spoofing — that's correct.
- Action: Track as a release blocker for production; mock mode is fine. Surface in deploy checklist.

### CSV export — formula-injection guarded

- `web/helpers/exportCsv.ts:65` — fields starting with `=`, `+`, `-`, `@`, tab, or CR are prefixed with a single quote to defeat Excel/Sheets formula injection. Covered by `exportCsv.test.ts`. Recent commit `4e9885e fix(posts): address code-review findings — CSV injection, upload races, rehydration` confirms this was caught and fixed in review.
- No outstanding action; keep coverage.

### CSRF one-shot retry

- `mutateApi` retries on `-4013` once after a `GET /session/current` to bump the cookie. `refreshCsrfToken` swallows fetch errors so the replay surfaces a terminal `PGCsrfError`. Real CSRF refresh contract is "pending PG confirmation" per `client.ts:236-243`. If PG exposes a dedicated refresh endpoint later, it must be wired — current design is brittle on a hostile token rotation policy.
- File: `web/api/client.ts:235-299`.

### Tiptap allowlist mirrors PGW's schema

- Toolbar removed `Link` and `Highlight` to match PGW's allowlist; sanitizer in `web/helpers/tiptap.ts` strips on paste. Without this, paste-from-Word would 4003-reject silently. Locked in by `helpers/tiptap.test.ts`.
- Risk: counter math on emoji / surrogate pairs not yet audited (parity audit #357). Validation can desync between client counter and PGW length check.

### -4031 redirect handling

- `handleRedirectResponse` follows the `Location` header for `opaqueredirect`/3xx, then throws `PGRedirectError`. PG team ask #9 is still open: the 302 to `/error/-4031` breaks the JSON-only envelope assumption. Recent commit `8fc3469 feat(posts): U10 — handle -4031 redirects as PGRedirectError` is the FE-side mitigation. Until PG returns JSON, we navigate the window away mid-mutation, which can mask in-flight uploads or scheduled-send confirmations.

---

## Performance Bottlenecks

### `RecipientReadTable` — no virtualization

- Files: `web/components/posts/RecipientReadTable.tsx` (452 lines).
- Impact: Classes of 500+ students will jank. Flagged in parity audit §PGTW-9 edge cases.
- Fix: When `totalCount > 200`, render via `react-virtual` or `@tanstack/react-virtual`.

### Posts list — no pagination, full-load every entry

- Files: `web/containers/PostsView.tsx`, `web/api/client.ts:399-405` (`fetchAnnouncements`/`fetchSharedAnnouncements`).
- Impact: With more than ~50 posts (PGW threshold) the list pays the full payload + DOM cost on every entry.
- Fix: PGTW-10 already calls this out as a missing feature; surface page size selector and stitch to the upstream pagination params when PG adds them.

### Preview re-render on every keystroke

- `useDeferredValue` in `CreatePostView.tsx` keeps preview off the critical path, but at 2000 chars + 10+ blocks the deferred update can still jank on slow hardware (parity audit §PGTW-6 #1).
- Fix: Memoize `PostPreview` body on `descriptionDoc` reference identity; current props chain may force re-render on any state change.

### `getConfigs` cache edge case

- 15-minute TTL on the success path. After todo 016 fix, error path resets `configsLoadedAt = 0` so the next call retries. Good. But the cache is module-scope — a long-lived SPA session never receives flag flips during a single mount until TTL expires. Acceptable trade-off; document.

---

## Fragile Areas

### `web/api/client.ts` upload pipeline races

- 3-step upload: `validateAttachmentUpload` → `uploadToPresignedUrl` → `verifyAttachmentUpload`. The polling loop in `verifyAttachmentUpload` uses `eslint-disable no-constant-condition` and a manual deadline; mock returns `{verified:true}` immediately so the polling path is essentially untested in CI. Real PG AV scan times are "variable" per the comment.
- A NOTE block at `client.ts:798-808` warns against emitting `onProgress('ready')` early because the caller's `.then` dispatches the atomic `{status:'ready', attachmentId, url, thumbnailUrl}` patch — emitting early would render a photo without `thumbnailUrl` for one microtask. This is exactly the class of bug commit `4e9885e` flagged.
- Fix priority: Add a deterministic mock for the polling endpoint (configurable delay) and a unit test asserting a slow scan does not race the reducer.

### Mock vs real divergence

- Mock returns raw payloads; real PGW wraps in `{body, resultCode, message, metadata}`. `unwrapEnvelope` distinguishes by presence of both `body` and a numeric `resultCode`. The detection is robust today, but a fixture that accidentally includes a `resultCode` field would be misread.
- Mock has zero CSRF, zero cookie auth, zero rate limits. Every reliability path (`PGCsrfError`, `PGSessionExpiredError`, `-4031` redirect, 429 throttle) is exercised only via unit tests, never integration.
- File: `web/api/client.ts:64-75`.

### Mock writes are stubs

- `POST /announcements`, `/announcements/drafts`, `/announcements/duplicate`, `/consentForms/*` all return canned IDs (`{"postId":1041}` etc). The mock does not persist; the FE's optimistic flow + redirect to `/posts/<id>` lands on the same fixture every time. Together with todo 031 (Edit on posted creates duplicate), this means a teacher dogfooding the mock cannot detect the duplicate-on-edit bug — fixtures hide it.

### Per-field validation error mapping

- `PGValidationError` carries `fieldPath` and `subCode`, but only `-4001` / `-4003` / `-4004` are mapped. `-4011`, `-4013` (handled separately), `-4031`, `-4032`, `-4033`, `-403`, `-500`/`-5001..5005` all fall through to a generic `notify.error(message)` toast (audit §error-code gaps). Teacher gets the same UX for "wrong session type", "MFA required", and "server crashed".
- Files: `web/api/client.ts:103-132`, `web/lib/validation-errors.ts` (per-field mapping helper).

### Timezone hard-coded to `+08:00`

- Schedule and event-time mappers stamp `+08:00` regardless of browser TZ. SGT users are fine; non-SGT testers (or any future deployment outside SG) will silently corrupt event times. Todo 020 closed with string-arithmetic fix for DST + `(SGT)` labels. The deeper non-SGT semantic (a London teacher typing "09:00" stores "09:00 SGT") is documented but not addressed.

### React Strict Mode + module-scope `getConfigs` promise

- `configsPromise` lives at module scope. In Strict Mode the loader fires twice; both calls await the same promise (correct), but a route that fast-navigates away before the first resolution leaves the cached promise referencing a stale `configsLoadedAt`. Edge case; works in practice.

---

## Scaling Limits

### Mock-only data

- All current dev runs against `TW_PG_MOCK=true` with embedded fixtures. No DB, no Redis. The Owner / real-PGW path requires `TW_OTPAAS_*` creds + IP allowlisting (per `pg-team-asks.md`), neither of which is unblocked yet.
- Implication: The team has shipped 14 weeks of FE work without one round-trip against real PGW. When the allowlist lands, expect a wave of contract-shape bugs (recent fix commits `5175098`, `b2957a4`, `78c605b` already show "align mapper to actual pgw-web response shape" — these were caught by re-reading the contract, not by exercising it).

### No real auth in mock mode

- `server/internal/pg/identity.go` is a stub. Until TW auth middleware ships, the BFF cannot enforce per-staff isolation in real mode — it relies entirely on PGW's cookie session.

### No autosave / draft persistence

- PGTW-5 calls for ~30s autosave + `REQUEST_HEADER_NO_EXTEND` suppression. Currently absent. Network drop mid-compose loses everything. Audit flags this as **high risk**.
- Files: `web/hooks/useAutoSave.ts` exists but is wired to manual save only; no polling, no session-extend suppression.

### Fixture-only `/api/configs`

- Feature flags drive schedule-send, duplicate, shortcuts. Mock returns a single `configs.json` fixture. There is no way to dogfood the "school has flag X off" path.

### No request retry / circuit breaker

- Mutations get a single attempt + one CSRF retry. GETs get one attempt. A flapping PGW will surface flap-by-flap to the user. `getConfigs` is the only call with a backoff (TTL).

---

## Dependencies at Risk

### `tw-pg-experiment` flag — to be removed

- Repeated callouts in audits/notes that the experiment branch's flag plumbing should disappear once parity ships. No specific code-level marker, but watch for `tw-pg-experiment` references during cleanup.

### `made-refine` — already removed

- Per audit notes; no action.

### Tiptap allowlist coupled to PGW

- `web/helpers/tiptap.ts` is intentionally narrower than Tiptap's defaults to mirror `pgw-web/src/server/utils/richTextUtil.ts#101`. Any Tiptap upgrade or pgw-web schema change requires a coordinated diff. The TODO comment at `tiptap.ts:23` explicitly tracks this.

### `react-day-picker` + Vite 7 + React 19

- Bleeding-edge stack. React 19 is GA; React Router v7 is recent. The double-submit fix (todo 014) ultimately depended on RR v7 navigation atomicity — verify this assumption holds across RR upgrades.

---

## Missing Critical Features

(From `docs/audits/pgtw-1-12-parity-scope.md` and `docs/references/pg-team-asks.md`.)

1. **PGTW-5 autosave + `Save as draft` button** — no polling, no `AutoSaveStatesContext`, no session-extend suppression. Manual save only.
2. **PGTW-7 staff-in-charge** — flat list; no Individual/Level/School tabs; helper text doesn't vary per kind. PGW exposes binary access (no editor/viewer); decision pending Grace.
3. **PGTW-9 read-status filters + Excel export columns** — Show Columns selector, status dropdown, class dropdown, "First Read By", "Status (Not Onboarded)", parent-role suffix all missing.
4. **PGTW-10 dashboard pagination + "Shared with you" tab + forms-status enum (OPEN/CLOSED) + `# RESPONDED` column** — single combined tab today.
5. **PGTW-11 attachment / photo / website-link / venue / event-date sub-systems** — UI not implemented at all per the audit; types exist but inputs don't.
6. **PGTW-12 reminders UI + `addReminderType` plumbing** — schema-only in `web/api/types.ts:210-211`; no UI.
7. **Dirty-state unload guard** — `useUnsavedChangesGuard` exists but does not yet wrap `beforeunload`; teacher hitting Back loses work.
8. **PG team asks #1–5** — IP allowlist, `X-TW-Staff-ID` trust, CSRF skip, staging URL, MIMS artifact reuse policy: all blocking the ideal real-mode integration. Until resolved, fallback (Valkey-backed PG session storage) is the contingency — not yet built either.
9. **PG team ask #9** — `-4031` 302 redirect shape unconfirmed; FE handles best-effort.

---

## Test Coverage Gaps

### Container coverage thin

- 91 source `.ts/.tsx` files in `web/`; 14 test files. Containers with no test sibling: `CreatePostView.tsx` (1339 lines — has reducer + validation tests but no integration), `PostDetailView.tsx` (378 lines), `HomeView.tsx`, `StudentsView.tsx`, `RootLayout.tsx`, `ComponentsView.tsx`, `SessionExpiredView.tsx`.
- `PostsView.test.tsx` exists but covers row rendering only; the kebab actions (Duplicate, Delete) and the recent Filter popover (commit `67dff39`) have no integration test.

### Posts components — only 2 of 25 tested

- Tested: `RichTextToolbar`, `SchedulePickerDialog`.
- Untested (and visible in users' day-to-day flow): `AttachmentSection`, `RecipientReadTable`, `RecipientSelector`, `PostFilterPopover`, `PostPreview`, `PostTypePicker`, `QuestionBuilder`, `ReadTrackingCards`, `ReminderSection`, `ResponseTypeSelector`, `RichTextEditor`, `SendConfirmationDialog`, `ShortcutsSection`, `SplitPostButton`, `VenueSection`, `WebsiteLinksSection`, `DueDateSection`, `EventScheduleSection`, `DeletePostDialog`, `PostCard`, `ReadRate`, `ConsentFormHistoryList`.

### Transport-layer holes in `web/api/client.ts`

- `client.test.ts` (306 lines) exists. Verify coverage on: `withTimeout` (caller-abort vs timeout-abort discrimination), `refreshCsrfToken` failure path, `mutateApi` second-attempt failure on `-4013`, `postMultipart` upload + verify polling, `getConfigs` negative-cache reset (todo 016 fix). Likely thin or absent.

### Fixture-only mock coverage

- Every mock POST returns canned IDs without echoing input. There is no test asserting that the FE payload shape matches the documented PG contract — existing `mappers.test.ts` exercises mapper roundtrips but not against a real (or replayed) PG response. When real PGW lands expect drift on ~3 boundary fields per endpoint (consistent with `5175098`, `b2957a4`, `78c605b`).

### No e2e

- Agent-browser was used for the 2026-04-20 manual sweep that produced todos 031–033. Findings were durable and high-signal. There is no automated equivalent — no Playwright, no Cypress. Each release ships on commit-level review + Vitest.

### Go test coverage

- `server/` has 10 test files for ~13 source files. `mock.go` (412 lines) has only `mock_files_test.go` covering the upload mock; the dispatcher logic + per-status fixture map (todos 013, 032 fixes) lack regression tests.

---

_Concerns audit: 2026-04-28_
