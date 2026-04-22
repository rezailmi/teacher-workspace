# PGTW-5 Save as Draft + Autosave + Dirty-State Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can explicitly save a post draft (announcement or form) without scheduling it; drafts autosave every 30 s; closing the tab or the browser with unsaved changes prompts a warning.

**Architecture:** Reuse existing `createDraft`/`updateDraft` endpoints in [web/api/client.ts](../../web/api/client.ts). Add a **"Save draft"** button to the `CreatePostView` footer, a live "Saved at HH:MM" / "Saving…" indicator, a new `useAutoSave` hook (30 s interval + `AbortController` single-flight), and a new `useUnsavedChangesGuard` hook (`beforeunload` listener). After the first `createDraft` in create mode, `navigate('/posts/:id/edit', { replace: true })` so subsequent saves go through `updateDraft`.

**Tech Stack:** React 19, React Router 7, TypeScript 6, `sonner` (via `notify` helper), `AbortController`, Tiptap (existing), Tailwind 4. No frontend test framework today — verification is manual in the browser (Vite dev server on port 5173).

---

## Context

PGTW-5 is the highest-leverage parity gap in the PGTW-1..12 scope (see [docs/audits/pgtw-1-12-parity-scope.md](../../docs/audits/pgtw-1-12-parity-scope.md)). Today there is **no** explicit "Save draft" action — drafts can only be created via the "Schedule for later" split-button path, which forces a scheduled send time. The May audit flagged lack of autosave as **high — data-loss risk**. We also have no dirty-state guard, so teachers who hit Back mid-compose lose the whole form.

