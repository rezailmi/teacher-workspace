---
title: 'feat: Posts — Consent Form Parity'
type: feat
status: active
date: 2026-04-20
origin: docs/brainstorms/2026-04-20-posts-creation-consent-form-parity-requirements.md
---

# feat: Posts — Consent Form Parity

## Enhancement Summary

**Deepened on:** 2026-04-20
**Reviewers applied in parallel:** architecture-strategist, kieran-typescript-reviewer, code-simplicity-reviewer, pattern-recognition-specialist, performance-oracle, best-practices-researcher (UI).

### Key improvements from deepening

1. **Type model shift.** Replace "optional form-only fields on merged `PGAnnouncement`" with a true discriminated union of distinct interfaces (`PGAnnouncementPost | PGConsentFormPost`). Kieran's argument — TS doesn't narrow optional fields across a discriminant on a flat type — wins against blast-radius. Keep `PGAnnouncement` as a temporary alias during the codemod, then remove.
2. **R4 enforced at compile time.** Drop the runtime-throw allowlist. Use `satisfies PGApiCreateConsentFormPayload` on mapper returns — catches drift at build time, not at user click. Runtime throw remains as defense-in-depth only.
3. **Branded ID types + type guard.** `PostId = AnnouncementId | ConsentFormId` with template literals and `isConsentFormId`. Prevents `loadConsentFormDetail(announcementId)` at compile time.
4. **Phase-1 additions.** Move `PGApiConsentFormStatus = 'SCHEDULED'` into Phase 1 (not Phase 5) — Phase 6 needs it for the merged list before schedule UI lands. Also: type the `consentFormHistory[]` element explicitly (no bare `[]`), and encode reminder as a 3-branch nested union (`{type:'NONE'} | {type:'ONE_TIME';date} | {type:'DAILY';date}`).
5. **Flip Phase 2 ↔ Phase 3 sequencing.** Land Phase 3 first (UI collects fields into reducer, still hits `/announcements` via existing mapper). Then Phase 2 flips routing. No broken mid-state; the existing silent-drop bug just persists one more phase — which is live today anyway.
6. **URL carries `kind`.** `/posts/:id?kind=form` — link constructor on list rows knows the row's kind and writes it into the link. ID-prefix probing becomes a fallback for direct URL paste. Removes coupling to TW's `cf_*` fixture convention.
7. **Kill `ConfigContext`.** Use a module-scope cache in `web/api/client.ts` (`getConfigs()` memoised once). Ship follow-up: inline the config response into the HTML shell via the Go handler to eliminate the boot-time RTT.
8. **Row memoisation on the list.** Extract `<PostRow kind={...} />` and `React.memo` keyed on `(id, status, kind, readCount, yesCount)`. Today every search keystroke re-renders ~100 rows.
9. **Rename `AnnouncementCard` → `PostCard`** in Phase 7 and render event/venue/due-date inline for `kind === 'form'` — skip the speculative prop-widening.
10. **`{value, onChange}` is the dominant prop pattern.** New sections follow it. Reserve `dispatch` only for list-owning (`WebsiteLinksSection` with up to 3 rows probably justifies it; the others do not).

### New considerations discovered

- **`ConfigContext` without revalidation is a latent bug.** A 24-hour session through a flag flip renders a Schedule button PG now rejects. Module-scope cache with a `staleAfter` TTL (or refetch on route change) closes this.
- **`PGRecipient` cross-kind lies.** Today's plan puts `response: 'YES' | 'NO' | null` on a shared `PGRecipient`. On announcements the field is structurally `null` 100% of the time — a Stringly-typed landmine. Split `PGRecipient` by kind alongside the type-level fix in improvement #1.
- **Event + venue travel together.** Encode as `event?: { start: string; end: string; venue?: string }` on the form variant, not three sibling optionals. Three independent optionals = 8 nominal states; the valid subset is 2.
- **List-row hotspot with real numbers.** ~100 rows × 6 cells × dropdown subtree = search becomes laggy under current `useMemo`. Memoise the row, precompute `_dateTs` once in the loader mapper (not per filter).
- **Component-level UX patterns** (from best-practices research):
  - Event range: use `react-day-picker` `<Calendar mode="range">` with `disabled={{before: startDate}}` — invalid dates are unselectable, no submit-time toast.
  - Same-day time coupling: manually disable hours before start on the end-time picker.
  - Reminder radio reveal: use shadcn `Collapsible` (Radix) for the conditional picker — prevents layout shift and handles `aria-hidden` / `aria-describedby` correctly. Don't auto-focus the picker on reveal (NN 2025 guidance).
  - Persist the reminder date across radio toggles so a user switching None ↔ One-time ↔ Daily doesn't lose their picked date.
  - Label the Daily reminder picker as **"Starting"**, not "From" (matches Google Calendar / Outlook conventions parents recognise).
  - Stat cards at 768px: ship a `compact` prop on the existing `StatCard`, don't clone it. Four cards render as `grid-cols-4` compact on tablet, `grid-cols-2` on mobile. Use Radix `ToggleGroup` semantics (`data-[state=on]` ring) for the active filter. Pending uses `text-muted-foreground` + clock icon (not warning — that's for unread). Progress bar only on Total.

### Aggressive-simplicity alternatives (only if scope trimming becomes necessary)

