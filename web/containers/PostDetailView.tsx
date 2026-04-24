import { ArrowLeft } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import {
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useRevalidator,
  useRouteError,
} from 'react-router';

import {
  cancelAnnouncementSchedule,
  cancelConsentFormSchedule,
  getConfigs,
  rescheduleAnnouncementDraft,
  rescheduleConsentFormDraft,
} from '~/api/client';
import { PGError, PGNotFoundError } from '~/api/errors';
import type { PGApiConfig } from '~/api/types';
import { ConsentFormHistoryList } from '~/components/posts/ConsentFormHistoryList';
import { PostCard } from '~/components/posts/PostCard';
import { ReadTrackingCards, type ReadCardFilter } from '~/components/posts/ReadTrackingCards';
import {
  DEFAULT_RECIPIENT_FILTER,
  type RecipientFilterValue,
} from '~/components/posts/RecipientFilterPopover';
import { RecipientReadTable } from '~/components/posts/RecipientReadTable';
import { SchedulePickerDialog } from '~/components/posts/SchedulePickerDialog';
import { Badge, Button } from '~/components/ui';
import {
  describeScheduledSendFailure,
  isAnnouncementDraftId,
  isConsentFormDraftId,
  isConsentFormId,
  PG_CONSENT_FORM_STATUS_BADGE,
  PG_STATUS_BADGE,
  postHref,
  validatePostRoute,
  type PGAnnouncementPost,
  type AnnouncementId,
  type PGConsentFormPost,
  type PGPost,
} from '~/data/mock-pg-announcements';
import { POST_REGISTRY } from '~/data/posts-registry';
import { assertNever } from '~/helpers/assertNever';
import { formatDate, formatDateTime } from '~/helpers/dateTime';
import { notify } from '~/lib/notify';

interface PostDetailLoaderData {
  post: PGPost;
  configs: PGApiConfig;
}

// ─── Route loader ───────────────────────────────────────────────────────────

/**
 * Pick the right loader for a detail request. The list-row link carries
 * `?kind=` so we can route without touching the ID shape; if the query string
 * is missing or unrecognised we fall back to parsing the raw ID (numeric →
 * announcement, `cf_<digits>` → consent form). Anything else is a 404.
 */
export async function loader({
  params,
  request,
}: LoaderFunctionArgs): Promise<PostDetailLoaderData> {
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });

  const url = new URL(request.url);
  const parsed = validatePostRoute(id, url.searchParams.get('kind'));
  if (!parsed) throw new Response('Not Found', { status: 404 });

  // Drafts are only accessible via the edit route; a direct detail
  // request for any draft ID is treated as 404.
  if (isAnnouncementDraftId(parsed)) throw new Response('Not Found', { status: 404 });
  if (isConsentFormDraftId(parsed)) throw new Response('Not Found', { status: 404 });

  const [post, configs] = await Promise.all([
    isConsentFormId(parsed)
      ? POST_REGISTRY.form.loadDetail(parsed)
      : POST_REGISTRY.announcement.loadDetail(parsed as AnnouncementId),
    getConfigs(),
  ]);
  return { post, configs };
}

// ─── Error boundary ─────────────────────────────────────────────────────────

export function ErrorBoundary() {
  const error = useRouteError();
  // 404s arrive in two shapes: (a) a loader-thrown `Response(404)` for malformed
  // IDs that fail `validatePostRoute`, which hits `isRouteErrorResponse`; and
  // (b) a server 404 that bubbles up as `PGNotFoundError` from the fetch layer
  // when the ID is well-formed but the resource is missing. Both mean the same
  // thing to the user, so render the same copy.
  const isNotFound =
    (isRouteErrorResponse(error) && error.status === 404) || error instanceof PGNotFoundError;

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16">
      <h2 className="text-xl font-semibold tracking-tight">
        {isNotFound ? 'Post not found' : 'Could not load post'}
      </h2>
      <p className="text-sm text-muted-foreground">
        {isNotFound
          ? 'This post may have been deleted.'
          : 'The server may be unavailable. Please try again.'}
      </p>
      <Button variant="secondary" size="sm" render={<Link to="/posts" />} nativeButton={false}>
        Back to Posts
      </Button>
    </div>
  );
}

// ─── Subviews ──────────────────────────────────────────────────────────────

function statusBadge(post: PGPost) {
  switch (post.kind) {
    case 'announcement':
      return PG_STATUS_BADGE[post.status];
    case 'form':
      return PG_CONSENT_FORM_STATUS_BADGE[post.status];
    default:
      return assertNever(post);
  }
}

/**
 * Strip any branded prefix from a post id and return the bare numeric id
 * PGW's draft endpoints expect (U3). Returns `null` when the id doesn't
 * parse \u2014 the Reschedule action surfaces a toast rather than issuing a
 * malformed request.
 */
