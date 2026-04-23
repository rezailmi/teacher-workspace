import { SlidersHorizontal } from 'lucide-react';

import {
  Button,
  Checkbox,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
} from '~/components/ui';

export type ReadStatusFilter = 'all' | 'read' | 'unread';
export type PgStatusFilter = 'all' | 'onboarded' | 'not-onboarded';

/**
 * Keys for the toggleable columns on `RecipientReadTable`. `Student` and
 * `Class` are always rendered as identity anchors, so they're not in this
 * map — PGW's "Show Columns" selector behaves the same way.
 */
export type ColumnKey =
  | 'readStatus'
  | 'readAt'
  | 'acknowledged'
  | 'acknowledgedAt'
  | 'response'
  | 'respondedAt'
  | 'pgStatus';

export type ColumnVisibility = Record<ColumnKey, boolean>;

export interface RecipientFilterValue {
  classId: string;
  read: ReadStatusFilter;
  pg: PgStatusFilter;
  columns: ColumnVisibility;
}

interface ColumnOption {
  key: ColumnKey;
  label: string;
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
  /** Toggleable columns for the current post kind/response-type combination. */
  columnOptions: ColumnOption[];
  /** Announcement context: show the one-liner about PG fields we can't render yet. */
  showDeferredNote?: boolean;
  /** Number of filters currently narrowing the view — shown on the trigger badge. */
  activeCount: number;
}

function RecipientFilterPopover({
  value,
  onChange,
  classOptions,
  showReadStatus = true,
  showPgStatus = true,
  columnOptions,
  showDeferredNote = false,
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

        {columnOptions.length > 0 && (
          <FilterSection label="Columns">
            <div className="flex flex-col gap-2">
              {columnOptions.map((opt) => (
                <CheckboxOption
                  key={opt.key}
                  label={opt.label}
                  checked={value.columns[opt.key]}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      columns: { ...value.columns, [opt.key]: checked },
                    })
                  }
                />
              ))}
            </div>
          </FilterSection>
        )}

        {showDeferredNote && (
          <p className="text-xs text-muted-foreground">
            First Read By and parent role aren&apos;t available from PG yet.
          </p>
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

function CheckboxOption({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
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
  // Hidden columns also count — an unchecked column is a filter on the view.
  const hiddenColumns = Object.values(v.columns).filter((visible) => !visible).length;
  if (hiddenColumns > 0) n += 1;
  return n;
}

export const ALL_COLUMNS_VISIBLE: ColumnVisibility = {
  readStatus: true,
  readAt: true,
  acknowledged: true,
  acknowledgedAt: true,
  response: true,
  respondedAt: true,
  pgStatus: true,
};

export const DEFAULT_RECIPIENT_FILTER: RecipientFilterValue = {
  classId: 'all',
  read: 'all',
  pg: 'all',
  columns: ALL_COLUMNS_VISIBLE,
};

export { RecipientFilterPopover };
export type { ColumnOption, RecipientFilterPopoverProps };
