---
date: 2026-04-20
topic: posts-pg-parity
focus: Posts is the umbrella for Announcements + Consent Forms. What does TW lack to honour that?
---

# Ideation: Posts (umbrella) vs PG Announcements + Consent Forms

## Codebase Context

### Grounding inputs

- `docs/pg-audit-findings.md` (2026-04-15) — type/mapper/endpoint audit vs pgw-web.
- `plans/2026-04-16-pg-fe-gap-analysis-may-testing.md` — three-way gap (PG / prototype / TW) scoped to May testing.
- `plans/PG-specs.md` §4 (Announcements) + §5 (Consent Forms) — reverse-engineered production spec.
- `server/internal/pg/{handler,proxy,mock}.go` + `fixtures/*.json` — Go BFF + fixtures.
- `web/api/{client,mappers,types,errors}.ts` — envelope unwrap, error routing, PG shape bindings.
- `web/containers/{Posts,CreatePost,PostDetail}View.tsx`, `web/components/posts/*` — current UI.

### Product direction (confirmed 2026-04-20)

**Posts is the umbrella.** One TW feature, one route tree, covers both PG modules:

- **Announcement** = view-only or acknowledge-only post (`VIEW_ONLY` / `ACKNOWLEDGE`) — routes to `POST /announcements`.
- **Consent form** = post that also collects structured responses (Yes/No, optional free-text questions, event date, venue, due-date, reminders) — routes to `POST /consentForms`.

PG stays two modules; TW fuses them. Routing at save-time is driven by whether the post carries any consent-form-only field (event, venue, due-date, reminders, custom questions) — not by response-type alone (both PG modules expose `YES_NO` and `ACKNOWLEDGE`).

### What Posts captures today

Announcement side: list (own + shared merged), status badges inc. `POSTING`, detail + read-tracking, create/edit with Tiptap JSON rich text (round-tripped + null-guarded), class + individual recipient selector, staff-in-charge selector (Individual only), enquiry email (Select of two options), schedule-send, duplicate posted, delete posted + draft, update draft. Error routing for -401 / -404 / validation / rate-limit. Sonner toasts. Proxy with staff-ID header + CSRF stub for local.

Consent-form side: **only** the API client surface — `createConsentForm`, `createConsentFormDraft`, `updateConsentFormDraft`, `updateConsentFormDueDate`, `fetchConsentFormDetail`, `loadConsentFormsList`, `deleteConsentForm`, `deleteConsentFormDraft` all exist in `web/api/client.ts`. No UI calls any of them. `PGApiConsentFormDetail` + `PGApiConsentFormSummary` types match the PG audit. Fixtures are in place.

### The gap, condensed

**Unification primitives missing entirely:**

- `PostsView` only loads `loadPostsList()` (announcements). Consent forms never reach the list.
- `CreatePostView.buildPayload()` has one hard-coded branch — `createAnnouncement` or `createDraft` — and no routing to `createConsentForm` / `createConsentFormDraft` / `updateConsentFormDraft`.
- `CreatePostView` collects `state.questions` and `state.dueDate`, then silently drops both on submit (`web/containers/CreatePostView.tsx:421`). Today's UI promises features the current payload can't carry; after unification they land on the wrong PG endpoint too.
- `PostDetailView` assumes an announcement shape (read/unread only) — no Yes/Pending/No stats, no per-student `response`, no `respondedAt`.
- `PostTypePicker` has two choices (`post`, `post-with-response`). A consent form is a third shape (event/venue/due-date/reminders) that today has no way to be authored.

**Forms-only fields with no UI at all:**
`eventStartDate`, `eventEndDate`, `venue`, `consentByDate`, `reminderDate`, `addReminderType` (`ONE_TIME` / `DAILY` / `NONE`), `customQuestions[]`, `consentFormHistory[]`, per-student `response: 'YES' | 'NO' | null`, `respondedAt`, staff-on-behalf reply (`PUT /consentForms/{formId}/student/{studentId}/reply`), mid-cycle due-date update.