function extractDraftNumericId(id: string): number | null {
  const bare = id.startsWith('annDraft_')
    ? id.slice('annDraft_'.length)
    : id.startsWith('cfDraft_')
      ? id.slice('cfDraft_'.length)
      : id.startsWith('cf_')
        ? id.slice('cf_'.length)
        : id;
  const n = Number(bare);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function DetailHeader({ post }: { post: PGPost }) {
  const badge = statusBadge(post);
  const iso = post.postedAt ?? post.createdAt;
  const postedDate = formatDateTime(iso) ?? formatDate(iso);
  const editHref = postHref(post, { edit: true });
  const revalidator = useRevalidator();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canReschedule = post.status === 'scheduled';

  async function handleRescheduleConfirm(scheduledSendAt: string) {
    const draftId = extractDraftNumericId(post.id);
    if (draftId === null) {
      notify.error('Could not resolve the scheduled post id.');
      return;
    }
    setRescheduling(true);
    try {
      if (post.kind === 'form') {
        await rescheduleConsentFormDraft(draftId, { scheduledSendAt });
      } else {
        await rescheduleAnnouncementDraft(draftId, { scheduledSendAt });
      }
      notify.success('Post rescheduled.');
      setRescheduleOpen(false);
      revalidator.revalidate();
    } catch (err) {
      if (!(err instanceof PGError)) {
        notify.error('Failed to reschedule. Please try again.');
      }
    } finally {
      setRescheduling(false);
    }
  }

  async function handleCancelSchedule() {
    const draftId = extractDraftNumericId(post.id);
    if (draftId === null) {
      notify.error('Could not resolve the scheduled post id.');
      return;
    }
    const confirmed = window.confirm(
      'Cancel the scheduled send? The post will return to Draft so you can edit or reschedule it.',
    );
    if (!confirmed) return;
    setCancelling(true);
    try {
      if (post.kind === 'form') {
        await cancelConsentFormSchedule(draftId);
      } else {
        await cancelAnnouncementSchedule(draftId);
      }
      notify.success('Scheduled send cancelled.');
      revalidator.revalidate();
    } catch (err) {
      if (!(err instanceof PGError)) {
        notify.error('Failed to cancel the scheduled send.');
      }
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link to="/posts" />}
          nativeButton={false}
          aria-label="Back to Posts"
          className="mt-1"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Posted {postedDate}
            {post.createdBy ? ` \u00b7 ${post.createdBy}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {canReschedule && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelSchedule}
              disabled={cancelling || rescheduling}
            >
              Cancel schedule
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRescheduleOpen(true)}
              disabled={cancelling || rescheduling}
            >
              Reschedule
            </Button>
          </>
        )}
        <Button variant="secondary" size="sm" render={<Link to={editHref} />} nativeButton={false}>
          Edit
        </Button>
      </div>

      {canReschedule && (
        <SchedulePickerDialog
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
          onConfirm={handleRescheduleConfirm}
          busy={rescheduling}
        />
      )}
    </div>
  );
}

function AnnouncementDetail({ post }: { post: PGAnnouncementPost }) {
  const sortedRecipients = useMemo(
    () =>
      [...post.recipients].sort((a, b) => {
        if (a.readStatus === 'unread' && b.readStatus === 'read') return -1;
        if (a.readStatus === 'read' && b.readStatus === 'unread') return 1;
        return 0;
      }),
    [post.recipients],
  );

  // Filter is lifted here so stat cards can drive it. `read` maps 1:1 to the
  // Read card's main/pending toggle; class + columns are still teacher-driven
  // via the popover.
  const [filter, setFilter] = useState<RecipientFilterValue>(DEFAULT_RECIPIENT_FILTER);
  const readCardFilter: ReadCardFilter =
    filter.read === 'read' ? 'read' : filter.read === 'unread' ? 'unread' : null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <ReadTrackingCards
          responseType={post.responseType}
          stats={post.stats}
          readFilter={readCardFilter}
          onReadFilterChange={(next) =>
            setFilter((f) => ({ ...f, read: next === null ? 'all' : next }))
          }
        />

        <RecipientReadTable
          recipients={sortedRecipients}
          responseType={post.responseType}
          filter={filter}
          onFilterChange={setFilter}
          exportId={String(post.id)}
        />
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <PostCard post={post} />
      </div>
    </div>
  );
}

function ConsentFormDetail({ post }: { post: PGConsentFormPost }) {
  // Sort: pending (no response) first, then YES, then NO — matches how teachers
  // triage chase-ups on the responses table.
  const sortedRecipients = useMemo(
    () =>
      [...post.recipients].sort((a, b) => {
        const rank = (r: typeof a) => (r.response === null ? 0 : r.response === 'YES' ? 1 : 2);
        return rank(a) - rank(b);
      }),
    [post.recipients],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <ReadTrackingCards kind="form" responseType={post.responseType} stats={post.stats} />

        <RecipientReadTable
          kind="form"
          recipients={sortedRecipients}
          responseType={post.responseType}
          exportId={String(post.id)}
        />

        <ConsentFormHistoryList entries={post.history} />
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <PostCard post={post} />
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

const PostDetailView: React.FC = () => {
  const { post } = useLoaderData<PostDetailLoaderData>();
  const failureReason = describeScheduledSendFailure(post.scheduledSendFailureCode);

  return (
    <div className="space-y-6 px-6 py-6">
      <DetailHeader post={post} />
      {failureReason && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <span className="font-medium">Scheduled send failed.</span> {failureReason}. Reschedule or
          cancel this post to try again.
        </div>
      )}
      {renderDetail(post)}
    </div>
  );
};

function renderDetail(post: PGPost) {
  switch (post.kind) {
    case 'announcement':
      return <AnnouncementDetail post={post} />;
    case 'form':
      return <ConsentFormDetail post={post} />;
    default:
      return assertNever(post);
  }
}

export { PostDetailView as Component };
