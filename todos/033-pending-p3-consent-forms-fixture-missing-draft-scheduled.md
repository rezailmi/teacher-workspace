---
status: pending
priority: p3
issue_id: 033
tags: [agent-browser-finding, fixtures, dx]
dependencies: [032]
---

# `consent_forms.json` only has OPEN + CLOSED — no DRAFT or SCHEDULED entries

## Problem Statement

The consent-form list fixture (`server/internal/pg/fixtures/consent_forms.json`) carries two rows: `cf_1038` (OPEN) and `cf_1039` (CLOSED). The announcement list covers POSTED, SCHEDULED, and DRAFT. That asymmetry means the "Posts with responses" tab can't exercise the scheduled / draft row rendering paths (date column colour, empty response cell, dropdown affordances) that `PostsView` supports. It also means there's no way to dogfood the consent-form draft edit flow end-to-end without hand-crafting a request.

## Findings

**Surfaced via agent-browser end-to-end tests (2026-04-20 session).** Compared row rendering between the Posts tab (4 statuses visible) and Posts with responses tab (only OPEN + CLOSED).

**Locations:**

- `server/internal/pg/fixtures/consent_forms.json` (list fixture — 2 entries)
- `server/internal/pg/fixtures/consent_form_detail.json` (detail fixture — OPEN only)
- `web/containers/PostsView.tsx:436-441` (`PostRowResponseCell` branches on `status` — untested for scheduled/draft in forms)

## Proposed Solutions

### Option A — Add DRAFT + SCHEDULED rows to the list fixture (recommended)

Append two entries to `consent_forms.json`:

```jsonc
{
  "id": "cf_1040",
  "postId": 1040,
  "title": "Year 4 Camp Consent (Draft)",
  "date": "2026-04-10T03:00:00.000Z",
  "status": "DRAFT",
  "toParentsOf": [],
  "respondedMetrics": { "respondedPerStudent": 0, "totalStudents": 0 },
  "scheduledSendFailureCode": null,
  "createdByName": "TAN GUANG SHIN",
  "consentByDate": null
},
{
  "id": "cf_1041",
  "postId": 1041,
  "title": "Swim Gala Consent",
  "date": "2026-04-25T01:00:00.000Z",
  "status": "SCHEDULED",
  "toParentsOf": ["4B"],
  "respondedMetrics": { "respondedPerStudent": 0, "totalStudents": 28 },
  "scheduledSendFailureCode": null,
  "createdByName": "TAN GUANG SHIN",
  "consentByDate": "2026-04-30T15:59:59.000Z"
}
```

Bump `total` to 4.

When todo 032 (ID-aware detail dispatch) lands, also add `consent_form_detail_draft.json` and `consent_form_detail_scheduled.json` so clicking each row resolves cleanly.

**Pros:** symmetric with announcements; the tab exercises every row state. **Cons:** none. **Effort:** Small. **Risk:** None.

### Option B — Defer until todo 032 lands

Without 032, adding DRAFT / SCHEDULED rows still lets the list render them, but clicking through lands on the stale OPEN detail. Some value, but partial.

**Pros:** no churn. **Cons:** row visible but click-through broken. **Effort:** None. **Risk:** None.

## Recommended Action

<!-- Filled during triage — Option A, paired with 032 -->

## Technical Details

**Affected files:**

- `server/internal/pg/fixtures/consent_forms.json`
- (when 032 lands) `server/internal/pg/fixtures/consent_form_detail_{draft,scheduled}.json`

## Acceptance Criteria

- [ ] Posts with responses tab renders at least four rows covering DRAFT / SCHEDULED / OPEN / CLOSED
- [ ] Draft row hides response progress cell (falls back to em-dash)
- [ ] Scheduled row shows warning-coloured date
- [ ] `go build ./...` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Surfaced: 2026-04-20 agent-browser testing pass
- Blocked on: todo 032 for full click-through coverage
