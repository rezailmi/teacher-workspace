import { describe, expect, it } from 'vitest';

import { toPGCreatePayload } from './mappers';
import type { PGApiCreateAnnouncementPayload } from './types';

const basePayload: PGApiCreateAnnouncementPayload = {
  title: 'Test',
  richTextContent: '{"type":"doc","content":[]}',
  enquiryEmailAddress: 'test@moe.edu.sg',
  recipients: { classIds: [], customGroupIds: [], ccaIds: [], levelIds: [] },
};

describe('toPGCreatePayload', () => {
  it('builds a write payload from a complete input', () => {
    const out = toPGCreatePayload(basePayload);
    expect(out.title).toBe('Test');
    expect(out.enquiryEmailAddress).toBe('test@moe.edu.sg');
    expect(out.targets).toEqual([]);
  });

  it('throws when enquiryEmailAddress is missing and allowPartial is not set', () => {
    const payload = { ...basePayload, enquiryEmailAddress: '' };
    expect(() => toPGCreatePayload(payload)).toThrow(/enquiryEmailAddress is required/i);
  });

  it('does not throw on missing enquiryEmailAddress when allowPartial is true', () => {
    // Mirrors pgw-web's AnnouncementDraftManager.test:
    // 'should call the AnnouncementDraftService even if all form inputs are provided with empty values'
    const payload = { ...basePayload, enquiryEmailAddress: '' };
    expect(() => toPGCreatePayload(payload, { allowPartial: true })).not.toThrow();
    expect(toPGCreatePayload(payload, { allowPartial: true }).enquiryEmailAddress).toBe('');
  });

  it('maps recipient ids by type into the flat target array', () => {
    const payload: PGApiCreateAnnouncementPayload = {
      ...basePayload,
      recipients: { classIds: [1, 2], customGroupIds: [], ccaIds: [3], levelIds: [4] },
    };
    const out = toPGCreatePayload(payload);
    expect(out.targets).toEqual([
      { targetType: 'class', targetId: 1 },
      { targetType: 'class', targetId: 2 },
      { targetType: 'cca', targetId: 3 },
      { targetType: 'level', targetId: 4 },
    ]);
  });
});
