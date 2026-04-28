import { describe, expect, it } from 'vitest';

import { describeScheduledSendFailure } from '~/data/mock-pg-announcements';

import {
  mapAnnouncementSummary,
  mapConsentFormDetail,
  mapConsentFormSummaryToPost,
  mapReminder,
  toPGCreatePayload,
} from './mappers';
import type {
  PGApiAnnouncementSummary,
  PGApiConsentFormDetail,
  PGApiConsentFormSummary,
  PGApiCreateAnnouncementPayload,
} from './types';

const basePayload: PGApiCreateAnnouncementPayload = {
  title: 'Test',
  richTextContent: '{"type":"doc","content":[]}',
  enquiryEmailAddress: 'test@moe.edu.sg',
  studentGroups: [],
};

describe('toPGCreatePayload', () => {
  it('builds a write payload from a complete input', () => {
    const out = toPGCreatePayload(basePayload);
    expect(out.title).toBe('Test');
    expect(out.enquiryEmailAddress).toBe('test@moe.edu.sg');
    expect(out.studentGroups).toEqual([]);
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

  it('passes studentGroups through to the wire (PGW expects {type, label, value})', () => {
    const payload: PGApiCreateAnnouncementPayload = {
      ...basePayload,
      studentGroups: [
        { type: 'class', label: 'P1A', value: 1 },
        { type: 'class', label: 'P1B', value: 2 },
        { type: 'cca', label: 'Choir', value: 3 },
        { type: 'level', label: 'Primary 1', value: 4 },
      ],
    };
    const out = toPGCreatePayload(payload);
    expect(out.studentGroups).toEqual([
      { type: 'class', label: 'P1A', value: 1 },
      { type: 'class', label: 'P1B', value: 2 },
      { type: 'cca', label: 'Choir', value: 3 },
      { type: 'level', label: 'Primary 1', value: 4 },
    ]);
  });

  it('renames websiteLinks → urls and shortcutLink → shortcuts on the wire', () => {
    const payload: PGApiCreateAnnouncementPayload = {
      ...basePayload,
      websiteLinks: [{ url: 'https://x.sg', title: 'X' }],
      shortcutLink: ['TRAVEL_DECLARATION'],
    };
    const out = toPGCreatePayload(payload);
    expect(out.urls).toEqual([{ webLink: 'https://x.sg', linkDescription: 'X' }]);
    expect(out.shortcuts).toEqual(['TRAVEL_DECLARATION']);
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
    expect(describeScheduledSendFailure('UPSTREAM_TIMEOUT')).toBe(
      "The messaging service didn't respond in time.",
    );
    expect(describeScheduledSendFailure('RECIPIENT_INVALID')).toBe(
      'Some recipients are no longer valid.',
    );
  });

  it('falls back to a generic apology for unknown codes', () => {
    expect(describeScheduledSendFailure('SOMETHING_PG_ADDED_LATER')).toBe(
      'Something went wrong on our side.',
    );
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

const baseConsentFormDetail: PGApiConsentFormDetail = {
  consentFormId: 1038,
  title: 'Consent Form',
  content: null,
  richTextContent: null,
  responseType: 'YES_NO',
  eventStartDate: null,
  eventEndDate: null,
  consentByDate: null,
  addReminderType: 'NONE',
  reminderDate: null,
  postedDate: '2026-04-01T00:00:00.000Z',
  venue: null,
  enquiryEmailAddress: 'teacher@moe.edu.sg',
  staffName: 'Teacher A',
  createdBy: 1013,
  createdAt: '2026-04-01T00:00:00.000Z',
  images: [],
  webLinkList: [],
  customQuestions: null,
  staffOwners: [],
  consentFormRecipients: [],
  consentFormHistory: [],
};

describe('mapConsentFormDetail — attachments rehydration', () => {
  it('rehydrates non-empty attachments into UploadingFile shape', () => {
    const detail: PGApiConsentFormDetail = {
      ...baseConsentFormDetail,
      attachments: [
        { attachmentId: 8100, name: 'briefing.pdf', size: 213456, url: '/dl/8100' },
        { attachmentId: 8101, name: 'itinerary.pdf', size: 98765, url: '/dl/8101' },
      ],
    };
    const out = mapConsentFormDetail(detail);
    expect(out.attachments).toHaveLength(2);
    expect(out.attachments?.[0]).toMatchObject({
      kind: 'file',
      status: 'ready',
      attachmentId: 8100,
      name: 'briefing.pdf',
      size: 213456,
      url: '/dl/8100',
    });
    expect(out.attachments?.[1]?.localId).toBe('rehydrated-file-8101');
  });

  it('returns an empty array when attachments are omitted', () => {
    const out = mapConsentFormDetail(baseConsentFormDetail);
    expect(out.attachments).toEqual([]);
  });

  it('returns an empty array when attachments is an empty list', () => {
    const out = mapConsentFormDetail({ ...baseConsentFormDetail, attachments: [] });
    expect(out.attachments).toEqual([]);
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

  it('brands scheduled rows as cfDraft_<id> (PGW: scheduled forms live in the draft table)', () => {
    const scheduled: PGApiConsentFormSummary = {
      ...baseConsentFormSummary,
      status: 'SCHEDULED',
    };
    const out = mapConsentFormSummaryToPost(scheduled, 'mine');
    expect(out.id).toBe('cfDraft_42');
    expect(out.status).toBe('scheduled');
  });
});

describe('mapReminder', () => {
  it('returns NONE for type NONE regardless of date', () => {
    expect(mapReminder('NONE', null)).toEqual({ type: 'NONE' });
    expect(mapReminder('NONE', '2026-05-15T00:00:00.000Z')).toEqual({ type: 'NONE' });
  });

  it('returns ONE_TIME with the date in YYYY-MM-DD form from an ISO timestamp', () => {
    expect(mapReminder('ONE_TIME', '2026-05-15T00:00:00.000Z')).toEqual({
      type: 'ONE_TIME',
      date: '2026-05-15',
    });
  });

  it('returns ONE_TIME with the date in YYYY-MM-DD form from a bare date string', () => {
    expect(mapReminder('ONE_TIME', '2026-05-15')).toEqual({
      type: 'ONE_TIME',
      date: '2026-05-15',
    });
  });

  it('returns DAILY with the date in YYYY-MM-DD form', () => {
    expect(mapReminder('DAILY', '2026-05-15T00:00:00.000Z')).toEqual({
      type: 'DAILY',
      date: '2026-05-15',
    });
  });

  it('falls back to NONE when type is unknown / addReminderType is empty string', () => {
    // Cast to silence TS — real-world guard against unexpected wire values.
    expect(mapReminder('' as 'NONE', null)).toEqual({ type: 'NONE' });
  });

  it('falls back to NONE when type is ONE_TIME but reminderDate is null', () => {
    expect(mapReminder('ONE_TIME', null)).toEqual({ type: 'NONE' });
  });

  it('falls back to NONE when type is DAILY but reminderDate is null', () => {
    expect(mapReminder('DAILY', null)).toEqual({ type: 'NONE' });
  });
});