User explicitly chose all of Phases 5, 8, 9 during brainstorm. The code-simplicity reviewer flagged three trims worth capturing here if a later sprint runs short:

- **Drop Phase 9 entirely.** Website-links + shortcuts + configs are the cleanest split — three UI builds + a new context + two PG flag contracts, all out at once. Success Criteria don't require any of them.
- **Drop Phase 5.** Schedule-send for consent forms isn't in the origin's Success Metrics. Origin mentioned schedule in scope, but the metric is "can author end-to-end".
- **Partial Phase 8.** Keep Level (already partially wired), defer CCA + Custom Group until a teacher reports the gap.

---

## Overview

Fuse PG's Announcements and Consent Forms modules behind TW's single "Posts" umbrella. The `PostTypePicker` already offers two tiles — **Posts** and **Posts with Responses** — but today the second tile collects consent-form fields and silently drops them, routing everything to `/announcements`. After this slice: **Posts with Responses always routes to `/consentForms`**, the authoring form carries every consent-form field PG accepts, the `/posts` list merges both kinds, and `/posts/:id` detail branches by kind with Yes / Pending / No stats for consent forms.

Scope is **create-flow + round-trip** (list + detail rendering). Post-publish editing (update due date, add staff, staff-on-behalf reply) and author-side polish (autosave, unload warning) are explicitly deferred. Attachments pipeline (former R6) is split off pending PG-team confirmation that `preUploadValidation` / `postUploadVerification` exist server-side.

## Problem Statement

Three concrete problems today (see origin: `docs/brainstorms/2026-04-20-posts-creation-consent-form-parity-requirements.md`):

1. **Silent data drop.** `buildPayload()` at `web/containers/CreatePostView.tsx:421-432` emits only announcement fields. `state.dueDate`, `state.questions`, `state.responseType` are collected through the UI and never reach PG. The "Posts with Responses" tile is a lie.
2. **Zero consent-form UI.** `createConsentForm`, `createConsentFormDraft`, `updateConsentFormDraft`, `fetchConsentFormDetail`, `loadConsentFormsList` exist in `web/api/client.ts:245-284` but no UI invokes them. The Consent Forms module is 100% backend-addressable, 0% frontend.
3. **Broken round-trip.** Posts list loader calls `loadPostsList()` (announcements only) at `web/containers/PostsView.tsx:45-47`. Posts detail calls `loadPostDetail(id)` and renders against `PGAnnouncement` at `web/containers/PostDetailView.tsx:16-20`. A successfully-posted consent form disappears from the list and any existing form ID 404s visually.

Research confirmed (`plans/PG-API-CONTRACT.md` §3 & §5) that PG's `/announcements` POST body does **not** accept `responseType`, `customQuestions`, or a due date. Any post collecting a structured parent response must be a Consent Form by PG's architecture. The Acknowledge-vs-Yes/No distinction is a consent-form sub-type (`ACKNOWLEDGEMENT` | `YES_NO`), never an announcement attribute (see origin: Key Decisions).

## Proposed Solution

Extend TW's post model to a discriminated union on `kind: 'announcement' | 'form'`. Route every mutation by kind at the `buildPayload` layer in `CreatePostView`. Add the missing Consent-Form-only form sections behind the existing "Posts with Responses" tile. Merge the list loader. Branch the detail view. Fill empty selector tabs with endpoints TW already proxies. Read `/api/configs` on boot and gate schedule/shortcuts by PG's flags.

The two-tile entry UX and current tab semantics are preserved. Teachers see the same screen with more depth, not a new module.

## Technical Approach

### Architecture

