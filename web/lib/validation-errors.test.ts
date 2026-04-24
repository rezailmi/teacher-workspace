import { describe, expect, it } from 'vitest';

import { PGValidationError } from '~/api/errors';

import { fieldForValidationError, reportValidationError } from './validation-errors';

describe('reportValidationError', () => {
  it('maps -4001 to "Enquiry email is required."', () => {
    const err = new PGValidationError('raw', -4001, 400);
    expect(reportValidationError(err)).toBe('Enquiry email is required.');
  });

  it('maps -4003 to a description-formatting message', () => {
    const err = new PGValidationError('raw', -4003, 400);
    expect(reportValidationError(err)).toMatch(/description.*format/i);
  });

  it('maps -4004 to a description-length message including the 2000 limit', () => {
    const err = new PGValidationError('raw', -4004, 400);
    const msg = reportValidationError(err);
    expect(msg).toMatch(/description/i);
    expect(msg).toMatch(/2000/);
  });

  it('falls back to err.message for unmapped -400x codes', () => {
    const err = new PGValidationError('Something else went wrong', -400, 400);
    expect(reportValidationError(err)).toBe('Something else went wrong');
  });
});

describe('fieldForValidationError', () => {
  it('maps -4001 to enquiryEmail', () => {
    expect(fieldForValidationError(new PGValidationError('', -4001, 400))).toBe('enquiryEmail');
  });

  it('maps -4003 and -4004 to description', () => {
    expect(fieldForValidationError(new PGValidationError('', -4003, 400))).toBe('description');
    expect(fieldForValidationError(new PGValidationError('', -4004, 400))).toBe('description');
  });

  it('returns undefined for unmapped codes so callers fall back to a toast', () => {
    expect(fieldForValidationError(new PGValidationError('', -400, 400))).toBeUndefined();
  });

  it('prefers a server-supplied fieldPath over the resultCode inference', () => {
    // Server says `title` is the issue even though the code is the "description too long" one.
    const err = new PGValidationError('', -4004, 400, { fieldPath: 'title' });
    expect(fieldForValidationError(err)).toBe('title');
  });

  it('aliases richTextContent -> description and enquiryEmailAddress -> enquiryEmail', () => {
    const desc = new PGValidationError('', -400, 400, { fieldPath: 'richTextContent' });
    expect(fieldForValidationError(desc)).toBe('description');
    const email = new PGValidationError('', -400, 400, { fieldPath: 'enquiryEmailAddress' });
    expect(fieldForValidationError(email)).toBe('enquiryEmail');
  });
});
