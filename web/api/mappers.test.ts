import { describe, expect, it } from 'vitest';

import { describeScheduledSendFailure } from '~/data/mock-pg-announcements';

import { mapAnnouncementSummary, mapConsentFormSummaryToPost, toPGCreatePayload } from './mappers';
import type {
  PGApiAnnouncementSummary,
  PGApiConsentFormSummary,
  PGApiCreateAnnouncementPayload,
} from './types';

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

const baseAnnouncementSummary: PGApiAnnouncementSummary = {
  id: 'ann_100',
  postId: 100,
  title: 'Test announcement',
  date: '2026-04-01T00:00:00.000Z',
  status: 'SCHEDULED',
  responseType: 'VIEW_ONLY',
  toParentsOf: [],
  readMetrics: { readPerStudent: 0, totalStudents: 0 },
  scheduledSendFailureCode: null,
  createdByName: 'Teacher A',
};

describe('describeScheduledSendFailure', () => {
  it('returns null for null or empty codes (the common happy path)', () => {
    expect(describeScheduledSendFailure(null)).toBeNull();
    expect(describeScheduledSendFailure(undefined)).toBeNull();
    expect(describeScheduledSendFailure('')).toBeNull();
  });

  it('looks up known codes in the catalogue', () => {
    expect(describeScheduledSendFailure('UPSTREAM_TIMEOUT')).toBe('Upstream timeout');
    expect(describeScheduledSendFailure('RECIPIENT_INVALID')).toBe('Recipients no longer valid');
  });

  it('falls back to a generic label for unknown codes', () => {
    expect(describeScheduledSendFailure('SOMETHING_PG_ADDED_LATER')).toBe('Delivery failed');
  });
});

describe('mapAnnouncementSummary', () => {
  it('passes through scheduledSendFailureCode on the summary', () => {
    const summary: PGApiAnnouncementSummary = {
      ...baseAnnouncementSummary,
      scheduledSendFailureCode: 'UPSTREAM_TIMEOUT',
    };
    const out = mapAnnouncementSummary(summary, 'mine');
    expect(out.scheduledSendFailureCode).toBe('UPSTREAM_TIMEOUT');
  });

  it('normalises a missing failure code to null', () => {
    const out = mapAnnouncementSummary(baseAnnouncementSummary, 'mine');
    expect(out.scheduledSendFailureCode).toBeNull();
  });
});

describe('mapConsentFormSummaryToPost', () => {
  it('passes through scheduledSendFailureCode on the summary', () => {
    const summary: PGApiConsentFormSummary = {
      ...baseConsentFormSummary,
      scheduledSendFailureCode: 'RECIPIENT_INVALID',
    };
    const out = mapConsentFormSummaryToPost(summary, 'mine');
    expect(out.scheduledSendFailureCode).toBe('RECIPIENT_INVALID');
  });
});

describe('mapConsentFormSummaryToPost — status branching', () => {
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
