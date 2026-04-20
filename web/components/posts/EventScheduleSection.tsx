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

/** Returns `date + hoursToAdd` in the same `YYYY-MM-DDTHH:MM` local-string shape. */
function addHoursToLocal(iso: string, hoursToAdd: number): string {
  // Parse without timezone interpretation — datetime-local strings are naive.
  const [datePart, timePart] = iso.split('T');
  if (!datePart || !timePart) return iso;
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  const dt = new Date(y, (mo ?? 1) - 1, d, h, mi);
  dt.setHours(dt.getHours() + hoursToAdd);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mmin = String(dt.getMinutes()).padStart(2, '0');
  return `${yy}-${mm}-${dd}T${hh}:${mmin}`;
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
      nextEnd = addHoursToLocal(next, 1);
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
      onChange({ start, end: addHoursToLocal(start, 1), venue: value?.venue });
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
          <Label htmlFor="event-start">Start</Label>
          <Input
            id="event-start"
            type="datetime-local"
            value={start}
            onChange={(e) => handleStartChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-end">End</Label>
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
