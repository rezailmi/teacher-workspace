import {
  AlertTriangle,
  Copy,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { Link, useLoaderData, useNavigate, useRevalidator } from 'react-router';

import {
  deleteAnnouncement,
  deleteConsentForm,
  deleteConsentFormDraft,
  deleteDraft,
  duplicateAnnouncement,
  duplicateConsentForm,
  getConfigs,
  loadConsentPostsList,
  loadPostsList,
} from '~/api/client';
import { PGError } from '~/api/errors';
import type { PGApiConfig } from '~/api/types';
import { ReadRate, RespondedRate } from '~/components/posts/ReadRate';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui';
import {
  isAnnouncementDraftId,
  isConsentFormDraftId,
  PG_CONSENT_FORM_STATUS_BADGE,
  PG_STATUS_BADGE,
  postHref,
} from '~/data/mock-pg-announcements';
import type { AnnouncementId, PGPost } from '~/data/mock-pg-announcements';
import { formatDate, getRelevantDate, isLowReadRate } from '~/helpers/dateTime';
import { notify } from '~/lib/notify';

type PostTab = 'view-only' | 'with-responses';

// Row augmented with `_date` and `_dateTs` so sorts/renders don't allocate
// a new `Date` per keystroke. Precomputed once in the loader.
type PostRowData = PGPost & { _date: string | undefined; _dateTs: number };

interface PostsLoaderData {
  rows: PostRowData[];
  /** PG feature flags; gates row-level actions (e.g. duplicate). */
  configs: PGApiConfig;
}

// ─── Route loader ───────────────────────────────────────────────────────────

const withDateTs = (p: PGPost): PostRowData => {
  const date = getRelevantDate(p);
  return { ...p, _date: date, _dateTs: date ? new Date(date).getTime() : 0 };
};

export async function loader(): Promise<PostsLoaderData> {
  const [announcements, forms, configs] = await Promise.all([
    loadPostsList(),
    loadConsentPostsList(),
    getConfigs(),
  ]);
  return { rows: [...announcements, ...forms].map(withDateTs), configs };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Tie-break: when two rows share the same timestamp, announcements render
// before forms, then lexical ID order — keeps sort output stable across
// re-renders regardless of the underlying `Array.sort` implementation.
function comparePosts(a: PostRowData, b: PostRowData): number {
  if (a._dateTs !== b._dateTs) return b._dateTs - a._dateTs;
  if (a.kind !== b.kind) return a.kind === 'announcement' ? -1 : 1;
  return a.id.localeCompare(b.id);
}

// ─── Component ──────────────────────────────────────────────────────────────

const PostsView: React.FC = () => {
  const { rows: posts, configs } = useLoaderData<PostsLoaderData>();
  const revalidator = useRevalidator();
  const [tab, setTab] = useState<PostTab>('view-only');
  const [searchQuery, setSearchQuery] = useState('');
  // `duplicate_announcement_form_post` gates the Duplicate row action — the
  // endpoint is still safe to call, but hiding the affordance matches the
  // PG UI when schools have the feature off.
  const duplicateEnabled = configs.flags.duplicate_announcement_form_post?.enabled === true;

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return posts
      .filter((p) => {
        if (tab === 'view-only' && p.kind === 'form') return false;
        if (tab === 'with-responses' && p.kind !== 'form') return false;
        if (q && !p.title.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice()
      .sort(comparePosts);
  }, [posts, searchQuery, tab]);

  const showResponseColumn = tab === 'with-responses';

  const handleDuplicate = useCallback(
    (row: PostRowData) => {
      const promise =
        row.kind === 'announcement'
          ? duplicateAnnouncement({ postId: Number(row.id) })
          : duplicateConsentForm({ consentFormId: Number(row.id.slice(3)) });

      promise
        .then(() => {
          revalidator.revalidate();
          notify.success('Post duplicated.');
        })
        .catch(() => {
          // Surface every failure, including PGError — the global handler
          // doesn't toast for this path, so a swallowed error leaves the
          // user clicking with no feedback.
          notify.error('Failed to duplicate post.');
        });
    },
    [revalidator],
  );

  const handleDelete = useCallback(
    async (row: PostRowData) => {
      if (!confirm('Delete this post?')) return;
      try {
        if (isConsentFormDraftId(row.id)) {
          await deleteConsentFormDraft(Number(row.id.slice('cfDraft_'.length)));
        } else if (row.kind === 'form') {
          await deleteConsentForm(row.id);
        } else if (isAnnouncementDraftId(row.id)) {
          await deleteDraft(Number(row.id.slice('annDraft_'.length)));
        } else {
          await deleteAnnouncement(row.id as AnnouncementId);
        }
        revalidator.revalidate();
        notify.success('Post deleted.');
      } catch (err) {
        if (!(err instanceof PGError)) {
          notify.error('Failed to delete post.');
        }
      }
    },
    [revalidator],
  );

  return (
    <div className="flex flex-col">
      {/* Page header */}
      <div className="border-b px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
            <p className="text-sm text-muted-foreground">
              Send posts to parents via Parents Gateway, send a view-only post or collect responses.
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            render={<Link to="/posts/new" />}
            nativeButton={false}
          >
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </div>
      </div>

      {/* Toolbar: view selector + search + filter */}
      <div className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6">
          <Select value={tab} onValueChange={(v) => setTab(v as PostTab)}>
            <SelectTrigger className="w-[200px]" aria-label="View">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view-only">Posts</SelectItem>
              <SelectItem value="with-responses">Posts with responses</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-w-[220px] pl-9 sm:w-[280px]"
                aria-label="Search posts"
              />
            </div>
            <Button variant="secondary" size="sm">
              <SlidersHorizontal className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="max-w-full overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              {searchQuery ? (
                <>
                  <p className="text-base text-foreground">No posts match your search.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try adjusting your search terms.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base text-foreground">No posts yet.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create your first post to get started.
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    className="mt-4"
                    render={<Link to="/posts/new" />}
                    nativeButton={false}
                  >
                    <Plus className="h-4 w-4" />
                    Create
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader className="border-b bg-white">
                <TableRow>
                  <TableHead className="min-w-[360px] pl-6">Title</TableHead>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[90px]">Owner</TableHead>
                  <TableHead className="w-[170px]">
                    {showResponseColumn ? 'Read / Response' : 'Read'}
                  </TableHead>
                  <TableHead className="w-[48px] pr-2">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <PostRow
                    key={row.id}
                    row={row}
                    duplicateEnabled={duplicateEnabled}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Row ────────────────────────────────────────────────────────────────────

interface PostRowProps {
  row: PostRowData;
  /** When false, the Duplicate dropdown item is hidden. Single gate across both kinds. */
  duplicateEnabled: boolean;
  onDuplicate: (row: PostRowData) => void;
  onDelete: (row: PostRowData) => void;
}

const PostRowInner: React.FC<PostRowProps> = ({ row, duplicateEnabled, onDuplicate, onDelete }) => {
  const navigate = useNavigate();
  const isShared = row.ownership === 'shared';
  const showDuplicate = duplicateEnabled;

  const statusBadge =
    row.kind === 'form' ? PG_CONSENT_FORM_STATUS_BADGE[row.status] : PG_STATUS_BADGE[row.status];

  const showLowRead =
    row.kind === 'announcement' &&
    row.status === 'posted' &&
    isLowReadRate(row.postedAt, row.stats.readCount, row.stats.totalCount);

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => navigate(postHref(row, { edit: row.status === 'draft' }))}
    >
      {/* Title + description stacked */}
      <TableCell className="overflow-hidden pl-6 align-top whitespace-normal">
        <div className="min-w-0 py-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{row.title}</span>
            {showLowRead && (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-foreground" />
            )}
          </div>
          {row.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.description}</p>
          )}
        </div>
      </TableCell>

      {/* Date */}
      <TableCell className="text-sm text-muted-foreground">
        <span className={row.status === 'scheduled' ? 'text-warning-foreground' : undefined}>
          {formatDate(row._date)}
        </span>
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
      </TableCell>

      {/* Owner */}
      <TableCell>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {isShared ? (
            <>
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>Shared</span>
            </>
          ) : (
            <span>Mine</span>
          )}
        </div>
      </TableCell>

      {/* Read / Response */}
      <TableCell className="pr-6">
        <PostRowResponseCell row={row} />
      </TableCell>

      {/* Actions */}
      <TableCell className="w-[48px] pr-2 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="More actions"
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {showDuplicate && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(row);
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
            )}
            {!isShared && (
              <>
                {showDuplicate && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDelete(row);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

/**
 * Row memoisation key: (id, status, kind, ownership) + the kind-specific
 * counts that actually drive rendering. Skipping equal re-renders removes
 * the per-keystroke ~100-row refresh the search input caused.
 */
const PostRow = React.memo(PostRowInner, (prev, next) => {
  if (prev.onDuplicate !== next.onDuplicate || prev.onDelete !== next.onDelete) return false;
  if (prev.duplicateEnabled !== next.duplicateEnabled) return false;
  const a = prev.row;
  const b = next.row;
  if (a.id !== b.id) return false;
  if (a.status !== b.status) return false;
  if (a.kind !== b.kind) return false;
  if (a.ownership !== b.ownership) return false;
  if (a.title !== b.title) return false;
  if (a.description !== b.description) return false;
  if (a._date !== b._date) return false;
  if (a.stats.totalCount !== b.stats.totalCount) return false;
  if (a.kind === 'announcement' && b.kind === 'announcement') {
    if (a.stats.readCount !== b.stats.readCount) return false;
    if (a.postedAt !== b.postedAt) return false;
  }
  if (a.kind === 'form' && b.kind === 'form') {
    if (a.stats.yesCount !== b.stats.yesCount) return false;
    if (a.stats.noCount !== b.stats.noCount) return false;
    if (a.stats.pendingCount !== b.stats.pendingCount) return false;
  }
  return true;
});

// ─── Response cell ──────────────────────────────────────────────────────────

const PostRowResponseCell: React.FC<{ row: PostRowData }> = ({ row }) => {
  if (row.kind === 'announcement') {
    if (row.status !== 'posted') {
      return <span className="text-sm text-muted-foreground">{'\u2014'}</span>;
    }
    return <ReadRate readCount={row.stats.readCount} totalCount={row.stats.totalCount} />;
  }

  if (row.status !== 'open' && row.status !== 'closed') {
    return <span className="text-sm text-muted-foreground">{'\u2014'}</span>;
  }
  const respondedCount = row.stats.totalCount - row.stats.pendingCount;
  return <RespondedRate respondedCount={respondedCount} totalCount={row.stats.totalCount} />;
};

export { PostsView as Component };
