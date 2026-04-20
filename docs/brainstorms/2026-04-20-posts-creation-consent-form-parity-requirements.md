---
date: 2026-04-20
topic: posts-creation-consent-form-parity
---

# Posts Creation — Consent Form Parity

## Problem Frame

Posts is the TW umbrella for PG's Announcements and Consent Forms modules. The `PostTypePicker` already offers two choices — **Posts** and **Posts with Responses** — and the `/posts` list page exposes matching tabs. Today the "Posts with Responses" tile collects consent-form fields (response type, due date, questions) but routes to `/announcements` and silently drops everything consent-form-specific on submit. Consent-form authoring is effectively zero-feature: the API client surface exists (`createConsentForm`, `createConsentFormDraft`, `updateConsentFormDraft`, `fetchConsentFormDetail`, `loadConsentFormsList`) but nothing in the UI calls it. After a teacher posts a consent form, the list loader only queries announcements — so the form they just created won't appear, and any existing form ID clicked from anywhere hits a detail view that assumes announcement shape.

This slice closes the end-to-end round-trip for consent forms while keeping the decided scope on the author side rather than sprawling into post-publish editing, autosave, or admin chrome.

## Requirements

### Entry + routing

- **R1.** The `PostTypePicker` continues to offer two tiles: **Posts** and **Posts with Responses**. Posts routes to `/announcements`; Posts with Responses routes to `/consentForms`. Draft writes route the same way (`/announcements/drafts` vs `/consentForms/drafts`), and edits to an existing draft use the endpoint that matches the draft's origin kind.
- **R2.** Inside Posts with Responses, the teacher picks the consent-form response type: **Acknowledge** or **Yes / No**. Both sub-types require the consent-form fields below. Acknowledge in TW always means an `ACKNOWLEDGEMENT` consent form — there is no announcement-with-acknowledge path, since PG's `/announcements` write does not accept a response type.

### Consent-form authoring fields

- **R3.** The Posts with Responses form exposes, in addition to the shared recipient / content sections: due-date-to-respond-by (required), reminder schedule (None / One-time / Daily, required; One-time and Daily reveal a date picker), event start + event end date/time (optional), venue (optional, 120-char counter), and custom questions (optional, via the existing `QuestionBuilder` — free-text or MCQ).
- **R4.** On publish and on save-as-draft, every field the form collects reaches the payload. No field is silently dropped; any field the endpoint does not accept is removed at the mapper layer with an explicit allowlist, not by omission.

### Schedule, preview

- **R5.** Consent forms support schedule-send via the same split-button UI already working for announcements. Schedule is gated by PG flag `schedule_announcement_form_post` once the app reads `/api/configs` on boot.
- **R6.** _(Dropped from this slice — attachments + photo gallery. See Scope Boundaries.)_
- **R7.** The preview panel reshapes when the teacher is in Posts with Responses: header includes event date/time and venue when set; body shows the response affordance (Acknowledge tick or Yes / No buttons); due-date and questions render as they will on Parents Gateway.

### Shared selector + content polish

- **R8.** Recipient selector populates its Level, CCA, and Custom Group tabs using endpoints already proxied (`/school/groups`, `/groups/assigned`, `/groups/custom`). Staff selector populates its Level and School tabs using the same sources.
- **R9.** Website links section (up to 3 URL + link-description rows) is available in both tiles. Shortcuts checkboxes (Declare travels, Edit contact details) are available in both tiles and gated by their respective PG flags read from `/api/configs`.

### Round-trip — list and detail

- **R10.** The `/posts` list loader merges consent forms with announcements into a single table. Rows carry their kind (announcement / consent form); rendering (status badge, date column, read-or-responded column) branches on kind. "Posts" tab shows announcements; "Posts with Responses" tab shows consent forms. Sort: most recent first by the row's relevant date — `postedDate` for posted/open/closed, `scheduledSendAt` for scheduled, `createdAt` for draft/posting.
- **R11.** The `/posts/:id` detail view branches on kind. Announcement detail is unchanged. Consent-form detail shows Yes / Pending / No / Total stat cards; the recipient table shows each student's response (YES / NO / null) and `respondedAt`; `consentFormHistory` renders as an audit log under the details tab.

## Success Criteria

