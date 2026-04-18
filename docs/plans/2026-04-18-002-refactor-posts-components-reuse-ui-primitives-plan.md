---
title: Refactor Posts components to reuse shadcn UI primitives
type: refactor
status: active
date: 2026-04-18
---

# Refactor Posts components to reuse shadcn UI primitives

## Overview

Sweep `web/components/posts/*` and replace every raw HTML element, ad-hoc styled `<div>`, and re-implemented primitive with the corresponding `web/components/ui/*` component. This is a purely structural refactor — no new wrapper components, no new design tokens, no behavior changes beyond token-aligned color shifts already sanctioned by [color-tokens.md](../architecture/color-tokens.md).

## Problem Statement

`web/components/posts/*` was built incrementally alongside the Posts feature. Most files already use the shadcn primitives for obvious cases (`Button`, `Dialog`, `Table`, `Badge`), but several call sites still:

1. **Wrap content in raw `<div className="rounded-xl border p-4">`** where `<Card size="sm">` would serve.
2. **Hand-roll `<button>` elements** (RichTextToolbar 16 buttons, PostTypePicker 2 buttons) instead of composing `Button`.
3. **Render inline status colors as `Badge className="bg-green-3..."`** (RecipientReadTable) where the new `<Badge variant="success|warning|info">` token-backed variants now fit directly.
4. **Re-introduce raw Radix color refs** (`text-amber-10`, `text-green-10`) where the project's newly-landed `--success-foreground` / `--warning-foreground` tokens apply.
5. **Keep a `StatusBadge` wrapper** that only maps status → `<Badge variant=…>`. User has already asked to inline it.

Consequence: review burden, drift from the color-tokens contract, and the design system's primitives are undersold — it's easy to pattern-match "what did the previous file do" rather than "what's the canonical primitive."

## Proposed Solution

One PR per logical grouping (see Implementation below), driven by the per-file table in the Audit section. Each change:

- Swaps a raw element for the primitive that already exists.
- Migrates any raw Radix color to the canonical semantic token when the visual intent matches.
- Registers an exemption only when the visual intent provably doesn't fit a canonical token.

**Out of scope** (explicitly, to keep blast radius bounded):

- No new primitives in `web/components/ui/*`.
- No new wrapper components in `web/components/posts/*` (e.g. no `<EyebrowLabel>`, no `<SelectableCard>`). User directive: reuse primitives, don't build more.
- No changes to `web/containers/*` beyond removing `StatusBadge` imports + inlining the mapping.
- PostPreview's phone-mimic chrome stays raw (intentionally non-canonical per [color-tokens.md:139-141](../architecture/color-tokens.md)).
- RichTextEditor's `editorProps.attributes.class` stays hand-rolled — that's the Tiptap API, not a primitive gap.

## Audit: current state + proposed refactor per file

Legend — **Risk**: L=low (mechanical, no visual shift), M=medium (visible shift or non-trivial rewiring), H=high (touches ProseMirror or Base UI `render` plumbing).

