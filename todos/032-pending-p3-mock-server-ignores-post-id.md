---
status: pending
priority: p3
issue_id: 032
tags: [agent-browser-finding, server, fixtures, dx]
dependencies: []
---

# Mock server returns the same detail fixture for every post ID

## Problem Statement

`GET /api/web/2/staff/announcements/{postId}` and `GET /api/web/2/staff/consentForms/{consentFormId}` both serve a single embedded fixture regardless of the path value. Navigating to `/posts/1039` (the DRAFT in `announcements.json`) shows the POSTED "Term 4 Letter to Parents" payload. The list view's status badges come from the list fixture (which does differ per ID), but clicking any row lands on the same detail page, which masks the status-aware behaviours we actually want to dogfood: scheduled detail vs. posted detail, draft hydration shape, edit-flow gating per status.

## Findings

**Surfaced via agent-browser end-to-end tests (2026-04-20 session).** Clicked "End of Year Prize-Giving Ceremony" (status=DRAFT) and "Science Centre Learning Journey" (status=SCHEDULED); both rendered the POSTED fixture.

**Locations:**

- `server/internal/pg/mock.go:19` (`GET /announcements/{postId}` → single fixture)
- `server/internal/pg/mock.go:33` (`GET /consentForms/{consentFormId}` → single fixture)

## Proposed Solutions

### Option A — Map fixtures by ID suffix (recommended)

Introduce a small in-memory map and a dispatcher:

```go
var announcementDetailFixtures = map[string]string{
    "1036": "fixtures/announcement_detail.json",             // POSTED
    "1037": "fixtures/announcement_detail_yes_no.json",      // POSTED YES_NO
    "1038": "fixtures/announcement_detail_scheduled.json",   // SCHEDULED
    "1039": "fixtures/announcement_detail_draft.json",       // DRAFT
}

mux.HandleFunc("GET /api/web/2/staff/announcements/{postId}", func(w http.ResponseWriter, r *http.Request) {
    path, ok := announcementDetailFixtures[r.PathValue("postId")]
    if !ok {
        http.NotFound(w, r)
        return
    }
    serveFixture(path)(w, r)
})
```

Same pattern for consent forms (with `cf_<id>` entries and an entry for the DRAFT / SCHEDULED statuses we're missing — see todo 033).

**Pros:** realistic dogfooding; FE can finally exercise status-branching loaders. **Cons:** adds N fixture files per kind. **Effort:** Medium. **Risk:** None (dev-only).

### Option B — Dynamic fixture assembly

Build the detail response at request time from the list fixture (which already carries status per ID) + a template body. More compact, but drifts from PG's real wire shape as soon as we need non-trivial differences.

**Pros:** fewer files. **Cons:** diverges from real PG responses as fields grow. **Effort:** Medium. **Risk:** Low.

### Option C — Accept the limitation; document

Keep the single-fixture pattern, add a comment in `mock.go` explaining that draft/scheduled/posted branch on the list fixture and not the detail. Test those branches via unit tests on the mappers with hand-rolled inputs instead.

**Pros:** zero diff. **Cons:** perpetuates the dogfooding gap. **Effort:** None. **Risk:** None.

## Recommended Action

<!-- Filled during triage — likely Option A given we have four announcement statuses and five consent-form statuses to represent -->

## Technical Details

**Affected files:**

- `server/internal/pg/mock.go:17-34`
- `server/internal/pg/fixtures/` (new per-status JSONs)

## Acceptance Criteria

- [ ] `GET /announcements/1036` returns POSTED fixture; `GET /announcements/1039` returns DRAFT fixture
- [ ] `GET /consentForms/cf_1038` returns OPEN fixture; `GET /consentForms/cf_<draft-id>` returns DRAFT fixture
- [ ] Unknown IDs return 404 rather than a stale fixture
- [ ] `go build ./...` clean
- [ ] Manual smoke: navigate to each status in the list → detail view renders the matching status

## Work Log

_(add entries as work progresses)_

## Resources

- Surfaced: 2026-04-20 agent-browser testing pass
- Related: todo 033 (add DRAFT / SCHEDULED entries to `consent_forms.json`)
