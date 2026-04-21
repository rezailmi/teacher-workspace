---
status: complete
priority: p2
issue_id: 021
tags: [code-review, react, ux]
dependencies: []
---

# `ReminderSection` date stash lives in `useRef`, lost on remount, stale when NONE

## Problem Statement

`ReminderSection` uses a `useRef` to stash the picked date across radio toggles (so switching None → One-time → Daily doesn't clear the user's date). Two concrete problems:

1. **Remount loses the stash.** If a parent `key=` changes or the component unmounts between toggles, the ref is gone and the date is silently lost without warning.
2. **Stale display when NONE.** When `value.type === 'NONE'`, `displayDate` returns the stashed date, so the `<Input>` continues to show the old date — confusing if the user thinks they cleared it.

Refs are not observable in React DevTools, not serialisable, and don't participate in the reducer's time-travel — they're the wrong persistence layer for data the user can edit.

## Findings

**julik-frontend-races-reviewer:**

> Writing to a ref during render body is the React "well, technically allowed if idempotent" pattern, but here it's conditional on `value.date !== stashedDateRef.current` which makes StrictMode's double-invoke land with the ref already synced on the second pass — subtle, but fine. The real hazard: `displayDate` at `:68` returns the stash when `value.type === 'NONE'`, so after the user picks NONE the `<Input>` continues to show the old date. Toggling NONE → ONE_TIME works (stash re-applied), but if a parent `key=` or unmount happens between, the ref is gone and the date is lost without warning.
>
> **Fix:** lift the stash into reducer state (`SET_REMINDER` with a `lastDate` field) so it survives remounts and is inspectable in devtools.

**Location:** `web/components/posts/ReminderSection.tsx:47-49, :68`

## Proposed Solutions

### Option A — Lift stash into the reducer (recommended)

Extend the reducer state to carry the "last picked date across toggles":

```ts
interface PostFormState {
  // ...
  reminder: ReminderConfig;
  reminderLastDate?: string; // stashed across type changes
}
```

Or extend the `ReminderConfig` union to carry a `lastDate` on the `NONE` branch (cleaner — keeps the persistence concern inside the type):

```ts
export type ReminderConfig =
  | { type: 'NONE'; lastDate?: string } // stash
  | { type: 'ONE_TIME'; date: string }
  | { type: 'DAILY'; date: string };
```

`ReminderSection` reads `lastDate` on NONE → pre-fills the picker on re-enable. `displayDate` now returns empty when NONE instead of stale.

**Pros:** survives remounts; visible in DevTools; serialisable. **Cons:** the `lastDate` field on the `NONE` branch is a tiny lie (it's not a reminder config, it's a memoisation slot). **Effort:** Small. **Risk:** Low.

### Option B — Just fix the NONE display

Return empty string from `displayDate` when `value.type === 'NONE'`. Leaves the remount hazard.

**Pros:** trivial. **Cons:** remount-lose still bites. **Effort:** Small. **Risk:** Low — but only partially fixes.

### Option C — Hoist stash to the container

Keep `useState<string | null>(null)` in `CreatePostView` and pass as prop.

**Pros:** container owns it. **Cons:** spreads `ReminderSection` concern upward. **Effort:** Small. **Risk:** Low.

## Recommended Action

<!-- Filled during triage — likely Option A -->

## Technical Details

**Affected files:**

- `web/components/posts/ReminderSection.tsx` (remove ref, consume `lastDate`)
- `web/data/mock-pg-announcements.ts` (extend `ReminderConfig` if chosen)
- `web/containers/CreatePostView.tsx` reducer + `SET_REMINDER` action

## Acceptance Criteria

- [ ] Pick date under One-time → switch to None → switch back to One-time: date is restored
- [ ] Remount the component (force via key change): date is still there
- [ ] When None is selected, the hidden picker does NOT display a stale date value

## Work Log

_(add entries as work progresses)_

## Resources

- Review: julik-frontend-races-reviewer
