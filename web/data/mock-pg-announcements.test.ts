import { describe, expect, it } from 'vitest';

import {
  isAnnouncementDraftId,
  isConsentFormDraftId,
  isConsentFormId,
  parsePostId,
} from './mock-pg-announcements';

describe('parsePostId', () => {
  it('returns ConsentFormDraftId for cfDraft_<digits>', () => {
    const id = parsePostId('cfDraft_42');
    expect(id).toBe('cfDraft_42');
    expect(isConsentFormDraftId(id!)).toBe(true);
  });

  it('returns ConsentFormId for cf_<digits>', () => {
    const id = parsePostId('cf_42');
    expect(id).toBe('cf_42');
    expect(isConsentFormId(id!)).toBe(true);
  });

  it('returns AnnouncementDraftId for annDraft_<digits>', () => {
    const id = parsePostId('annDraft_42');
    expect(id).toBe('annDraft_42');
    expect(isAnnouncementDraftId(id!)).toBe(true);
  });

  it('returns AnnouncementId for bare numeric string', () => {
    const id = parsePostId('123');
    expect(id).toBe('123');
    expect(isConsentFormId(id!)).toBe(false);
    expect(isConsentFormDraftId(id!)).toBe(false);
    expect(isAnnouncementDraftId(id!)).toBe(false);
  });

  it('returns null for non-numeric strings', () => {
    expect(parsePostId('invalid')).toBeNull();
    expect(parsePostId('')).toBeNull();
    expect(parsePostId('cf_')).toBeNull();
    expect(parsePostId('cfDraft_')).toBeNull();
  });
});

describe('isConsentFormDraftId', () => {
  it('is true for cfDraft_ prefixed ids', () => {
    const id = parsePostId('cfDraft_1007')!;
    expect(isConsentFormDraftId(id)).toBe(true);
  });

  it('is false for cf_ prefixed ids', () => {
    const id = parsePostId('cf_1007')!;
    expect(isConsentFormDraftId(id)).toBe(false);
  });

  it('is false for annDraft_ prefixed ids', () => {
    const id = parsePostId('annDraft_1007')!;
    expect(isConsentFormDraftId(id)).toBe(false);
  });
});

describe('isConsentFormId', () => {
  it('is true for cf_ prefixed ids', () => {
    const id = parsePostId('cf_42')!;
    expect(isConsentFormId(id)).toBe(true);
  });

  it('is false for cfDraft_ prefixed ids (does not match cf_ branch)', () => {
    const id = parsePostId('cfDraft_42')!;
    expect(isConsentFormId(id)).toBe(false);
  });
});
