# PGTW-1..12 Parity Scoping — Announcements & Forms

## Context

This is **not** a sprint plan — it is a gap-analysis / scoping doc. The goal is to enumerate, for every Jira ticket PGTW-1..12 (the "PHASE 1 PILOT" backlog for announcements + forms), what PGW (the production Parents Gateway web app) does, what the current `tw-pg-experiment` frontend does on branch `feat/posts-frontend`, and what is still missing to reach parity. It exists so I can size the work and decide what to tackle first.

**IA / naming mapping in this repo:**

- **Post** (type = `view-only`) = **Announcement** in PGW (`/announcements/*`)
- **Post with responses** (type = `acknowledge` | `yes-no` | `custom`) = **Form** in PGW (`/consentForms/*`)

Both map onto a single FE flow in tw-pg-experiment today (`CreatePostView` branches on `responseType`), whereas PGW has two separate routes/flows. That divergence is intentional here — it is not called out as a gap per ticket, but is tracked under "Cross-cutting" below.

**Sources used:** [docs/audits/pg-fe-may-testing.md](pg-fe-may-testing.md), [docs/audits/pg-backend-contract.md](pg-backend-contract.md), [docs/references/pg-api-contract.md](../references/pg-api-contract.md), [docs/references/pg-specs.md](../references/pg-specs.md), [docs/references/pg-bff-design.md](../references/pg-bff-design.md), [docs/references/pg-context.md](../references/pg-context.md), [docs/references/pg-team-asks.md](../references/pg-team-asks.md) and direct inspection of `web/` on branch `feat/posts-frontend`.

**Note on PGTW-2:** Not present in the Jira backlog screenshot (tickets jump 1 → 3). Treated as absent; flag if it actually exists so I can fetch it via the Atlassian MCP.

**Hard constraint — "PGW backend is untouchable":** every gap in this doc is resolved on our side. PGW's endpoints, error codes, enums, field shapes and feature flags are treated as fixed. Divergence is absorbed in the `tw-pg-experiment` FE and BFF. If a parity item would require _any_ change to the PGW backend, it's out of scope for this phase — we either map to what PGW already exposes or we drop/defer the item.

---

## PGTW-1 — Staff to select type of post

**PGW behavior.** Type is selected implicitly by route: `+ New announcement` → `/announcements/new`, `+ New form` → `/consentForms/new`. The forms differ substantially (forms have response type, due date, reminders, custom questions, event dates, venue).

**Current tw-pg-experiment state.** A single route `/posts/new` mounts `CreatePostView`, which shows a modal `PostTypePicker` ([web/components/posts/PostTypePicker.tsx](../../web/components/posts/PostTypePicker.tsx)) with "Post" vs "Post with Response" cards. Selection sets `selectedType: PostKind` in the `useReducer` form state and conditionally reveals form sections. Fully wired to BFF via `createAnnouncement` / `createDraft` ([web/api/client.ts](../../web/api/client.ts)).

**Gap.**

- None for the user-visible behavior — selection + conditional rendering works.
- **Shape mismatch vs PGW:** announcement and form are one code path here, two routes in PGW. If we ever proxy to real PGW endpoints we'll need to dispatch to `/announcements/*` vs `/consentForms/*` based on `selectedType`. Covered under "Cross-cutting: announcements vs forms split" below.

**Files likely to touch later:** [web/containers/CreatePostView.tsx](../../web/containers/CreatePostView.tsx), [web/api/client.ts](../../web/api/client.ts).

---

## PGTW-3 — Schedule post

**PGW behavior.** "Schedule Send" radio group ("Now" vs "Later") under feature flag `flags.schedule_announcement_form_post.enabled`. Time picker uses 15-min increments between 7:00 AM and 9:45 PM. Scheduled post saved via `POST /api/web/2/staff/announcements/drafts/schedule` with `scheduledSendAt` (ISO 8601 UTC). Reschedule via `PUT /drafts/:id/rescheduleSchedule`. Default reminders auto-computed and shown read-only next to schedule.

**Current state.** `SplitPostButton` ([web/components/posts/SplitPostButton.tsx](../../web/components/posts/SplitPostButton.tsx)) flips between "Post" and "Schedule". Selecting "Schedule for later" opens `SchedulePickerDialog` ([web/components/posts/SchedulePickerDialog.tsx](../../web/components/posts/SchedulePickerDialog.tsx)) — `react-day-picker` + 30-min-increment time select, 9:00 AM default, 15-min minimum lead time, 30-day window, emits ISO 8601 with `+08:00`. Calls `createDraft({ scheduledSendAt })` / `updateDraft`.

**Gap.**

