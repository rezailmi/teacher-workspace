---
status: complete
priority: p2
issue_id: 027
tags: [code-review, patterns, duplication]
dependencies: []
---

# Asymmetric recipient mappers: `mapAnnouncementDetail` vs `mapConsentFormDetail`

## Problem Statement

Both detail mappers construct recipient objects inline with overlapping keys (`studentId`, `studentName`, `classLabel`) and kind-specific tails. The two paths are visibly similar but not structurally factored — a new reader has to eyeball both to see which fields are shared and which are kind-specific. When PG adds a new shared field (e.g. `parentContactNumber`), two files must update in lockstep.

## Findings

**pattern-recognition-specialist:**

> `mapAnnouncementDetail` at `web/api/mappers.ts:79-85` returns `{readStatus, respondedAt}` for announcements; `mapConsentFormDetail` at `web/api/mappers.ts:232-238` returns `{response, respondedAt}` for forms. Both mappers each construct their own recipient object inline, with different keys. Extract a shared `buildRecipientBase(s)` that returns `{studentId, studentName, classLabel}` so the two paths visibly differ only in their response half.

**Locations:**

- `web/api/mappers.ts:79-85` (`mapAnnouncementDetail` recipients)
- `web/api/mappers.ts:232-238` (`mapConsentFormDetail` recipients)

## Proposed Solutions

### Option A — Extract `buildRecipientBase` (recommended)

```ts
function buildRecipientBase(s: PGApiAnnouncementStudent | PGApiConsentFormStudent) {
  return {
    studentId: String(s.studentId),
    studentName: s.studentName,
    classLabel: s.className,
  };
}

// In mapAnnouncementDetail:
const recipients: PGRecipient[] = detail.students.map((s) => ({
  ...buildRecipientBase(s),
  readStatus: s.isRead ? 'read' : 'unread',
  respondedAt: undefined,
}));

// In mapConsentFormDetail:
const recipients: PGConsentFormRecipient[] = detail.students.map((s) => ({
  ...buildRecipientBase(s),
  response: s.response,
  respondedAt: s.respondedAt,
}));
```

**Pros:** the divergence is visible at the call site (kind-specific tail only); adding a shared field updates one helper. **Cons:** one more small helper. **Effort:** Small. **Risk:** None.

### Option B — Extract a generic `mapStudentsToRecipients<T>(students, kindSpecific)` higher-order

Overkill for two call sites. **Reject.**

## Recommended Action

<!-- Filled during triage — Option A -->

## Technical Details

**Affected files:** `web/api/mappers.ts:79-85, :232-238`

## Acceptance Criteria

- [ ] `buildRecipientBase` extracted and reused in both mappers
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Review: pattern-recognition-specialist
