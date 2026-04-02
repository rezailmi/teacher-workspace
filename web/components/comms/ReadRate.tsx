import { cn } from '@flow/core';

interface ReadRateProps {
  readCount: number;
  totalCount: number;
  compact?: boolean;
  className?: string;
}

export function ReadRate({
  readCount,
  totalCount,
  compact = false,
  className,
}: ReadRateProps) {
  if (totalCount === 0) {
    return <span className="text-sm text-muted-foreground">{'\u2014'}</span>;
  }

  const pct = Math.round((readCount / totalCount) * 100);
  const isLow = pct < 50;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isLow ? 'bg-amber-400' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact && (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {readCount} / {totalCount}
        </span>
      )}
    </div>
  );
}
