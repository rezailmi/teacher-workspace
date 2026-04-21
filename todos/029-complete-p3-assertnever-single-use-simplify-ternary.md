---
status: complete
priority: p3
issue_id: 029
tags: [code-review, simplicity, typescript]
dependencies: []
---

# `assertNever` single-use inside a verbose ternary

## Problem Statement

`assertNever` was added in Phase 7 for exhaustiveness on the `PostDetailView` render branch. It's called at exactly one site (the detail view's `post.kind === 'announcement' ? ... : post.kind === 'form' ? ... : assertNever(post)` ternary). For a two-variant union, TS narrows the discriminant on the first comparison; the second comparison narrows to the form branch; there's nothing left for `assertNever` to catch. When a third kind appears (meetings), we'll want exhaustiveness — but we'll also want a `switch` that TS can verify exhaustively. The current shape is neither; it's a verbose ternary with a dead default.

## Findings

**code-simplicity-reviewer:**

> `assertNever` used at exactly one site. `PostDetailView.tsx:25-27`, called only at line 199 inside a ternary that already narrows both known variants. The surrounding `post.kind === 'announcement' ? ... : post.kind === 'form' ? ... : assertNever(post)` is verbose for a two-variant union. Simpler: `post.kind === 'form' ? <ConsentFormDetail/> : <AnnouncementDetail/>`. When a third kind appears, TS will surface it at the discriminant itself. Delete the helper.

**Note:** this conflicts with todo 019's recommendation to use `switch (post.kind)` + `assertNever` for future-proofing. If 019 lands first, `assertNever` stays with actual multi-site coverage.

**Locations:** `web/containers/PostDetailView.tsx:25-27, :~199`

## Proposed Solutions

### Option A — Defer; let todo 019 (registry/switch) own this

If we're extracting `switch (post.kind)` + `assertNever` across all branch sites per 019, `assertNever` earns its keep. This todo becomes obsolete.

**Pros:** coherent with 019. **Cons:** none. **Effort:** N/A. **Risk:** None.

### Option B — Simplify now, revisit when third kind lands

Replace the ternary with a binary: `post.kind === 'form' ? <ConsentFormDetail /> : <AnnouncementDetail />`. Delete `assertNever`.

**Pros:** less code today. **Cons:** regresses exhaustiveness safety; a third kind won't fail compilation here until the registry pattern catches it. **Effort:** Small. **Risk:** Low.

## Recommended Action

<!-- Filled during triage — likely Option A; close this as duplicate of 019 -->

## Technical Details

**Affected files:** `web/containers/PostDetailView.tsx:25-27, :~199`

## Acceptance Criteria

- [ ] Decision made: either defer to 019 or simplify now
- [ ] If simplified: `assertNever` deleted; binary ternary in place

## Work Log

_(add entries as work progresses)_

## Resources

- Review: code-simplicity-reviewer
- Related: `019-pending-p2-kind-branch-sprawl-registry.md`
