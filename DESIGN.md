# Design System Decisions

## Token-First Styling Strategy

When overriding Flow DS component appearance, **prioritize token overrides over component wrappers** — but never break the token hierarchy.

### Approach

1. **Override tokens** for colors, spacing, typography, shadows — values that affect many components uniformly.
2. **Keep the radius scale intact** — don't set `--radius-lg` to `9999px` when `--radius-full` already exists. Pill shapes use `rounded-full` via wrappers.
3. **Use `~/components/ui` wrappers** for per-component shape overrides (pill buttons, rounder inputs, etc.).

### Why not override radius tokens for pill shapes?

Setting `--radius-lg: 9999px` breaks the semantic hierarchy (`xs < sm < md < lg < xl < ... < full`) and causes cascading issues — every component using `rounded-lg` (SidebarItem, dropdown content, etc.) becomes pill unintentionally. Since `--radius-full: 9999px` already exists in the scale, use it via wrappers.

### Radius Scale (Flow DS defaults, unchanged)

```
--radius-xs:   2px
--radius-sm:   6px
--radius-md:   8px
--radius-lg:   10px
--radius-xl:   14px
--radius-2xl:  16px
--radius-3xl:  24px
--radius-4xl:  32px
--radius-full: 9999px
```

### Component Wrappers

Wrappers in `web/components/ui/` apply shape overrides via `className` + `twMerge`:

| Component                            | Wrapper override           | Result                      |
| ------------------------------------ | -------------------------- | --------------------------- |
| Button                               | `rounded-full font-medium` | pill, medium weight         |
| Badge                                | `rounded-full`             | pill                        |
| Input                                | `rounded-xl`               | 14px corners                |
| TabsTrigger                          | `rounded-full font-medium` | pill, medium weight         |
| TabsList                             | `rounded-xl`               | 14px container              |
| DropdownMenuContent                  | pure re-export             | 10px (default `rounded-lg`) |
| Card, Checkbox, Switch, Label, Table | pure re-exports            | use Flow DS defaults        |

### Color Token Strategy

Semantic color tokens use slate for neutral UI and blue for brand/interactive:

- **Hover/inactive fills**: `--color-slate-3` (not brand blue)
- **Button borders**: `--color-slate-7` (subtle gray, not brand)
- **Foreground text**: `--color-slate-12` (for ghost/outline buttons, page text)
- **Brand fills**: `--color-blue-9` / `--color-blue-10` (only for primary/default buttons)

### What gets token-overridden vs wrapper-overridden

| Category           | Method                   | Example                                       |
| ------------------ | ------------------------ | --------------------------------------------- |
| Colors             | Token override           | `--color-fill-inactive: var(--color-slate-3)` |
| Spacing            | Token override           | `--spacing-2xl: 2.25rem`                      |
| Typography sizes   | Token override           | `--font-size-200: 0.875rem`                   |
| Typography weights | Token override           | `--text-style-title-sm-weight: 500`           |
| Shadows            | Token override           | `--shadow-xs: none`                           |
| Pill shapes        | Wrapper (`rounded-full`) | Button, Badge, TabsTrigger                    |
| Custom radius      | Wrapper (specific token) | Input (`rounded-xl`), TabsList (`rounded-xl`) |

### Files

- `web/flow-teacher-ds.css` — Token overrides (colors, spacing, typography, shadows)
- `web/App.css` — Imports, Tailwind theme registration, base layer
- `web/components/ui/` — Wrapper re-exports (shape overrides only)
- `web/containers/ComponentsView.tsx` — Design system preview page at `/components`
