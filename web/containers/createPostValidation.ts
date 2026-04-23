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
  if (selectedType !== 'post-with-response') return true;

  if (state.dueDate.trim().length === 0) return false;

  return true;
}
