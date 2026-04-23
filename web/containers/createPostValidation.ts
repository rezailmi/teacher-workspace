import type { PostKind } from '~/components/posts/PostTypePicker';

import type { PostFormState } from './CreatePostView';

/**
 * Pure validation helper for the CreatePost form. Extracted so the rules can
 * be unit-tested without mounting the full component.
 *
 * Gate 1 — common: title, enquiry email, recipients, and description are
 * required for all post types.
 * Gate 2 — post-with-response only: due date is required; if a reminder is
 * configured, its date must fall in `[tomorrow, dueDate - 1]` (matches
 * pgw-web's reminder window).
 */
export function isCreatePostFormValid(
  state: PostFormState,
  selectedType: PostKind | null,
): boolean {
  // Gate 1: required for all post types.
  const baseValid =
    state.title.trim().length > 0 &&
    state.enquiryEmail.trim().length > 0 &&
    state.selectedRecipients.length > 0 &&
    state.description.trim().length > 0;

  if (!baseValid) return false;

  // Gate 2: consent-form (post-with-response) — due date required.
  if (selectedType === 'post-with-response' && state.dueDate.trim().length === 0) {
    return false;
  }

  // Gate 3: all in-flight uploads must have resolved. Submitting while rows
  // are `uploading` / `verifying` would send partial state; errored rows are
  // allowed through because the mapper filters them out on the wire.
  const allUploadsResolved = [...state.attachments, ...state.photos].every(
    (u) => u.status === 'ready' || u.status === 'error',
  );
  if (!allUploadsResolved) return false;

  // Reminder-date window: when ONE_TIME or DAILY, date must sit between
  // tomorrow and `dueDate - 1` (inclusive). Otherwise PGW returns a generic
  // "Bad request" at submit time.
  if (state.reminder.type === 'ONE_TIME' || state.reminder.type === 'DAILY') {
    const r = state.reminder.date;
    if (!r) return false;
    const min = addDaysIso(todayIso(), 1);
    const max = addDaysIso(state.dueDate, -1);
    if (r < min || r > max) return false;
  }

  return true;
}

export function hasPendingUploads(state: PostFormState): boolean {
  return [...state.attachments, ...state.photos].some(
    (u) => u.status === 'uploading' || u.status === 'verifying',
  );
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
