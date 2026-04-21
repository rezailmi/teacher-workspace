import type { PGPost } from '~/data/mock-pg-announcements';
import { assertNever } from '~/helpers/assertNever';

/**
 * Get the day period based on the current hour.
 *
 * @returns The day period.
 */
export function getDayPeriod(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

export const DATE_FORMATTER = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Singapore',
});

export function formatDate(iso: string | undefined): string {
  if (!iso) return '\u2014';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '\u2014';
  return DATE_FORMATTER.format(date);
}

/**
 * Format an ISO string as `DD MMM YYYY, hh:mm am/pm` (or upper-cased).
 * Returns `undefined` when the input is missing or unparseable so callers
 * can fall back to `formatDate` (date-only) without a sentinel dash.
 */
export function formatDateTime(
  iso: string | undefined,
  opts: { case?: 'upper' | 'lower' } = {},
): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;

  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const year = d.getFullYear();
  let hour = d.getHours();
  const minute = d.getMinutes().toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12 || 12;
  const hourStr = hour.toString().padStart(2, '0');

  const result = `${day} ${month} ${year}, ${hourStr}:${minute} ${ampm}`;
  return opts.case === 'upper' ? result.toUpperCase() : result;
}

/**
 * Parse a naive-local `YYYY-MM-DDTHH:MM` string (the shape emitted by
 * `<input type="datetime-local">`) without timezone interpretation. Returns
 * `undefined` for missing or malformed inputs.
 */
function parseLocalDateTime(local: string | undefined): Date | undefined {
  if (!local) return undefined;
  const [datePart, timePart] = local.split('T');
  if (!datePart || !timePart) return undefined;
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return undefined;
  const dt = new Date(y, (mo ?? 1) - 1, d, h, mi);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

/** Parse a naive-local `YYYY-MM-DD` string (the shape from `<input type="date">`). */
function parseLocalDate(local: string | undefined): Date | undefined {
  if (!local) return undefined;
  const [y, mo, d] = local.split('-').map(Number);
  if (![y, mo, d].every((n) => Number.isFinite(n))) return undefined;
  const dt = new Date(y, (mo ?? 1) - 1, d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

function formatDatePart(date: Date, opts: { weekday?: boolean } = {}): string {
  const day = date.getDate();
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const year = date.getFullYear();
  const base = `${day} ${month} ${year}`;
  if (!opts.weekday) return base;
  const wd = date.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${wd}, ${base}`;
}

function formatTimePart(date: Date): string {
  let hour = date.getHours();
  const minute = date.getMinutes().toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

/**
 * Format a naive-local `YYYY-MM-DD` string as `"30 Mar 2026"`. Returns
 * `undefined` for missing/malformed inputs.
 */
export function formatLocalDate(local: string | undefined): string | undefined {
  const d = parseLocalDate(local);
  return d ? formatDatePart(d) : undefined;
}

/**
 * Format a naive-local datetime range (`YYYY-MM-DDTHH:MM` pair) for display.
 * Same-day ranges collapse to `"Mon, 1 Apr 2026 · 12:00 pm – 5:00 pm"`;
 * cross-day ranges render the start weekday/date/time and end weekday/date/time
 * separately. If `end` is missing, only the start is rendered.
 */
export function formatLocalDateTimeRange(
  start: string | undefined,
  end: string | undefined,
): string | undefined {
  const s = parseLocalDateTime(start);
  if (!s) return undefined;
  const e = parseLocalDateTime(end);
  const sameDay =
    e !== undefined &&
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  if (!e) return `${formatDatePart(s, { weekday: true })} \u00b7 ${formatTimePart(s)}`;
  if (sameDay) {
    return `${formatDatePart(s, { weekday: true })} \u00b7 ${formatTimePart(s)} \u2013 ${formatTimePart(e)}`;
  }
  return `${formatDatePart(s, { weekday: true })}, ${formatTimePart(s)} \u2013 ${formatDatePart(e, { weekday: true })}, ${formatTimePart(e)}`;
}

export function isLowReadRate(
  postedAt: string | undefined,
  readCount: number,
  total: number,
): boolean {
  if (!postedAt || total === 0) return false;
  const hoursElapsed = (Date.now() - new Date(postedAt).getTime()) / 3_600_000;
  return hoursElapsed >= 48 && readCount / total < 0.5;
}

/**
 * The list's sort/display date for a `PGPost`, keyed off `kind` × `status`:
 *
 * - announcement + `posted` → `postedAt`
 * - announcement + `scheduled` → `scheduledAt`
 * - form + `open` / `closed` → `postedAt`
 * - form + `scheduled` → `scheduledAt`
 * - otherwise (draft / posting) → `createdAt`
 */
export function getRelevantDate(post: PGPost): string | undefined {
  switch (post.kind) {
    case 'announcement':
      if (post.status === 'posted') return post.postedAt;
      if (post.status === 'scheduled') return post.scheduledAt;
      return post.createdAt;
    case 'form':
      if (post.status === 'open' || post.status === 'closed') return post.postedAt;
      if (post.status === 'scheduled') return post.scheduledAt;
      return post.createdAt;
    default:
      return assertNever(post);
  }
}