**Constraint:** PGW backend is untouchable (see the memory note). All work is in the `tw-pg-experiment` repo. The `createDraft`/`updateDraft` endpoints on our Go BFF already exist and map to PGW. No Go changes are in scope for this plan — session-extend suppression (`X-No-Extend-Session` / PGW's `REQUEST_HEADER_NO_EXTEND`) is deferred because our proxy at `server/internal/pg/proxy.go:35-52` doesn't currently forward client headers; that's a Phase B task. For dev/test, autosave will keep the session alive, which is acceptable until we hit real session-expiry in staging.

**Intended outcome:** A teacher opens `/posts/new`, types, sees "Saving…" → "Saved 9:41 AM" without clicking anything, can hit "Save draft" to save on demand, and is warned if they try to leave with unsaved edits. A fresh load of `/posts/:id/edit` for that draft shows the same content.

---

## File Structure

**New files**

- `web/hooks/useAutoSave.ts` — interval-based autosave hook with `AbortController` single-flight; exposes `{ status, lastSavedAt, saveNow }`.
- `web/hooks/useUnsavedChangesGuard.ts` — `beforeunload` listener toggled by `isDirty` boolean.

**Modified files**

- `web/api/client.ts` — extend `mutateApi`, `createDraft`, `updateDraft` to accept an optional `AbortSignal`.
- `web/containers/CreatePostView.tsx` — add Save-draft button + status ticker; wire both hooks; handle first-save navigation.

**Untouched on purpose**

- `web/api/types.ts` — payload types already cover drafts.
- `server/internal/pg/proxy.go` — Phase B.
- `web/components/posts/SplitPostButton.tsx` — no changes; Save-draft is a separate button next to it.

---

## Task 0 — Preflight

**Files:** none.

- [ ] Confirm branch is `feat/posts-frontend` and working tree is clean (`git status`). The branch has 20+ pending staged doc renames from an earlier reorganization; leave them alone — every commit in this plan uses `git commit -- <path>` with explicit paths so those renames stay in the index.
- [ ] Start the Vite dev server in another terminal (`pnpm dev`) and keep it running; the plan assumes you'll flip to the browser for every verify step.
- [ ] Open two browser tabs: `http://localhost:5173/posts/new` and `http://localhost:5173/posts` (the list). The second is for verifying that saved drafts appear after save.

---

## Task 1 — Thread `AbortSignal` through the API client

**Why:** Autosave needs to cancel an in-flight request when a newer one fires; manual save needs to cancel a lingering autosave. `AbortController` at the `fetch` layer gives clean cancellation.

**Files:**

- Modify: `web/api/client.ts:108-120` (`mutateApi`)
- Modify: `web/api/client.ts:180-194` (`createDraft`, `updateDraft`)

- [ ] **Step 1.** Extend `mutateApi` to accept an optional signal.

Replace `web/api/client.ts:108-120` with:

```ts
async function mutateApi<T>(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!res.ok) await handleErrorResponse(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return unwrapEnvelope<T>(JSON.parse(text));
}
```

- [ ] **Step 2.** Extend `createDraft` and `updateDraft` signatures.

Replace the relevant block around `web/api/client.ts:180-194`:

```ts
export function createDraft(
  payload: PGApiCreateDraftPayload,
  options: { signal?: AbortSignal } = {},
): Promise<{ announcementDraftId: number }> {
  return mutateApi('POST', '/announcements/drafts', payload, options);
}

export function updateDraft(
  draftId: number,
  payload: PGApiCreateDraftPayload,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  return mutateApi('PUT', `/announcements/drafts/${draftId}`, payload, options);
}
```

- [ ] **Step 3.** Verify the build still compiles. In the Vite dev server terminal, watch for a clean reload; in editor, run `pnpm lint` on just this file and confirm no TypeScript errors.

- [ ] **Step 4.** Manual verify in browser: load `/posts/new`, click "Schedule for later", pick a time, confirm the dialog saves as before (existing behavior must not regress — the scheduling path calls `createDraft`/`updateDraft` without `signal`, exercising the default-arg code path).

- [ ] **Step 5.** Commit just this file.

```bash
git commit -m "refactor(web): thread AbortSignal through draft API calls" -- web/api/client.ts
```

---

## Task 2 — Create `useUnsavedChangesGuard` hook

**Why:** Prevent the cheapest form of data loss: tab-close and browser-back while the form has unsaved edits.

**Files:**

- Create: `web/hooks/useUnsavedChangesGuard.ts`

- [ ] **Step 1.** Create the hook file with this exact content:

```ts
import { useEffect } from 'react';

/**
 * Registers a `beforeunload` listener while `isDirty` is true.
 * The browser shows its default "Leave site?" prompt — copy is not customizable.
 *
 * Does NOT guard in-app React Router navigation (that needs `useBlocker`
 * from react-router-dom v7; tracked as a follow-up).
 */
export function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Legacy browsers need returnValue set to anything truthy.
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
}
```

- [ ] **Step 2.** Verify TypeScript compiles. The dev server should hot-reload; no visible change yet.

- [ ] **Step 3.** Do **not** commit yet — batch with Task 3 since both are new hooks.

---

## Task 3 — Create `useAutoSave` hook

**Why:** Periodically persist form state without user action. Must be single-flight (AbortController), skip when state hasn't changed since last save, expose status to the UI, and not fire for empty-ish drafts.

**Design contract:**

- Input: current form payload (the exact object we'd send to `createDraft`/`updateDraft`), plus a `save(payload, { signal })` function the caller provides.
- Output: `{ status, lastSavedAt, saveNow }` where `status` is `'idle' | 'saving' | 'saved' | 'error'`, and `saveNow()` triggers an immediate save, cancelling any in-flight autosave.
- Interval: 30 000 ms (matches PGW).
- Skip rule: don't save if the serialized payload equals the last-saved serialized payload (avoids network churn on a stale form).
- Skip rule: don't save if the payload has no title AND no description content (avoids creating zero-content drafts on page load).

**Files:**

- Create: `web/hooks/useAutoSave.ts`

- [ ] **Step 1.** Create the hook file with this exact content:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveOptions<TPayload> {
  /** Current payload. Hook serializes with JSON.stringify for change detection. */
  payload: TPayload;
  /** Called to persist. Must accept a signal and respect it. */
  save: (payload: TPayload, opts: { signal: AbortSignal }) => Promise<void>;
  /** Poll interval in ms. Defaults to 30_000. */
  intervalMs?: number;
  /** When false, autosave stops scheduling new ticks but doesn't cancel in-flight. */
  enabled?: boolean;
  /**
   * Return true when the payload has enough content to be worth saving.
   * Defaults to `() => true`.
   */
  shouldSave?: (payload: TPayload) => boolean;
}

export interface UseAutoSaveResult {
  status: AutoSaveStatus;
  lastSavedAt: Date | null;
  /** Force an immediate save; aborts any in-flight autosave first. */
  saveNow: () => Promise<void>;
}

export function useAutoSave<TPayload>(options: UseAutoSaveOptions<TPayload>): UseAutoSaveResult {
  const { payload, save, intervalMs = 30_000, enabled = true, shouldSave } = options;

  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const payloadRef = useRef(payload);
  const saveRef = useRef(save);
  const shouldSaveRef = useRef(shouldSave);
  const lastSerializedRef = useRef<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  // Keep refs up-to-date without re-running the interval effect.
  useEffect(() => {
    payloadRef.current = payload;
    saveRef.current = save;
    shouldSaveRef.current = shouldSave;
  }, [payload, save, shouldSave]);

  const runSave = useCallback(async (): Promise<void> => {
    const current = payloadRef.current;
    if (shouldSaveRef.current && !shouldSaveRef.current(current)) return;

    const serialized = JSON.stringify(current);
    if (serialized === lastSerializedRef.current) return;

    // Abort any previous in-flight save.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setStatus('saving');
    try {
      await saveRef.current(current, { signal: controller.signal });
      // Only mark saved if this is still the latest request.
      if (inFlightRef.current === controller) {
        lastSerializedRef.current = serialized;
        setLastSavedAt(new Date());
        setStatus('saved');
      }
    } catch (err) {
      if (controller.signal.aborted) return; // superseded, don't surface.
      setStatus('error');
      // Let the caller's save() surface its own toast; hook only tracks status.
      // Re-throw so saveNow() callers can await the outcome.
      throw err;
    } finally {
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
      }
    }
  }, []);

  // Interval scheduler.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      void runSave().catch(() => {
        // Errors already surfaced via setStatus('error').
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, runSave]);

  // Abort any in-flight save on unmount.
  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, []);

  const saveNow = useCallback(async () => {
    await runSave();
  }, [runSave]);

  return { status, lastSavedAt, saveNow };
}
```

- [ ] **Step 2.** Verify TypeScript compiles cleanly. Dev server hot-reloads; no visible change yet.

- [ ] **Step 3.** Commit both hooks.

```bash
git commit -m "feat(web): add \`useAutoSave\` and \`useUnsavedChangesGuard\` hooks" -- web/hooks/useAutoSave.ts web/hooks/useUnsavedChangesGuard.ts
```

---

## Task 4 — Add "Save draft" button + status ticker to the form footer

**Why:** Give teachers an explicit save action and visible feedback. This task does NOT yet wire autosave; Task 5 does.

**Files:**

- Modify: `web/containers/CreatePostView.tsx` around lines 519–532 (footer block) and add a new handler above it.

- [ ] **Step 1.** Inside `CreatePostViewInner`, near the existing `handleScheduleConfirm` (around line 434–460), add a `handleSaveDraft` function. Paste this immediately above `handleScheduleConfirm`:

```ts
const draftIdRef = useRef<number | null>(isEditing && editId ? Number(editId) : null);
const [isSavingDraft, setIsSavingDraft] = useState(false);

