---
status: complete
priority: p2
issue_id: 019
tags: [code-review, architecture, maintainability]
dependencies: []
---

# Kind-branching scattered across 12+ sites in 8 files — extract registry

## Problem Statement

The slice's read-side kind-branching (`post.kind === 'form'`) lives in at least 12 call sites across 8 files: list href construction, sort, tab filter, row render, delete action, stats memo (`PostsView`), `postToFormState`, type-picker seed, send/schedule dispatch (`CreatePostView`), detail loader + render branch (`PostDetailView`), plus four components (`PostCard`, `PostPreview`, `ReadTrackingCards`, `RecipientReadTable`). The write side funnels through `buildPostPayload`. The read side has no equivalent dispatcher. Adding a third kind (meetings / PTM, next on the roadmap) means patching every one of these 8 files. Today's binary ternaries (`kind === 'form' ? ... : ...`) will silently route a future `'meeting'` into the announcement branch without a compile error.

## Findings

**architecture-strategist:**

> Read-side branching is scattered across `PostsView.tsx` (6 sites), `CreatePostView.tsx` (4), `PostDetailView.tsx` (2), and four components. The write side correctly funnels through one dispatcher (`buildPostPayload`); the read side has no equivalent. **The single biggest extensibility win**: extract `postHref`, `postDetailLoader`, `postListLoader`, `postMemoKeys`, `postDateField` into a kind-keyed registry in `web/data/posts-registry.ts` so adding meetings means adding one row instead of patching 8 files.

**kieran-typescript-reviewer (related, landmines):**

> `DetailHeader` at `PostDetailView.tsx:89` is a binary `isForm ? ... : ...` — when kind #3 arrives, this quietly buckets it into the announcement branch. Convert to `switch (post.kind)` with `assertNever`. Same pattern at `PostsView.comparePosts` tie-break, `CreatePostView.tsx:699-703` ternary.

## Proposed Solutions

### Option A — Incremental narrowing with `assertNever` (minimal)

Replace every `kind === 'form' ? X : Y` ternary with `switch (post.kind)` + `assertNever(post)` default case. When a third kind lands, TS refuses to compile until every switch is extended.

**Pros:** small diff; immediate safety net. **Cons:** doesn't reduce sprawl, just traps it. **Effort:** Small. **Risk:** Low.

### Option B — Extract `posts-registry.ts` (architect's recommendation)

```ts
// web/data/posts-registry.ts
export const POST_REGISTRY = {
  announcement: {
    href: (id: AnnouncementId) => `/posts/${id}?kind=announcement`,
    loadDetail: (id: AnnouncementId) => loadPostDetail(id),
    memoKeys: (p: PGAnnouncementPost) => [p.id, p.status, p.stats.totalCount, p.stats.readCount],
    relevantDate: (p: PGAnnouncementPost) => p.postedAt ?? p.scheduledAt ?? p.createdAt,
  },
  form: {
    href: (id: ConsentFormId) => `/posts/${id}?kind=form`,
    loadDetail: (id: ConsentFormId) => loadConsentPostDetail(id),
    memoKeys: (p: PGConsentFormPost) => [
      p.id,
      p.status,
      p.stats.totalCount,
      p.stats.yesCount,
      p.stats.noCount,
    ],
    relevantDate: (p: PGConsentFormPost) => p.postedAt ?? p.scheduledAt ?? p.createdAt,
  },
} satisfies Record<PGPost['kind'], unknown>;
```

Containers use `POST_REGISTRY[post.kind].href(post.id)` etc. Adding a third kind is one new object literal; TS forces you to add every method.

**Pros:** eliminates sprawl; third kind is additive. **Cons:** indirection; not every branch has a registry-shaped equivalent (rendering branches are JSX-shaped). **Effort:** Medium. **Risk:** Low.

### Option C — Combined: registry for behaviour, `switch` for rendering

Use Option B for non-JSX branches (URL, loader, memo keys, date field). Keep `switch (post.kind)` + `assertNever` in JSX branches (they need component narrowing anyway).

**Pros:** best of both. **Cons:** split pattern across two conventions. **Effort:** Medium. **Risk:** Low.

## Recommended Action

<!-- Filled during triage — likely Option C -->

## Technical Details

**Affected files:**

- New: `web/data/posts-registry.ts`
- `web/containers/PostsView.tsx` (6 sites)
- `web/containers/CreatePostView.tsx` (4 sites)
- `web/containers/PostDetailView.tsx` (2 sites)
- Components: `PostCard`, `PostPreview`, `ReadTrackingCards`, `RecipientReadTable`

## Acceptance Criteria

- [ ] A new `kind: 'meeting'` added to `PGPost` fails compilation in at least 5 places
- [ ] No `kind === 'form' ? ... : ...` binary ternaries remain in container code (all `switch` + `assertNever`)
- [ ] URL construction for `?kind=` uses a single helper
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: architecture-strategist (primary), kieran-typescript-reviewer (landmines)
