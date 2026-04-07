import {
  Input as FlowInput,
  type InputProps,
  cn,
} from '@flow/core';
import { type ComponentRef, forwardRef } from 'react';

const Input = forwardRef<ComponentRef<typeof FlowInput>, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <FlowInput
        ref={ref}
        className={cn('rounded-xl', className)}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input, type InputProps };
