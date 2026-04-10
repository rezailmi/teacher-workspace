import {
  cn,
  Textarea as FlowTextarea,
  type TextareaProps,
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
