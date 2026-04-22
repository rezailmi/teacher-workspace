import { PGValidationError } from '~/api/errors';

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