- **Time increments:** ours is 30-min, PGW is 15-min. Either change to 15-min or confirm 30-min is acceptable.
- **Allowed window:** PGW bounds 7:00 AM – 9:45 PM. Ours allows any time-of-day. Confirm PGW's window is a hard rule vs school-configurable.
- **Reschedule after publish:** PGW supports `rescheduleSchedule` on an existing scheduled draft; we currently re-use `updateDraft`. Verify behavior when a scheduled draft's time is edited.
- **Default reminders preview:** PGW shows auto-computed default reminders next to the schedule. Not shown here. (Depends on PGTW-12.)
- **Failure surfacing:** PGW has `scheduledSendFailureCode` on the list summary. We don't surface it.

**Files:** [SchedulePickerDialog.tsx](../../web/components/posts/SchedulePickerDialog.tsx), [SplitPostButton.tsx](../../web/components/posts/SplitPostButton.tsx), [CreatePostView.tsx](../../web/containers/CreatePostView.tsx), [web/api/client.ts](../../web/api/client.ts).

---

## PGTW-4 — Duplicate post

**PGW behavior.** Feature-flagged by `flags.duplicate_announcement_form_post.enabled`. Kebab menu on both drafts and posted items. `POST /announcements/duplicate` with `{ announcementId }` → `{ announcementDraftId }`. New draft is titled "Copy of [Title]". Success toast links to new draft.