**Shared-with-both gaps inherited from the May audit:**
file attachments, photo gallery, website-links UI, shortcuts, autosave + unload-warning, reschedule/cancel-schedule, duplicate-draft, delete-confirm modal, Level/CCA/School/Group/Student tabs on both selectors, filter modal, read-tracking toolbar, "add staff-in-charge" and "edit enquiry email" modals on detail, draft file-expiry notice, feature-flag gating via `/api/configs`.

**Architecture:**
Proxy is a dumb `httputil.ReverseProxy` — no cookie→staff-ID exchange, no CSRF double-submit, no response-envelope validation. Mock fixtures hand-maintained (drift risk). `mock-pg-announcements.ts` carries FE-only fields (`parentName`, `indexNo`, `parentRelationship`) the audit confirms PG never sends — mixed with real shapes. `extractTextFromTiptap` only walks paragraphs + text nodes; lists/tables/blockquotes flatten without separators.

---

## Ranked Ideas

### 1. Ship the unified Post model — the linchpin

**Description:** Fuse the two PG modules behind one TW feature end-to-end. Concretely:

- **Type model.** Turn `PGAnnouncement` into a discriminated union: `{ kind: 'announcement', ... }` | `{ kind: 'form', eventStartDate?, eventEndDate?, venue?, consentByDate, reminderDate?, addReminderType, customQuestions[], stats: { yes, no, pending, total } }`. Both variants share title/description/richTextContent/recipients/staff/enquiry-email/status/timestamps/attachments.
- **Routing.** `buildPayload()` detects `kind === 'form'` (or: any consent-form-only field present) and dispatches to `createConsentForm` / `createConsentFormDraft` / `updateConsentFormDraft`. Otherwise to the announcement counterpart. The outbound mapper grows a sibling `toPGFormPayload` alongside `toPGCreatePayload`.
- **List.** `PostsView` loader becomes `Promise.all([loadPostsList(), loadConsentFormsList()])`, merged by `{ id, createdAt }` and sorted. Each row carries its `kind` for routing (`/posts/:id` keeps the unified URL, but the loader picks announcement vs form by ID prefix or by probing the kind stored in a shared index). Tabs stay as "Posts" / "Posts with responses" — the second tab collapses the current announcement-with-responseType set and the consent-form set into one list.
- **Create flow.** `PostTypePicker` gets a third tile: **Post**, **Post with response**, **Consent form**. Selecting Consent form reveals Forms-only sections (event, venue, due date, reminders). `QuestionBuilder` becomes the authoring surface for `customQuestions`. The currently-orphaned `state.dueDate` wires into `consentByDate`. Post-with-response (acknowledge/yes-no on an announcement) stays announcement-routed and no longer exposes questions + due-date.
- **Detail.** `PostDetailView` branches stats card on `kind`: announcements keep Read/Unread; forms show Yes / Pending / No / Total, render `consentFormHistory`, and expose "Update due date" + "Edit response on behalf" for staff-in-charge on OPEN forms.

**Rationale:** Everything else the user will ask for — due-date updates, response stats, history, staff-on-behalf reply, custom questions — is impossible until the type + routing unification lands. This is the one idea that collapses today's silent-drop bug, the zero Consent-Forms UI, and the misleading "post-with-response" flow all at once.

