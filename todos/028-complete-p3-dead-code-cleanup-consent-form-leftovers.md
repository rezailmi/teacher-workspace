---
status: complete
priority: p3
issue_id: 028
tags: [code-review, simplicity, yagni]
dependencies: []
---

# Dead code: `scheduleConsentFormDraft`, deprecated `mapConsentFormSummary`, `fetchSchoolGroups`, stale types

## Problem Statement

Several exports and types added during the slice have no importer. Leaving them ships unused surface area that readers will assume is load-bearing, widens the diff future readers need to understand, and breeds the illusion that e.g. the consent-form schedule path differs from the announcement one (it doesn't — `createConsentFormDraft` accepts `scheduledSendAt` directly).

## Findings

**code-simplicity-reviewer:**

> **`scheduleConsentFormDraft` never called.** `web/api/client.ts:339-341` plus the `PGApiScheduleConsentFormDraftPayload` import. `handleScheduleConfirm` only uses `createConsentFormDraft` / `updateConsentFormDraft`. Cut the export and its type until a caller exists.
>
> **Deprecated consent-form path, fully shadowed.** `mapConsentFormSummary` (`mappers.ts:145-150`), `ConsentFormListItem` + `loadConsentFormsList` (`client.ts:362-370`) are `@deprecated` with zero importers. Delete outright — no external boundary keeps them alive.
>
> **`fetchSchoolGroups` orphan + `PGApiSchoolGroups` orphan** after the `/groups` narrowing. Only `fetchSchoolClasses` (which narrows to `.class`) is actually consumed. Drop the wide fetcher and the unused type.

**Locations:**

- `web/api/client.ts` — `scheduleConsentFormDraft`, `loadConsentFormsList`, `ConsentFormListItem`, `fetchSchoolGroups`
- `web/api/mappers.ts:145-150` — `mapConsentFormSummary` (deprecated)
- `web/api/types.ts` — `PGApiScheduleConsentFormDraftPayload`, `PGApiSchoolGroups`

## Proposed Solutions

### Option A — Delete all six unused items in one commit (recommended)

```
- scheduleConsentFormDraft (client.ts)
- PGApiScheduleConsentFormDraftPayload (types.ts)
- loadConsentFormsList (client.ts)
- ConsentFormListItem (client.ts)
- mapConsentFormSummary (mappers.ts)
- fetchSchoolGroups (client.ts)
- PGApiSchoolGroups (types.ts)
```

**Pros:** drops ~50 lines of never-imported surface; the slice's API profile becomes exactly what's used. **Cons:** if a follow-up slice needs any of these, re-add. **Effort:** Small. **Risk:** None — they have zero importers.

### Option B — Keep `scheduleConsentFormDraft` as parallel to `scheduleDraft`

Earlier phase rationale: "parallels announcement's `scheduleDraft` for a future flow where a teacher schedules an already-saved draft." If that flow is in the next slice's plan, keep it; otherwise delete.

**Verdict:** depends on near-term roadmap. If no concrete use case is named, delete per Option A.

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**

- `web/api/client.ts`
- `web/api/mappers.ts`
- `web/api/types.ts`

## Acceptance Criteria

- [ ] `grep -r "scheduleConsentFormDraft\|loadConsentFormsList\|ConsentFormListItem\|mapConsentFormSummary\|fetchSchoolGroups\|PGApiSchoolGroups\|PGApiScheduleConsentFormDraftPayload" web/` returns zero call-site references (definitions allowed only if we keep them per Option B)
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean
- [ ] `pnpm build` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: code-simplicity-reviewer
