---
status: complete
priority: p2
issue_id: 024
tags: [code-review, simplicity, duplication]
dependencies: []
---

# `textToTiptapDoc` duplicated across container and mappers

## Problem Statement

The helper that wraps a plain-text string in a minimal Tiptap document (for the editor's `initialContent`) has identical implementations in two files. A comment in `mappers.ts` even acknowledges the duplication as deliberate — but "deliberate duplication" across a wire-boundary utility is the classic drift trap. If the Tiptap schema changes, the two copies will diverge silently.

## Findings

**code-simplicity-reviewer:**

> `textToTiptapDoc` duplicated across boundary. Identical body at `CreatePostView.tsx:388-398` and `mappers.ts:536-546`. Export one from `mappers.ts` (or `helpers/tiptap.ts`) and import into the container — the comment at `mappers.ts:534` even acknowledges the duplication as deliberate.

**Locations:**

- `web/containers/CreatePostView.tsx:388-398`
- `web/api/mappers.ts:536-546`

## Proposed Solutions

### Option A — Export from `mappers.ts`, import in container (recommended)

Add `export` to the `mappers.ts` copy, delete the container copy, update the import.

**Pros:** minimal diff; one canonical helper. **Cons:** `mappers.ts` isn't an obvious home for a Tiptap utility. **Effort:** Small. **Risk:** None.

### Option B — Extract to `web/helpers/tiptap.ts` (cleanest)

New file co-locating Tiptap helpers (`textToTiptapDoc`, `extractTextFromTiptap` which currently also lives in `mappers.ts`). Both `mappers.ts` and `CreatePostView.tsx` import from there.

**Pros:** Tiptap concerns live together; mappers stays PG-only. **Cons:** one new file. **Effort:** Small. **Risk:** None.

## Recommended Action

<!-- Filled during triage — Option B is cleaner -->

## Technical Details

**Affected files:**

- `web/containers/CreatePostView.tsx:388-398` (delete)
- `web/api/mappers.ts:536-546` (export, or move to helpers/tiptap.ts)
- `web/helpers/tiptap.ts` (new, if Option B)

## Acceptance Criteria

- [ ] Grep for `textToTiptapDoc` returns exactly one definition
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean
- [ ] `pnpm build` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: code-simplicity-reviewer
