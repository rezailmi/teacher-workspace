import type { PostKind } from '~/components/posts/PostTypePicker';

import type { PostFormState } from './CreatePostView';

/**
 * Pure validation helper for the CreatePost form. Extracted so the rules can
 * be unit-tested without mounting the full component.
 *
 * Gate 1 — common: title, enquiry email, recipients, and description are
 * required for all post types.
 * Gate 2 — post-with-response only: due date is required.
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

  return true;
}

/**
 * True when at least one attachment or photo is actively uploading or
 * verifying. Used by the Send button handler to surface a toast when the
 * user tries to submit too early — distinct from `isCreatePostFormValid`
 * so the caller can tell "form unfilled" from "upload pending" apart.
 */
export function hasPendingUploads(state: PostFormState): boolean {
  return [...state.attachments, ...state.photos].some(
    (u) => u.status === 'uploading' || u.status === 'verifying',
  );
}
