import { SlidersHorizontal } from 'lucide-react';

import {
  Button,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
} from '~/components/ui';

export type ReadStatusFilter = 'all' | 'read' | 'unread';
export type PgStatusFilter = 'all' | 'onboarded' | 'not-onboarded';

export interface RecipientFilterValue {
  classId: string;
  read: ReadStatusFilter;
  pg: PgStatusFilter;
}

interface RecipientFilterPopoverProps {
  value: RecipientFilterValue;
  onChange: (next: RecipientFilterValue) => void;
  /** Distinct classes present in the current recipient set. */
  classOptions: string[];
  /** Hide the Read Status section for consent forms (they use Response, not read/unread). */
  showReadStatus?: boolean;
  /** Hide the PG Status section when the BFF doesn't surface it (announcements). */
  showPgStatus?: boolean;
  /** Number of filters currently narrowing the view — shown on the trigger badge. */
  activeCount: number;
}

function RecipientFilterPopover({
  value,
  onChange,
  classOptions,
  showReadStatus = true,
  showPgStatus = true,
  activeCount,
}: RecipientFilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="secondary" size="sm" aria-label="Filter recipients">
            <SlidersHorizontal className="h-4 w-4" />
            Filter
            {activeCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                {activeCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 gap-5">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Filters
        </p>

        <FilterSection label="Class">
          <RadioGroup
            value={value.classId}
            onValueChange={(v) => onChange({ ...value, classId: v })}
            className="gap-2"
          >
            <RadioOption value="all" label="All classes" />
            {classOptions.map((cls) => (
              <RadioOption key={cls} value={cls} label={cls} />
            ))}
          </RadioGroup>
        </FilterSection>

        {showReadStatus && (
          <FilterSection label="Read Status">
            <RadioGroup
              value={value.read}
              onValueChange={(v) => onChange({ ...value, read: v as ReadStatusFilter })}
              className="gap-2"
            >
              <RadioOption value="all" label="All" />
              <RadioOption value="read" label="Read" />
              <RadioOption value="unread" label="Unread" />
            </RadioGroup>
          </FilterSection>
        )}

        {showPgStatus && (
          <FilterSection label="PG status">
            <RadioGroup
              value={value.pg}
              onValueChange={(v) => onChange({ ...value, pg: v as PgStatusFilter })}
              className="gap-2"
            >
              <RadioOption value="all" label="All" />
              <RadioOption value="onboarded" label="Onboarded" />
              <RadioOption value="not-onboarded" label="Not Onboarded" />
            </RadioGroup>
          </FilterSection>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}

function RadioOption({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <RadioGroupItem value={value} />
      <Label className="cursor-pointer text-sm font-normal">{label}</Label>
    </label>
  );
}

/** Count of non-default filters — used by consumers to show an "active" badge. */
export function countActiveFilters(v: RecipientFilterValue): number {
  let n = 0;
  if (v.classId !== 'all') n += 1;
  if (v.read !== 'all') n += 1;
  if (v.pg !== 'all') n += 1;
  return n;
}

export const DEFAULT_RECIPIENT_FILTER: RecipientFilterValue = {
  classId: 'all',
  read: 'all',
  pg: 'all',
};

export { RecipientFilterPopover };
export type { RecipientFilterPopoverProps };
