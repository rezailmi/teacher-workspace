import { PGValidationError } from '~/api/errors';

/** Logical form field identifiers the container stamps inline validation errors against. */
export type PostFormField = 'title' | 'description' | 'enquiryEmail';

/**
 * Map PGW validation error codes to a user-facing message. Falls back to the
 * raw `err.message` (PGW's `errorReason`) when the code isn't specifically
 * mapped — preserves the existing fallback behavior.
 */
export function reportValidationError(err: PGValidationError): string {
  switch (err.resultCode) {
    case -4001:
      return 'Enquiry email is required.';
    case -4003:
      return 'Description formatting is invalid. Please simplify and try again.';
    case -4004:
      return 'Description is too long. Maximum 2000 characters.';
    default:
      return err.message;
  }
}

/**
 * Map a validation error to the form field it should be stamped against.
 * Prefers the structured `err.fieldPath` when the server supplies it; falls
 * back to inferring from `resultCode`. Returns `undefined` when the field is
 * unknown — callers should surface `reportValidationError(err)` as a toast.
 */
export function fieldForValidationError(err: PGValidationError): PostFormField | undefined {
  if (err.fieldPath === 'title') return 'title';
  if (err.fieldPath === 'description' || err.fieldPath === 'richTextContent') return 'description';
  if (err.fieldPath === 'enquiryEmailAddress' || err.fieldPath === 'enquiryEmail') {
    return 'enquiryEmail';
  }
  switch (err.resultCode) {
    case -4001:
      return 'enquiryEmail';
    case -4003:
    case -4004:
      return 'description';
    default:
      return undefined;
  }
}