**Type model** (revised per deepening — see Enhancement Summary #1). A true discriminated union of two distinct interfaces sharing a literal `kind` tag. Optional fields on a merged type do not narrow across the discriminant on a flat shape, so every consumer would null-check fields that are structurally required on one branch and absent on the other.

```ts
interface PGPostBase {
  id: string;
  title: string;
  recipients: PGRecipient[];
  createdAt: string; /* … */
}

interface PGAnnouncementPost extends PGPostBase {
  kind: 'announcement';
  stats: AnnouncementStats; // readCount / totalCount
  recipients: PGAnnouncementRecipient[]; // no response field
}

interface PGConsentFormPost extends PGPostBase {
  kind: 'form';
  consentByDate: string; // required
  reminder: { type: 'NONE' } | { type: 'ONE_TIME'; date: string } | { type: 'DAILY'; date: string };
  event?: { start: string; end: string; venue?: string }; // travel together
  questions: PGCustomQuestion[];
  consentFormHistory: PGConsentFormHistoryEntry[]; // element-typed, no bare []
  stats: ConsentFormStats; // yesCount/noCount/pendingCount
  recipients: PGConsentFormRecipient[]; // includes response + respondedAt
}

type PGPost = PGAnnouncementPost | PGConsentFormPost;
```

Keep `PGAnnouncement = PGAnnouncementPost` as a temporary alias during the ~20-file codemod; drop the alias in a follow-up commit.

Prune the FE-only drift fields at the same time: `parentName`, `indexNo`, `parentRelationship`, `pgStatus`, and the `classId`/`classLabel` redundancy (both set to `className` at `mappers.ts:69,73` — keep `classLabel`). `indexNo` is wired into `RecipientReadTable.tsx:84` as an empty cell; remove the column and its `TableHead` in the same phase.

**Routing signal = kind, not field-presence** (see origin: Key Decisions). `buildPayload()` reads `kind` from the form state (set by picker on create, hydrated from loader on edit) and picks the endpoint. R4 enforcement shifts to **compile-time** via `satisfies PGApiCreateConsentFormPayload` on mapper returns — drift fails the build, not the user click. Runtime throw remains as defense-in-depth only.

**URL scheme** (revised per deepening — see Enhancement Summary #6). `/posts/:id?kind=form` — the list-row link constructor writes `kind` into the query param from the row's known kind, eliminating coupling to TW's `cf_*` fixture convention (which is ours, not PG's). ID-prefix probing stays as a **fallback** for direct URL paste (`parsePostId(raw: string): PostId | null` gates entry into the typed world). Loader uses `isConsentFormId` guard on branded `PostId = AnnouncementId | ConsentFormId` types — calling `loadConsentFormDetail(announcementId)` fails at compile time.

**Feature flags** (revised per deepening — see Enhancement Summary #7). `/api/configs` fetched once via a module-scope `getConfigs()` in `web/api/client.ts` (memoised; fallback on failure = all flags off). No React context, no provider. Follow-up optimisation: inline the config payload into the HTML shell via the Go handler to eliminate the boot-time RTT. Add a `staleAfter` TTL (or refetch on route change) so a 24-hour session survives a flag flip without rendering a Schedule button PG now rejects.

### Implementation Phases

#### Phase 1: Type + API layer foundation (no UI change yet)

- [ ] Introduce `PGPost = PGAnnouncementPost | PGConsentFormPost` in `web/data/mock-pg-announcements.ts` as distinct interfaces with a literal `kind` tag. Keep `PGAnnouncement = PGAnnouncementPost` as a temporary alias so the codemod can land incrementally.
- [ ] Split `PGRecipient` into `PGAnnouncementRecipient` and `PGConsentFormRecipient`. The consent-form variant carries `response: 'YES' | 'NO' | null` + `respondedAt: string | null`; the announcement variant does not.
- [ ] Encode reminder as a 3-branch nested discriminated union on the form variant (`{type:'NONE'} | {type:'ONE_TIME'; date: string} | {type:'DAILY'; date: string}`).
- [ ] Encode `event?: { start: string; end: string; venue?: string }` as a single optional object, not three sibling optionals.
- [ ] Type `consentFormHistory[]` element shape explicitly — define `PGConsentFormHistoryEntry` alongside it. No bare `[]`.
- [ ] Prune `parentName`, `indexNo`, `parentRelationship`, `pgStatus` from recipient types. Delete the `classId`/`classLabel` redundancy (both set to `className` at `mappers.ts:69,73`) — keep `classLabel`.
- [ ] Update `RecipientReadTable.tsx:84` to stop rendering the `indexNo` column (and its `TableHead`) in the same phase — landing separately leaves empty cells.
- [ ] **Add `SCHEDULED` to `PGApiConsentFormStatus`** in `web/api/types.ts:6` (pulled forward from Phase 5 per deepening — Phase 6 merges the list before Phase 5 lands the schedule UI, so the type must support `SCHEDULED` consent forms from day one).
- [ ] Add branded ID types: `AnnouncementId`, `ConsentFormId` (template literal `` `cf_${string}` ``), `PostId = AnnouncementId | ConsentFormId`. Add `parsePostId(raw: string): PostId | null` + `isConsentFormId(id: PostId): id is ConsentFormId` guard.
- [ ] Add payload types to `web/api/types.ts`: `PGApiCreateConsentFormPayload`, `PGApiCreateConsentFormDraftPayload`, `PGApiScheduleConsentFormDraftPayload`. Mirror the shapes in `PG-API-CONTRACT.md:483-500`.
- [ ] Retype the three currently-`unknown` client functions: `createConsentForm`, `createConsentFormDraft`, `updateConsentFormDraft` (`client.ts:251-261`). Parameter types take `AnnouncementId` / `ConsentFormId` where IDs are involved.
- [ ] Add `mapConsentFormSummary → PGConsentFormPost` (replacing the current ownership-only pass-through at `mappers.ts:134-139`).
- [ ] Add `mapConsentFormDetail → PGConsentFormPost` populating recipients with `response` + `respondedAt`, stats (including `pendingCount`), questions from `customQuestions`, event object, reminder union, `consentFormHistory`.
- [ ] Add `toPGConsentFormCreatePayload` + `toPGConsentFormDraftPayload` in `mappers.ts`. Use `satisfies PGApiCreateConsentFormPayload` on the returned object literal — compile-time enforcement of R4.
- [ ] Export `loadConsentFormDetail(formId: ConsentFormId): Promise<PGConsentFormPost>` in `client.ts` (parallel to `loadPostDetail` at `:220-223`).
- [ ] Update `loadConsentFormsList` to return `PGConsentFormPost[]` (not `PGAnnouncement[]`).
- [ ] Extract shared helpers in `client.ts`: `isConsentFormId` and `postKindFromId(id)` so kind-branching doesn't scatter across 4+ files.

**Success:** Type-check passes. No behavior change yet. Fixtures still load via unchanged mock routes. Every kind-branch site in Phases 2/6/7 can import from one helper.

**Sequencing note (revised per deepening — see Enhancement Summary #5):** Phase 3 lands **before** Phase 2. Rationale: Phase 3 adds UI that collects fields into the reducer but continues to route through the existing `/announcements` path (extending the live silent-drop for one more phase — no regression from `main`). Phase 2 then flips routing. This removes the "must ship 2+3 together" hard dependency.

#### Phase 3 (lands first): Consent-form authoring sections (R2, R3)

- [ ] Extend `PostFormAction` union with: `SET_REMINDER`, `SET_EVENT`, `SET_VENUE` (reminder and event travel as objects per Phase 1 typing). Extend reducer.
- [ ] Fork `ResponseTypeSelector.tsx` into a consent-form-only variant (or gate the `view-only` option by caller prop) — see origin R2: inside Posts-with-Responses only Acknowledge and Yes/No are valid.
- [ ] Build `EventScheduleSection.tsx` + `VenueSection.tsx` (split per deepening — `EventVenueSection` was asymmetrically named). Event schedule uses shadcn `<Calendar mode="range">` with `disabled={{ before: startDate }}` on the end picker so invalid ranges are unselectable. Same-day: disable end-time hours before start on the end-time picker manually. Auto-adjust end → `start + 1h` if user picks a start later than current end.
- [ ] Build `DueDateSection.tsx`: single date picker, required for `kind === 'form'`.
- [ ] Build `ReminderSection.tsx`: radio None / One-time / Daily. Use shadcn `Collapsible` for the conditional picker reveal — no layout shift, correct `aria-hidden` handling. **Do not** auto-focus the picker on reveal (NN 2025). **Persist** the picked date across radio toggles (don't reset on unmount). Label the Daily picker as **"Starting"**, not "From".
- [ ] All four sections follow the `{value, onChange}` prop pattern to match `ResponseTypeSelector` (dominant pattern per deepening — only `WebsiteLinksSection` in Phase 9 may justify `dispatch` given add/remove/reorder).
- [ ] Mount the four sections inside the existing Response card (`CreatePostView.tsx:659-691`) for `kind === 'form'`. Keep `QuestionBuilder` in place — already reusable.
- [ ] Tighten the form-validity gate at `:403-406` to require `dueDate` + `reminder.type` when `kind === 'form'`.

**Success:** The reducer collects every consent-form field. Submits still route through the announcement path (fields dropped, same as today). No regression from `main`.

#### Phase 2 (lands second): Creation-flow routing (R1, R4)

- [ ] Add `kind` to `PostFormState` at `web/containers/CreatePostView.tsx:79-92`, set from `selectedType` on create, set from loader detail on edit.
- [ ] Rewrite the loader at `:66-75` to read `kind` from the URL query param first (`?kind=form`), fall back to `parsePostId(params.id)` + `isConsentFormId` guard. `cf_*` → `loadConsentFormDetail`, else → `loadPostDetail`. Unknown ID → `Navigate to /posts`.
- [ ] Update list-row link constructors in `PostsView.tsx` to write `?kind=form` / `?kind=announcement` at link time.
- [ ] Branch `buildPayload()` at `:421-432` via a single `buildPostPayload(state)` dispatcher in `mappers.ts` (extracted helper per deepening — kind-branching shouldn't appear verbatim in 5 sites). The dispatcher calls `toPGCreatePayload` or `toPGConsentFormCreatePayload` and uses `satisfies` at both return sites.
- [ ] Branch `handleSendConfirm` at `:462-483` to `createAnnouncement` or `createConsentForm`.
- [ ] Branch `handleScheduleConfirm` at `:434-460` to `createDraft` / `updateDraft` (announcement) or `createConsentFormDraft` / `updateConsentFormDraft` (form).

**Success:** Every field collected in the reducer reaches PG on the correct endpoint; `satisfies` guarantees mapper output conforms to the wire contract at compile time. Silent-drop bug closed. Edit-mode of a consent-form draft lands on the form.

#### Phase 4: Preview reshape (R7)

- [ ] Extend `PostPreview.tsx:19` to accept `kind` (or read from `formState.kind`).
- [ ] For `kind === 'form'`: header shows event start / end and venue when set; body shows the response affordance (Acknowledge tick or Yes/No buttons — already rendered at `PostPreview.tsx:91-106`); due-date line renders when set; questions list renders under the description.
- [ ] No change for `kind === 'announcement'`.

**Success:** The preview panel for a consent form matches what Parents Gateway actually renders for that form's shape.

#### Phase 5: Schedule-send for consent forms (R5)

- [ ] Add `POST /consentForms/drafts/schedule` mock stub in `server/internal/pg/mock.go` mirroring the announcement stub at `:63`. Body shape parallels `PGApiScheduleDraftPayload`.
- [ ] Extend `SplitPostButton` caller in `CreatePostView.tsx` to branch on `kind` for the schedule path; reuse `SchedulePickerDialog` unchanged.
- [ ] Gate the Schedule button visibility on `configs.flags.schedule_announcement_form_post.enabled` (phase 9 adds the context).

**Success:** Teachers can schedule a consent form the same way they schedule an announcement. The flag gate hides the UI when PG reports the feature off.

#### Phase 6: List unification (R10)

- [ ] Rewrite `PostsView.loader` at `web/containers/PostsView.tsx:45-47` to `Promise.all([loadPostsList(), loadConsentFormsList()])` and concat. Type: `(PGAnnouncementPost | PGConsentFormPost)[]` = `PGPost[]`.
- [ ] **Precompute `_dateTs` in the loader mapper** (per deepening — not in the filter memo). Avoids `new Date().getTime()` per row per keystroke.
- [ ] Change tab filter at `:58-75` from `requiresResponse(responseType)` to `kind === 'form'`.
- [ ] Update sort: most recent first by relevant date — `postedDate` for posted/open/closed, `scheduledSendAt` for scheduled, `createdAt` for draft/posting.
- [ ] **Extract `<PostRow kind={...} />`** and wrap in `React.memo` keyed on `(id, status, kind, readCount, yesCount)` — per deepening, today every search keystroke re-renders all ~100 rows.
- [ ] Branch the Read/Response column at `:242-248` on `kind`: `ReadRate` for announcement, "X / Y responded" for form.
- [ ] Branch row actions at `:251-314`: duplicate is announcement-only for this slice (explicit scope call; consent-form duplicate is out of scope because PG has no dedicated endpoint and duplicating a consent form is a new product decision).

**Success:** Teachers see both kinds in one table, tabs partition correctly, and a just-posted consent form appears in the list without a hand refresh. Search/filter stays responsive at 100+ rows.

#### Phase 7: Detail branching (R11)

- [ ] Rewrite `PostDetailView.loader` at `web/containers/PostDetailView.tsx:16-20` to use the same `?kind=` query param + `parsePostId` fallback as Phase 2.
- [ ] Branch the render body on `kind` with an `assertNever` exhaustiveness check in the default case. Announcement path unchanged.
- [ ] For `kind === 'form'`: **render event / venue / due-date / reminder inline in the form branch of `PostDetailView`** (per deepening — do NOT widen `AnnouncementCard`; the speculative prop-widening is premature).
- [ ] **Rename `AnnouncementCard.tsx` → `PostCard.tsx`** when Phase 7 touches it (per deepening — the type-name/value-name mismatch is a maintenance tax and Phase 7 is already touching the file).
- [ ] Ship a `compact` variant on the existing `ReadTrackingCards.tsx` rather than cloning it (per deepening). Four cards (Total / Yes / Pending / No) render as `grid-cols-4` compact at 768px, `grid-cols-2` on mobile. Use Radix `ToggleGroup` (`role="radiogroup"`, `data-[state=on]` ring) for the active-filter state — same row behaves as a filter control for the table below. Pending uses `text-muted-foreground` + clock icon (not `text-warning-foreground` — that's for unread). Progress bar only on Total; Yes/No/Pending are counts, not rates.
- [ ] Build `ConsentFormHistoryList.tsx` to render `consentFormHistory[]` as a timestamped log (plain list; humanisation stays minimal per origin Deferred question).

**Success:** A clicked consent-form row shows Yes / Pending / No / Total stat cards, a per-student response table with `respondedAt`, a history panel, and inline event/venue/due-date metadata. No announcement detail regression.

#### Phase 8: Selector tab completeness (R8)

- [ ] In `web/components/comms/student-recipient-selector.tsx:61-67`, populate the Level scope from `/school/groups` (Level entries), CCA from `/groups/assigned` (`ccaGroups` field per `PGApiGroupsAssigned` at `types.ts:281-284`), and Custom Groups from `/groups/custom`. Extend the loader to fetch these.
- [ ] In `web/components/comms/staff-selector.tsx:25-29`, populate Level and School from the same sources.
- [ ] Add the corresponding groupType arms to `groupRecipients()` at `CreatePostView.tsx:216-247`.
- [ ] Custom Groups tab stays read-only in this slice (confirms origin Deferred question); no "Create custom group" entry point.

**Success:** No empty selector tabs anywhere. Teachers can target by Level, CCA, or Custom Group for either kind of post.

#### Phase 9: Website-links, shortcuts, `/api/configs` gating (R9)

- [ ] Add `getConfigs(): Promise<PGApiConfig>` to `web/api/client.ts` as a **module-scope memoised fetch** (revised per deepening — Enhancement Summary #7). No React context, no provider. First call fetches; subsequent calls return the cached promise. Add a `staleAfter` TTL (default ~15 min) that invalidates the cache so long sessions survive flag flips.
- [ ] Fallback on fetch failure: all flags treated as off. Silent — no banner.
- [ ] **Follow-up optimisation (defer to a later commit):** inline the config payload into the HTML shell via the Go handler so `getConfigs()` returns synchronously on first call — eliminates the boot-time RTT.
- [ ] Build `WebsiteLinksSection.tsx`: up to 3 rows of URL + description. This is the one form section that legitimately needs the reducer `dispatch` pattern (list with add/remove/reorder per the dominant-pattern deepening note). Mount in both kinds of Content card. Extend the allowlist mappers to forward to `webLinkList` (announcement) / `websiteLinks` (consent form — confirm field name in Phase 1 types).
- [ ] Build `ShortcutsSection.tsx`: checkboxes for `TRAVEL_DECLARATION` and `EDIT_CONTACT_DETAILS`. Gate per-shortcut on its own flag. Extend the allowlist mappers to forward to `shortcutLink`.

**Success:** Both tiles expose website-links and shortcuts UI; schedule and shortcuts UI hides when PG reports the flag off. No React tree coupling, no provider, no hook — a plain async function.

### Discarded from slice

- **`AttachmentSection.tsx`** ships today as a disabled "Add files" button at `:653` — a broken-looking stub. Remove from the Content card for this slice. When R6 resumes (attachments), the section comes back wired end-to-end. Leaving a disabled button is a user-hostile middle state.

## Alternative Approaches Considered

| Alternative                                                                                         | Why rejected                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Introduce a new `PGPost` discriminated union as a parallel type~~ — **accepted after deepening.** | Originally rejected for blast radius. Deepening review (kieran-typescript-reviewer) demonstrated that optional fields on a merged type force null-checks forever at every reader, while a discriminated union of distinct interfaces lets TS narrow across `kind`. One-time codemod cost beats a perpetual reader tax. Temporary `PGAnnouncement = PGAnnouncementPost` alias bridges the codemod window. |
| Route by field-presence (any consent-form field set → `/consentForms`)                              | Origin rejected this: "`kind` is simpler than presence-of-any-consent-form-field and survives the teacher clearing a field" (see origin: Key Decisions). Also ambiguous when a teacher in Posts-with-Responses leaves all optional forms-fields blank.                                                                                                                                                   |
| Distinct URL scheme per kind (`/posts/announcement/:id` + `/posts/form/:id`)                        | Origin picked unified `/posts/:id` to keep list → detail navigation uniform and avoid URL migration. ID-prefix probing is cheap.                                                                                                                                                                                                                                                                         |
| Stub file-attachments behind a feature flag to keep R6 in-slice                                     | Origin dependencies section explicitly rules out stubbing: R6 drops cleanly or blocks — no fake fallback.                                                                                                                                                                                                                                                                                                |
| Keep `AttachmentSection` visible but disabled until R6 resumes                                      | User-hostile. A disabled button next to functional buttons looks like a bug. Remove now, restore with R6.                                                                                                                                                                                                                                                                                                |

## System-Wide Impact

### Interaction Graph

`CreatePostView.handleSendConfirm` → `buildPayload()` → (branches on `kind`) → `toPGCreatePayload` OR `toPGConsentFormCreatePayload` → `createAnnouncement` OR `createConsentForm` in `client.ts` → `mutateApi` → fetch `/api/web/2/staff/{announcements|consentForms}` → `unwrapEnvelope` → success returns `{postId}` OR `{consentFormId}` → `notify.success` → `navigate('/posts')` → `PostsView.loader` re-runs `Promise.all([loadPostsList, loadConsentFormsList])` → merged list renders → tab filter branches on `kind`.

Error surface: `handleErrorResponse` at `client.ts:61-100` already routes `-401 / -4012 / -404 / -400 / -4001 / -4003 / -4004 / -429` to the typed error classes. Consent-form endpoints share that contract — no new error branches. `PGValidationError` is surfaced inline; everything else toasts.

### Error & Failure Propagation

- `PGValidationError` (e.g. form-level missing-field errors from PG) → `handleSendConfirm` catches at `:473-480` → `notify.error(err.message)`. No UI regression.
- `PGSessionExpiredError` → `window.location.href = '/session-expired'` at `:82-85`. Same behaviour on both endpoints.
- Mapper output mismatch with wire DTO → **compile-time error** via `satisfies` (revised per deepening). Runtime throw remains as defense-in-depth for cases where fixture-sourced data sneaks an unknown field in; caught at `handleSendConfirm` as plain `Error` and toasted verbatim (existing branch at `:474-478`).
- Config fetch failure on boot → all flags off, schedule + shortcuts hidden; no toast (silent fallback).

### State Lifecycle Risks

- ~~Phase 2 before Phase 3 risk~~ — resolved by flipping phase order (see Enhancement Summary #5). Phase 3 lands first with fields plumbed into the reducer but routing still via `/announcements`. Phase 2 then flips routing safely.
- Pruning `PGRecipient.indexNo` + updating `RecipientReadTable` must land together; otherwise the column renders empty strings.
- `ConfigContext` staleness (raised in deepening, mitigated by Phase 9 design): a 24-hour session surviving a flag flip could render UI PG rejects. Mitigated by `staleAfter` TTL on the module-scope cache.

### API Surface Parity

- ~~Add `SCHEDULED` in Phase 5~~ — **moved to Phase 1** per deepening. Phase 6 merges the list before Phase 5 lands; the type must support `SCHEDULED` consent forms from day one.

### Integration Test Scenarios

TW has no frontend tests yet (`CLAUDE.md` — "No frontend tests yet"). Until a test infra lands, the following scenarios need manual smoke verification on each phase:

1. Create view-only announcement → post → appears in Posts tab. No regression from `main`.
2. Create Yes/No consent form with event start/end + venue + due date + daily reminder + two questions → post → appears in Posts with Responses tab; detail renders Yes/Pending/No cards.
3. Create Acknowledge consent form with only due date + no reminder → post → detail renders an Acknowledge tick affordance, 0/N pending initially.
4. Save consent form as draft → close tab → reopen `/posts` → draft visible → open → form rehydrates all fields → publish.
5. Schedule consent form → close tab → draft visible with SCHEDULED status → scheduled time passes → (manual) status flips to OPEN.
6. Recipient selector: select CCA → select Custom Group → select Level → post reaches the correct `studentGroups` in the payload.
7. Toggle `schedule_announcement_form_post` off in `/api/configs` fixture → schedule button hides.
8. Session expiry during consent-form draft save → redirects to `/session-expired` cleanly (existing `handleErrorResponse` path).

## Acceptance Criteria

### Functional Requirements (maps 1:1 to origin R1–R11)

- [ ] **R1.** Posts tile routes to `/announcements`; Posts-with-Responses tile routes to `/consentForms`. Draft writes and edit writes route to the matching endpoint. Edit of an existing draft resolves kind from the URL `?kind=` query param (written at link-construction time from the list row), falling back to a branded-ID `parsePostId` guard for direct URL pastes.
- [ ] **R2.** Posts-with-Responses offers Acknowledge + Yes/No only. No announcement-with-acknowledge path remains.
- [ ] **R3.** The consent-form form exposes due-date (required), reminder schedule (None / One-time / Daily — One-time and Daily reveal a date picker; required), event start + end (optional), venue (optional, 120-char counter), and custom questions (free-text + MCQ via the existing `QuestionBuilder`).
- [ ] **R4.** No field the reducer collects is silently dropped. The mapper output is constrained to the wire DTO at **compile time** via `satisfies PGApiCreateConsentFormPayload` / `satisfies PGApiCreateAnnouncementPayload` — drift fails the build. Runtime throw remains as defense-in-depth for fixture-sourced data.
- [ ] **R5.** Consent forms support schedule-send via the same split-button. Gated by `schedule_announcement_form_post` read from `/api/configs` on boot.
- [ ] **R6.** _(Dropped from this slice; see origin Scope Boundaries.)_
- [ ] **R7.** Preview panel reshapes for consent forms: event/venue header, response affordance, due-date, questions.
- [ ] **R8.** Recipient selector populates Level, CCA, Custom Group tabs; Staff selector populates Level + School.
- [ ] **R9.** Website-links section (up to 3 URL + description rows) and shortcuts checkboxes (Declare travels, Edit contact) available in both tiles; gated by their respective PG flags.
- [ ] **R10.** Posts list loader merges both kinds. Tabs partition by kind. Sort: most recent first by relevant date per status.
- [ ] **R11.** Detail branches by kind. Consent-form detail shows Yes/Pending/No/Total + per-student response table + `consentFormHistory` audit log.

### Non-Functional Requirements

- [ ] Type-safe throughout: no `any`, no `unknown` on client function signatures.
- [ ] No regression to existing announcement flows (every scenario that works on `main` still works).
- [ ] No new runtime errors from null `consentFormHistory`, null `reminderDate`, null `eventStartDate`, or empty students lists (all PG-audit-flagged nullable fields).
- [ ] Prettier + ESLint clean; `pnpm lint` + `pnpm format` pass.
- [ ] `golangci-lint run` passes for the single added mock route.

### Quality Gates

- [ ] Manual smoke of all eight integration scenarios above.
- [ ] `docs/pg-audit-findings.md` updated to reflect which §2 mapper risks are now resolved (POSTING handling, responseType wiring, consentByDate on summaries).
- [ ] Code review approval with explicit cross-check against the origin requirements doc (§6 of the ce-plan skill).

## Success Metrics

- Teachers can author every consent-form field PG accepts, end-to-end, without leaving the form.
- Zero "Posts with Responses" submissions land on `/announcements` after this ships.
- Zero empty selector tabs in the production build.
- The audit-doc's Critical-severity items on the mapper + types (lines 12-14) all resolve.

## Dependencies & Prerequisites

- `/api/configs` response shape matches `plans/PG-specs.md §1.4`. If PG changes this, R5 and R9 need a parallel update (origin dependency).
- Current local CSRF stub remains valid through the testing window.
- No new npm dependencies expected for this slice. The date-time picker reuses `SchedulePickerDialog`'s existing widgets.

## Risk Analysis & Mitigation

| Risk                                                                                             | Likelihood | Impact | Mitigation                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 ships before Phase 3 → consent-form creates fail validation on PG                        | Med        | Med    | Land Phases 2+3 on one branch. Verify with the manual smoke before merge.                                                                                                     |
| PG doesn't support `POST /consentForms/drafts/schedule` (no evidence in `PG-API-CONTRACT.md` §5) | Med        | Med    | Phase 5 first tries `createConsentFormDraft` with `scheduledSendAt` in body (cron-picked). If PG rejects, fall back to confirming via PG team. Capture as Phase-5 smoke step. |
| ID-prefix probing silently mis-routes if PG changes ID format                                    | Low        | High   | Add an assert in the loader that rejects any ID not matching `^(cf_)?\d+$`. Route unknown to `Navigate to /posts`.                                                            |
| `ReadTrackingCards` extension for `pendingCount` breaks announcement layout                      | Low        | Low    | Derive `pendingCount` inside the consent-form branch only; announcement branch unchanged.                                                                                     |
| Consent-form list `SCHEDULED` status not in current `PGApiConsentFormStatus` union               | Low        | Low    | Add it in Phase 1 (per PG-API-CONTRACT.md:408). Renders the same SCHEDULED badge the announcement path uses.                                                                  |
| Hidden user flows touch `PGRecipient.indexNo` outside `RecipientReadTable`                       | Low        | Low    | Grep confirms only one read site. Prune + column removal land together.                                                                                                       |
| Phase 8's new selector scopes change payload shape → breaks announcement path                    | Med        | Med    | Add new arms to `groupRecipients` without removing existing ones. Manual smoke of an announcement POST with a CCA recipient after Phase 8.                                    |

## Future Considerations

- **R6 follow-up slice:** when PG confirms the attachment endpoints, restore `AttachmentSection`, wire the pre-upload → S3 → scan → token pipeline, and surface the draft 30-day expiry banner. Same component mounts in both kinds of Content card.
- **Post-publish editing:** update-due-date, add-staff-in-charge, edit-enquiry-email modals on the detail page are in the ideation doc's #2. Natural follow-up once the detail-branching in Phase 7 ships.
- **PG drift guardrail** (`docs/ideation/2026-04-20-posts-pg-parity-ideation.md` #3): the type-level drift around `PGApiConsentFormStatus = 'SCHEDULED'` discovered during this plan is exactly the class of bug the guardrail catches. Plan dependency.
- **Autosave + unload warning:** larger consent-form payloads make data-loss risk more visible; this slice intentionally defers it but raises the priority.
- **Responded-tracking toolbar** (search / class / columns / Excel): deferred. Natural follow-up once the response table in Phase 7 is in place.

## Documentation Plan

- Update `docs/pg-audit-findings.md`: resolve §1 items on `POSTING`, `responseType` nullability, `consentByDate`, `addReminderType`, `customQuestions` — cite the phase that closed each.
- Update `CLAUDE.md` to note that `PGAnnouncement` is a discriminated union over `kind`.
- No README change. No new ADR — the routing decision is captured in the origin brainstorm.

## Sources & References

### Origin

- **Origin document:** [`docs/brainstorms/2026-04-20-posts-creation-consent-form-parity-requirements.md`](../brainstorms/2026-04-20-posts-creation-consent-form-parity-requirements.md).
  Key decisions carried forward:
  - Posts-with-Responses = Consent Form, always (PG's `/announcements` POST does not accept `responseType`).
  - Routing signal = `kind`, not field-presence.
  - Unified `/posts/:id` URL; ID-prefix probing on the loader.
  - Attachments (R6) split off pending PG-team confirmation; no stub fallback.
  - `/api/configs` read once on boot; flag-off fallback is silent.

### Internal References

- `web/containers/CreatePostView.tsx:79-92, 421-432, 462-483` — reducer state, build-payload, submit branches.
- `web/containers/PostsView.tsx:45-47, 58-75, 242-314` — loader, filter, row rendering.
- `web/containers/PostDetailView.tsx:16-128` — loader + render.
- `web/api/client.ts:245-284` — consent-form client functions (typed + untyped).
- `web/api/mappers.ts:134-148, 216-234` — `mapConsentFormSummary`, `toPGCreatePayload`, `mergeAndDedup`.
- `web/api/types.ts:6, 179-226, 320-323` — consent-form shapes, `PGApiConfig`.
- `web/data/mock-pg-announcements.ts:41-55, 73-102` — `PGRecipient`, `PGAnnouncement` drift fields + core type.
- `web/components/comms/student-recipient-selector.tsx:61-67`, `web/components/comms/staff-selector.tsx:25-29` — empty selector scopes (R8).
- `web/components/posts/PostPreview.tsx:19, 91-106`, `ResponseTypeSelector.tsx`, `QuestionBuilder.tsx`, `SchedulePickerDialog.tsx`, `SplitPostButton.tsx`, `ReadTrackingCards.tsx:54-98`, `RecipientReadTable.tsx:84` — component reuse verdicts.
- `server/internal/pg/mock.go:14, 17-33, 44-52, 61-82` — route coverage.
- `server/internal/pg/proxy.go:12-33` — pass-through, kind-agnostic.
- `plans/PG-API-CONTRACT.md:279-295, 408, 483-500` — the endpoint contracts this plan routes against.
- `plans/PG-specs.md §1.4, §4.2, §5.2` — configs shape, Announcement vs Consent Form form sections.
- `docs/pg-audit-findings.md §1, §2` — the drift items this plan closes.

### Related Work

- `docs/ideation/2026-04-20-posts-pg-parity-ideation.md` — seven-survivor ideation that seeded this slice; #3 (drift guardrail) and #4 (autosave) are natural follow-ups.
- `plans/2026-04-16-pg-fe-gap-analysis-may-testing.md` — three-way gap doc that named the silent-drop bug and the "post-with-response payload drop" that this plan fixes as part of R4.
- `docs/plans/2026-04-08-001-feat-posts-end-to-end-frontend-plan.md` (completed) — introduced the `PostTypePicker`, reducer, key-remount pattern this plan extends.
- `docs/plans/2026-04-08-002-feat-wire-frontend-to-pg-proxy-api-plan.md` (completed) — introduced `PGAnnouncement`, mappers, envelope unwrap, PG loaders.
