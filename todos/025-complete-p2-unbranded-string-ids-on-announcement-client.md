---
status: complete
priority: p2
issue_id: 025
tags: [code-review, typescript, api]
dependencies: []
---

# `deleteAnnouncement` / `loadPostDetail` / `fetchAnnouncementDetail` accept unbranded `string`

## Problem Statement

The slice introduced branded `AnnouncementId` / `ConsentFormId` / `PostId` types with a `parsePostId` entry point (`mock-pg-announcements.ts`). The consent-form client functions (`loadConsentPostDetail`, `deleteConsentForm`, `fetchConsentFormDetail`) correctly take `ConsentFormId`. Their announcement siblings take bare `string`. This asymmetry is the root cause of the `row.id as ConsentFormId` cast in `PostsView.tsx` delete handler — if announcement IDs were `AnnouncementId`, the type system would enforce routing through `parsePostId` everywhere and the cast would be unnecessary.

## Findings

**kieran-typescript-reviewer:**

> `deleteAnnouncement`, `loadPostDetail`, and `fetchAnnouncementDetail` all accept bare `string`. The consent-form siblings take `ConsentFormId`. This asymmetry is the main reason [the `as ConsentFormId` cast] exists — `row.id` for an announcement is always a `string`, never an `AnnouncementId`. Tighten to `AnnouncementId` and let callers route through `parsePostId`; this will expose a couple more unbranded strings (`loadPostByKind(rawId, …)` at `CreatePostView.tsx:117,123` passes `rawId` straight in) that should go through `parsePostId` too.

**Locations:**

- `web/api/client.ts:257, 275+` (announcement mutations taking `string`)
- `web/data/mock-pg-announcements.ts:74+` (`PGAnnouncement.id: string` — should be `AnnouncementId`)
- `web/containers/CreatePostView.tsx:117,123` (`loadPostByKind` passing `rawId`)

## Proposed Solutions

### Option A — Brand announcement IDs symmetric to consent forms (recommended)

1. Change `PGAnnouncement.id: string` → `PGAnnouncement.id: AnnouncementId`
2. Change announcement client function signatures:
   ```ts
   export function deleteAnnouncement(id: AnnouncementId): Promise<void>;
   export function loadPostDetail(id: AnnouncementId): Promise<PGAnnouncement>;
   export function fetchAnnouncementDetail(id: AnnouncementId): Promise<PGApiAnnouncementDetail>;
   ```
3. Mapper (`mapAnnouncementSummary`, `mapAnnouncementDetail`) already populates `String(api.postId)` — cast the output to `AnnouncementId` at the mapper boundary (the one place where string → brand is safe by construction).
4. Call sites that had `row.id as ConsentFormId` disappear because `row.id` is already the branded type.
5. `loadPostByKind(rawId, …)` threads `rawId: string` through `parsePostId` first, then dispatches.

**Pros:** symmetric with consent forms; eliminates all `as <Brand>` casts; structural type safety on every ID path. **Cons:** ~10 call sites update. **Effort:** Small-Medium. **Risk:** Low.

### Option B — Unbrand consent forms instead

Revert `ConsentFormId` to plain `string`. Simpler but loses compile-time guarantee.

**Pros:** less code. **Cons:** loses the Phase 1 safety. **Effort:** Small. **Risk:** Low. **Not recommended.**

## Recommended Action

<!-- Filled during triage — Option A -->

## Technical Details

**Affected files:**

- `web/data/mock-pg-announcements.ts` (`PGAnnouncement.id`)
- `web/api/client.ts` (announcement mutation signatures)
- `web/api/mappers.ts` (cast at the boundary in both summary and detail mappers)
- `web/containers/PostsView.tsx`, `CreatePostView.tsx`, `PostDetailView.tsx` (call sites)

## Acceptance Criteria

- [ ] `grep -r "as AnnouncementId\|as ConsentFormId\|as PostId" web/` returns zero matches
- [ ] All announcement-ID parameters in client.ts are branded
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: kieran-typescript-reviewer
- Related: todo `015-pending-p1-buildpostpayload-as-cast-defeats-satisfies.md` (brands `PGConsentFormPost.id`)
