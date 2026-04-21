---
status: complete
priority: p2
issue_id: 026
tags: [code-review, patterns, routing]
dependencies: []
---

# URL `?kind=` construction duplicated + loader return-shape inconsistent

## Problem Statement

Two related pattern drifts:

1. **`?kind=` construction is duplicated across three call sites**, with one asymmetric. `PostsView.tsx:85` uses `p.kind === 'form' ? 'form' : 'announcement'` (redundant ternary since `post.kind` is already exactly that union). `PostDetailView.tsx:92` uses `?kind=${post.kind}` (cleaner). Edit links construct URLs in a third way. No shared helper.
2. **Loader return shapes are inconsistent.** `PostsView.loader → {rows, configs}`, `CreatePostView.loader → {detail, classes, staff, …, configs}` (both object, configs included), but `PostDetailView.loader → PGPost` (bare value, no configs). A new reader has to read three loaders to discover the "return an object with configs" convention. `PostDetailView` will need configs the moment it renders flag-gated chrome (e.g. hiding Edit behind a permission flag).

## Findings

**pattern-recognition-specialist:**

> URL `?kind=` construction duplicated across three callsites, one asymmetric. `PostsView.tsx:85`'s ternary is redundant and inconsistent with `PostDetailView.tsx:92`. Extract one `postHref(post, { edit? })` helper in `~/data/mock-pg-announcements.ts` (co-located with `postKindFromId`).
>
> Loader return-shape inconsistency. `PostsView.loader → {rows, configs}`, `CreatePostView.loader → {detail, classes, staff, ..., configs}`, but `PostDetailView.loader → PGPost` (bare value, no configs). Today it is a bare union — a new hire has to read three loaders to learn the "return an object with configs" convention.

**Locations:**

- `web/containers/PostsView.tsx:85` (redundant ternary)
- `web/containers/PostDetailView.tsx:92` (cleaner form)
- `web/containers/CreatePostView.tsx` edit link construction
- `web/containers/PostDetailView.tsx:16-60` (loader returns bare `PGPost`)

## Proposed Solutions

### Option A — Extract `postHref` + normalise `PostDetailView.loader` (recommended)

1. Add helper in `web/data/mock-pg-announcements.ts`:
   ```ts
   export function postHref(post: PGPost, opts?: { edit?: boolean }): string {
     const base = `/posts/${post.id}?kind=${post.kind}`;
     return opts?.edit ? `${base}&edit=1` : base;
   }
   ```
   Or accept a separate edit path: `/posts/${id}/edit?kind=${kind}`.
2. Replace the three duplicated call sites with `postHref(p)`.
3. Wrap `PostDetailView.loader` return in `{post, configs}`:
   ```ts
   return { post, configs: await getConfigs() };
   ```
   Container destructures `const { post, configs } = useLoaderData<...>()`. Brings all three loaders into the same shape.

**Pros:** centralised URL; consistent loader convention; configs ready when detail view needs them. **Cons:** `PostDetailView`'s container unwraps one more level. **Effort:** Small. **Risk:** Low.

### Option B — `postHref` only; defer loader normalisation

Just fix the URL duplication. Revisit loader shape when `PostDetailView` actually needs configs.

**Pros:** minimal. **Cons:** perpetuates the inconsistency. **Effort:** Small. **Risk:** Low.

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**

- `web/data/mock-pg-announcements.ts` (+`postHref`)
- `web/containers/PostsView.tsx:85` (use helper)
- `web/containers/PostDetailView.tsx:16-60, :92` (use helper + wrap loader)
- `web/containers/CreatePostView.tsx` (edit link)

## Acceptance Criteria

- [ ] `grep -r "?kind=" web/containers/` shows only `postHref` as the origin
- [ ] All three loaders return an object, not a bare value
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: pattern-recognition-specialist
