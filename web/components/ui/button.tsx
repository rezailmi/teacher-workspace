import { Button as FlowButton, type ButtonProps, cn } from '@flow/core';

function Button({ className, ...props }: ButtonProps) {
  return (
    <FlowButton className={cn('font-medium', className)} {...props} />
  );
}
Button.displayName = 'Button';

export { Button, type ButtonProps };
