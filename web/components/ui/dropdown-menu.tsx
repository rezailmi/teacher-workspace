import {
  cn,
  DropdownMenuContent as FlowDropdownMenuContent,
  type DropdownMenuContentProps,
} from '@flow/core';

function DropdownMenuContent({ className, ...props }: DropdownMenuContentProps) {
  return (
    <FlowDropdownMenuContent
      className={cn('rounded-xl', className)}
      {...props}
    />
  );
}
DropdownMenuContent.displayName = 'DropdownMenuContent';

export { DropdownMenuContent, type DropdownMenuContentProps };

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type DropdownMenuItemProps,
  type DropdownMenuProps,
  type DropdownMenuSeparatorProps,
  type DropdownMenuTriggerProps,
} from '@flow/core';