- A teacher can author, preview, save-as-draft, reopen the draft, and publish a consent form for an upcoming event with recipients, description, event start/end, venue, due date, reminder schedule, and two custom questions. The resulting post appears in the `/posts` list under the Posts with Responses tab and its detail page renders Yes / Pending / No stats as responses arrive.
- The same teacher can still author, save, and publish a view-only announcement through the unchanged "Posts" path.
- Every author-facing surface is either filled by real data or removed — no empty selector tabs, no orphaned website-links UI, no fields that are collected and then dropped on submit.

## Scope Boundaries

Explicitly deferred to follow-up slices:

- **File attachments + photo gallery (former R6).** Dropped pending PG-team confirmation that `preUploadValidation` / `postUploadVerification` exist. When confirmed, resume `/ce:brainstorm` to add this as its own slice — not re-merged into this one.
- Autosave every ~30s and unsaved-changes unload warning.
- Post-publish editing on consent forms: update due date mid-cycle, add-staff-in-charge modal, edit-enquiry-email modal, staff-edited reply on behalf of a parent.
- Read-tracking / responded-tracking toolbar: per-student search, class filter, column picker, Excel export.
- Reschedule and cancel-schedule of existing scheduled drafts.
- PG drift guardrail (FE schema validation + fixture-refresh script + proxy drift log) — tracked separately in `docs/ideation/2026-04-20-posts-pg-parity-ideation.md` #3.
- Delete-confirm modal upgrade (native `confirm()` stays for now).
- Admin oversight views.
- The "Other (please specify)" enquiry-email free-text option (PG parity item, not blocking).

## Key Decisions

- **Posts with Responses = Consent Form, always.** Every post authored through the second tile is a consent form regardless of whether the teacher picks Acknowledge or Yes / No. Confirmed against `plans/PG-API-CONTRACT.md` §3 and §5: PG's `/announcements` POST body does not accept `responseType`, custom questions, or a due date — the Announcement write endpoint is strictly view-only. The `responseType` visible on Announcement read responses is a list-unification denormalization, not a create-time field. Any post that collects a structured parent response is, by PG's architecture, a Consent Form. The Acknowledge-vs-Yes/No distinction is a sub-type of consent form (`ACKNOWLEDGEMENT` | `YES_NO`), not an announcement attribute.
- **Routing signal = kind, not field-presence.** `buildPayload` decides the endpoint from the post's kind (which is the picker choice on create, and a stored attribute on edit). This is simpler than "presence of any consent-form-only field" and survives the teacher clearing a field.
- **Unified `/posts/:id` URL.** One URL scheme covers both kinds. The loader fetches the record first, then decides which detail shape to render. This preserves existing routes and keeps list → detail navigation uniform.
- **Attachments pipeline is shared, not forked.** One implementation for both tiles so future attachment work (virus-scan handling, token refresh, size limits) updates once.
- **`/api/configs` is read once on app boot.** Flag values hydrate a typed config context that gates schedule-send and shortcuts. Fallback when the endpoint is unreachable: treat flags as off, surface a subtle banner.

## Dependencies / Assumptions

- `/api/configs` response shape matches what `plans/PG-specs.md §1.4` documents (`flags: Record<string, { enabled: boolean }>`). If PG changes this, R5 and R9 need a parallel update.
- Current CSRF bypass (Docker `sed` stub locally) remains valid through the testing window; the PG-side IP allowlist is not a prerequisite for this slice.

## Outstanding Questions

### Resolve Before Planning

_None remaining._ R6 (attachments) has been split off this slice pending PG-team confirmation.

### Deferred to Planning

- [Affects R1, R4][Technical] How to detect an existing draft's kind when the edit route loads it — prefix in the ID, a discriminator field, or probe both endpoints? Planning picks whichever survives an edit-mode reload best.
- [Affects R10][Technical] Exact sort key when merged rows share the same `date` value — stable tie-break by kind or by insertion order. Visible edge case, small code.
- [Affects R10][Technical] Pagination behaviour for the merged list — consent forms return paginated (`{posts, total, page, pageSize}`), announcements return a flat array. Planning picks a unified pager.
- [Affects R8][Needs research] Whether the Custom Groups tab should surface the PG `Create custom group` entry point or stay read-only in this slice. Likely read-only; confirm during planning.
- [Affects R11][Needs research] Whether `consentFormHistory` needs humanisation (timestamp formatting, action label mapping) beyond what the fixture implies, or renders fine as-is.

## Next Steps

→ `/ce:plan` the 10 requirements in this slice (R1–R5, R7–R11). R6 is deferred to its own follow-up slice and will resume `/ce:brainstorm` once the PG team confirms the file-upload contract.
