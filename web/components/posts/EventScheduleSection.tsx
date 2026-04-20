import { useMemo } from 'react';

import { Input, Label } from '~/components/ui';
import type { PGEvent } from '~/data/mock-pg-announcements';

interface EventScheduleSectionProps {
  value: PGEvent | undefined;
  onChange: (value: PGEvent | undefined) => void;
}

// Event datetimes travel together — both start + end are set or both are
// cleared. The underlying `<input type="datetime-local">` emits strings in
// the `YYYY-MM-DDTHH:MM` shape; we preserve that shape as our transport
// format so Phase 2's mapper can convert to PG's ISO-with-offset at the
// boundary (matching `SchedulePickerDialog.toSgtIso`).

/**
 * Add one hour to a `YYYY-MM-DDTHH:MM` naive string via pure integer math —
 * no `Date` constructor, so the result is immune to the browser's local
 * DST transitions. Day carry handles the 23:xx → next-day-00:xx boundary;
 * event windows shorter than a day don't need month carry.
 */
function addHourToLocal(iso: string): string {
  const [datePart, timePart] = iso.split('T');
  if (!datePart || !timePart) return iso;
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return iso;

  let nextH = (h ?? 0) + 1;
  let nextD = d ?? 1;
  if (nextH >= 24) {
    nextH -= 24;
    nextD += 1;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo ?? 1)}-${pad(nextD)}T${pad(nextH)}:${pad(mi ?? 0)}`;
}

function EventScheduleSection({ value, onChange }: EventScheduleSectionProps) {
  const start = value?.start ?? '';
  const end = value?.end ?? '';

  // Min for the end picker: cannot pick earlier than start. Browsers honour
  // `min` on `datetime-local` — invalid values fail the form's built-in
  // validity check. This makes invalid ranges unselectable per deepening note.
  const endMin = useMemo(() => (start ? start : undefined), [start]);

  function handleStartChange(next: string) {
    if (!next) {
      // Clearing start clears the event entirely (start/end/venue travel together).
      onChange(undefined);
      return;
    }
    let nextEnd = end;
    // If start is after current end (or end is empty), auto-adjust end → start + 1h.
    if (!end || next >= end) {
      nextEnd = addHourToLocal(next);
    }
    onChange({ start: next, end: nextEnd, venue: value?.venue });
  }

  function handleEndChange(next: string) {
    if (!next) {
      // Allow empty end only if start is also empty (otherwise invalid range).
      if (!start) {
        onChange(undefined);
        return;
      }
      // Snap end back to start + 1h rather than leaving an invalid empty range.
      onChange({ start, end: addHourToLocal(start), venue: value?.venue });
      return;
    }
    onChange({ start: start || next, end: next, venue: value?.venue });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Event Schedule</p>
        <p className="text-sm text-muted-foreground">
          When the event takes place. Parents see this in the post header.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="event-start">Start (SGT)</Label>
          <Input
            id="event-start"
            type="datetime-local"
            value={start}
            onChange={(e) => handleStartChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-end">End (SGT)</Label>
          <Input
            id="event-end"
            type="datetime-local"
            value={end}
            min={endMin}
            disabled={!start}
            onChange={(e) => handleEndChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export { EventScheduleSection };
export type { EventScheduleSectionProps };
