# Design System Decisions

## Strategy

Call sites consume semantic Tailwind utilities (`bg-background`,
`text-muted-foreground`, `bg-sidebar-accent`). Raw Radix utilities
(`bg-slate-4`, `text-red-9`) must be registered in the exemption list with a
reason; CI enforces via `pnpm check:colors`.

## Token layers (all declared in `web/App.css`)

```
Radix scales (slate, blue, green, red, amber) + twblue brand scale
        ▼
Shadcn v4 semantic tokens (--background, --primary, --muted, --border,
                           --sidebar*, --success/--warning/--info)
        ▼
Tailwind @theme inline exports (--color-background, --color-primary, …)
```

## Deviations from shadcn v4 canonical

- **Status tokens** — `--success`, `--warning`, `--info` (+ `-foreground`).
  shadcn does not ship them ([GH #8986](https://github.com/shadcn-ui/ui/discussions/8986));
  added to drive `<Badge variant="success|warning|info">`.
- **Form-input radius (14px)** — hardcoded as `rounded-[14px]` on
  `Input`/`Textarea`/`SelectTrigger`/`entity-selector` chip container. Bigger
  than shadcn canonical (`rounded-md`); lives at the primitive, not as a token.
- **Light-only palette** — no dark overrides; primitives override upstream
  `dark:` variants where they'd hijack appearance under
  `prefers-color-scheme: dark`.

Bar for any future invented token: 3+ existing call sites that canonical
tokens can't express, with rationale captured in the exemption registry
header before landing.

## Primitives

[`web/components/ui/`](web/components/ui/) holds shadcn-style components
built on `@base-ui/react` + `class-variance-authority`. Shape decisions
(`rounded-full` on Button, `rounded-4xl` on Badge, etc.) are baked into
each `cva` — no wrapper indirection.

## Radius

Only `--radius: 0.625rem` is declared. Form-input primitives use
`rounded-[14px]` at the component; everything else uses Tailwind's default
`rounded-*` utilities directly.

## Sidebar and Sonner

`App.css` declares the shadcn v4 canonical `--sidebar-*` block and maps
Sonner's `[data-sonner-toaster]` vars to theme tokens so toast chrome
tracks the palette. Tailwind v4 JIT tree-shakes utilities, not var
declarations — if all Sidebar consumers are removed, remove the sidebar
block too.

## Files

- [`web/App.css`](web/App.css) — tokens, Tailwind theme, Sonner overrides.
- [`web/components/ui/`](web/components/ui/) — shadcn primitives.
- [`web/containers/ComponentsView.tsx`](web/containers/ComponentsView.tsx) —
  preview page at `/components`.
- [`scripts/check-raw-colors.sh`](scripts/check-raw-colors.sh) +
  [`scripts/raw-color-exemptions.txt`](scripts/raw-color-exemptions.txt) —
  CI guard + exemption registry.
