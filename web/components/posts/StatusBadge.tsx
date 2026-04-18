import type { VariantProps } from 'class-variance-authority';

import { Badge, type badgeVariants } from '~/components/ui';
import type { PGStatus } from '~/data/mock-pg-announcements';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const STATUS_CONFIG: Record<PGStatus, { label: string; variant: BadgeVariant }> = {
  posted: { label: 'Posted', variant: 'success' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  posting: { label: 'Posting', variant: 'info' },
  draft: { label: 'Draft', variant: 'secondary' },
};

const FALLBACK = STATUS_CONFIG.draft;

interface StatusBadgeProps {
  status: PGStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? FALLBACK;
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
