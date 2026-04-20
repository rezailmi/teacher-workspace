import { ArrowLeft } from 'lucide-react';
import React, { useMemo } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import { isRouteErrorResponse, Link, useLoaderData, useRouteError } from 'react-router';

import { loadConsentPostDetail, loadPostDetail } from '~/api/client';
import { ConsentFormHistoryList } from '~/components/posts/ConsentFormHistoryList';
import { PostCard } from '~/components/posts/PostCard';
import { ReadTrackingCards } from '~/components/posts/ReadTrackingCards';
import { RecipientReadTable } from '~/components/posts/RecipientReadTable';
import { Badge, Button } from '~/components/ui';
import {
  isConsentFormId,
  parsePostId,
  PG_CONSENT_FORM_STATUS_BADGE,
  PG_STATUS_BADGE,
  type PGAnnouncementPost,
  type PGConsentFormPost,
  type PGPost,
} from '~/data/mock-pg-announcements';
import { formatDate, formatDateTime } from '~/helpers/dateTime';

// Exhaustiveness helper — if the `PGPost` union ever gains a third kind, the
// default branch below will fail to compile until this is handled.
function assertNever(x: never): never {
  throw new Error(`Unreachable post kind: ${JSON.stringify(x)}`);
}

// ─── Route loader ───────────────────────────────────────────────────────────

/**
 * Pick the right loader for a detail request. The list-row link carries
 * `?kind=` so we can route without touching the ID shape; if the query string
 * is missing or unrecognised we fall back to parsing the raw ID (numeric →
 * announcement, `cf_<digits>` → consent form). Anything else is a 404.
 */
export async function loader({ params, request }: LoaderFunctionArgs): Promise<PGPost> {
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });

  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');

  if (kindParam === 'form') {
    const parsed = parsePostId(id);
    if (!parsed || !isConsentFormId(parsed)) {
      throw new Response('Not Found', { status: 404 });
    }
    return loadConsentPostDetail(parsed);
  }
  if (kindParam === 'announcement') {
    const parsed = parsePostId(id);
    if (!parsed || isConsentFormId(parsed)) {
      throw new Response('Not Found', { status: 404 });
    }
    return loadPostDetail(parsed);
  }

  // Fallback: infer kind from the ID shape.
  const parsed = parsePostId(id);
  if (!parsed) throw new Response('Not Found', { status: 404 });
  return isConsentFormId(parsed) ? loadConsentPostDetail(parsed) : loadPostDetail(parsed);
}

// ─── Error boundary ─────────────────────────────────────────────────────────

export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16">
      <h2 className="text-xl font-semibold tracking-tight">
        {isRouteErrorResponse(error) && error.status === 404
          ? 'Post not found'
          : 'Could not load post'}
      </h2>
      <p className="text-sm text-muted-foreground">
        {isRouteErrorResponse(error) && error.status === 404
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

function DetailHeader({ post }: { post: PGPost }) {
  const isForm = post.kind === 'form';
  const badge = isForm ? PG_CONSENT_FORM_STATUS_BADGE[post.status] : PG_STATUS_BADGE[post.status];
  const iso = post.postedAt ?? post.createdAt;
  const postedDate = formatDateTime(iso) ?? formatDate(iso);
  const editHref = `/posts/${post.id}/edit?kind=${post.kind}`;

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

      <Button variant="secondary" size="sm" render={<Link to={editHref} />} nativeButton={false}>
        Edit
      </Button>
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

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <ReadTrackingCards responseType={post.responseType} stats={post.stats} />

        <RecipientReadTable recipients={sortedRecipients} responseType={post.responseType} />
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
  const post = useLoaderData<PGPost>();

  return (
    <div className="space-y-6 px-6 py-6">
      <DetailHeader post={post} />
      {post.kind === 'announcement' ? (
        <AnnouncementDetail post={post} />
      ) : post.kind === 'form' ? (
        <ConsentFormDetail post={post} />
      ) : (
        assertNever(post)
      )}
    </div>
  );
};

export { PostDetailView as Component };