async function handleSaveDraft(opts: { signal?: AbortSignal } = {}): Promise<void> {
  if (isSavingDraft) return; // single-flight for manual clicks
  setIsSavingDraft(true);
  try {
    const payload = buildPayload();
    if (draftIdRef.current == null) {
      const { announcementDraftId } = await createDraft(payload, { signal: opts.signal });
      draftIdRef.current = announcementDraftId;
      // Switch the URL so refresh hits the draft. `replace` to avoid a history entry.
      navigate(`/posts/${announcementDraftId}/edit`, { replace: true });
    } else {
      await updateDraft(draftIdRef.current, payload, { signal: opts.signal });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    if (err instanceof PGValidationError) {
      notify.error(err.message);
    } else if (!(err instanceof PGError)) {
      notify.error('Failed to save draft.');
    }
    throw err;
  } finally {
    setIsSavingDraft(false);
  }
}
```

Notes:

- `buildPayload()` is the existing closure helper at [CreatePostView.tsx:421](../../web/containers/CreatePostView.tsx#L421), used today by `handleScheduleConfirm` (line 437) and `handleSendConfirm` (line 465). Takes no args — reads `state` via closure.
- `isEditing` and `editId` are existing derived values in `CreatePostViewInner` (same ones used at [line 439](../../web/containers/CreatePostView.tsx#L439) for the scheduled-update branch).
- Because the `/posts/:id/edit` route today only loads DRAFT posts (posted announcements aren't editable per PGW IA), seeding `draftIdRef` from `editId` is safe — if that changes, tighten the gate to check `loaderData.detail?.status === 'DRAFT'`.
- `setIsSaving` (the shared in-flight flag used by publish/schedule) is intentionally NOT touched — we use a separate `isSavingDraft` so the Post/Schedule buttons stay enabled during autosave.

- [ ] **Step 2.** Import additions at the top of the file — add `useRef` if not already present (already imported at line 2 per the exploration), and ensure `createDraft`, `updateDraft`, `PGValidationError`, `PGError`, `notify` are imported (they are, via existing client.ts / errors / notify paths).

- [ ] **Step 3.** Add a `SaveStatusTicker` inline in the footer. Find the footer block around line 519–532 and replace it with:

```tsx
<div className="flex items-center gap-3">
  <SaveStatusTicker status={autoSave.status} lastSavedAt={autoSave.lastSavedAt} />
  <Button variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)}>
    {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </Button>
  <Button
    variant="outline"
    size="sm"
    disabled={isSavingDraft}
    onClick={() => {
      void handleSaveDraft();
    }}
  >
    {isSavingDraft ? 'Saving…' : 'Save draft'}
  </Button>
  <SplitPostButton
    disabled={!isFormValid || isSaving}
    onPost={() => setShowSendDialog(true)}
    onSchedule={() => setShowScheduleDialog(true)}
  />
</div>
```

- [ ] **Step 4.** Add the `SaveStatusTicker` component at the bottom of the file (below `CreatePostView`), or inline near the other tiny components in the file — match the file's existing convention.

```tsx
function SaveStatusTicker({
  status,
  lastSavedAt,
}: {
  status: AutoSaveStatus;
  lastSavedAt: Date | null;
}) {
  let label: string;
  if (status === 'saving') label = 'Saving…';
  else if (status === 'error') label = 'Save failed';
  else if (lastSavedAt) {
    label = `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } else label = '';

  return (
    <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
      {label}
    </span>
  );
}
```

- [ ] **Step 5.** Add the `autoSave` object as a placeholder for now (Task 5 replaces it with the real hook). Temporarily, just above the return, insert:

```ts
// Placeholder; replaced in Task 5.
const autoSave = { status: 'idle' as AutoSaveStatus, lastSavedAt: null as Date | null };
```

And import the type:

```ts
import type { AutoSaveStatus } from '~/hooks/useAutoSave';
```

- [ ] **Step 6.** Manual verify: reload `/posts/new`, fill title + description, click **Save draft**. Expect: button shows "Saving…", the URL changes to `/posts/:id/edit` (check the address bar), the button re-enables, and the list at `/posts` shows a new "Draft" row after refresh. No autosave yet — the ticker stays blank.

- [ ] **Step 7.** Second manual verify: on `/posts/:id/edit` for a draft created in Step 6, change the title, click **Save draft** again. Expect: no URL change, list still shows one draft (not a duplicate), reopening `/posts/:id/edit` shows the new title.

- [ ] **Step 8.** Commit.

```bash
git commit -m "feat(web): add 'Save draft' button and save-status ticker to \`CreatePostView\`" -- web/containers/CreatePostView.tsx
```

---

## Task 5 — Wire `useAutoSave` into the form

**Why:** Hands-off persistence. The ticker from Task 4 lights up as soon as this is wired.

**Files:**

- Modify: `web/containers/CreatePostView.tsx` (the `autoSave` placeholder from Task 4)

- [ ] **Step 1.** Import the hook at the top of the file:

```ts
import { useAutoSave } from '~/hooks/useAutoSave';
```

- [ ] **Step 2.** Replace the placeholder block added in Task 4 Step 5 with the real hook call. Insert immediately above the footer JSX:

```ts
const autoSave = useAutoSave({
  payload: state, // serialization drives change detection; reducer state is stable
  save: async (_snapshot, { signal }) => {
    // We save via the same handler so URL navigation + error handling stay DRY.
    await handleSaveDraft({ signal });
  },
  intervalMs: 30_000,
  enabled: !isSaving, // pause autosave while publishing
  shouldSave: (s) => s.title.trim().length > 0 || editorHasContent(s.descriptionDoc),
});
```

- [ ] **Step 3.** Add the tiny helper `editorHasContent` at the top of the file (near the other utilities):

```ts
function editorHasContent(doc: PostFormState['descriptionDoc']): boolean {
  if (!doc || typeof doc !== 'object') return false;
  const content = (doc as { content?: unknown[] }).content;
  return Array.isArray(content) && content.length > 0;
}
```

- [ ] **Step 4.** Remove the placeholder `const autoSave = { ... }` line added in Task 4 Step 5.

- [ ] **Step 5.** Manual verify — **autosave happy path**: reload `/posts/new`, type a title. Wait 30 s without clicking anything. Expect: ticker flashes "Saving…" → "Saved 9:41 AM" (or whatever time), address bar moves to `/posts/:id/edit`. Open `/posts` in the other tab, refresh, confirm a new Draft row.

- [ ] **Step 6.** Manual verify — **change detection skip**: sit on the edit page for 60 s without changing anything. Expect: the ticker shows the same "Saved HH:MM" time (the 30-s tick does not flash because the serialized payload is unchanged).

- [ ] **Step 7.** Manual verify — **single-flight cancellation**: open DevTools → Network, throttle to "Slow 3G". Type, wait 30 s for an autosave to start ("Saving…"), and while it's in flight click **Save draft**. Expect: one cancelled request (red), one successful request. Ticker lands on "Saved HH:MM".

- [ ] **Step 8.** Commit.

```bash
git commit -m "feat(web): autosave draft every 30 s in \`CreatePostView\`" -- web/containers/CreatePostView.tsx
```

---

## Task 6 — Wire `useUnsavedChangesGuard` into the form

**Why:** Close the data-loss loophole for tab-close and full-page-back. In-app React Router navigation is still unguarded (Phase B).

**Files:**

- Modify: `web/containers/CreatePostView.tsx`

- [ ] **Step 1.** Import and compute `isDirty`. Add near the top of `CreatePostViewInner`:

```ts
import { useUnsavedChangesGuard } from '~/hooks/useUnsavedChangesGuard';
```

And inside the component body, after `autoSave` is declared:

```ts
const lastSavedSerialized = useRef<string | null>(null);
useEffect(() => {
  if (autoSave.status === 'saved') {
    lastSavedSerialized.current = JSON.stringify(state);
  }
}, [autoSave.status, state]);

const isDirty =
  lastSavedSerialized.current !== null
    ? JSON.stringify(state) !== lastSavedSerialized.current
    : // No save has happened yet. Treat as dirty only if there's meaningful content.
      state.title.trim().length > 0 || editorHasContent(state.descriptionDoc);

useUnsavedChangesGuard(isDirty);
```

Note: the explicit `JSON.stringify` comparisons look heavy but are fine for a form of this size (~5 KB serialized). If it becomes an issue, we switch to a dedicated `useMemo` + dirty counter.

- [ ] **Step 2.** Manual verify — **unload warning fires**: reload `/posts/new`, type a title, **don't save**, try to close the tab. Expect: browser's "Leave site?" dialog.

- [ ] **Step 3.** Manual verify — **unload warning clears after save**: reload `/posts/new`, type a title, wait for autosave to land ("Saved 9:41 AM"). Close the tab. Expect: no warning.

- [ ] **Step 4.** Manual verify — **empty form doesn't warn**: open `/posts/new`, don't type anything, close the tab. Expect: no warning. (Prevents false positives when a user just looks at the page.)

- [ ] **Step 5.** Commit.

```bash
git commit -m "feat(web): warn on unload when \`CreatePostView\` has unsaved edits" -- web/containers/CreatePostView.tsx
```

---

## Task 7 — End-to-end verification sweep

**Why:** Catch regressions in adjacent flows (schedule, publish, edit-existing-draft, validation errors) before calling it done.

**Files:** none (verification only).

- [ ] **Step 1.** Happy-path compose + publish: `/posts/new` → type → wait for autosave → click **Post** → confirm → land on `/posts`. Draft should not linger as a separate row (publish should replace the draft).

- [ ] **Step 2.** Happy-path schedule: `/posts/new` → type → click **Schedule for later** → pick time → confirm → `/posts` shows a Scheduled row, not two rows.

- [ ] **Step 3.** Edit existing draft: from `/posts`, click a Draft row → `/posts/:id/edit` loads with filled form → change title → **Save draft** → reload → title persisted.

- [ ] **Step 4.** Validation error on manual save: clear required fields (e.g., remove recipients), click **Save draft**. Expect: draft endpoint still accepts (PGW has no required-field enforcement on draft save), row appears. If PG returns a validation error (`-4001/-4003/-4004`), the toast surfaces from the existing error-handling in [web/api/client.ts](../../web/api/client.ts).

- [ ] **Step 5.** Network failure on autosave: in DevTools, set network to **Offline**, wait 30 s. Expect: ticker flips to "Save failed", no toast spam, and when connectivity returns the next autosave succeeds and ticker recovers.

- [ ] **Step 6.** Unmount cancels in-flight save: on a slow connection during an autosave, click the back button before it completes. Expect: the in-flight request shows as cancelled in DevTools; no console errors.

- [ ] **Step 7.** Lint + format sanity.

```bash
pnpm lint
pnpm format
```

- [ ] **Step 8.** (Optional) Put the plan file in the repo at the canonical location.

```bash
cp /Users/shin/.claude/plans/1-12-not-sprint-plan-cozy-curry.md \
   docs/plans/2026-04-22-pgtw-5-save-as-draft-autosave-plan.md
git add docs/plans/2026-04-22-pgtw-5-save-as-draft-autosave-plan.md
git commit -m "docs(plan): PGTW-5 save-as-draft + autosave implementation plan" -- docs/plans/2026-04-22-pgtw-5-save-as-draft-autosave-plan.md
```

---

## Deferred to Phase B (intentionally out of scope)

Each of these is a standalone follow-up ticket or section; NOT blocking PGTW-5 completion.

1. **`X-No-Extend-Session` header on autosave.** Requires `server/internal/pg/proxy.go:35-52` to forward or translate the header into PGW's `REQUEST_HEADER_NO_EXTEND`. Ship when staging session expiry starts being visible.
2. **`useBlocker` for in-app navigation.** React Router 7 `useBlocker`. Covers clicking the sidebar or the browser back-button without tab-close.
3. **File-expiry banner on draft load.** Blocked on attachments (PGTW-11 cross-cutting).
4. **Two-tab concurrent edit warning.** Requires `updatedAt` echo from the draft response and a stale-check before every save. Low priority.
5. **Paste-exceeds-2000-chars truncation** for Tiptap description (PGTW-8 edge case, not PGTW-5).

---

## Critical file references

- [web/containers/CreatePostView.tsx](../../web/containers/CreatePostView.tsx) — primary target
- [web/api/client.ts](../../web/api/client.ts) — signal threading
- [web/api/types.ts](../../web/api/types.ts) — `PGApiCreateDraftPayload` (already covers our needs)
- [web/lib/notify.ts](../../web/lib/notify.ts) — toast helpers
- [web/hooks/useIsMobile.ts](../../web/hooks/useIsMobile.ts) — existing hook style reference
- [docs/audits/pgtw-1-12-parity-scope.md](../../docs/audits/pgtw-1-12-parity-scope.md) — scope/context
- [docs/audits/pg-fe-may-testing.md](../../docs/audits/pg-fe-may-testing.md) — "high-risk" data-loss callout

## Verification summary

Acceptance = all of the following pass:

- `/posts/new` with a typed title autosaves within 30 s and ticker shows "Saved HH:MM".
- **Save draft** button works in both create (`/posts/new`) and edit (`/posts/:id/edit`) modes; first create triggers `replace` navigation to `/posts/:id/edit`.
- Tab close with unsaved edits triggers browser warning; clean state doesn't.
- Existing Post-now and Schedule-for-later flows still work unchanged.
- Network failure shows "Save failed" without spamming toasts; recovers on next tick.
- `pnpm lint` and `pnpm format` pass.
