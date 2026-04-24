import { CalendarClock } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Button,
  Calendar,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui';
import { cn } from '~/lib/utils';

export interface ScheduleWindow {
  /** Window start as `HH:MM`, 24-hour, 15-min aligned. */
  start: string;
  /** Window end as `HH:MM`, 24-hour, 15-min aligned. Inclusive. */
  end: string;
}

// PG ask #4 is unresolved — is 7:00–21:45 SGT hard-coded upstream or
// school-configurable. Ship with a conservative default, sourced through
// `configs.configs.schedule_window` in callers so a later flip is a config
// change, not a code change.
export const DEFAULT_SCHEDULE_WINDOW: ScheduleWindow = { start: '07:00', end: '21:45' };

// pgw accepts a 15-min minimum lead time and a 30-day maximum. Both are
// PG-team-confirmable — defaulting here to the provisional values called out
// in the plan; adjust when PG confirms.
const MIN_LEAD_MS = 15 * 60 * 1000;
const MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;
const SLOT_STEP_MIN = 15;
const DEFAULT_TIME = '09:00';

function toMinuteOfDay(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  return Number.parseInt(hStr, 10) * 60 + Number.parseInt(mStr, 10);
}

function isTimeInWindow(time: string, window: ScheduleWindow): boolean {
  const t = toMinuteOfDay(time);
  return t >= toMinuteOfDay(window.start) && t <= toMinuteOfDay(window.end);
}

export function buildTimeSlots(window: ScheduleWindow): { value: string; label: string }[] {
  const startMin = toMinuteOfDay(window.start);
  const endMin = toMinuteOfDay(window.end);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin < startMin) {
    return [];
  }
  // Round start up to the next 15-min boundary if the window isn't aligned;
  // the UI contract stays at 15-min increments even if config happens to use
  // 5-min precision.
  const firstSlotMin = Math.ceil(startMin / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  const slots: { value: string; label: string }[] = [];
  for (let m = firstSlotMin; m <= endMin; m += SLOT_STEP_MIN) {
    const hour = Math.floor(m / 60);
    const minute = m % 60;
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const ampmHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const label = `${ampmHour}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
    slots.push({ value, label });
  }
  return slots;
}

/**
 * Build an ISO 8601 string anchored to Asia/Singapore (+08:00). Pgw expects
 * dates in this zone — constructing the offset explicitly avoids surprises
 * when the browser's local TZ differs.
 */
function toSgtIso(date: Date, time: string): string {
  const [hStr, mStr] = time.split(':');
  const hh = String(Number.parseInt(hStr, 10)).padStart(2, '0');
  const mm = String(Number.parseInt(mStr, 10)).padStart(2, '0');
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:00+08:00`;
}

function formatWhenDate(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  });
}

function formatWhenTime(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Singapore',
  });
}

export interface SchedulePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired on confirm. Receives ISO 8601 with +08:00 offset. */
  onConfirm: (scheduledSendAt: string) => void;
  /** Disables confirm while the parent is in flight. */
  busy?: boolean;
  /**
   * Allowed sending window (15-min aligned). When omitted, falls back to
   * `DEFAULT_SCHEDULE_WINDOW`. Callers should source this from
   * `configs.configs.schedule_window` once PG ships the real flag.
   */
  scheduleWindow?: ScheduleWindow;
}

export function SchedulePickerDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
  scheduleWindow = DEFAULT_SCHEDULE_WINDOW,
}: SchedulePickerDialogProps) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>(DEFAULT_TIME);

  const slots = useMemo(() => buildTimeSlots(scheduleWindow), [scheduleWindow]);

  const scheduledSendAt = useMemo(() => {
    if (!date) return null;
    return toSgtIso(date, time);
  }, [date, time]);

  const validation = useMemo(() => {
    if (!isTimeInWindow(time, scheduleWindow)) {
      return {
        ok: false as const,
        reason: `Time is outside the allowed sending window (${scheduleWindow.start}–${scheduleWindow.end} SGT).`,
      };
    }
    if (!scheduledSendAt) return { ok: false as const, reason: 'Pick a date first.' };
    const diff = new Date(scheduledSendAt).valueOf() - Date.now();
    if (diff < MIN_LEAD_MS) {
      return { ok: false as const, reason: 'Scheduled time must be at least 15 minutes from now.' };
    }
    if (diff > MAX_LEAD_MS) {
      return { ok: false as const, reason: 'Scheduled time cannot be more than 30 days away.' };
    }
    return { ok: true as const };
  }, [scheduledSendAt, time, scheduleWindow]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const maxDate = useMemo(() => {
    const m = new Date();
    m.setHours(23, 59, 59, 999);
    m.setDate(m.getDate() + 30);
    return m;
  }, []);

  function handleConfirm() {
    if (!scheduledSendAt || !validation.ok) return;
    onConfirm(scheduledSendAt);
  }

  const showWindowError = !isTimeInWindow(time, scheduleWindow);
  const showDateError = !validation.ok && date !== undefined && !showWindowError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Schedule post</DialogTitle>
          <DialogDescription>
            Pick a date and time to send this post automatically. Parents will be notified at the
            scheduled moment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            disabled={{ before: today, after: maxDate }}
            className="rounded-xl border"
          />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="schedule-time-select">Time</Label>
                <span className="text-xs text-muted-foreground">
                  {scheduleWindow.start}–{scheduleWindow.end} SGT
                </span>
              </div>
              <Select
                value={time}
                onValueChange={(v) => {
                  if (v != null) setTime(v);
                }}
              >
                <SelectTrigger id="schedule-time-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((slot) => (
                    <SelectItem key={slot.value} value={slot.value}>
                      {slot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              className="flex gap-3 rounded-xl border bg-muted/40 p-3"
              aria-live="polite"
              data-slot="schedule-summary"
            >
              <CalendarClock
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  scheduledSendAt && validation.ok ? 'text-foreground' : 'text-muted-foreground',
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Sending on
                </div>
                {scheduledSendAt && validation.ok ? (
                  <>
                    <div className="mt-0.5 text-sm font-medium text-foreground">
                      {formatWhenDate(scheduledSendAt)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatWhenTime(scheduledSendAt)} · Asia/Singapore
                    </div>
                  </>
                ) : (
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {date ? 'Adjust your time to continue.' : 'Select a date to continue.'}
                  </div>
                )}
              </div>
            </div>

            {(showWindowError || showDateError) && !validation.ok && (
              <p className="text-xs text-destructive" role="alert">
                {validation.reason}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!validation.ok || busy}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