**Current state.** Kebab menu in `PostsView` ([web/containers/PostsView.tsx:265-286](../../web/containers/PostsView.tsx#L265-L286)) has "Duplicate" item; calls `duplicateAnnouncement({ postId })` → BFF `/announcements/duplicate`. Success toast: "Post duplicated."

**Gap.**

- **No "Copy of" prefix visible in our toast/title handling** — verify whether PGW echoes the new title back; if not, prepend in our BFF on the duplicate response before we render the list. At minimum, the toast should deep-link to the new draft (PGW does; we don't).
- **Forms path:** PGW likely has `/consentForms/duplicate` separate from `/announcements/duplicate`. Under the untouchable constraint, our BFF must route on `responseType` and call whichever PGW endpoint exists. If `/consentForms/duplicate` doesn't exist upstream, forms-duplicate is **blocked until PGW adds it** — flag for PG team.
- **Permissions:** PGW restricts duplicate to author/staff-in-charge; we should mirror with an FE gate (hide menu item when current staff isn't the owner/on staff list).

**Files:** [web/containers/PostsView.tsx](../../web/containers/PostsView.tsx), [web/api/client.ts](../../web/api/client.ts).

---

## PGTW-5 — Save as draft

**PGW behavior.** Dedicated **"Save as draft"** button (orange outline) in the sticky bottom bar on create/edit. Endpoints: `POST /announcements/drafts` (new) or `PUT /drafts/:id` (update). No required-field enforcement on save. PGW also runs **auto-save** (~30s polling via `AutoSaveStatesContext`) with session-extension suppression header `REQUEST_HEADER_NO_EXTEND`. Draft detail loads with file-expiry notice.

**Current state.** There is **no explicit "Save as draft" button.** The only path that creates a draft is the `SplitPostButton` → "Schedule for later" flow, which persists as a scheduled draft. The API verbs `createDraft`/`updateDraft` exist but the UI only invokes them through scheduling.

**Gap.**

- **Missing UI action: "Save as draft"** button in the create/edit form footer. Must call `createDraft({ ...payload })` without `scheduledSendAt`.
- **Missing auto-save.** No polling, no `AutoSaveStatesContext`, no session-extension header. This is substantial work — own it as a distinct line item if we take it.
- **Missing file-expiry notice** on draft load (depends on attachments scope).
- **Status pill on list:** "Draft" already shown in `PostsView`, but only after schedule-save; without the button above, regular drafts can't be created from the UI.

**Files to create/touch:** form footer in [CreatePostView.tsx](../../web/containers/CreatePostView.tsx), new auto-save hook/context, [web/api/client.ts](../../web/api/client.ts).

---

## PGTW-6 — Preview post before sending

**PGW behavior.** Separate `/announcements/preview` (or `/consentForms/preview`) route. Preview button validates required fields first; phone-frame mockup of parent app; "Post Now" and "Back" CTAs; shows auto-save ticker "Last saved today at HH:MM AM".

**Current state.** **Side-by-side live preview** via `PostPreview` ([web/components/posts/PostPreview.tsx](../../web/components/posts/PostPreview.tsx)). Sticky right column on `lg+`, drawer on mobile. `useDeferredValue` keeps it performant. Per meeting notes, side-by-side is the desired direction — **this is intentional divergence, not a gap.**

**Gap.**

- **Validation gate missing.** PGW's preview is also a pre-flight validation step; ours is just a visual mirror. When the "Post" button is pressed today, validation happens, but there's no "dry-run / review" mode.
- **Content breadth.** Our preview shows title, description, response-type buttons. PGW preview mirrors the parent-app card more fully — attachments, images, shortcut links, website links, venue (forms), event dates (forms), due date (forms). Audit gap after PGTW-11 defines final field set.
- **Desktop vs phone.** PGW preview is a phone mockup. Ours is a card. Decide: do we want a phone frame when viewport is wide?

**Files:** [PostPreview.tsx](../../web/components/posts/PostPreview.tsx), [CreatePostView.tsx](../../web/containers/CreatePostView.tsx).

---

## PGTW-7 — Staff-in-charge access type (editor or viewer)

**PGW behavior.** Multi-select staff picker categorized by Individual / Level / School tabs. Announcements helper: "These staff will be able to view read status, and delete the announcement." Forms helper: "These staff will be able to **view and edit responses**, and delete the form." Submitted as `staffOwners: [staffId, ...]`. **No editor-vs-viewer role field observed in PGW contract today** — access appears binary (on the list = can act).

**Current state.** `StaffSelector` ([web/components/comms/staff-selector.tsx](../../web/components/comms/staff-selector.tsx)) captures `selectedStaff[]` and persists as `staffOwnerIds` on payload. Rehydrates on edit. Helper text does not vary between announcement/form today. `grep` shows **no `editor` / `viewer` / `accessType` / `staffRole` tokens anywhere in the codebase**.

**Gap.**

- **Ticket title implies role granularity (editor/viewer) that PGW does not expose.** Under the "PGW untouchable" constraint, editor/viewer cannot be a PGW field. Options that don't touch PGW:
  - (a) **Replicate PGW as-is** (one list, binary access). Just add per-type helper text + Individual/Level/School tabs. Ignore the "editor/viewer" wording in the ticket title. Smallest scope.
  - (b) **TW-only role metadata**: FE captures editor/viewer per staff chip and we store it in the TW BFF's own datastore (keyed by post id), while `staffOwners` upstream stays as just the ID list. Extra TW plumbing, no PGW change, but the role distinction is invisible to PGW's own access checks — it'd be cosmetic / audit-log only until PGW adopts it.
  - Recommend: start with (a); only take (b) if Grace says editor/viewer is a Phase-1 commitment.
- **Either way:** picker tabs (Individual / Level / School) not implemented; currently flat list.

**Files:** [staff-selector.tsx](../../web/components/comms/staff-selector.tsx), likely [CreatePostView.tsx](../../web/containers/CreatePostView.tsx), [web/api/types.ts](../../web/api/types.ts) if schema grows.

---

## PGTW-8 — Additional rich text formatting in description

**PGW behavior.** Tiptap + ProseMirror. Documented nodes/marks: `doc`, `paragraph` (with `textAlign: left|center|right|justify`), `text` with `bold`/`italic`/`underline`, `bulletList`, `orderedList`, `listItem`, `hardBreak`. Stored as JSON-escaped string in `richTextContent`. 2000-char cap, counter "2000 characters left". Hyperlinks **not** supported in form description per HeyTalia note in audit.

**Current state.** Tiptap via `RichTextEditor` / `RichTextToolbar` ([web/components/posts/RichTextEditor.tsx](../../web/components/posts/RichTextEditor.tsx), [RichTextToolbar.tsx](../../web/components/posts/RichTextToolbar.tsx)). Supports **Bold, Italic, Underline, Align L/C/R, Link (with autolink), Highlight**. CharacterCount set to 2000. Stored as Tiptap JSON in `descriptionDoc`, sent to BFF as `richTextContent` (stringified).

**Gap.**

- **Missing vs PGW:** `justify` alignment, `bulletList` / `orderedList` / `listItem`, `hardBreak` as a toolbar action.
- **Extras we have that PGW doesn't document — `Link` and `Highlight`.** Under the untouchable-backend constraint, these will trigger `-4003` on submit. **Remove from toolbar and strip on paste** (via a Tiptap input rule/sanitizer) to match PGW's schema.
- **Serialization format:** PGW expects a **JSON-escaped string**; we send JSON (via stringify). Confirm that matches what the BFF/proxy passes through.
- **Validation:** PGW rejects with `-4003` (invalid schema) / `-4004` (length exceeded). We rely on CharacterCount + backend rejection; `-4003` will only surface as a generic toast today.

**Files:** [RichTextEditor.tsx](../../web/components/posts/RichTextEditor.tsx), [RichTextToolbar.tsx](../../web/components/posts/RichTextToolbar.tsx), [web/api/client.ts](../../web/api/client.ts) (error mapping).

---

## PGTW-9 — Post-created: recipient read-status table

**PGW behavior.** Detail page's default "Read Status" tab. Click-through stat cards: **Total / Read / Unread**. Filters: status dropdown (All / Read / Unread / Not Onboarded), class dropdown, "Show Columns" multi-select. Columns: Name (+ parent role), Class/Index, Read Status, Read Time, First Read By, Status. Export to Excel (`.xlsx`). Data via `GET /announcements/:postId/readStatus`.

**Current state.** `RecipientReadTable` ([web/components/posts/RecipientReadTable.tsx](../../web/components/posts/RecipientReadTable.tsx)): Student name, Class, Read ✓/✗, Read timestamp; conditional columns for acknowledge / yes-no. Unread sorted first. Reads from detail payload.

**Gap.**

- **Filters missing:** status dropdown, class dropdown, Show Columns selector.
- **Missing columns:** First Read By, Status (e.g. "Not Onboarded"), parent-role suffix on name.
- **No export to Excel.**
- **Click-through stat cards** (Total/Read/Unread) not implemented — `ReadTrackingCards` shows rollup metrics but no filter-on-click.
- **Endpoint:** data is currently read from the detail payload; PGW exposes a dedicated `/readStatus` endpoint. Confirm whether we should switch.

**Files:** [RecipientReadTable.tsx](../../web/components/posts/RecipientReadTable.tsx), [web/components/posts/ReadTrackingCards.tsx](../../web/components/posts/ReadTrackingCards.tsx), [web/containers/PostDetailView.tsx](../../web/containers/PostDetailView.tsx), [web/api/client.ts](../../web/api/client.ts).

---

## PGTW-10 — Dashboard: list of posts by type with status overview

**PGW behavior.** Two separate list pages: `/announcements` and `/consentForms`. Each has tabs "Created by you" and "Shared with you". Announcements columns: TITLE, Date (Posted on / Edited on), STATUS, TO PARENTS OF, # READ (X / Y + progress bar), Actions. Forms columns: same except # RESPONDED. Status pills: announcements `POSTED | DRAFT | SCHEDULED`; forms `OPEN | DRAFT | CLOSED`. Pagination with rows-per-page + "Showing X–Y of Z".

**Current state.** Single `PostsView` ([web/containers/PostsView.tsx](../../web/containers/PostsView.tsx)) with two tabs ("Posts" = view-only, "Posts with responses" = acknowledge/yes-no). Status pills: "Posted", "Scheduled", "Draft", "Posting". Read-rate column exists.

**Gap.**

- **Missing "Shared with you" tab** (and its "CREATED BY" column).
- **Missing "Open / Closed" status for forms** — forms today only show Post/Schedule/Draft; no concept of a response window closing.
- **Missing `# RESPONDED` column for forms.**
- **Missing pagination UI** ("Showing X–Y of Z", page size selector, numbered pages).
- **Date column** doesn't distinguish "Posted on" vs "Edited on" today.
- **Architectural:** we've merged announcements and forms into one list with tab filter; PGW splits. This is a deliberate IA decision we should state in the design.

**Files:** [PostsView.tsx](../../web/containers/PostsView.tsx), [web/api/client.ts](../../web/api/client.ts) (`loadPostsList` — add shared-with-you, status enum for forms).

---

## PGTW-11 — Mandatory fields + character-limit validation

**PGW behavior.** Required on both announcements and forms: Students, Title (120 chars), Description (2000 chars), Enquiry email. Forms-only required: Response type, Due date, "Send additional reminder(s)" (None / One Time / Daily). Optional limits: Website links ≤ 3, URL validation; File attachments ≤ 3, < 5 MB; Photos ≤ 12 (≤ 3 cover); Venue ≤ 120 chars (forms). Error codes from API: `-4001` email missing, `-4003` bad rich text, `-4004` rich text too long.

**Current state.** Title (120 cap + counter), Enquiry email (required, pre-submit validated), Recipients (required count check), Description (2000 cap but **not required**), Due date (only shown when response type ack/yes-no, **not required**). `isFormValid` gate ([CreatePostView.tsx:403-406](../../web/containers/CreatePostView.tsx#L403-L406)) gates the Post button. API errors surface via `PGValidationError` toasts, without per-field highlighting.

**Gap.**

- **Description should be required** — today it's optional.
- **Due date required** when form type requires responses — today it's soft.
- **"Send additional reminder(s)" field missing entirely** (see PGTW-12).
- **Website-link limits (≤3, URL validation), attachment limits (≤3, <5MB), photo limits (≤12, ≤3 cover), venue cap (≤120)** — attachments/photos/venue/links UI is not implemented at all ("not wired to payload" comments exist).
- **Per-field error messaging** for API errors `-4001`/`-4003`/`-4004` — currently generic toast.
- **Response type + question count validation** for form posts — no frontend validation.

**Files:** [CreatePostView.tsx](../../web/containers/CreatePostView.tsx), [web/api/client.ts](../../web/api/client.ts), eventually attachment/link/photo sub-components that don't exist yet.

---

## PGTW-12 — Job to trigger reminders for posts with reminders set

**PGW behavior.** Forms: "Send additional reminder(s) to parents" section with radio (`None` / `One Time` [+ date picker] / `Daily` [+ "from" date picker]). Default reminder auto-computed and shown read-only: "Default reminder will be sent on [due date − 1] and [due date]". Announcements: "Schedule send" section shows auto-computed default reminders read-only. API fields: `addReminderType: "ONE_TIME" | "NONE" | "DAILY"`, `reminderDate: ISO 8601 | null`. Backend schedules and delivers; specifics of the cron/job **not documented in our audits.**

**Current state.** `addReminderType` and `reminderDate` exist as **types only** in [web/api/types.ts:210-211](../../web/api/types.ts#L210-L211). **No UI** to set them; no default-reminder preview; no backend job on our side. This is purely a FE-type scaffolding right now.

**Gap.**

- **FE work:**
  - Reminders radio group + date picker(s) in form-type posts.
  - Default-reminder preview row in create/edit and in preview panel.
  - Rehydrate reminders on draft/edit load.
  - Surface `reminderDate` in detail view.
- **BFF / proxy work (out of FE scope, but needs alignment):** passthrough to PGW `addReminderType`/`reminderDate` fields on create/update/draft endpoints.
- **Backend reminders job itself** is a PGW concern — if we ever run it locally (mock service), we have to stand up a cron or scheduler. Call out as "needs PG team confirmation" — ties into the meeting's Next Step "Tan: set up mock service and database environment".

**Files:** [CreatePostView.tsx](../../web/containers/CreatePostView.tsx), [web/components/posts/PostPreview.tsx](../../web/components/posts/PostPreview.tsx), [web/containers/PostDetailView.tsx](../../web/containers/PostDetailView.tsx), [web/api/client.ts](../../web/api/client.ts).

---

## Cross-cutting gaps (not tied to one ticket)

1. **Announcements vs Forms split — decided: keep unified FE IA, BFF fans out to PGW's two endpoint families.** PGW has two routes, two endpoints, two status vocabularies. Teachers want unified IA, and PGW is untouchable, so the `tw-pg-experiment` Go BFF becomes the adapter: it receives our unified `/posts` calls, inspects `responseType`, and dispatches to PGW `/announcements/*` or `/consentForms/*` with the right field transform. Status vocabularies are also normalized in the BFF (e.g. PGW's `OPEN`/`CLOSED` for forms → a unified status enum for our list). This affects PGTW-1 (dispatch), PGTW-4 (BFF routes duplicate to the right upstream), PGTW-7 (helper text varies by `responseType`), PGTW-10 (list-merge query fans out + merges), PGTW-11 (per-type required fields), PGTW-12 (reminders only on form path).
2. **Auto-save.** PGW runs ~30s auto-save with no-extend session header. We have nothing. Needed for PGTW-5 to feel complete and for PGTW-6 (preview shows "last saved" ticker).
3. **Attachments, photos, website links, venue, event dates** — entire sub-systems not implemented in FE. Blocks PGTW-6 (preview must render them), PGTW-11 (limits).
4. **Individual student selections not wired to payload** (existing TODO in `CreatePostView.tsx` around line 215). Blocks PGTW-11 (recipient validation) if teachers pick individuals.
5. **Recipient tabs (Level / CCA / Teaching Group / Custom Groups)** are placeholders in [student-recipient-selector.tsx](../../web/components/posts/student-recipient-selector.tsx) lines 59-67. Blocks PGTW-11.
6. **Per-field validation error mapping** — we toast raw errors; PGW error codes need per-field plumbing.
7. **Feature flag plumbing.** PGW gates schedule/duplicate behind flags. We must **read** PGW's flags and gate our UI accordingly — no PGW change. BFF should expose the flag values to the FE on session/bootstrap.
8. **Post-creation features (PGTW-9, 10) were scoped out of the sprint** in the meeting notes but are in this document per the user ask. If the sprint holds to issues 1-8, treat 9-10 as stretch.

---

## Suggested parity ordering (rough, needs sprint discussion)

In order of "biggest visible gap per unit of work":

1. **PGTW-5 Save as draft button** + minimal auto-save — unblocks half of everything else and is one component.
2. **PGTW-11 required-field enforcement** (description + due date + response type) — small, high-value.
3. **PGTW-8 rich text parity** (lists, justify, hardBreak; remove highlight/link if PGW doesn't support) — mostly toolbar edits.
4. **PGTW-12 reminders UI** — medium; schema already in types.
5. **PGTW-3 schedule refinements** (15-min increments, time window, reschedule flow).
6. **PGTW-7 staff-in-charge** — blocked on clarification (binary vs editor/viewer).
7. **PGTW-9 read-status table filters + export** — medium, and sprint-excluded per meeting notes.
8. **PGTW-10 dashboard shared-with-you tab + forms status enum + pagination** — medium, and sprint-excluded per meeting notes.
9. **PGTW-4 duplicate** — mostly done; small follow-ups (toast deep-link, forms endpoint).
10. **PGTW-1 type picker** — already works; only touches if we split announcement/form routes.
11. **PGTW-6 preview validation/content completeness** — depends on cross-cutting items 3.

---

## Open questions (need PG team / Grace input)

All questions are framed under the "PGW untouchable" constraint — they're asking what PGW _already exposes_, not what PGW could add.

1. **PGTW-7:** editor/viewer roles — Grace decision: is (a) binary access (PGW-as-is) acceptable for Phase 1, or do we need (b) TW-side role metadata? Do **not** request PGW to add a role field.
2. **PGTW-4:** does `/consentForms/duplicate` exist in PGW today? If yes, what's the shape? If no, forms-duplicate is deferred.
3. **PGTW-8:** does PGW's parent app render `justify` alignment today? (If no, drop `justify` too; if yes, add it.) Link/Highlight confirmed out — we'll strip.
4. **PGTW-3:** is the 7:00 AM – 9:45 PM window hard-coded in PGW or school-configurable? Either way we mirror what PGW does; just need to know whether to read from config.
5. **PGTW-12:** cron schedule + delivery channel for reminders is purely a PGW-side concern. Our ask: does PGW return the _computed_ default-reminder dates on the draft payload (so we can render the preview), or do we need to compute them client-side from `dueDate`?
6. **PGW error code table:** is there a complete per-endpoint error catalog for `/announcements` and `/consentForms`? We have the generic auth/validation codes but not business-level ones.
7. **Feature flags exposure:** how does the BFF learn `flags.schedule_announcement_form_post.enabled` / `flags.duplicate_announcement_form_post.enabled`? Is there a `/session` or `/bootstrap` endpoint that returns them, or do we probe the endpoint and infer?
8. **`-4031` 302 redirect:** (carried over from pg-team-asks #9) still unresolved — we need the Location shape to handle it in FE.

---

## Error handling & edge-case audit (added on review)

The first pass of this doc covered feature-level gaps. This section is a systematic sweep of error paths, race conditions, and edge cases. It's based on: [web/api/client.ts](../../web/api/client.ts) (current error routing), [web/api/errors.ts](../../web/api/errors.ts), PGW error table in [docs/audits/pg-backend-contract.md](pg-backend-contract.md#errors), and the May-testing audit's "high-risk" callouts in [docs/audits/pg-fe-may-testing.md](pg-fe-may-testing.md).

### Current error-routing baseline (what we already have)

In [web/api/client.ts:79-99](../../web/api/client.ts#L79-L99):

| PGW code  | HTTP | Current behavior                                              |
| --------- | ---- | ------------------------------------------------------------- |
| `-401`    | 401  | Redirect `/session-expired` + throw `PGSessionExpiredError`   |
| `-4012`   | 401  | Same as `-401`                                                |
| `-404`    | 404  | Throw `PGNotFoundError`                                       |
| `-400`    | 400  | Throw `PGValidationError` (silent — container renders inline) |
| `-4001`   | 400  | Throw `PGValidationError`                                     |
| `-4003`   | 400  | Throw `PGValidationError`                                     |
| `-4004`   | 400  | Throw `PGValidationError`                                     |
| `-429`    | 429  | Toast "Too many requests…" + throw `PGError`                  |
| _default_ | any  | Toast raw `errorReason` + throw `PGError`                     |

### Error-code gaps vs PG's documented table

From [pg-backend-contract.md §Errors](pg-backend-contract.md#errors):

| PGW code              | HTTP    | What's documented                             | Our handling today                                                                                           | Fix needed                                                                                        |
| --------------------- | ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `-4011`               | 401     | Wrong session type                            | Falls through → generic toast                                                                                | Force logout + re-auth; distinct from `-401`                                                      |
| `-4013`               | 401     | **Invalid CSRF**                              | Falls through → generic toast                                                                                | Refresh CSRF token and retry the request **once**. If still fails, treat as `-401`.               |
| `-403`                | 403     | Unauthorized access                           | Falls through → generic toast                                                                                | Route to error page; no retry                                                                     |
| `-4031`               | **302** | Redirect, not JSON — `Location: /error/-4031` | `!res.ok` check never fires because it's a redirect. Today we likely silently follow or break on HTML parse. | Intercept in fetch: `redirect: 'manual'` and inspect `Location`; navigate to a login-failed route |
| `-4032`               | 403     | Insufficient permission                       | Falls through → generic toast                                                                                | Inline error on the feature (not toast)                                                           |
| `-4033`               | 403     | 2FA required                                  | Falls through → generic toast                                                                                | Prompt MFA flow (out of scope for posts but must not silently fail)                               |
| `-500`, `-5001..5005` | 500     | Server / upstream failure                     | Generic toast                                                                                                | Single retry with backoff for idempotent GETs; no retry on writes; toast "Try again later"        |

**Also:** PGW-specific post-creation codes beyond `-4001/-4003/-4004` are not documented in our audit but almost certainly exist (conflict on duplicate, attachment too large, etc.). Flag as an ask to the PG team — "full error-code table for `/announcements` and `/consentForms`".

### Cross-cutting runtime edge cases

1. **Dirty-state unload guard** — no `beforeunload` listener, no React Router `useBlocker`. Teacher hits Back mid-compose and loses everything. Port `useUnloadEvent` from `pgw-web/src/app/pages/Announcements/CreateAnnouncementPage/SaveAsDraft.tsx:116-181` as noted in the May audit.
2. **Autosave race with manual save** — ties PGTW-5. When both fire, need a single-flight guard (cancel in-flight autosave on manual save) and a version/etag or last-modified echo to reject stale PUTs.
3. **Session-extend suppression** — autosave must send `X-No-Extend-Session: 1` (PGW uses `REQUEST_HEADER_NO_EXTEND`) so polling doesn't keep the session alive when the user is idle.
4. **Concurrent edit from another tab / another staff owner** — no conflict detection. Last write wins. At minimum, show a stale-draft banner if the server `updatedAt` moves ahead of our copy on a save.
5. **Request timeout** — no `AbortController` with timeout on any call in [client.ts](../../web/api/client.ts). A hung request hangs the Post button forever. Wrap every mutate in a 30s timeout.
6. **Offline / network drop mid-save** — no `navigator.onLine` check, no retry queue. Minimum: detect "Failed to fetch", distinguish from HTTP errors, show "You're offline — we'll retry when you're back" toast.
7. **Clock skew at submit** — scheduled time validated client-side against `Date.now()`; gets stale if form sits open. Re-validate on submit.
8. **Toast de-duplication** — `handleErrorResponse` toasts generic failures, but CreatePostView / PostsView may also catch and toast. Verify no double toasts (e.g. PostsView lines 275-279 check `!(err instanceof PGError)` — correct for avoiding double-toast on catch, but need to audit every call site).
9. **Payload too large (413)** — would hit on future attachments work. Not handled. Add before implementing uploads.
10. **CSRF token rotation** — after `-4013` we should refetch CSRF and retry once. Currently one-shot failure.
11. **`fetchApiSafe` swallows too much** — returns fallback on "network errors" but a 500 toast may still fire via `handleErrorResponse`. Need clear rules for which read-path callers should degrade silently vs surface.
12. **Empty/null distinction on rich text** — if user clears the editor, do we send `null`, empty string, or empty ProseMirror doc `{ type: "doc", content: [] }`? PGW validation differs per case; confirm.

### Per-ticket edge cases

**PGTW-1 — type picker**

- Selecting a type → partial fill → switch type: current flow wipes conditional sections (response type, questions, due date, reminders). No confirm dialog — silent data loss.
- Deep-link with pre-selected type (`/posts/new?type=form`) not supported; not a requirement but useful for Grace's demos.

**PGTW-3 — schedule**

- Time becomes past between form load and submit (long idle); we validate in the dialog but not at submit.
- Timezone hard-coded to `+08:00`; staff logged in from abroad will see confusing times. Acceptable if Singapore-only, but document.
- Scheduled send failure (`scheduledSendFailureCode`) surfaces on PGW's list summary; we don't render it at all — a failed scheduled send would silently appear as "Posted" or stuck on "Scheduled".
- Reschedule while a publish is in-flight (within the 15-min lead window) — race condition; PGW guards with a separate `rescheduleSchedule` endpoint.

**PGTW-4 — duplicate**

- Title length overflow: if original title is 120 chars and BFF prefixes "Copy of ", result is 128 — BFF must truncate or echo the final title.
- Duplicate of a post that was deleted mid-click → 404; toast shouldn't say "duplicated".
- Duplicate of a scheduled post: does the new draft inherit `scheduledSendAt`? PGW likely strips it; confirm.
- Rapid-fire duplicate (double-click) creates two copies. Disable button during request.

**PGTW-5 — save as draft / autosave**

- Network drop mid-save, user navigates away before retry → **data loss**. The audit flags this as _high_ risk.
- File-expiry banner ("your files will expire on X") not shown on draft reload — user may re-use a draft with dead attachments.
- Manual save clicked twice → two `createDraft` calls, creating two drafts. Disable during in-flight.
- Opening the same draft in two tabs: edits overwrite each other. At minimum, last-modified warning.

**PGTW-6 — preview**

- Preview updates on every keystroke via `useDeferredValue` — large docs (2000 chars, 10+ blocks) could still jank on slower machines. Confirm with Grace on demo hardware.
- Attachments / images not rendered in preview today (blocks full PGTW-6 once PGTW-11 attachments land).
- Mobile drawer: no scroll lock, no focus trap — keyboard users can tab into the background form while preview is open.

**PGTW-7 — staff-in-charge**

- Rehydrating a stored `staffOwnerId` for a staff who has left the school — we show a ghost chip with no name. Need a "[unknown staff]" fallback or filter them out + warn.
- Adding self as staff-in-charge: PGW likely prevents (you already own it); we don't check.

**PGTW-8 — rich text**

- HTML paste from Word / Google Docs: Tiptap's default paste handlers bleed in fonts, colors, classes that PGW won't accept. Need a sanitizer on paste that strips to PGW's node/mark allowlist.
- Paste that exceeds 2000 chars: `CharacterCount` prevents typing past limit but I'm not sure it intercepts paste; verify.
- Empty doc vs null `richTextContent` — see cross-cutting #12.
- Emoji / non-BMP character counting: JS `.length` counts surrogate pairs as 2; PGW may count as 1. Can desync our counter.
- Link validation (if we keep `Link` mark): `javascript:` and data URIs must be stripped.

**PGTW-9 — read-status**

- Empty state (zero recipients) — no explicit empty UI today.
- Large class (500+ students): no virtualization on `RecipientReadTable`; will jank.
- "Not Onboarded" students: PGW renders a status; we ignore (read=false shown the same as any other unread).
- Stale data while detail is open — no polling/refresh; read counts drift.
- Export to Excel for 1000+ rows: time budget, file size.

**PGTW-10 — dashboard**

- Empty state (no posts at all, no posts for selected tab): no explicit copy.
- Pagination: none. With >50 posts the page gets heavy. (PGW paginates; we load everything.)
- `scheduledSendFailureCode` from PGW not surfaced — failed scheduled sends invisible to the list.
- Tab + search + sort combination: no search; adding one will interact with client-side tab filter.

**PGTW-11 — validation**

- Paste-over into title: no truncation; user can paste 500 chars and the counter just goes red but submit still fires.
- Response-type + questions for forms: no frontend check for "questions present when response type is custom".
- Due date in the past relative to scheduled send time: should error ("reminders would fire before post sends").
- No enquiry emails configured at school → select is empty; no empty-state message, just a non-functional dropdown.
- Multiple recipient modes (class + individual) simultaneously: not wired, so unclear what payload shape wins.
- `PGValidationError` today is toast-only (actually silent — see client.ts comment "render them inline"), but CreatePostView catch block at lines 451-478 doesn't currently map `resultCode` → specific field. All validation errors look the same to the teacher.

**PGTW-12 — reminders**

- Reminder set with `addReminderType: ONE_TIME`, then user changes due date to before the reminder: reminder becomes invalid. No client guard.
- Daily reminder `reminderDate` in the past: server error likely; no client guard.
- Switching `ONE_TIME → NONE → ONE_TIME` should reset `reminderDate`; reducer needs to handle this explicitly or stale state persists.
- Timezone on `reminderDate` — same issue as schedule (hard-coded `+08:00`).

### What's still unaudited (flag before starting any ticket)

- **Full PG error table for announcements and forms endpoints** — we only have the general `-40xx` / `-50xx` table. Per-endpoint business errors unknown.
- **Attachment/photo upload error taxonomy** — 413, malware scan rejection (mentioned in meeting notes), invalid mime, upload timeout.
- **Feature flag off-path behavior** — if PGW returns `flags.schedule_announcement_form_post.enabled = false`, does our UI gracefully hide the schedule option, or show a broken button?
- **`-4031` 302 redirect behavior** — still marked "need to confirm" in [pg-team-asks.md](../references/pg-team-asks.md) #9.
- **Cookie name rotation** — ops-only per the audit, but if it ever happens mid-session our BFF proxy breaks silently.

---

## Verification — "how do we know parity is reached"

Per ticket, parity is demonstrated by:

- **UI walkthrough** against the matching PGW flow (screenshots in [docs/audits/pg-fe-may-testing.md](pg-fe-may-testing.md)).
- **API payload diff** between our BFF call and the PGW contract ([docs/references/pg-api-contract.md](../references/pg-api-contract.md)): every required field present, every enum value matches.
- **Error handling** for each PGW error code (`-4001`, `-4003`, `-4004`) surfaces a per-field message.
- For PGTW-3, 5, 12: end-to-end once the mock service / database lands, confirming drafts + scheduled + reminder rows persist and reload.

Nothing in this doc requires code changes yet — the next step is to decide which tickets to pull into the 2-week sprint, then spin up `writing-plans` for each.
