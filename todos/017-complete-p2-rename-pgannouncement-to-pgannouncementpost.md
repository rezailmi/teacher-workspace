---
status: complete
priority: p2
issue_id: 017
tags: [code-review, architecture, naming]
dependencies: []
---

# Rename `PGAnnouncement` → `PGAnnouncementPost` per plan commitment

## Problem Statement

The plan's Enhancement Summary #1 explicitly committed to renaming `PGAnnouncement` to `PGAnnouncementPost` with a temporary alias bridging the codemod window. What actually shipped: `PGAnnouncement` at `mock-pg-announcements.ts:83` is still the canonical interface name for the announcement **variant** of `PGPost`. The type name now suggests `PGAnnouncement` is the parent / umbrella when it's actually one of two siblings — a direct contradiction of the discriminated-union design and a trap for anyone reading the union for the first time.

## Findings

**architecture-strategist:**

> The plan explicitly committed to `PGAnnouncement = PGAnnouncementPost` as a _temporary_ alias during the codemod. What actually shipped is the opposite: `PGAnnouncement` at `mock-pg-announcements.ts:83` is still the canonical interface name. Both halves of the union now violate Single-Responsibility naming. Rename to `PGAnnouncementPost` and keep `PGAnnouncement` as a `@deprecated` alias; otherwise the "next kind" PR inherits the wrong mental model.

**Related — `mock-pg-announcements.ts` filename is also stale** (P3, pattern-recognition-specialist):

> The file now hosts `PGPost`, `PGConsentFormPost`, `PGConsentFormHistoryEntry`, `parsePostId`, `postKindFromId`, etc. 16 files import from it. The `mock-pg-announcements` name invisibly ties consent-form types to a file a reader expects to be announcement-only fixtures.

## Proposed Solutions

### Option A — Rename interface, keep alias (recommended per plan)

1. Rename `interface PGAnnouncement` → `interface PGAnnouncementPost` in `mock-pg-announcements.ts`.
2. Add `/** @deprecated Use \`PGAnnouncementPost\`. \*/ export type PGAnnouncement = PGAnnouncementPost`.
3. Keep the alias for one slice; remove in a follow-up `chore(web)` after downstream renames land.

**Pros:** zero runtime change, no migration pain, aligns with plan. **Cons:** the alias persists until you actively remove it. **Effort:** Small. **Risk:** Low.

### Option B — Full rename sweep in one commit

Grep + replace `PGAnnouncement` → `PGAnnouncementPost` across all 16 importers.

**Pros:** clean tree after one commit. **Cons:** wider blast radius. **Effort:** Medium. **Risk:** Low.

### Option C — Also rename the file

Bundle the file rename (`mock-pg-announcements.ts` → `posts.ts` or `pg-post.ts`) with the type rename.

**Pros:** fixes both naming smells at once. **Cons:** more files touched; 16 imports update. **Effort:** Medium. **Risk:** Low.

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**

- `web/data/mock-pg-announcements.ts:83` (the interface)
- All importers of `PGAnnouncement` — expect ~10 container/component files

## Acceptance Criteria

- [ ] `interface PGAnnouncementPost` exists
- [ ] `PGAnnouncement` either removed or marked `@deprecated` alias
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean
- [ ] `pnpm build` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: architecture-strategist, pattern-recognition-specialist
- Plan: `docs/plans/2026-04-20-001-feat-posts-consent-form-parity-plan.md` Enhancement Summary #1
