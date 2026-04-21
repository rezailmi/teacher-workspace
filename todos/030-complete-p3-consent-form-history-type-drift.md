---
status: complete
priority: p3
issue_id: 030
tags: [code-review, typescript, drift]
dependencies: []
---

# `PGApiConsentFormHistoryEntry` vs `PGConsentFormHistoryEntry` structural duplicate

## Problem Statement

Two interfaces with identical fields (`historyId`, `action`, `actionAt`, `actionBy`) live in two files:

- `PGApiConsentFormHistoryEntry` in `types.ts:76-81` (wire shape)
- `PGConsentFormHistoryEntry` in `mock-pg-announcements.ts:143-148` (domain shape)

The `mapConsentFormDetail` mapper does `const history: PGConsentFormHistoryEntry[] = detail.consentFormHistory` — a direct assignment with no mapping, relying on structural compatibility. TS will silently accept drift: if PG adds `ipAddress?: string` to the wire shape but not the domain one (or vice versa), the assignment still passes until someone reads the new field. This is the class of latent bug the plan's PG drift guardrail (deferred to a follow-up slice) is designed to catch.

## Findings

**kieran-typescript-reviewer:**

> `const history: PGConsentFormHistoryEntry[] = detail.consentFormHistory;` — the two interfaces happen to be structurally identical today. TS will silently accept drift on either side (e.g. PG adds `ipAddress?: string`). Either alias `export type PGConsentFormHistoryEntry = PGApiConsentFormHistoryEntry` and delete the duplicate, or map field-by-field so a drift becomes a compile error. Pick one.

**Locations:**

- `web/api/types.ts:76-81`
- `web/data/mock-pg-announcements.ts:143-148`
- `web/api/mappers.ts:269` (the direct assignment)

## Proposed Solutions

### Option A — Alias the wire type (recommended)

Delete the domain copy; re-export as alias:

```ts
// mock-pg-announcements.ts
import type { PGApiConsentFormHistoryEntry } from '~/api/types';
export type PGConsentFormHistoryEntry = PGApiConsentFormHistoryEntry;
```

**Pros:** one source of truth; drift can only come from PG side, which is the correct failure point. **Cons:** domain layer imports from API layer — usually undesirable but acceptable for pass-through types. **Effort:** Small. **Risk:** None.

### Option B — Map field-by-field

```ts
const history: PGConsentFormHistoryEntry[] = detail.consentFormHistory.map((e) => ({
  historyId: e.historyId,
  action: e.action,
  actionAt: e.actionAt,
  actionBy: e.actionBy,
}));
```

**Pros:** drift on either side = compile error. **Cons:** dumb copy; perpetuates two interfaces. **Effort:** Small. **Risk:** None.

### Option C — Satisfies-check the assignment

```ts
const history = detail.consentFormHistory satisfies PGConsentFormHistoryEntry[];
```

**Pros:** catches wire-side drift; no mapping. **Cons:** domain-side drift still passes. **Effort:** Small. **Risk:** None.

## Recommended Action

<!-- Filled during triage — likely Option A -->

## Technical Details

**Affected files:**

- `web/data/mock-pg-announcements.ts:143-148` (delete interface, add alias)
- `web/api/mappers.ts:269` (no change needed if Option A)

## Acceptance Criteria

- [ ] Only one source-of-truth declaration exists
- [ ] Adding a required field to the wire type fails compilation in the mapper or its callers
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: kieran-typescript-reviewer
- Related: PG drift guardrail (`docs/ideation/2026-04-20-posts-pg-parity-ideation.md` #3, deferred)
