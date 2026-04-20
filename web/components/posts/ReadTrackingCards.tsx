import { Check, Clock, MessageSquareText, Users, X } from 'lucide-react';
import { memo } from 'react';

import { Card, CardContent, Progress } from '~/components/ui';
import type {
  PGAnnouncementStats,
  PGConsentFormStats,
  ResponseType,
} from '~/data/mock-pg-announcements';

type ReadTrackingCardsProps =
  | { kind?: 'announcement'; responseType: ResponseType; stats: PGAnnouncementStats }
  | { kind: 'form'; responseType: 'acknowledge' | 'yes-no'; stats: PGConsentFormStats };

interface StatCardProps {
  label: string;
  count: number;
  total: number;
  icon: React.ReactNode;
  subline?: React.ReactNode;
  /** Compact variant hides the progress bar — used when several cards share a row. */
  variant?: 'default' | 'compact';
  /** Tone drives the icon circle color so each stat reads at a glance. */
  tone?: 'primary' | 'success' | 'destructive' | 'muted';
}

const TONE_CLASS: Record<NonNullable<StatCardProps['tone']>, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success-foreground',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

const StatCard = memo(function StatCard({
  label,
  count,
  total,
  icon,
  subline,
  variant = 'default',
  tone = 'primary',
}: StatCardProps) {
  const percent = total > 0 ? (count / total) * 100 : 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              {label}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl leading-none font-semibold tabular-nums">{count}</span>
              <span className="text-base text-muted-foreground tabular-nums">/ {total}</span>
            </div>
            {subline}
          </div>

          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[tone]}`}
          >
            {icon}
          </div>
        </div>

        {variant === 'default' && (
          <div className="flex items-center gap-3">
            <Progress value={percent} className="flex-1" aria-label={`${label} progress`} />
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {count} / {total}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

function AnnouncementCards({
  responseType,
  stats,
}: {
  responseType: ResponseType;
  stats: PGAnnouncementStats;
}) {
  const { totalCount, readCount, responseCount, yesCount, noCount } = stats;
  const unreadCount = Math.max(totalCount - readCount, 0);

  const readSubline =
    unreadCount > 0 ? (
      <span className="text-sm font-medium text-warning-foreground">{unreadCount} unread</span>
    ) : null;

  const readCard = (
    <StatCard
      label="Read by parents"
      count={readCount}
      total={totalCount}
      icon={<Users className="h-5 w-5" />}
      subline={readSubline}
    />
  );

  if (responseType === 'view-only') {
    return readCard;
  }

  const responseLabel = responseType === 'acknowledge' ? 'Acknowledged' : 'Responses received';
  const responseSubline =
    responseType === 'yes-no' && totalCount > 0 ? (
      <span className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{yesCount}</span> yes {'\u00b7'}{' '}
        <span className="font-medium text-foreground">{noCount}</span> no
      </span>
    ) : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {readCard}
      <StatCard
        label={responseLabel}
        count={responseCount}
        total={totalCount}
        icon={<MessageSquareText className="h-5 w-5" />}
        subline={responseSubline}
      />
    </div>
  );
}

function ConsentFormCards({
  responseType,
  stats,
}: {
  responseType: 'acknowledge' | 'yes-no';
  stats: PGConsentFormStats;
}) {
  const { totalCount, yesCount, noCount, pendingCount } = stats;

  const totalCard = (
    <StatCard
      label="Total"
      count={totalCount}
      total={totalCount}
      icon={<Users className="h-5 w-5" />}
      tone="primary"
    />
  );

  const yesCard = (
    <StatCard
      label={responseType === 'acknowledge' ? 'Acknowledged' : 'Yes'}
      count={yesCount}
      total={totalCount}
      icon={<Check className="h-5 w-5" strokeWidth={2.25} />}
      tone="success"
      variant="compact"
    />
  );

  const pendingCard = (
    <StatCard
      label="Pending"
      count={pendingCount}
      total={totalCount}
      icon={<Clock className="h-5 w-5" strokeWidth={2.25} />}
      tone="muted"
      variant="compact"
    />
  );

  if (responseType === 'acknowledge') {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {totalCard}
        {yesCard}
        {pendingCard}
      </div>
    );
  }

  const noCard = (
    <StatCard
      label="No"
      count={noCount}
      total={totalCount}
      icon={<X className="h-5 w-5" strokeWidth={2.25} />}
      tone="destructive"
      variant="compact"
    />
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {totalCard}
      {yesCard}
      {pendingCard}
      {noCard}
    </div>
  );
}

export function ReadTrackingCards(props: ReadTrackingCardsProps) {
  if (props.kind === 'form') {
    return <ConsentFormCards responseType={props.responseType} stats={props.stats} />;
  }
  return <AnnouncementCards responseType={props.responseType} stats={props.stats} />;
}
