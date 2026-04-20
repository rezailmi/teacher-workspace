import { loadConsentPostDetail, loadPostDetail } from '~/api/client';
import { getRelevantDate } from '~/helpers/dateTime';

import type {
  AnnouncementId,
  ConsentFormId,
  PGAnnouncementPost,
  PGConsentFormPost,
  PGPost,
} from './mock-pg-announcements';

/**
 * Kind-keyed dispatch table for post-level behaviours that have no natural
 * home on `PGPost` itself (route loaders, memo keys, relevant-date accessor).
 * Adding a third kind means adding one object literal — `satisfies` forces
 * every slot to be populated, and every consumer to narrow via
 * `POST_REGISTRY[post.kind]` gets a compile error if a new kind is missing.
 */
export const POST_REGISTRY = {
  announcement: {
    loadDetail: (id: AnnouncementId) => loadPostDetail(id),
    relevantDate: (p: PGAnnouncementPost) => getRelevantDate(p),
    memoKeys: (p: PGAnnouncementPost): readonly (string | number | undefined)[] => [
      p.id,
      p.status,
      p.ownership,
      p.title,
      p.description,
      p.stats.totalCount,
      p.stats.readCount,
      p.postedAt,
    ],
  },
  form: {
    loadDetail: (id: ConsentFormId) => loadConsentPostDetail(id),
    relevantDate: (p: PGConsentFormPost) => getRelevantDate(p),
    memoKeys: (p: PGConsentFormPost): readonly (string | number | undefined)[] => [
      p.id,
      p.status,
      p.ownership,
      p.title,
      p.description,
      p.stats.totalCount,
      p.stats.yesCount,
      p.stats.noCount,
      p.stats.pendingCount,
    ],
  },
} as const satisfies Record<PGPost['kind'], unknown>;
