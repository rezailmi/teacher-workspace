import { cn } from '@flow/core';

interface ReadRateProps {
  readCount: number;
  totalCount: number;
  className?: string;
}

export function ReadRate({ readCount, totalCount, className }: ReadRateProps) {
  if (totalCount === 0) {
    return <span className="text-sm text-muted-foreground">{'\u2014'}</span>;
  }

  return (
    <span className={cn('text-sm text-muted-foreground', className)}>
      {readCount} / {totalCount}
    </span>
  );
}
