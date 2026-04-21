---
status: complete
priority: p1
issue_id: 015
tags: [code-review, typescript, architecture]
dependencies: []
---

# `buildPostPayload` union return + `as` casts erase the `satisfies` guarantees

## Problem Statement

`buildPostPayload` in `mappers.ts` returns `PGApiCreateAnnouncementPayload | PGApiCreateConsentFormPayload`. The call sites in `CreatePostView.tsx` don't narrow the union — they cast with `as PGApiCreate{Announcement|ConsentForm}Payload` before passing to `createAnnouncement` / `createConsentForm`. This punches through the compile-time R4 allowlist (`satisfies`) that the mapper layer just earned: add a required field to `PGApiCreateConsentFormPayload` and the cast will happily ship a half-built announcement payload to `createConsentForm`. The slice's headline type-safety claim ("silent-drop bug closed at compile time") is undermined at the exact handoff where it matters most.

## Findings

**kieran-typescript-reviewer:**

> `buildPostPayload` returns `PGApiCreateAnnouncementPayload | PGApiCreateConsentFormPayload` — the one place the discriminant matters most — but the call sites cast with `as PGApiCreate*Payload` instead of narrowing on `state.kind`. That erases every guarantee `satisfies` just bought upstream. Fix: change `buildPostPayload`'s return type to overloaded signatures keyed on `state.kind`, or inline-dispatch (`const payload = state.kind === 'form' ? buildConsentFormPayload(state) : buildAnnouncementPayload(state)`) so the narrowing is structural, then drop the casts.

**architecture-strategist** (independent confirmation, P1):

> The combination of (a) `buildPostPayload` returning a `PGApiCreateAnnouncementPayload | PGApiCreateConsentFormPayload` union that's then `as`-cast at the call site, and (b) kind-branching _again_ in `handleSendConfirm` / `handleScheduleConfirm` to pick the mutation function, means the type system is not enforcing the payload→mutation pairing. Autosave, post-publish editing, and meetings will all add mutation functions and worsen this. Replace `buildPostPayload` returning a union with _two_ functions and a single switch in the container — or better, have the dispatcher return `{ kind, payload, submit, schedule }` so the container is pure dispatch.

**Related — `parsePostId` bypassed on delete path:**

> `await deleteConsentForm(row.id as ConsentFormId)` at `PostsView.tsx:154` — cast on what should be a branded invariant. `row.kind === 'form'` already implies the row came out of `mapConsentFormSummaryToPost`, whose IDs are always `cf_<digits>`. Brand `PGConsentFormPost.id: ConsentFormId` at the type level so the cast disappears.

**Locations:**

- `web/api/mappers.ts:676` (`buildPostPayload` union return)
- `web/containers/CreatePostView.tsx:662, 669, 700, 702` (the `as` casts)
- `web/containers/PostsView.tsx:154` (`row.id as ConsentFormId` delete cast)

## Proposed Solutions

### Option A — Inline dispatch at the call site (recommended)

Drop `buildPostPayload` entirely; have `handleSendConfirm` narrow on `state.kind` and call the right builder:

```tsx
async function handleSendConfirm() {
  if (state.kind === 'form') {
    const payload = buildConsentFormPayload(state); // typed as PGApiCreateConsentFormPayload
    await createConsentForm(payload); // callee expects exactly this
  } else {
    const payload = buildAnnouncementPayload(state); // typed as PGApiCreateAnnouncementPayload
    await createAnnouncement(payload); // callee expects exactly this
  }
}
```

TS narrows `state.kind` → the builder return type is precise → the mutation signature matches → no `as`. `buildAnnouncementPayload` and `buildConsentFormPayload` become exported from `mappers.ts`; `buildPostPayload` deletes.

**Pros:** zero casts, zero wrapper function, TS enforces the payload→mutation pairing at every call site. **Cons:** the container has the `state.kind` branch visible — arguably more explicit, arguably more coupling. **Effort:** Small. **Risk:** Low.

### Option B — Discriminated dispatcher returning a submit closure

```tsx
// mappers.ts
export function buildPostSubmission(state: PostFormState) {
  if (state.kind === 'form') {
    const payload = buildConsentFormPayload(state);
    return {
      kind: 'form' as const,
      submit: () => createConsentForm(payload),
      schedule: (at: string) => createConsentFormDraft({ ...payload, scheduledSendAt: at }),
    };
  }
  const payload = buildAnnouncementPayload(state);
  return {
    kind: 'announcement' as const,
    submit: () => createAnnouncement(payload),
    schedule: (at: string) => createDraft({ ...payload, scheduledSendAt: at }),
  };
}
```

Container becomes `const { submit } = buildPostSubmission(state); await submit()`.

**Pros:** the architect's recommendation; single source of payload→mutation truth. **Cons:** closures hide the underlying client call in the container, making debugging harder. **Effort:** Medium. **Risk:** Low.

### Option C — Function overloads on `buildPostPayload`

Keep the dispatcher but overload the signature so TS narrows on the input discriminant:

```ts
export function buildPostPayload(
  state: PostFormState & { kind: 'announcement' },
): PGApiCreateAnnouncementPayload;
export function buildPostPayload(
  state: PostFormState & { kind: 'form' },
): PGApiCreateConsentFormPayload;
export function buildPostPayload(
  state: PostFormState,
): PGApiCreateAnnouncementPayload | PGApiCreateConsentFormPayload {
  /* impl */
}
```

Call sites: `const payload = buildPostPayload(state)` — TS narrows when `state.kind` is already narrowed by a prior `if`.

**Pros:** keeps the dispatcher; enforces narrowing at call site. **Cons:** requires call sites to narrow `state.kind` before calling. **Effort:** Small. **Risk:** Low.

### Addendum — Brand `PGConsentFormPost.id`

Regardless of option chosen, change `PGConsentFormPost.id: string` → `PGConsentFormPost.id: ConsentFormId`. The mapper already produces `cf_<digits>` IDs; this is a pure type-level tightening with no runtime change. Drops the cast at `PostsView.tsx:154`.

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**

- `web/api/mappers.ts:676+` (`buildPostPayload` and its branches)
- `web/containers/CreatePostView.tsx:662, 669, 700, 702` (remove `as` casts)
- `web/containers/PostsView.tsx:154` (remove `as ConsentFormId` cast)
- `web/data/mock-pg-announcements.ts:191` (brand `PGConsentFormPost.id`)

## Acceptance Criteria

- [ ] No `as PGApiCreate*Payload` casts in containers
- [ ] No `as ConsentFormId` cast anywhere (verify with `grep -r "as ConsentFormId" web/`)
- [ ] Adding a required field to `PGApiCreateConsentFormPayload` fails the build at the call site (not just in the mapper)
- [ ] `pnpm exec tsc --noEmit -p tsconfig.app.json` clean
- [ ] `pnpm build` clean

## Work Log

_(add entries as work progresses)_

## Resources

- Reviews: kieran-typescript-reviewer, architecture-strategist
- TS discriminated-union narrowing: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
