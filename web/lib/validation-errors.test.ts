import { describe, expect, it } from 'vitest';

import { PGValidationError } from '~/api/errors';

import { reportValidationError } from './validation-errors';

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
