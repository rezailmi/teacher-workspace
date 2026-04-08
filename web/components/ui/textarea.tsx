import {
  Textarea as FlowTextarea,
  type TextareaProps,
  cn,
} from '@flow/core';
import { type ComponentRef, forwardRef } from 'react';

const Textarea = forwardRef<ComponentRef<typeof FlowTextarea>, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <FlowTextarea
        ref={ref}
        className={cn('rounded-xl', className)}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea, type TextareaProps };
