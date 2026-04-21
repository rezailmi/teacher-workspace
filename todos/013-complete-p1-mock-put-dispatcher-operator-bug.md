---
status: complete
priority: p1
issue_id: 013
tags: [code-review, quality, go, backend]
dependencies: []
---

# Mock server PUT dispatcher uses `&&` where it needs `||`

## Problem Statement

The dispatched PUT handler for `/consentForms/{first}/{second}` uses a boolean operator that only rejects requests where **both** path segments are wrong. Any URL like `PUT /consentForms/foo/bar` falls through to the catch-all `jsonStub` and returns `200 {}` instead of `404`. This masks wiring bugs during development — a typo in the FE's mutation path returns success, so tests / manual smoke can silently pass while the real server would reject.

## Findings

**architecture-strategist (feat/posts-consent-form-parity review):**

> The dispatched PUT handler has `if first != "drafts" && second != "updateDueDate"` — boolean operator is wrong. With `&&`, the guard only rejects requests where _both_ conditions fail; a URL like `PUT /consentForms/foo/bar` (neither `drafts` nor `updateDueDate`) still falls through to the `jsonStub` and returns 200 instead of 404.

**Location:** `server/internal/pg/mock.go:73-80`

## Proposed Solutions

### Option A — Two positive matches (recommended)

Replace the dispatched handler with two explicit `mux.HandleFunc` registrations:

```go
mux.HandleFunc("PUT /api/web/2/staff/consentForms/drafts/{consentFormDraftId}", jsonStub(http.StatusOK, `{}`))
mux.HandleFunc("PUT /api/web/2/staff/consentForms/{consentFormId}/updateDueDate", jsonStub(http.StatusOK, `{}`))
```

The code comment above the original (`// Dispatched: Go ServeMux panics on drafts/{id} vs {id}/updateDueDate.`) is out of date — Go 1.22+'s ServeMux handles overlapping routes with wildcards correctly as long as they're structurally distinct, which these two are.

**Pros:** standard ServeMux pattern; each route independently maintainable. **Cons:** verify no actual ServeMux panic on the current Go version. **Effort:** Small. **Risk:** Low.

### Option B — Flip the operator

Change `&&` to `||` and accept the dispatch pattern:

```go
if first != "drafts" || second != "updateDueDate" {
    // Still wrong — this now rejects `drafts/123` because second != "updateDueDate"
}
```

This doesn't actually fix the bug — the guard needs `(first != "drafts") && (second != "updateDueDate")` OR matching logic. **Reject.**

### Option C — Positive match in dispatcher

Keep the dispatcher pattern, invert to positive logic:

```go
isDraftUpdate := first == "drafts"
isDueDateUpdate := second == "updateDueDate"
if !isDraftUpdate && !isDueDateUpdate {
    http.NotFound(w, r)
    return
}
jsonStub(http.StatusOK, `{}`)(w, r)
```

**Pros:** minimal diff. **Cons:** preserves the convoluted pattern. **Effort:** Small. **Risk:** Low.

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:** `server/internal/pg/mock.go:73-80`

## Acceptance Criteria

- [ ] `PUT /api/web/2/staff/consentForms/drafts/123` returns 200
- [ ] `PUT /api/web/2/staff/consentForms/123/updateDueDate` returns 200
- [ ] `PUT /api/web/2/staff/consentForms/foo/bar` returns 404
- [ ] `go test ./server/internal/pg` passes
- [ ] Go server builds cleanly (`go build ./...`)

## Work Log

_(add entries as work progresses)_

## Resources

- Review: architecture-strategist on `feat/posts-consent-form-parity`
- Go ServeMux routing docs: https://pkg.go.dev/net/http#ServeMux
