import { describe, expect, it } from 'vitest';

import { mapConsentFormSummaryToPost, toPGCreatePayload } from './mappers';
import type { PGApiConsentFormSummary, PGApiCreateAnnouncementPayload } from './types';

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

const baseConsentFormSummary: PGApiConsentFormSummary = {
  id: 'cf_42',
  postId: 42,
  title: 'Test form',
  date: '2026-04-01T00:00:00.000Z',
  status: 'OPEN',
  toParentsOf: [],
  respondedMetrics: { respondedPerStudent: 0.5, totalStudents: 10 },
  scheduledSendFailureCode: null,
  createdByName: 'Teacher A',
  consentByDate: '2026-05-01T00:00:00.000Z',
};

describe('mapConsentFormSummaryToPost', () => {
  it('brands posted rows as cf_<id>', () => {
    const out = mapConsentFormSummaryToPost(baseConsentFormSummary, 'mine');
    expect(out.id).toBe('cf_42');
    expect(out.status).toBe('open');
  });

  it('brands draft rows as cfDraft_<id>', () => {
    const draft: PGApiConsentFormSummary = { ...baseConsentFormSummary, status: 'DRAFT' };
    const out = mapConsentFormSummaryToPost(draft, 'mine');
    expect(out.id).toBe('cfDraft_42');
    expect(out.status).toBe('draft');
  });

  it('brands scheduled rows as cf_<id>', () => {
    const scheduled: PGApiConsentFormSummary = {
      ...baseConsentFormSummary,
      status: 'SCHEDULED',
    };
    const out = mapConsentFormSummaryToPost(scheduled, 'mine');
    expect(out.id).toBe('cf_42');
    expect(out.status).toBe('scheduled');
  });
});
