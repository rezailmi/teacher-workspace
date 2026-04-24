import { CalendarIcon, Filter, RotateCcw } from 'lucide-react';
import * as React from 'react';
import type { Matcher } from 'react-day-picker';

import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from '~/components/ui';
import { cn } from '~/lib/utils';

export type PostStatusFilter = 'posted' | 'scheduled' | 'draft';
export type PostOwnershipFilter = 'mine' | 'shared';
export type PostResponseFilter = 'view-only' | 'acknowledge' | 'yes-no';

export interface PostFilters {
  status: PostStatusFilter[];
  ownership: PostOwnershipFilter[];
  response: PostResponseFilter[];
  /** Inclusive start, ISO date (YYYY-MM-DD). Matches against the row's relevant date. */
  dateFrom?: string;
  /** Inclusive end, ISO date (YYYY-MM-DD). */
  dateTo?: string;
}

export const DEFAULT_POST_FILTERS: PostFilters = {
  status: [],
  ownership: [],
  response: [],
};

export function countActivePostFilters(f: PostFilters): number {
  let n = 0;
  if (f.status.length) n += 1;
  if (f.ownership.length) n += 1;
  if (f.response.length) n += 1;
  if (f.dateFrom || f.dateTo) n += 1;
  return n;
}

const STATUS_OPTIONS: { value: PostStatusFilter; label: string }[] = [
  { value: 'posted', label: 'Posted' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
];

const OWNERSHIP_OPTIONS: { value: PostOwnershipFilter; label: string }[] = [
  { value: 'mine', label: 'Created by me' },
  { value: 'shared', label: 'Shared with me' },
];

const RESPONSE_OPTIONS_FULL: { value: PostResponseFilter; label: string }[] = [
  { value: 'view-only', label: 'View Only' },
  { value: 'acknowledge', label: 'Acknowledge' },
  { value: 'yes-no', label: 'Yes / No' },
];

interface PostFilterPopoverProps {
  value: PostFilters;
  onChange: (next: PostFilters) => void;
  /**
   * Response options to offer. Omit to show all three. Callers in contexts
   * where the outer tab already narrows response (e.g. the "Posts" tab is
   * view-only-only) should pass `null` to hide the section entirely.
   */
  responseOptions?: { value: PostResponseFilter; label: string }[] | null;
}

function PostFilterPopover({
  value,
  onChange,
  responseOptions = RESPONSE_OPTIONS_FULL,
}: PostFilterPopoverProps) {
  const active = countActivePostFilters(value);

  function toggle<T extends string>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  function reset() {
    onChange(DEFAULT_POST_FILTERS);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="secondary" size="sm" aria-label="Filter posts">
            <Filter className="h-4 w-4" />
            Filter
            {active > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                {active}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 gap-4 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-foreground">Show records</p>
          {active > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={reset}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>

        <FilterRow label="Status">
          {STATUS_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={value.status.includes(opt.value)}
              onClick={() => onChange({ ...value, status: toggle(value.status, opt.value) })}
            />
          ))}
        </FilterRow>

        <FilterRow label="Ownership">
          {OWNERSHIP_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={value.ownership.includes(opt.value)}
              onClick={() => onChange({ ...value, ownership: toggle(value.ownership, opt.value) })}
            />
          ))}
        </FilterRow>

        {responseOptions && responseOptions.length > 0 && (
          <FilterRow label="Response">
            {responseOptions.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={value.response.includes(opt.value)}
                onClick={() => onChange({ ...value, response: toggle(value.response, opt.value) })}
              />
            ))}
          </FilterRow>
        )}

        <FilterRow label="Date">
          <DatePill
            label="From"
            value={value.dateFrom}
            max={value.dateTo}
            onChange={(d) => onChange({ ...value, dateFrom: d })}
          />
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            –
          </span>
          <DatePill
            label="To"
            value={value.dateTo}
            min={value.dateFrom}
            onChange={(d) => onChange({ ...value, dateTo: d })}
          />
        </FilterRow>
      </PopoverContent>
    </Popover>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-8 px-3 font-normal',
        'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90',
      )}
    >
      {label}
    </Button>
  );
}

/** Formats `YYYY-MM-DD` as a human-friendly "24 Apr 2026" for the pill label. */
function formatPillDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function DatePill({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value?: string;
  onChange: (iso: string | undefined) => void;
  min?: string;
  max?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const display = value ? formatPillDate(value) : label;
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  // react-day-picker's `Matcher` variants require their bound (before/after) —
  // push only the sides we have so the other side stays unconstrained.
  const disabled: Matcher[] = [];
  if (min) disabled.push({ before: new Date(`${min}T00:00:00`) });
  if (max) disabled.push({ after: new Date(`${max}T00:00:00`) });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            size="sm"
            type="button"
            aria-label={value ? `${label}: ${display}` : `Pick ${label.toLowerCase()} date`}
            className={cn(
              'h-8 flex-1 justify-start px-3 font-normal',
              value ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            {display}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto gap-0 p-2">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(toIsoDate(d));
              setOpen(false);
            }
          }}
          disabled={disabled.length > 0 ? disabled : undefined}
        />
        {value && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
            className="mt-1 self-end text-muted-foreground"
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { PostFilterPopover };
export type { PostFilterPopoverProps };
