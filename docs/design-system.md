# Frontend Design System — How It Works

Companion to [`DESIGN.md`](../DESIGN.md) (the decisions log). This file explains
_how_ the pieces fit together so a new contributor can confidently add a
component, pick a color, or debug a stray `dark:` variant.

## TL;DR

- **Colors flow through three layers.** Radix scales → shadcn semantic tokens →
  Tailwind `@theme` utilities. Call sites consume only the top layer.
- **Primitives live in [`web/components/ui/`](../web/components/ui/).** Shadcn-style
  components built on [`@base-ui/react`](https://base-ui.com) + `cva` +
  `tailwind-merge`. No wrapper indirection; shape is baked into each `cva`.
- **One CSS entrypoint: [`web/App.css`](../web/App.css).** Declares tokens,
  Tailwind `@theme inline` exports, one `@utility`, and Sonner overrides.
- **No dark mode.** Light-only palette. Some primitives carry `dark:` classes
  inherited from shadcn upstream — left in place but inert.

## Layer 1 — Radix scales (raw palette)

The four Radix scales plus a project brand scale are the ground truth:

```css
/* web/App.css */
@import '@radix-ui/colors/slate.css'; /* neutrals */
@import '@radix-ui/colors/blue.css'; /* info states, decoration */
@import '@radix-ui/colors/green.css'; /* success */
@import '@radix-ui/colors/red.css'; /* destructive */
@import '@radix-ui/colors/amber.css'; /* warning */

:root {
  --twblue-9: #0064ff; /* brand primary, and 11 steps around it */
  /* …twblue-1…12 defined inline… */
}
```

Each Radix scale exposes 12 steps (`--slate-1` … `--slate-12`). Higher = more
emphasis. See [Radix's usage guide](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
for what each step is for (backgrounds, borders, solids, text).

> **Rule:** Never reference these scales directly from a component. They're the
> source material, not the UI contract.

## Layer 2 — Shadcn semantic tokens

The bridge layer. Each semantic token aliases one Radix (or brand) step:

```css
--background: var(--slate-1);
--foreground: var(--slate-12);
--primary: var(--twblue-9);
--muted: var(--slate-3);
--border: var(--slate-6);
--ring: var(--twblue-7);
/* …plus --card, --popover, --accent, --destructive, --sidebar-*, --radius… */
```

Two project-local extensions beyond shadcn v4 canonical:

| Token set                                                              | Why it exists                                                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--success/-foreground`, `--warning/-foreground`, `--info/-foreground` | shadcn doesn't ship status colors ([GH #8986](https://github.com/shadcn-ui/ui/discussions/8986)). Drives `<Badge variant="success\|warning\|info">`. |
| `--sidebar-*`                                                          | Canonical shadcn v4 sidebar block, included for `<Sidebar/>`. If Sidebar consumers go away, delete this block.                                       |

Bar for any _new_ invented token: 3+ call sites that canonical tokens can't
express. Everything else lives as an inline utility expression (e.g.
`bg-primary/10`, `text-warning-foreground/80`).

## Layer 3 — Tailwind `@theme inline` exports

`@theme inline` is how Tailwind v4 turns CSS variables into utility classes:

```css
@theme inline {
  --color-background: var(--background); /* → bg-background, text-background, … */
  --color-primary: var(--primary); /* → bg-primary, text-primary, border-primary, … */
  --color-muted-foreground: var(--muted-foreground);
  /* …one line per semantic token, plus full Radix scales re-exported… */
}
```

The Radix scales are _also_ re-exported here (`--color-slate-*`,
`--color-twblue-*`, etc.), which is what makes `bg-slate-4` work at all. Raw
Radix refs aren't forbidden by the build — they're just rare, because the
semantic token almost always fits.

**Alpha variation** uses Tailwind's slash modifier — no new tokens needed:

```tsx
<button className="bg-primary/10 hover:bg-primary/20 text-primary">
```

This pattern is in use in `web/components/ui/button.tsx`,
`web/components/ui/badge.tsx`, and throughout the posts area.

## Primitives — `web/components/ui/`

Shadcn-style React components built on three libraries:

- [`@base-ui/react`](https://base-ui.com) — unstyled, accessible primitives
  (Dialog, Popover, Select, Dropdown, etc.). Successor to Radix UI's React
  library; the same team.
- [`class-variance-authority`](https://cva.style/) — `cva()` encodes
  variant+size combinations into a single class string.
- [`tailwind-merge`](https://github.com/dcastil/tailwind-merge) via our
  `cn()` helper at `web/lib/utils.ts` — dedupes conflicting Tailwind classes
  so `cn('bg-primary', props.className)` lets callers override cleanly.

### The shape of a primitive

```tsx
// web/components/ui/button.tsx (abridged)
const buttonVariants = cva(
  'rounded-full border ... cursor-pointer transition-all ...',  // base classes
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/80 ...',
        secondary:   'border-border bg-background hover:bg-muted ...',
        ghost:       'hover:bg-muted ...',
        destructive: 'bg-destructive/10 text-destructive ...',
        link:        'text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-9 px-3', xs, sm, lg, icon, 'icon-sm', ... },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({ className, variant, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
```

Every primitive follows this pattern: one `cva` with base + variants + sizes,
then a thin function that passes merged classes into a `@base-ui/react` root.
The full list is exported from `web/components/ui/index.ts`.

### Form-input radius

`Input`, `Textarea`, `SelectTrigger`, and the entity-selector chip all use
`rounded-[14px]` — a project-specific shape that doesn't match any Radix or
shadcn convention. It's hardcoded at the primitive, not exposed as a token, per
the "no single-use tokens" rule.

## `focus-standard` — the one bespoke utility

```css
@utility focus-standard {
  &:focus-visible {
    outline: 2px solid var(--color-slate-8);
    outline-offset: 0;
  }
}
```

Use on raw elements (non-primitive buttons, clickable `<div>`s) that need a
keyboard focus ring. Current consumers: `Sidebar/SidebarItem.tsx`,
`posts/PostTypePicker.tsx`. Primitives already wire their own focus rings via
`focus-visible:ring-*` in `cva`.

## What lives where

```
web/
├── App.css                       ← tokens, @theme, @utility, Sonner overrides
├── components/
│   ├── ui/                       ← primitives (Button, Card, Dialog, …)
│   ├── Sidebar/                  ← app chrome (consumes --sidebar-* tokens)
│   ├── posts/                    ← feature-area components
│   └── comms/                    ← feature-area components
├── containers/
│   ├── RootLayout.tsx            ← <Sidebar/> + <Outlet/>
│   ├── ComponentsView.tsx        ← /components preview page
│   └── …Views.tsx                ← route-level screens
└── lib/utils.ts                  ← cn() helper (twMerge + clsx)
```

- **`/components`** route renders `ComponentsView.tsx` — a gallery of every
  primitive and the full Radix palette. Use it to eyeball tokens against
  components when tweaking colors.
- **Flow shim.** `App.css` declares a handful of `--text-style-*`,
  `--font-family-*`, and `.typography-*` classes compatible with `@flow/core`
  token names. This is legacy — used by a few places still consuming `@flow`
  components (`@source` directives at the top of `App.css`).

## Adding something new

### Adding a color usage

1. Try an existing semantic token first: `bg-primary`, `text-muted-foreground`,
   `border-border`, `bg-sidebar`, `text-destructive`, etc.
2. Need a tint? Use the slash modifier: `bg-primary/10`, `text-warning-foreground/80`.
3. Still no fit? Use a raw Radix step: `bg-slate-4`, `text-amber-11`. Prefer
   this over inventing a new token for one call site.
4. Only invent a new semantic token (`--something`, `--color-something`) if
   3+ call sites would benefit and no combination of the above works.

### Adding a primitive

1. Create `web/components/ui/<name>.tsx` following the shape of `button.tsx` or
   `badge.tsx`.
2. Wrap a `@base-ui/react` primitive (or a native element when there's no
   equivalent). Put base classes + variants in a single `cva`.
3. Export from `web/components/ui/index.ts`.
4. Add an entry to `ComponentsView.tsx` so the preview page covers it.

### Adding a feature component

Compose primitives from `web/components/ui/`. Reach for raw Tailwind utilities
for spacing/layout, semantic tokens for color. Avoid inline `style={}` unless
the value is computed at runtime.

## Gotchas and conventions

- **`cn(base, props.className)` always.** If a primitive hardcodes a class
  without merging caller's `className`, the caller can't override it —
  `tailwind-merge` needs both strings to dedupe.
- **`data-slot="…"` on every primitive root.** Useful for styling from parent
  scopes (`[data-slot="button"]:disabled`) and for test selectors.
- **`dark:` variants from upstream shadcn.** Some primitives carry
  `dark:aria-invalid:ring-destructive/40` and similar. They're inert under
  our light-only palette but left in place to minimize diffs from upstream —
  see `DESIGN.md` for the override pattern when they'd hijack colors.
- **Sidebar tokens are a boundary.** `bg-sidebar`, `text-sidebar-foreground`,
  etc. are meant for the sidebar chrome. Using them elsewhere is a
  code-smell — there's one intentional exception (`RichTextToolbar` chrome)
  documented with an inline comment.
- **No tests for color.** Visual verification goes through the `/components`
  page during dev.

## References

- [`web/App.css`](../web/App.css) — full token + theme source
- [`web/components/ui/`](../web/components/ui/) — all primitives
- [`web/containers/ComponentsView.tsx`](../web/containers/ComponentsView.tsx) — live preview at `/components`
- [`DESIGN.md`](../DESIGN.md) — decisions log (deviations, token rules)
- [shadcn/ui docs](https://ui.shadcn.com/) — upstream primitive conventions
- [Base UI docs](https://base-ui.com/react/overview/quick-start) — unstyled components
- [Radix Colors](https://www.radix-ui.com/colors) — scale theory
- [Tailwind v4 `@theme`](https://tailwindcss.com/docs/theme) — how CSS vars become utilities