| File                                                                                | Primitives today                                          | Issues                                                                                                                                                                                                                                                                                                                                                                                        | Proposed                                                                                                                                                                                                                                                                                                                                                                                                                        | Risk |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| [StatusBadge.tsx](../../web/components/posts/StatusBadge.tsx)                       | `Badge`                                                   | Wrapper-only component; maps 4 statuses → `{label, variant}`                                                                                                                                                                                                                                                                                                                                  | **Delete.** Inline `<Badge variant="...">{label}</Badge>` at 3 call sites; put the `PGStatus → {label, variant}` map as a tiny exported const in `data/mock-pg-announcements.ts` (same file that defines `PGStatus`).                                                                                                                                                                                                           | L    |
| [AnnouncementCard.tsx](../../web/components/posts/AnnouncementCard.tsx)             | `Card`, `CardContent`, `Separator`                        | Already clean. `p-5` override on `CardContent` is intentional (tighter than Card's default `py-6`).                                                                                                                                                                                                                                                                                           | **No change.**                                                                                                                                                                                                                                                                                                                                                                                                                  | —    |
| [ReadRate.tsx](../../web/components/posts/ReadRate.tsx)                             | `Progress`                                                | Clean.                                                                                                                                                                                                                                                                                                                                                                                        | **No change.**                                                                                                                                                                                                                                                                                                                                                                                                                  | —    |
| [ResponseTypeSelector.tsx](../../web/components/posts/ResponseTypeSelector.tsx)     | `RadioGroup`, `RadioGroupItem`, `Label`                   | Raw `<label>` wraps `RadioGroupItem` + `Label` — idiomatic (native label association); not a primitive gap.                                                                                                                                                                                                                                                                                   | **No change.**                                                                                                                                                                                                                                                                                                                                                                                                                  | —    |
| [SplitPostButton.tsx](../../web/components/posts/SplitPostButton.tsx)               | `Button`, `DropdownMenu*` (via `render={<Button ... />}`) | `border-white/20` raw ref on the split-chevron divider.                                                                                                                                                                                                                                                                                                                                       | Swap `border-white/20` → `border-primary-foreground/20` (`--primary-foreground` is `#ffffff`).                                                                                                                                                                                                                                                                                                                                  | L    |
| [ReadTrackingCards.tsx](../../web/components/posts/ReadTrackingCards.tsx)           | `Card`, `CardContent`, `Progress`                         | `text-amber-10` on the "unread" subline. `bg-twblue-3 text-primary` icon halo — brand tint, already exempted.                                                                                                                                                                                                                                                                                 | Swap `text-amber-10` → `text-warning-foreground` (shifts amber-10 → amber-11, ~1 step darker). Keep brand tint exemption.                                                                                                                                                                                                                                                                                                       | L    |
| [RichTextEditor.tsx](../../web/components/posts/RichTextEditor.tsx)                 | —                                                         | Tiptap primitive; `editorProps.attributes.class` is the API surface.                                                                                                                                                                                                                                                                                                                          | **No change.**                                                                                                                                                                                                                                                                                                                                                                                                                  | —    |
| [RichTextToolbar.tsx](../../web/components/posts/RichTextToolbar.tsx)               | —                                                         | 16 hand-rolled `<button>` elements (`ToolbarButton`) with `onMouseDown preventDefault` to preserve ProseMirror selection. Square 28×28, `aria-pressed` active state. `bg-slate-2` wrapper (sidebar-color bleed, already exempted).                                                                                                                                                            | Replace `<button>` with `<Button variant="ghost" size="icon-xs" className="size-7 rounded" data-active={active} onMouseDown={e=>e.preventDefault()}>`. `size-7` overrides the `size-6` from `size="icon-xs"`; `rounded` overrides `rounded-full`; data-active drives the active bg via `data-active:bg-accent` (already canonical on primitives). `onMouseDown preventDefault` MUST be preserved or selection is lost on click. | H    |
| [PostTypePicker.tsx](../../web/components/posts/PostTypePicker.tsx)                 | —                                                         | Two raw card-shaped `<button>` elements with brand-tinted hover (`hover:border-blue-6 hover:bg-blue-2/50`). Not a fit for `Card` (different radius) or `Button` (pill).                                                                                                                                                                                                                       | **No change.** Card-shaped button is not a canonical shadcn primitive; a new primitive would violate "no new wrapper components." Keep the brand-tint exemptions.                                                                                                                                                                                                                                                               | —    |
| [RecipientSelector.tsx](../../web/components/posts/RecipientSelector.tsx)           | `Badge`, `Checkbox`                                       | `<div className="space-y-4 rounded-xl border p-4">` wrapper.                                                                                                                                                                                                                                                                                                                                  | Swap wrapper to `<Card size="sm" className="p-4 space-y-4">`. **Visual shift:** Card is `rounded-3xl`, current is `rounded-xl` — larger radius. If unwanted, keep raw.                                                                                                                                                                                                                                                          | M    |
| [QuestionBuilder.tsx](../../web/components/posts/QuestionBuilder.tsx)               | `Button`, `Input`                                         | Per-question `<div className="space-y-3 rounded-xl border p-4">`. Same radius mismatch as RecipientSelector.                                                                                                                                                                                                                                                                                  | Same decision: swap to `<Card size="sm">` (accepts rounded-3xl) or leave raw. Choose **one policy** and apply consistently to both files.                                                                                                                                                                                                                                                                                       | M    |
| [AttachmentSection.tsx](../../web/components/posts/AttachmentSection.tsx)           | `Button`                                                  | No `<Card>` wrapper in the file itself — the border shown in the showcase lives on the **ComponentsView** demo wrapper (`max-w-md rounded-xl border p-4` at [ComponentsView.tsx](../../web/containers/ComponentsView.tsx) around the AttachmentSection demo).                                                                                                                                 | Swap the **showcase** wrapper in ComponentsView.tsx (not AttachmentSection.tsx) to `<Card size="sm" className="max-w-md p-4">`. AttachmentSection itself unchanged.                                                                                                                                                                                                                                                             | L    |
| [PostPreview.tsx](../../web/components/posts/PostPreview.tsx)                       | `Button`                                                  | `border-2 border-slate-12` phone chrome — intentional high-contrast border, already exempted.                                                                                                                                                                                                                                                                                                 | **No change.**                                                                                                                                                                                                                                                                                                                                                                                                                  | —    |
| [SchedulePickerDialog.tsx](../../web/components/posts/SchedulePickerDialog.tsx)     | `Button`, `Dialog*`, `Select*`                            | `<div className="rounded-xl border p-3">` around the `DayPicker`.                                                                                                                                                                                                                                                                                                                             | Swap to `<Card size="sm" className="p-3">`. Same radius-shift as RecipientSelector / QuestionBuilder — group the decision.                                                                                                                                                                                                                                                                                                      | M    |
| [SendConfirmationDialog.tsx](../../web/components/posts/SendConfirmationDialog.tsx) | `Button`, `Dialog*`                                       | Clean.                                                                                                                                                                                                                                                                                                                                                                                        | **No change.**                                                                                                                                                                                                                                                                                                                                                                                                                  | —    |
| [RecipientReadTable.tsx](../../web/components/posts/RecipientReadTable.tsx)         | `Badge`, `Button`, `Input`, `Table*`                      | (a) `Badge className="bg-green-3 text-green-11 hover:bg-green-3"` for "Yes" — duplicates `<Badge variant="success">`. (b) `bg-destructive/10 text-destructive` for "No" — duplicates `<Badge variant="destructive">`. (c) Inline status text: `text-green-10` / `text-amber-10` on Read/Unread spans. (d) `text-green-10` on ack checkmark. (e) `rounded-xl border` wrapper around `<Table>`. | (a) `<Badge variant="success">Yes</Badge>`. (b) `<Badge variant="destructive">No</Badge>`. (c) `text-green-10` → `text-success-foreground`, `text-amber-10` → `text-warning-foreground` (1-step darker shift in each). (d) Same swap for the ack check. (e) `<Card size="sm" className="overflow-x-auto p-0">` around `<Table>` — or keep raw and register exemption.                                                           | M    |

## Technical Considerations

**Base UI `render` prop, not `asChild`.** Every primitive composition in this repo uses Base UI's `render={<Primitive .../>}` pattern ([button.tsx:1](../../web/components/ui/button.tsx), example at [SplitPostButton.tsx:49-57](../../web/components/posts/SplitPostButton.tsx)). Any swap in RichTextToolbar that tries to "use Button inside the toolbar" should render `<Button>` directly, not try to force an `asChild`-style wrapper.

**RichTextToolbar risk.** This is the highest-risk swap. The 16 existing `<button>`s intentionally don't use `Button` because:

- Toolbar buttons must preserve `onMouseDown={(e) => e.preventDefault()}` — without it, clicking the button moves focus out of the ProseMirror editor and the selection is lost before the command runs ([RichTextToolbar.tsx:48](../../web/components/posts/RichTextToolbar.tsx)).
- `Button` is `rounded-full` pill-shaped; toolbar is square `rounded` (4px).
- `size="icon-xs"` is `size-6` (24px); toolbar is `h-7 w-7` (28px).
- Active state is driven by `aria-pressed`; `Button` doesn't wire that to background.

Workable path: swap the `<button>` for `<Button>`, pass `onMouseDown`, override size/radius with classNames, and use a `data-active` attribute whose style is added locally. Before starting, add a Storybook-free smoke test: open RichTextEditor in the dev preview, click Bold mid-sentence, verify the word goes bold and the caret stays in place.

**Radius mismatch.** `Card` is `rounded-3xl`. Posts components use `rounded-xl` for inner containers (question cards, recipient lists, calendar wrapper). Three options:

1. **Accept the radius shift** — consistent with the design system. Recommended unless visual design pushes back.
2. **Keep raw** — add `className="rounded-xl border p-4"` at each site. Small ongoing drift.
3. **Add a `size` or `radius` variant to `Card`** — violates "no new primitives" but is the only way to keep both consistent composition and the current radius.

Default recommendation: **option 2** (keep raw for the three rounded-xl containers), because the shift from `rounded-xl` (12px) to `rounded-3xl` (24px) is visually large and the cards are small.

**Color-token compliance.** The newly-landed `--success`/`--warning`/`--info` tokens (from this session's work) map to `--green-3/--green-11`, `--amber-3/--amber-11`, `--blue-3/--blue-11`. Existing raw refs at `text-green-10`, `text-amber-10`, `text-green-11`, `bg-green-3` either match or shift by one step. Swap where the scale-11 value is acceptable; register an exemption only when the scale-10 is load-bearing (e.g. contrast-tuned icon color).

## System-Wide Impact

**Interaction graph:**

- `StatusBadge` removal → 3 call sites update (PostsView:220, PostDetailView:84, ComponentsView:525–527) → `data/mock-pg-announcements.ts` gains a small `STATUS_BADGE: Record<PGStatus, {label, variant}>` export.
- RichTextToolbar swap → editor state unchanged; `RichTextEditor.tsx` doesn't need to change.
- Card swaps → no runtime wiring changes; the primitive just renders a styled div.

**Error propagation:** No API surface changes. No new failure modes.

**State lifecycle:** None affected.

**API surface parity:** None — these are internal components, not exported outside `web/`.

**Integration test scenarios:**

1. RichTextEditor: bold/italic/link a selection, verify selection persists and format applies (manual in dev preview — there are no frontend tests per [CLAUDE.md](../../CLAUDE.md)).
2. StatusBadge inline: verify each of 4 statuses renders the right color (posted=success, scheduled=info, posting=info, draft=secondary).
3. RecipientReadTable: verify "Yes" and "No" badges match the variant colors and don't change hover behavior.

## Acceptance Criteria

### Per-file

- [ ] `StatusBadge.tsx` deleted; 3 call sites migrated; status map lives in `data/mock-pg-announcements.ts`.
- [ ] `SplitPostButton.tsx`: `border-white/20` → `border-primary-foreground/20`.
- [ ] `ReadTrackingCards.tsx`: `text-amber-10` → `text-warning-foreground`.
- [ ] `RichTextToolbar.tsx`: 16 `<button>`s replaced with `<Button variant="ghost">` preserving `onMouseDown preventDefault` and `aria-pressed`. Active state renders visually identical to current.
- [ ] `RecipientReadTable.tsx`: "Yes"/"No" inline badges use `variant="success"` / `variant="destructive"`; read/unread span text uses semantic tokens.
- [ ] `ComponentsView.tsx` AttachmentSection demo wrapper: `<div className="max-w-md rounded-xl border p-4">` → `<Card size="sm" className="max-w-md p-4">`.
- [ ] Decision recorded on the radius-mismatch question (accept shift vs keep raw) — applied consistently to RecipientSelector, QuestionBuilder, SchedulePickerDialog, RecipientReadTable.

### Quality gates

- [ ] `pnpm exec tsc -b --noEmit` clean.
- [ ] `sh scripts/check-raw-colors.sh` clean — no new raw refs unregistered; exemption registry net-decreases or stays flat.
- [ ] `pnpm format` clean on tracked files.
- [ ] Manual browser verification: ComponentsView showcase renders each affected component without visual regression beyond the documented radius/scale shifts.
- [ ] RichTextEditor smoke test: bold-while-selected preserves selection and applies.
- [ ] `docs/architecture/color-tokens.md` updated if new exemptions register or old ones resolve.

## Success Metrics

- Net count of raw `<div className="rounded-xl border">` instances in `web/components/posts/*` reduced (current: 4; target: 0 or 4 with clear decision).
- Exemption registry size steady or reduced (currently ~18 non-badge status entries — target: unchanged; badge-related entries removed).
- Zero new ESLint warnings.
- Zero regressions reported in a manual pass of CreatePostView, PostsView, PostDetailView.

## Implementation Phases

Small PRs, mergeable independently. Order chosen for low-risk-first so mistakes are cheap.

### Phase 1 — Mechanical cleanup (low risk)

1. Delete `StatusBadge.tsx`, inline at the 3 call sites, add status map export in `data/mock-pg-announcements.ts`.
2. `SplitPostButton` border-white fix.
3. `ComponentsView` AttachmentSection wrapper → `<Card size="sm">`.
4. Decide and apply the radius policy for RecipientSelector / QuestionBuilder / SchedulePickerDialog.

### Phase 2 — Semantic-token migration (low-to-medium risk)

1. `ReadTrackingCards` amber-10 → warning-foreground.
2. `RecipientReadTable`: Yes/No badges to variants, inline status text to semantic tokens, ack/check icon colors.
3. Update exemption registry: remove `RecipientReadTable.tsx:121` (Yes badge), trim any now-resolved entries. Update `docs/architecture/color-tokens.md` mapping table if needed.

### Phase 3 — RichTextToolbar migration (high risk)

Isolated PR. Steps:

1. Replace `ToolbarButton` internals with `<Button variant="ghost" size="icon-xs" className="size-7 rounded" data-active={active} onMouseDown={e=>e.preventDefault()}>`.
2. Add a local CSS hook for `data-active:bg-accent data-active:text-foreground` — or use `aria-pressed:bg-accent` if Tailwind v4 supports the attribute selector (verify with `pnpm build`).
3. Manual smoke test: Bold, Italic, Link, Highlight, AlignCenter, BulletList, H1. For each, select existing text and click; verify format applies, selection persists, `aria-pressed` flips.
4. Screenshot before/after side-by-side — catch any pixel-level drift.

## Dependencies & Risks

**Depends on:**

- Canonical Badge/Button variant set established this session (PR in flight — `feat/posts-frontend` branch).
- `--success`/`--warning`/`--info` tokens declared in `web/App.css` (this session).
- The `pnpm check:colors` script + `scripts/raw-color-exemptions.txt`.

**Risks:**

- **RichTextToolbar** is the only place where a refactor could genuinely break behavior — ProseMirror focus model is subtle. Mitigation: isolate to its own PR, manual smoke tests.
- **Card radius shift** (rounded-xl → rounded-3xl) will be visible. Mitigation: default to keeping `rounded-xl` raw; document as intentional.
- **Amber-10 → amber-11 shift** is ~8% darker. Mitigation: acceptable in a scale-based design system; flag to designer in PR.

## Sources & References

### Internal

- [docs/architecture/color-tokens.md](../architecture/color-tokens.md) — token contract, exemption policy.
- [scripts/raw-color-exemptions.txt](../../scripts/raw-color-exemptions.txt) — current raw-color exemptions.
- [docs/plans/2026-04-18-001-refactor-consolidate-color-refs-behind-shadcn-tokens-plan.md](./2026-04-18-001-refactor-consolidate-color-refs-behind-shadcn-tokens-plan.md) — prior refactor that landed the semantic-token substrate this plan leans on.
- [web/components/ui/index.ts](../../web/components/ui/index.ts) — primitive barrel.
- [web/containers/CreatePostView.tsx](../../web/containers/CreatePostView.tsx) — canonical composition pattern (`<Card><CardContent>`).

### External

- Tiptap "toolbar" pattern: <https://tiptap.dev/docs/editor/getting-started/style-editor#editor-with-styling> — documents `onMouseDown preventDefault` requirement.
- Base UI `useRender` / `render` prop: <https://base-ui.com/react/handbook/composition>.
- shadcn Badge/Button canonical variants: verified this session via shadcn v4 docs.

### Related

- This refactor naturally follows PR #143 (the color-tokens consolidation that just closed against upstream).
- No open issues to link — session context only.
