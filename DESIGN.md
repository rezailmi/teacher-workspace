# Design System Decisions

## Token-First Styling Strategy

When overriding Flow DS component appearance, **prioritize token overrides over component wrappers**.

### Approach

1. **Override the token** if a single CSS custom property change handles multiple components at once.
2. **Use a `~/components/ui` wrapper** only when a component needs to deviate from the token value.

### Radius Example

Flow DS components reference radius tokens via Tailwind classes (`rounded-lg`, `rounded-xl`, etc.). Instead of writing CSS selector hacks with `!important` or adding `rounded-full` to every wrapper, we override the token:

```css
/* flow-teacher-ds.css */
:root {
  --radius-lg: 9999px; /* pill — affects Button, Badge, TabsTrigger */
}
```

Components that need a different radius override via their wrapper using a different token:

| Component | Internal class | Token value | Wrapper override |
|-----------|---------------|-------------|-----------------|
| Button | `rounded-lg` | 9999px (pill) | none needed |
| Badge | `rounded-lg` | 9999px (pill) | none needed |
| TabsTrigger | `rounded-lg` | 9999px (pill) | none needed |
| Input | `rounded-lg` | 9999px | `rounded-xl` (14px) |
| DropdownMenuContent | `rounded-lg` | 9999px | `rounded-xl` (14px) |
| TabsList | `rounded-xl` | 14px | `rounded-4xl` (32px) |

### Flow DS Default Radius Scale (for reference)

```
--radius-xs:   2px
--radius-sm:   6px
--radius-md:   8px
--radius-lg:   10px  → overridden to 9999px
--radius-xl:   14px
--radius-2xl:  16px
--radius-3xl:  24px
--radius-4xl:  32px
--radius-full: 9999px
```

### Wrapper Rules

Wrappers in `web/components/ui/` should be thin — only override what the token can't handle:

- **Button**: `font-medium` (weight only, radius from token)
- **Badge**: pure re-export (radius from token)
- **Input**: `rounded-xl` (needs 14px, not pill)
- **TabsTrigger**: `font-medium` (weight only, radius from token)
- **TabsList**: `rounded-4xl` (needs 32px container)
- **DropdownMenuContent**: `rounded-xl` (content panel needs 14px, not pill)

### Color Token Strategy

Semantic color tokens use slate for neutral UI and blue for brand/interactive:

- **Hover/inactive fills**: `--color-slate-3` (not brand blue)
- **Button borders**: `--color-slate-7` (subtle gray, not brand)
- **Foreground text**: `--color-slate-12` (for ghost/outline buttons, page text)
- **Brand fills**: `--color-blue-9` / `--color-blue-10` (only for primary/default buttons)

All token overrides live in `web/flow-teacher-ds.css`. The `web/App.css` file only handles imports, Tailwind `@theme`, and the base layer.

### Files

- `web/flow-teacher-ds.css` — All token overrides (colors, spacing, typography, radius)
- `web/App.css` — Imports, Tailwind theme registration, base layer
- `web/components/ui/` — Wrapper re-exports (token-first, wrapper only for exceptions)
- `web/containers/ComponentsView.tsx` — Design system preview page at `/components`
