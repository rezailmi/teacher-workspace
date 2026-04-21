---
status: complete
priority: p2
issue_id: 018
tags: [code-review, routing, ux]
dependencies: []
---

# Asymmetric URL `?kind=` vs ID-prefix validation leaks to server 404

## Problem Statement

`PostDetailView.loader` validates `?kind=form` against a bare-numeric ID (returns 404 locally) but doesn't mirror the reverse: `?kind=announcement` with a `cf_` prefix falls through to `loadPostDetail('cf_123')` → server returns 404 → user sees a generic error instead of the "Post not found" route. `loadPostByKind` in `CreatePostView.tsx` has the same asymmetry. One leg of the guard is a fast fail; the other is a slow fail.

## Findings

**architecture-strategist:**

> `PostDetailView.loader` validates `?kind=form` against a bare-numeric ID (404s at `PostDetailView.tsx:46-48`), but `?kind=announcement` with a `cf_` ID falls through to `loadPostDetail('cf_123')` at `:52`, which round-trips to the server as a 404. Same asymmetry in `loadPostByKind` at `CreatePostView.tsx:116-117`. Add the mirror guard.

**Locations:**

- `web/containers/PostDetailView.tsx:46-52`
- `web/containers/CreatePostView.tsx:113-117`

## Proposed Solutions

### Option A — Mirror guard at each call site (recommended)

```ts
if (kindParam === 'announcement' && rawId.startsWith('cf_')) {
  throw new Response('Not Found', { status: 404 });
}
if (kindParam === 'form' && !rawId.startsWith('cf_')) {
  throw new Response('Not Found', { status: 404 });
}
```

**Pros:** symmetric, minimal diff. **Cons:** duplicated logic across two loaders. **Effort:** Small. **Risk:** Low.

### Option B — Extract a `validatePostRoute(rawId, kindParam): PostId | null` helper

Co-locate with `parsePostId` in `mock-pg-announcements.ts`. Single source of truth for "the URL agrees with itself".

**Pros:** DRY; future loaders get it free. **Cons:** one more export. **Effort:** Small. **Risk:** Low.

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**

- `web/containers/PostDetailView.tsx:46-52`
- `web/containers/CreatePostView.tsx:113-117`
- `web/data/mock-pg-announcements.ts` (for shared validator if Option B)

## Acceptance Criteria

- [ ] `/posts/cf_123?kind=announcement` returns 404 without network call
- [ ] `/posts/123?kind=form` already returns 404 — still works
- [ ] Both detail and edit routes apply the guard

## Work Log

_(add entries as work progresses)_

## Resources

- Review: architecture-strategist
