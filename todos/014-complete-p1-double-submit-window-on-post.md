---
status: complete
priority: p1
issue_id: 014
tags: [code-review, races, react, ux]
dependencies: []
---

# `handleSendConfirm` opens a 150ms double-submit window via `setTimeout`

## Problem Statement

`handleSendConfirm` in `CreatePostView.tsx` wraps the post-success navigation in `setTimeout(() => navigate('/posts'), 150)` with the comment claiming it keeps `isSaving=true` until navigation completes. In practice, React's state cascade resolves before the 150ms timer fires, so `isSaving` flips false and the **Post** button becomes re-enabled. A teacher who double-taps out of habit hits the success toast, taps again within 150ms → a second `createAnnouncement` / `createConsentForm` fires → duplicate post lands in parents' phones. At 800 parents × two push notifications per accidental duplicate, this is a felt UX bug.

## Findings

**julik-frontend-races-reviewer:**

> The comment at `:705` claims "Keep isSaving=true until navigation completes" — but the `setTimeout(navigate, 150)` is fire-and-forget, so `isSaving` flips to `false` at the end of the microtask queue via the React state cascade after `notify.success`. The teacher mashes Post, sees the toast, mashes it again within 150ms out of habit → second `createAnnouncement`/`createConsentForm` fires, a duplicate post materialises, their phone buzzes twice.
>
> **Fix:** drop the `setTimeout`, `await navigate('/posts')` (or call synchronously — RR v7 navigations are atomic) and leave `isSaving` true in the success path.

**Related — schedule path has the same class of bug, smaller window:** `handleScheduleConfirm` navigates immediately but hits `finally { setIsSaving(false) }` — same race, just tighter.

**Locations:**

- `web/containers/CreatePostView.tsx:694-718` (`handleSendConfirm` — the 150ms window)
- `web/containers/CreatePostView.tsx:~682, :690` (`handleScheduleConfirm` — tighter but same class)

## Proposed Solutions

### Option A — State machine (recommended)

Replace the boolean `isSaving` with a three-state variable:

```tsx
type SaveState = 'idle' | 'submitting' | 'submitted';
const [saveState, setSaveState] = useState<SaveState>('idle');

async function handleSendConfirm() {
  if (saveState !== 'idle') return; // hard guard
  setSaveState('submitting');
  try {
    await createAnnouncement(payload); // or createConsentForm
    setSaveState('submitted');
    notify.success('Post sent.');
    navigate('/posts'); // no setTimeout; leave saveState = 'submitted' until unmount
  } catch (err) {
    setSaveState('idle');
    // existing error handling
  }
}
```

**Pros:** impossible double-submit; no timers. **Cons:** one more state value; `finally` pattern reshapes. **Effort:** Small. **Risk:** Low.

### Option B — Keep `isSaving`, drop the `setTimeout`

```tsx
await createAnnouncement(payload);
notify.success('Post sent.');
navigate('/posts'); // isSaving stays true; unmount resets
```

Remove the error-path `setIsSaving(false)` only on success. On error, reset normally.

**Pros:** minimal diff. **Cons:** subtle — depends on navigation unmounting the component before React re-renders; empirically true for RR v7, but fragile. **Effort:** Small. **Risk:** Medium (depends on RR behaviour).

### Option C — `useTransition` with pending state

Wrap submit in `useTransition` and key the button on `isPending`.

**Pros:** idiomatic React 19. **Cons:** overkill for a hard-guard race. **Effort:** Medium. **Risk:** Low.

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**

- `web/containers/CreatePostView.tsx:694-718` (send path)
- `web/containers/CreatePostView.tsx:~666-690` (schedule path — apply same fix)

## Acceptance Criteria

- [ ] Rapid double-tap on Post button issues exactly one POST
- [ ] Success path navigates without delay
- [ ] Error path re-enables the button
- [ ] Manual smoke: click Post, see toast, verify second click before navigation is ignored
- [ ] Applies to both send and schedule paths

## Work Log

_(add entries as work progresses)_

## Resources

- Review: julik-frontend-races-reviewer
- React Router v7 navigation semantics: https://reactrouter.com/
