import {
  Tabs,
  TabsContent,
  TabsList as FlowTabsList,
  type TabsListProps,
  TabsTrigger as FlowTabsTrigger,
  type TabsTriggerProps,
  cn,
  type TabsContentProps,
  type TabsProps,
} from '@flow/core';

function TabsList({ className, ...props }: TabsListProps) {
  return <FlowTabsList className={cn('rounded-full', className)} {...props} />;
}
TabsList.displayName = 'TabsList';

function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <FlowTabsTrigger
      className={cn('rounded-full font-medium', className)}
      {...props}
    />
  );
}
TabsTrigger.displayName = 'TabsTrigger';

export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type TabsContentProps,
  type TabsListProps,
  type TabsProps,
  type TabsTriggerProps,
};
