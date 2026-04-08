import { Badge as FlowBadge, type BadgeProps, cn } from '@flow/core';

function Badge({ className, ...props }: BadgeProps) {
  return <FlowBadge className={cn('rounded-full', className)} {...props} />;
}
Badge.displayName = 'Badge';

export { Badge, type BadgeProps };
