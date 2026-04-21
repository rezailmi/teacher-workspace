# Color tokens — placeholder

> **Status:** stub. The full contract has not been written — see [todos/010-complete-p3-color-tokens-architecture-doc.md](../../todos/010-complete-p3-color-tokens-architecture-doc.md).

Until this doc is filled in, the **[2026-04-18 color-tokens refactor plan](../plans/2026-04-18-001-refactor-consolidate-color-refs-behind-shadcn-tokens-plan.md) serves as the canonical contract** for:

- The canonical shadcn semantic tokens in use (`--background`, `--foreground`, `--muted`, `--accent`, `--destructive`, `--sidebar-*`, `--success`, `--warning`, etc.).
- The exemption policy — raw Radix color refs are gated by [scripts/check-raw-colors.sh](../../scripts/check-raw-colors.sh) against [scripts/raw-color-exemptions.txt](../../scripts/raw-color-exemptions.txt).
- The **graduation rule**: if an exempt pattern hits 3+ call sites, open a follow-up plan to evaluate a project-local token.
- Sidebar carve-out (Phase 2) and destructive-intent narrowing (Phase 3) — see the plan.

Other inbound links that will resolve here once this doc is written:

- `docs/plans/2026-04-18-001-…` Risks 4 + 7, Acceptance criteria.
- `docs/plans/2026-04-18-002-…` Overview, PostPreview exemption note, Sources, Verification.
- `todos/005-*`, `todos/009-*` — sidebar-token coupling + `bg-slate-4` mapping rule.
