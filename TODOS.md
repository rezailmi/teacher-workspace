# TODOs

## ESLint no-restricted-imports rule for Flow DS wrappers

Enforce that `Button`, `Badge`, `Input`, `Tabs*`, `Table*`, `DropdownMenu*` are imported from `~/components/ui`, not `@flow/core` directly. Without this rule, the wrapper convention is documentation-only and a developer can accidentally bypass project-level overrides (pill radius, font-weight).

**Context:** The `~/components/ui` wrappers apply project-specific styling defaults. Sidebar components intentionally import directly from `@flow/core` and should be excluded from the rule. `cn`, `Typography`, `Tooltip*`, and `TooltipProvider` have no wrappers and should remain importable from `@flow/core`.
