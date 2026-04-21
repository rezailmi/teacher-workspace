---
status: pending
priority: p1
issue_id: 031
tags: [agent-browser-finding, architecture, api]
dependencies: []
---

# Edit on a posted post re-submits and creates a duplicate

## Problem Statement

`PostDetailView` renders an Edit button on every post regardless of status. Clicking it routes to `CreatePostView` in edit mode. If the user then hits **Post**, `handleSendConfirm` calls `createAnnouncement` / `createConsentForm` — both `POST` endpoints — producing a second post rather than updating the original. The edit surface suggests full mutability, but PG only supports post-publish edits on `enquiryEmailAddress` for announcements (and `updateDueDate` for consent forms). Every other field change is a new post in disguise.

## Findings

**Surfaced via agent-browser end-to-end tests (2026-04-20 session).**

- `handleSendConfirm` in `CreatePostView.tsx:659-684` dispatches on `state.kind` only — no `isEditing` check on the send path; the update endpoints are only wired into `handleScheduleConfirm` for drafts.
- `DetailHeader` in `PostDetailView.tsx:97-133` builds `editHref = postHref(post, { edit: true })` unconditionally — no guard on `post.status`.
- Supporting evidence: `docs/pg-audit-findings.md` "Post-publish edits" row — PG exposes only `/announcements/{id}/enquiryEmailAddress` (PUT) for sent announcements, and `/consentForms/{id}/updateDueDate` for sent forms.

**Locations:**

- `web/containers/PostDetailView.tsx:97-133` (Edit button rendered for every status)
- `web/containers/CreatePostView.tsx:659-684` (`handleSendConfirm` creates new on submit regardless of `isEditing`)

## Proposed Solutions

### Option A — Hide Edit on posted/open/closed; keep for draft/scheduled (recommended)

Narrow the Edit affordance to statuses where full edit is actually supported:

```tsx
const canEdit =
  post.kind === 'announcement'
    ? post.status === 'draft' || post.status === 'scheduled'
    : post.status === 'draft' || post.status === 'scheduled';
```

Render the Edit button behind `canEdit`. For posted announcements, expose a separate "Update enquiry email" affordance that hits the narrow PUT. For open consent forms, expose "Update due date" (already a PG endpoint).

**Pros:** impossible to accidentally duplicate; UI matches PG's actual write surface. **Cons:** teachers lose the perceived ability to "fix a typo" on a sent post — honest but worse-feeling UX. **Effort:** Small-Medium. **Risk:** Low.

### Option B — Keep Edit, but branch the submit path

In `handleSendConfirm`, when `isEditing && post.status === 'posted'`, refuse and surface a "Posted posts can't be edited" toast. When `isEditing && status === 'draft'`, call the draft update endpoints instead of the create endpoints.

**Pros:** teachers can view/browse the form; clearer feedback at point of action. **Cons:** the Edit button still lies about what edit means. **Effort:** Small. **Risk:** Low.

### Option C — Read-only view mode for posted

Render `CreatePostView` in a read-only variant (disabled inputs, no Post button) when the target is posted. Let narrow edits (enquiry email, due date) surface as inline inputs within the detail view rather than inside the big edit form.

**Pros:** cleanest separation; matches PG's actual capability. **Cons:** largest code churn. **Effort:** Medium. **Risk:** Low.

## Recommended Action

<!-- Filled during triage — likely Option A with follow-up tickets for the narrow PUTs -->

## Technical Details

**Affected files:**

- `web/containers/PostDetailView.tsx:97-133` (Edit button visibility)
- `web/containers/CreatePostView.tsx:659-684` (send-path guard or branch)

## Acceptance Criteria

- [ ] Editing a posted announcement cannot produce a new `POST /announcements` request
- [ ] Editing a posted consent form cannot produce a new `POST /consentForms` request
- [ ] Draft edit flow still round-trips via the existing draft update endpoints
- [ ] Manual smoke: open a posted announcement, attempt to click Edit → verify affordance behaves per chosen option
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Surfaced: 2026-04-20 agent-browser testing pass
- Related: `docs/pg-audit-findings.md` "Post-publish edits" row