**Downsides:** Largest single piece of work in this list. The merged list-loader has to handle two paginated endpoints (Consent forms return `{posts, total, page, pageSize}` vs Announcements' flat array) and a shared sort key. URL scheme (`/posts/:id` or `/posts/ann_:id` + `/posts/cf_:id`) needs a call; PG already prefixes fixture `id` as `ann_…` / `cf_…`, so we can ride that free. Discriminated union rippling through the detail + edit containers is routine but wide.

**Confidence:** 95%
**Complexity:** High
**Status:** Unexplored

### 2. Consent-form post-publish actions on unified detail

**Description:** Once idea #1 lands, three OPEN-form actions become the first teachers-will-notice wins:

- **Update due date** (modal + `updateConsentFormDueDate`, already in client.ts).
- **`consentFormHistory` audit log** render on detail (timestamped entries of create / post / due-date change / staff replies).
- **Staff-edited reply on behalf of parent** (`PUT /consentForms/{formId}/student/{studentId}/reply`). A row-level action on the response table for offline parents.

**Rationale:** These are the three Consent-Form features PG teachers use the most _after_ creation. They're all modal-scoped additions on top of the unified detail view; none blocks the list/create flow from shipping first.

**Downsides:** Staff-on-behalf reply needs a confirm dialog + audit trail UX, and PG's endpoint semantics on that route need a smoke test (not in the May gap doc). Would be defensible to split (1) + (2) from (3).

**Confidence:** 85%
**Complexity:** Medium
**Status:** Unexplored

### 3. PG drift guardrail — runtime contract + fixture refresh + proxy drift log

**Description:** The audit doc catches shape drift once per quarter by hand. Turn it into a standing system:

- Runtime validation on the FE: zod (or valibot) schemas derived from the existing `PGApi*` interfaces; validate in dev-mode + CI; fail fixtures on drift.
- Fixture refresh script: `go run scripts/refresh-pg-fixtures` hits a local pgw-web for each proxied GET and diffs against `server/internal/pg/fixtures/*.json`. Commit the diff on intentional catch-ups; alarm in CI when unintentional.
- Proxy drift telemetry: in `proxyErrorHandler` + a small envelope sniff, `slog.Warn` any response whose `resultCode` is unknown to the catalog or whose envelope parse fails. A ring-buffer at `/api/_debug/drift` gives the next audit a head start.

**Rationale:** Unification doubles the PG contract surface TW depends on — Announcement **and** Consent Form shapes side-by-side. A Consent-Forms type mismatch (e.g. `reminderDate` going from string to `Date | null`) today reaches the user as a runtime `TypeError` in the detail view. This turns the audit into code.

**Downsides:** Another thing to maintain. CI noise if pgw-web ships frequent additive fields without field-tagging.

**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 4. Autosave every 30s + unload warning

**Description:** Port pgw-web's `useUnloadEvent` + 30s `setInterval` autosave from `SaveAsDraft.tsx`. Send autosave with `X-No-Extend-Session: 1`; have the Go proxy pass it through so sliding-expiry doesn't freeze the session on every tick. Combine with `useBlocker` from React Router for in-app navigation.

**Rationale:** Consent forms take longer to author than announcements (event, venue, due-date, reminders, questions). Data-loss risk is the first thing a frustrated teacher can explain clearly. Cheap; visible in demos.

**Downsides:** Needs a staging PG that honours the no-extend header; behaviour under CSRF rotation needs care (autosave mutates). Autosave on consent forms means routing through `updateConsentFormDraft`, which the unified mapper covers once idea #1 is in.

**Confidence:** 88%
**Complexity:** Medium
**Status:** Unexplored

### 5. Selector completeness — fill the empty recipient + staff tabs

**Description:** Both `StudentRecipientSelector` and `StaffSelector` show tabs they don't populate: Level, CCA, School, Group (custom) on recipients; Level, School on staff. Endpoints are already proxied (`/groups/assigned`, `/groups/custom`, `/school/groups`, `/school/students`). Fan them in. Fix the `stripClassYear` regex shortcut in `CreatePostView.tsx:275` so edit-hydration lines up for non-year-suffixed labels.

**Rationale:** Both announcements and consent forms use the same recipient/staff selectors. Half-filled tabs make the form look broken and silently limit the audience teachers can target — felt twice as often once Forms are authorable.

**Downsides:** Each tab adds a loader + chip-type; `groupRecipients` stays in sync with any new `groupType` variant. Custom Groups also means the new `CreateCustomGroup` chrome PG has, but that's scope-creep for this card.

**Confidence:** 85%
**Complexity:** Medium
**Status:** Unexplored

### 6. Attachments pipeline — files, photos, draft-file expiry notice

**Description:** Replace `AttachmentSection.tsx` placeholder with the real PG flow: `POST /files/2/preUploadValidation` → S3 presigned PUT → poll `GET /files/2/postUploadVerification` until clean → stash `fileToken` → include in `attachments` / `images` on whichever endpoint unification routes to. Re-use pipeline for 12-photo gallery with 3-cover selection. Surface PG's 30-day draft-file expiry notice when loading a draft that carries uploaded tokens.

**Rationale:** Attachments are the single feature teachers ask about first. Both announcements and consent forms accept them, so this single pipeline benefits both sides of the umbrella. Audit §4 flagged that `preUploadValidation` / `postUploadVerification` may not actually exist server-side — needs a PG-team confirmation before committing.

**Downsides:** S3 + antivirus-scan polling + CORS on presigned PUTs. Locally needs LocalStack or stubbed scan. High relative effort; no partial value before end-to-end works. Don't attempt before idea #1 because the upload-token field wiring differs per endpoint.

**Confidence:** 70%
**Complexity:** High
**Status:** Unexplored

### 7. Content blocks + feature-flag gating (website-links, shortcuts, `/api/configs`)

**Description:** Three small payload-already-supported UI holes that apply to both announcements and consent forms: (a) website-links section (up to 3 URL+description rows) — `toPGCreatePayload` already emits `webLinkList`; (b) shortcuts checkboxes for Declare-travels / Edit-contact; (c) actually read `/api/configs` on boot and gate schedule + duplicate + shortcut UI on the flags PG provides.

**Rationale:** Small, visible, and PG-parity. Drift between "PG has the flag off" and "TW pretends it's on" becomes a support-ticket surface. The `/api/configs` read also unlocks PG's `heyTaliaAccess` gate if/when TW surfaces AI features.

**Downsides:** Flag-driven UI adds conditional branches; needs a typed config client and a fallback for when `/api/configs` is unreachable.

**Confidence:** 75%
**Complexity:** Low
**Status:** Unexplored

## Rejection Summary

| #   | Idea                                                        | Reason rejected                                                              |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Standalone "fix post-with-response payload drop"            | Absorbed into idea #1 — payload wiring is step 1 of unification, not a patch |
| 2   | Standalone "two modules, Forms as sibling" option           | Superseded by confirmed umbrella direction                                   |
| 3   | Reschedule + cancel-schedule drafts (kebab actions)         | Polish; covered once unification lands                                       |
| 4   | Delete confirmation modal replacing `confirm()`             | Trivial polish, not leverage                                                 |
| 5   | "Add staff-in-charge" modal on detail                       | Post-publish chrome; small impact                                            |
| 6   | "Edit enquiry email" modal on detail                        | Post-publish chrome                                                          |
| 7   | Duplicate-draft kebab action                                | Trivial                                                                      |
| 8   | Filter modal (date range + status checkboxes)               | Table polish only; more valuable once list merges both kinds (defer)         |
| 9   | Read-tracking toolbar (search + class + column + Excel)     | Valuable but second-order; defer until stats + detail branching land         |
| 10  | Extend `extractTextFromTiptap` for lists/tables/blockquotes | Subsumed by fixture drift testing (idea #3)                                  |
| 11  | Admin list / post oversight                                 | Flagged out-of-scope in May gap doc                                          |
| 12  | Custom response options (PG inferred)                       | Yagnit until teachers ask; Yes/No + Acknowledge cover 95%                    |
| 13  | Prune FE-only fields from `mock-pg-announcements.ts`        | Bundle into idea #1's discriminated-union rewrite                            |
| 14  | Move JSON fixture imports out of FE client                  | Tactical bundle-size win; not leverage                                       |
| 15  | Unified write state machine (single `savePost` reducer)     | The routing in idea #1 is already a mini state machine; don't over-engineer  |
| 16  | 90-day IMA / 2FA / session-expiry countdown                 | Platform chrome; flagged out-of-scope                                        |
| 17  | Photo gallery as a separate idea                            | Rolled into idea #6                                                          |
| 18  | Shortcuts as a separate idea                                | Rolled into idea #7                                                          |

## Session Log

- 2026-04-20: Initial ideation — 30 candidates, 7 survivors across correctness + parity + leverage + polish.
- 2026-04-20: Rewrite after user confirmed Posts is the umbrella for both PG modules. Former ideas #1 (decide) and #2 (payload patch) merged into a single execution plan (new #1). Promoted Forms post-publish actions (new #2) from the rejection table. Other survivors unchanged in substance, re-justified against the umbrella frame.
