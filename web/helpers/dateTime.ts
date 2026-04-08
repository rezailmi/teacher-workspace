import type { PGAnnouncement } from '~/data/mock-pg-announcements';

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

export function isLowReadRate(
  postedAt: string | undefined,
  readCount: number,
  total: number,
): boolean {
  if (!postedAt || total === 0) return false;
  const hoursElapsed =
    (Date.now() - new Date(postedAt).getTime()) / 3_600_000;
  return hoursElapsed >= 48 && readCount / total < 0.5;
}

export function getRelevantDate(announcement: PGAnnouncement): string | undefined {
  if (announcement.status === 'posted') return announcement.postedAt;
  if (announcement.status === 'scheduled') return announcement.scheduledAt;
  return announcement.createdAt;
}
