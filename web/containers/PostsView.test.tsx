import { describe, expect, it } from 'vitest';

import type {
  AnnouncementId,
  ConsentFormId,
  PGAnnouncementPost,
  PGConsentFormPost,
  PGPost,
} from '~/data/mock-pg-announcements';

import { matchesPostFilters } from './PostsView';

function announcement(partial: Partial<PGAnnouncementPost> & { id: string }): PGAnnouncementPost {
  return {
    kind: 'announcement',
    id: partial.id as AnnouncementId,
    title: 'Untitled',
    description: '',
    status: 'posted',
    responseType: 'view-only',
    ownership: 'mine',
    recipients: [],
    stats: { totalCount: 0, readCount: 0, responseCount: 0, yesCount: 0, noCount: 0 },
    createdBy: 'Teacher A',
    ...partial,
  };
}

function consentForm(partial: Partial<PGConsentFormPost> & { id: string }): PGConsentFormPost {
  return {
    kind: 'form',
    id: partial.id as ConsentFormId,
    title: 'Untitled form',
    description: '',
    status: 'open',
    responseType: 'yes-no',
    ownership: 'mine',
    recipients: [],
    stats: { totalCount: 0, yesCount: 0, noCount: 0, pendingCount: 0 },
    createdBy: 'Teacher A',
    questions: [],
    consentByDate: '',
    reminder: { type: 'NONE' },
    history: [],
    ...partial,
  };
}

// `matchesPostFilters` operates on rows augmented with loader-added fields;
// the extras are irrelevant for filter logic, so cast via the PGPost union.
const row = (p: PGPost) => ({ ...p, _date: undefined, _dateTs: 0 });

describe('matchesPostFilters', () => {
  const mine = announcement({ id: 'ann_1', title: 'Maths homework', ownership: 'mine' });
  const shared = announcement({ id: 'ann_2', title: 'Shared update', ownership: 'shared' });
  const mineForm = consentForm({ id: 'cf_1', title: 'Field trip', ownership: 'mine' });
  const sharedForm = consentForm({ id: 'cf_2', title: 'Outreach', ownership: 'shared' });

  it('keeps only mine-owned rows on the Mine tab', () => {
    expect(matchesPostFilters(row(mine), { tab: 'view-only', ownership: 'mine', query: '' })).toBe(
      true,
    );
    expect(
      matchesPostFilters(row(shared), { tab: 'view-only', ownership: 'mine', query: '' }),
    ).toBe(false);
  });

  it('AND-composes ownership with search query', () => {
    expect(
      matchesPostFilters(row(shared), { tab: 'view-only', ownership: 'shared', query: 'shared' }),
    ).toBe(true);
    // Shared tab + non-matching search → filtered out even though ownership matches
    expect(
      matchesPostFilters(row(shared), {
        tab: 'view-only',
        ownership: 'shared',
        query: 'nonexistent',
      }),
    ).toBe(false);
  });

  it('hides forms on the Posts tab and announcements on the Posts-with-responses tab', () => {
    expect(
      matchesPostFilters(row(mineForm), { tab: 'view-only', ownership: 'mine', query: '' }),
    ).toBe(false);
    expect(
      matchesPostFilters(row(mine), { tab: 'with-responses', ownership: 'mine', query: '' }),
    ).toBe(false);
    expect(
      matchesPostFilters(row(mineForm), { tab: 'with-responses', ownership: 'mine', query: '' }),
    ).toBe(true);
  });

  it('produces 4 non-overlapping filtered sets across the two axes', () => {
    const all = [mine, shared, mineForm, sharedForm].map(row);
    const filter = (tab: 'view-only' | 'with-responses', ownership: 'mine' | 'shared') =>
      all.filter((r) => matchesPostFilters(r, { tab, ownership, query: '' }));

    expect(filter('view-only', 'mine').map((r) => r.id)).toEqual(['ann_1']);
    expect(filter('view-only', 'shared').map((r) => r.id)).toEqual(['ann_2']);
    expect(filter('with-responses', 'mine').map((r) => r.id)).toEqual(['cf_1']);
    expect(filter('with-responses', 'shared').map((r) => r.id)).toEqual(['cf_2']);
  });

  it('search query is case-insensitive', () => {
    expect(
      matchesPostFilters(row(mine), { tab: 'view-only', ownership: 'mine', query: 'MATHS' }),
    ).toBe(true);
  });
});
