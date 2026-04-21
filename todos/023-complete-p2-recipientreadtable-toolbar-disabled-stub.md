---
status: complete
priority: p2
issue_id: 023
tags: [code-review, ux, simplicity]
dependencies: []
---

# `RecipientReadTable.Toolbar` ships disabled buttons + non-wired search

## Problem Statement

The `Toolbar` inside `RecipientReadTable` renders a search input plus three buttons (Filter, Columns, Export) that are all `disabled`. The search input has no `onChange` handler — typing into it does nothing. This is exactly the "looks like a feature, does nothing" pattern the plan explicitly called out as worth removing. The read-tracking toolbar is deferred from this slice (in Scope Boundaries). Leaving its chrome rendered signals capability that doesn't exist and trains users to ignore it when it eventually ships.

## Findings

**code-simplicity-reviewer:**

> `RecipientReadTable.Toolbar` ships 3 disabled buttons + a non-wired Search input. Filter/Columns/Export all `disabled`, Search has no `onChange`. This is exactly the "looks like a feature, does nothing" pattern. Strip the Toolbar to just the `{count} recipients` line until search/filter actually work; re-add the chrome in the slice that implements them.

**Location:** `web/components/posts/RecipientReadTable.tsx:33-64` (the `Toolbar` subcomponent)

## Proposed Solutions

### Option A — Strip to recipient count only (recommended)

Replace the `Toolbar` body with just the count line:

```tsx
function Toolbar({ count }: { count: number }) {
  return <p className="text-sm text-muted-foreground">{count} recipients</p>;
}
```

Or inline the count directly in `RecipientReadTable` and delete `Toolbar` entirely.

**Pros:** removes user-hostile chrome; trivial to re-add when the toolbar slice ships. **Cons:** loses the visual frame. **Effort:** Small. **Risk:** None.

### Option B — Keep the visual frame, remove the inputs

Keep the outer `<div>` with its justify-between layout but drop the disabled inputs. Leaves a placeholder row in case someone wants to add filter chrome later without redoing the outer layout.

**Pros:** preserves the grid. **Cons:** empty container is weird; still signals "something goes here". **Effort:** Small. **Risk:** None.

### Option C — Wire up search

Implement the search input end-to-end — add `useState<string>('')`, filter the `recipients` array by `studentName` / `classLabel`. Leave Filter/Columns/Export disabled with a TODO.

**Pros:** actual user value. **Cons:** expands this slice's scope — search is in Scope Boundaries. **Effort:** Medium. **Risk:** Low — but violates slice discipline. **Defer** per plan.

## Recommended Action

<!-- Filled during triage — likely Option A -->

## Technical Details

**Affected files:** `web/components/posts/RecipientReadTable.tsx:33-64`

## Acceptance Criteria

- [ ] No disabled buttons render anywhere in `RecipientReadTable`
- [ ] No non-wired inputs render
- [ ] Recipient count still displays

## Work Log

_(add entries as work progresses)_

## Resources

- Review: code-simplicity-reviewer
- Plan: Scope Boundaries (read-tracking toolbar deferred)
