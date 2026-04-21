---
status: complete
priority: p2
issue_id: 020
tags: [code-review, timezone, races]
dependencies: []
---

# Timezone handling: DST foot-gun + non-SGT teacher semantics

## Problem Statement

Two related timezone issues in `EventScheduleSection` and the wire-boundary mappers:

1. **DST foot-gun.** `addHoursToLocal` builds `new Date(y, mo-1, d, h, mi)` in the browser's local TZ, calls `setHours(+1)`, formats back to a naive string. On spring-forward days (e.g. a London-based tester on 30 Mar 2026), 01:30 → `setHours(+1)` skips to 03:30 (the 02:30 hour doesn't exist locally). That naive string then gets stamped with `+08:00` by `localDateTimeToSgtIso` as if it were SGT. Singapore has no DST so this doesn't bite SG users today — but any remote testing / future non-SGT deployment silently corrupts event times.
2. **Non-SGT user semantics.** A teacher typing `09:00` on a non-SGT browser has `localDateTimeToSgtIso` stamp `+08:00` onto their local-time string. The mapper's inverse (`sgtIsoToLocalDateTime` using `Intl` in `Asia/Singapore`) re-displays in SGT on reload — numerically lossless for SGT-resident users, but a London teacher who typed "09:00 expecting local" sees their event re-display as 09:00 but means 09:00 SGT (= 01:00 UTC). No UI indicates this.

## Findings

**julik-frontend-races-reviewer (Issue 1, P2):**

> `addHoursToLocal` builds a `new Date(y, mo-1, d, h, mi)` in the _browser's_ local TZ, then `setHours(+1)`, then formats back to a naive string that `localDateTimeToSgtIso` will stamp with `+08:00`. For a teacher in London on the British-summertime spring-forward day, start=01:30 → `setHours(+1)` produces 03:30 local (skipping 02:30), which gets stamped as `03:30+08:00` — not what the user asked for.
>
> **Fix:** do the arithmetic as pure string math (parse H:M, add 1, handle carry on 24, bump date string). No `Date` anywhere near naive SGT strings.

**architecture-strategist (Issue 2, P2):**

> A London teacher typing `09:00` stores "09:00 SGT" and sees "09:00" on edit — lossless numerically, but they _thought_ they were typing local. The helper pair is correct for SGT-resident teachers; the plan acknowledges this. Document this constraint at the input-level component with a "(SGT)" label; otherwise future MOE ops outside SG fires a bug.

## Proposed Solutions

### Option A — String arithmetic for `addHoursToLocal` + "(SGT)" labels (recommended)

1. Replace `addHoursToLocal` with pure string math:

```ts
function addHoursToLocal(local: string): string {
  // local = 'YYYY-MM-DDTHH:MM'
  const [date, time] = local.split('T');
  const [h, m] = time.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  let nextH = h + 1;
  let nextD = d;
  if (nextH >= 24) {
    nextH = 0;
    nextD += 1;
  } // Phase 1: day carry
  // Don't need month carry for "+1h" — event windows are hours, not days
  return `${y}-${String(mo).padStart(2, '0')}-${String(nextD).padStart(2, '0')}T${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
```

No `Date`, no TZ math.

2. Add "(SGT)" to the field labels in `EventScheduleSection`, `DueDateSection`, `ReminderSection`.

**Pros:** eliminates DST risk; surfaces the SGT anchor to users. **Cons:** string math for a trivial operation reads unusual. **Effort:** Small. **Risk:** Low.

### Option B — Only fix the DST math

Skip the label change; just do the string arithmetic.

**Pros:** minimal diff. **Cons:** non-SGT confusion remains. **Effort:** Small. **Risk:** Low.

### Option C — Store full ISO with user's TZ offset, convert on display

Major refactor: let each teacher type in their own TZ, carry offset on the wire, render in SGT on parent side.

**Pros:** correct semantics for all users. **Cons:** large scope; PG may not accept non-SGT offsets; breaks wire contract. **Effort:** Large. **Risk:** High. **Defer.**

## Recommended Action

<!-- Filled during triage — likely Option A -->

## Technical Details

**Affected files:**

- `web/components/posts/EventScheduleSection.tsx:18-32` (`addHoursToLocal`)
- `web/components/posts/EventScheduleSection.tsx`, `DueDateSection.tsx`, `ReminderSection.tsx` (add (SGT) labels)
- `web/api/mappers.ts:478` (add a comment citing the constraint)

## Acceptance Criteria

- [ ] `addHoursToLocal` has no `Date` constructor usage
- [ ] Field labels for event start/end, due date, and reminder date carry `(SGT)` suffix
- [ ] Manual smoke: set browser TZ to Europe/London, enter 01:30 on 30 Mar 2026, verify end auto-adjusts to 02:30 (not 03:30)

## Work Log

_(add entries as work progresses)_

## Resources

- Reviews: julik-frontend-races-reviewer, architecture-strategist
