import { memo } from 'react';

import { Card, CardContent, Progress } from '~/components/ui';
import type {
  PGAnnouncementStats,
  PGConsentFormStats,
  ResponseType,
} from '~/data/mock-pg-announcements';
import { cn } from '~/lib/utils';

/**
 * Scope the Read card filters by when clicked. `main` = "filter to read only";
 * `pending` = "filter to unread only". `null` means no active filter.
 */
export type ReadCardFilter = 'read' | 'unread' | null;

type ReadTrackingCardsProps =
  | {
      kind?: 'announcement';
      responseType: ResponseType;
      stats: PGAnnouncementStats;
      /** When provided, the Read card becomes clickable (both the main count
       *  and the unread pending note). Consent forms don't receive this. */
      readFilter?: ReadCardFilter;
      onReadFilterChange?: (next: ReadCardFilter) => void;
    }
  | { kind: 'form'; responseType: 'acknowledge' | 'yes-no'; stats: PGConsentFormStats };

/**
 * Mini-stat slot for the right edge of a ResponseCard — mirrors the YES / NO
 * pair on the announcement responses card. `tone` drives the count colour so
 * teachers triage the card at a glance (green = positive, red = negative,
 * muted = neutral).
 */
interface MiniStat {
  count: number;
  label: string;
  tone: 'success' | 'destructive' | 'muted';
}

const MINI_TONE: Record<MiniStat['tone'], string> = {
  success: 'text-success-foreground',
  destructive: 'text-destructive',
  muted: 'text-muted-foreground',
};

