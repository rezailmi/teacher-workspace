---
status: complete
priority: p2
issue_id: 022
tags: [code-review, patterns, api-consistency]
dependencies: []
---

# `ShortcutsSection` breaks the `{value, onChange}` convention

## Problem Statement

The slice's form-section pattern (documented in the plan and followed by `EventScheduleSection`, `VenueSection`, `DueDateSection`, `ReminderSection`) uses `{value, onChange: (next) => void}`. `ShortcutsSection` took a third shape: `{value, onToggle: (key, enabled) => void}`. This is neither the `{value, onChange}` convention for single-value sections nor the `{dispatch}` pattern for list-owning sections (which is what `WebsiteLinksSection` correctly uses for its add/remove/reorder needs). A new hire reading the folder has to learn three prop shapes instead of two.

## Findings

**pattern-recognition-specialist:**

> `ShortcutsSection` breaks the documented `{value, onChange}` convention. Uses `onToggle: (key, enabled) => void` while every other value-owned section takes `onChange` returning the next full value. Either it is list-owning (then take `dispatch` like `WebsiteLinksSection`) or it is `{value, onChange}` returning the next `string[]`. Today it is a third shape the plan did not sanction.

**Location:** `web/components/posts/ShortcutsSection.tsx:27-44`

## Proposed Solutions

### Option A — `{value, onChange}` with next `string[]` (recommended)

```tsx
interface ShortcutsSectionProps {
  value: string[];
  onChange: (next: string[]) => void;
  declareTravelsEnabled: boolean;
  editContactEnabled: boolean;
}

function ShortcutsSection({
  value,
  onChange,
  declareTravelsEnabled,
  editContactEnabled,
}: ShortcutsSectionProps) {
  const toggle = (key: string, enabled: boolean) => {
    onChange(enabled ? [...value, key] : value.filter((k) => k !== key));
  };
  // ...
}
```

Caller becomes:

```tsx
<ShortcutsSection
  value={state.shortcuts}
  onChange={(next) => dispatch({ type: 'SET_SHORTCUTS', payload: next })}
/>
```

**Pros:** matches convention; callable with any value, not just checkbox toggles. **Cons:** one more reducer action (or reuse an existing one). **Effort:** Small. **Risk:** Low.

### Option B — `dispatch`-driven like `WebsiteLinksSection`

Pass `dispatch` and have the section fire `TOGGLE_SHORTCUT` actions directly.

**Pros:** matches `WebsiteLinksSection`. **Cons:** couples the section to the reducer's action shape, which is heavier than needed for two checkboxes. **Effort:** Small. **Risk:** Low.

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**

- `web/components/posts/ShortcutsSection.tsx` (prop shape)
- `web/containers/CreatePostView.tsx` (call site + action replacement if Option A)

## Acceptance Criteria

- [ ] `ShortcutsSection` takes `{value, onChange}` (Option A) or `{value, dispatch}` (Option B)
- [ ] No other prop shape lingers
- [ ] Toggling each checkbox produces correct state in the reducer
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: pattern-recognition-specialist
