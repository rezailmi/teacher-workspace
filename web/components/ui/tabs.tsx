import {
  cn,
  Tabs,
  TabsContent,
  type TabsContentProps,
  TabsList as FlowTabsList,
  type TabsListProps,
  type TabsProps,
  TabsTrigger as FlowTabsTrigger,
  type TabsTriggerProps,
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
  type TabsContentProps,
  TabsList,
  type TabsListProps,
  type TabsProps,
  TabsTrigger,
  type TabsTriggerProps,
};