function MiniStatCell({ count, label, tone }: MiniStat) {
  return (
    <div className="flex min-w-[44px] flex-col items-center gap-0.5">
      <span className={cn('text-3xl leading-none font-semibold tabular-nums', MINI_TONE[tone])}>
        {count}
      </span>
      <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

interface ResponseCardProps {
  label: string;
  count: number;
  total: number;
  /**
   * Urgent note rendered in amber when the teacher still has parents to chase
   * up (unread / no-response / pending). Null otherwise so the row collapses.
   */
  pendingNote?: string | null;
  /** Right-edge mini-stats. Empty array hides the right column entirely. */
  miniStats?: MiniStat[];
  /** Clicking the main count region fires this; makes the region focusable. */
  onMainActivate?: () => void;
  /** Clicking the pendingNote fires this; makes it focusable. */
  onPendingActivate?: () => void;
  /** `'main'` highlights the main count; `'pending'` highlights the note. */
  active?: 'main' | 'pending' | null;
}

const ResponseCard = memo(function ResponseCard({
  label,
  count,
  total,
  pendingNote,
  miniStats = [],
  onMainActivate,
  onPendingActivate,
  active = null,
}: ResponseCardProps) {
  const percent = total > 0 ? (count / total) * 100 : 0;

  const mainContent = (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-4xl leading-none font-semibold tracking-tight tabular-nums">
        {count}
      </span>
      <span className="text-xl text-muted-foreground tabular-nums">/ {total}</span>
    </div>
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {label}
            </span>
            {onMainActivate ? (
              <button
                type="button"
                onClick={onMainActivate}
                aria-pressed={active === 'main'}
                className={cn(
                  'rounded-md text-left transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                  active === 'main' ? 'ring-2 ring-primary' : 'hover:bg-muted/40',
                )}
              >
                {mainContent}
              </button>
            ) : (
              mainContent
            )}
            {pendingNote &&
              (onPendingActivate ? (
                <button
                  type="button"
                  onClick={onPendingActivate}
                  aria-pressed={active === 'pending'}
                  className={cn(
                    'rounded-md px-1 text-left text-sm font-medium text-warning-foreground transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                    active === 'pending'
                      ? 'bg-warning/20 ring-2 ring-warning'
                      : 'hover:bg-warning/10',
                  )}
                >
                  {pendingNote}
                </button>
              ) : (
                <span className="text-sm font-medium text-warning-foreground">{pendingNote}</span>
              ))}
          </div>

          {miniStats.length > 0 && (
            <div className="flex items-start gap-4 pt-1">
              {miniStats.map((s) => (
                <MiniStatCell key={s.label} {...s} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Progress value={percent} className="flex-1" aria-label={`${label} progress`} />
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {count} / {total}
          </span>
        </div>
      </CardContent>
    </Card>
  );
});

// ─── Announcement variant ───────────────────────────────────────────────────

function AnnouncementCard({
  responseType,
  stats,
  readFilter,
  onReadFilterChange,
}: {
  responseType: ResponseType;
  stats: PGAnnouncementStats;
  readFilter?: ReadCardFilter;
  onReadFilterChange?: (next: ReadCardFilter) => void;
}) {
  const { totalCount, readCount, responseCount, yesCount, noCount } = stats;
  const unreadCount = Math.max(totalCount - readCount, 0);

  const active: 'main' | 'pending' | null =
    readFilter === 'read' ? 'main' : readFilter === 'unread' ? 'pending' : null;
  const toggle = (scope: 'read' | 'unread') => {
    if (!onReadFilterChange) return;
    onReadFilterChange(readFilter === scope ? null : scope);
  };

  const readCard = (
    <ResponseCard
      label="Read by parents"
      count={readCount}
      total={totalCount}
      pendingNote={unreadCount > 0 ? `${unreadCount} unread` : null}
      onMainActivate={onReadFilterChange ? () => toggle('read') : undefined}
      onPendingActivate={onReadFilterChange && unreadCount > 0 ? () => toggle('unread') : undefined}
      active={active}
    />
  );

  if (responseType === 'view-only') {
    return readCard;
  }

  const pending = Math.max(totalCount - responseCount, 0);
  const label = responseType === 'acknowledge' ? 'Acknowledged' : 'Responses received';
  const noteWord = responseType === 'acknowledge' ? 'pending' : 'no response';
  const miniStats: MiniStat[] =
    responseType === 'yes-no'
      ? [
          { count: yesCount, label: 'Yes', tone: 'success' },
          { count: noCount, label: 'No', tone: 'destructive' },
        ]
      : [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {readCard}
      <ResponseCard
        label={label}
        count={responseCount}
        total={totalCount}
        pendingNote={pending > 0 ? `${pending} ${noteWord}` : null}
        miniStats={miniStats}
      />
    </div>
  );
}

// ─── Consent-form variant ───────────────────────────────────────────────────

function ConsentFormCard({
  responseType,
  stats,
}: {
  responseType: 'acknowledge' | 'yes-no';
  stats: PGConsentFormStats;
}) {
  const { totalCount, yesCount, noCount, pendingCount } = stats;
  // Acknowledge: yesCount carries the ack count, noCount is unused.
  // Yes/No: yesCount + noCount together make the responded count.
  const respondedCount =
    responseType === 'acknowledge' ? yesCount : Math.max(totalCount - pendingCount, 0);
  const label =
    responseType === 'acknowledge' ? 'Acknowledgements received' : 'Consent form responses';
  const miniStats: MiniStat[] =
    responseType === 'yes-no'
      ? [
          { count: yesCount, label: 'Yes', tone: 'success' },
          { count: noCount, label: 'No', tone: 'destructive' },
        ]
      : [];

  return (
    <ResponseCard
      label={label}
      count={respondedCount}
      total={totalCount}
      pendingNote={pendingCount > 0 ? `${pendingCount} pending` : null}
      miniStats={miniStats}
    />
  );
}

export function ReadTrackingCards(props: ReadTrackingCardsProps) {
  if (props.kind === 'form') {
    return <ConsentFormCard responseType={props.responseType} stats={props.stats} />;
  }
  return (
    <AnnouncementCard
      responseType={props.responseType}
      stats={props.stats}
      readFilter={props.readFilter}
      onReadFilterChange={props.onReadFilterChange}
    />
  );
}
