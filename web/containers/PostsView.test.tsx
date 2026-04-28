import { describe, expect, it } from 'vitest';

import { DEFAULT_POST_FILTERS } from '~/components/posts/PostFilterPopover';
import type {
  AnnouncementId,
  ConsentFormId,
  PGAnnouncementPost,
  PGConsentFormPost,
  PGPost,
} from '~/data/mock-pg-announcements';

import { __duplicateDraftHref as duplicateDraftHref, matchesPostFilters } from './PostsView';

const baseFilter = { ...DEFAULT_POST_FILTERS, tab: 'view-only' as const, query: '' };

function announcement(
  partial: Partial<Omit<PGAnnouncementPost, 'id'>> & { id: string },
): PGAnnouncementPost {
  const { id, ...rest } = partial;
  return {
    kind: 'announcement',
    id: id as AnnouncementId,
    title: 'Untitled',
    description: '',
    status: 'posted',
    responseType: 'view-only',
    ownership: 'mine',
    recipients: [],
    stats: { totalCount: 0, readCount: 0, responseCount: 0, yesCount: 0, noCount: 0 },
    createdBy: 'Teacher A',
    ...rest,
  };
}

function consentForm(
  partial: Partial<Omit<PGConsentFormPost, 'id'>> & { id: string },
): PGConsentFormPost {
  const { id, ...rest } = partial;
  return {
    kind: 'form',
    id: id as ConsentFormId,
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
    ...rest,
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

  it('keeps only mine-owned rows when ownership filter is ["mine"]', () => {
    expect(matchesPostFilters(row(mine), { ...baseFilter, ownership: ['mine'] })).toBe(true);
    expect(matchesPostFilters(row(shared), { ...baseFilter, ownership: ['mine'] })).toBe(false);
  });

  it('empty ownership filter keeps everything (no default narrowing)', () => {
    expect(matchesPostFilters(row(mine), baseFilter)).toBe(true);
    expect(matchesPostFilters(row(shared), baseFilter)).toBe(true);
  });

  it('AND-composes ownership with search query', () => {
    expect(
      matchesPostFilters(row(shared), {
        ...baseFilter,
        ownership: ['shared'],
        query: 'shared',
      }),
    ).toBe(true);
    expect(
      matchesPostFilters(row(shared), {
        ...baseFilter,
        ownership: ['shared'],
        query: 'nonexistent',
      }),
    ).toBe(false);
  });

  it('hides forms on the Posts tab and announcements on the Posts-with-responses tab', () => {
    expect(matchesPostFilters(row(mineForm), baseFilter)).toBe(false);
    expect(matchesPostFilters(row(mine), { ...baseFilter, tab: 'with-responses' })).toBe(false);
    expect(matchesPostFilters(row(mineForm), { ...baseFilter, tab: 'with-responses' })).toBe(true);
  });

  it('produces 4 non-overlapping filtered sets across tab × ownership', () => {
    const all = [mine, shared, mineForm, sharedForm].map(row);
    const filter = (tab: 'view-only' | 'with-responses', who: 'mine' | 'shared') =>
      all.filter((r) => matchesPostFilters(r, { ...baseFilter, tab, ownership: [who] }));

    expect(filter('view-only', 'mine').map((r) => r.id)).toEqual(['ann_1']);
    expect(filter('view-only', 'shared').map((r) => r.id)).toEqual(['ann_2']);
    expect(filter('with-responses', 'mine').map((r) => r.id)).toEqual(['cf_1']);
    expect(filter('with-responses', 'shared').map((r) => r.id)).toEqual(['cf_2']);
  });

  it('search query is case-insensitive', () => {
    expect(matchesPostFilters(row(mine), { ...baseFilter, query: 'MATHS' })).toBe(true);
  });

  it('buckets posting/open/closed under "posted" status', () => {
    const postingAnn = announcement({ id: 'ann_p', status: 'posting', ownership: 'mine' });
    const openForm = consentForm({ id: 'cf_o', status: 'open', ownership: 'mine' });
    const closedForm = consentForm({ id: 'cf_c', status: 'closed', ownership: 'mine' });
    expect(matchesPostFilters(row(postingAnn), { ...baseFilter, status: ['posted'] })).toBe(true);
    expect(
      matchesPostFilters(row(openForm), {
        ...baseFilter,
        tab: 'with-responses',
        status: ['posted'],
      }),
    ).toBe(true);
    expect(
      matchesPostFilters(row(closedForm), {
        ...baseFilter,
        tab: 'with-responses',
        status: ['posted'],
      }),
    ).toBe(true);
  });

  it('filters by response type', () => {
    const ack = consentForm({ id: 'cf_ack', responseType: 'acknowledge' });
    const yn = consentForm({ id: 'cf_yn', responseType: 'yes-no' });
    expect(
      matchesPostFilters(row(ack), {
        ...baseFilter,
        tab: 'with-responses',
        response: ['acknowledge'],
      }),
    ).toBe(true);
    expect(
      matchesPostFilters(row(yn), {
        ...baseFilter,
        tab: 'with-responses',
        response: ['acknowledge'],
      }),
    ).toBe(false);
  });

  it('filters by inclusive date range on `_dateTs`', () => {
    const dated = { ...row(mine), _dateTs: new Date('2026-04-15T10:00:00').getTime() };
    expect(matchesPostFilters(dated, { ...baseFilter, dateFrom: '2026-04-15' })).toBe(true);
    expect(matchesPostFilters(dated, { ...baseFilter, dateFrom: '2026-04-16' })).toBe(false);
    expect(matchesPostFilters(dated, { ...baseFilter, dateTo: '2026-04-15' })).toBe(true);
    expect(matchesPostFilters(dated, { ...baseFilter, dateTo: '2026-04-14' })).toBe(false);
    // Rows with no date are excluded when any bound is set
    expect(matchesPostFilters(row(mine), { ...baseFilter, dateFrom: '2026-04-01' })).toBe(false);
  });

  it('filters by createdBy when the filter is set', () => {
    const fromAlice = announcement({
      id: 'ann_3',
      ownership: 'shared',
      createdBy: 'Alice Tan',
    });
    const fromBob = announcement({ id: 'ann_4', ownership: 'shared', createdBy: 'Bob Lim' });
    expect(matchesPostFilters(row(fromAlice), { ...baseFilter, createdBy: ['Alice Tan'] })).toBe(
      true,
    );
    expect(matchesPostFilters(row(fromBob), { ...baseFilter, createdBy: ['Alice Tan'] })).toBe(
      false,
    );
    // Multi-select: any match passes
    expect(
      matchesPostFilters(row(fromBob), { ...baseFilter, createdBy: ['Alice Tan', 'Bob Lim'] }),
    ).toBe(true);
    // Empty filter is a no-op (does not narrow)
    expect(matchesPostFilters(row(fromBob), baseFilter)).toBe(true);
  });
});

describe('duplicateDraftHref', () => {
  it('builds the announcement-draft edit URL for the announcement kind', () => {
    expect(duplicateDraftHref('announcement', 42)).toBe(
      '/posts/annDraft_42/edit?kind=announcement',
    );
  });

  it('builds the consent-form-draft edit URL for the form kind', () => {
    expect(duplicateDraftHref('form', 99)).toBe('/posts/cfDraft_99/edit?kind=form');
  });
});
