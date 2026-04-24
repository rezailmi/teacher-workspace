import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SCHEDULE_WINDOW,
  SchedulePickerDialog,
  buildTimeSlots,
} from './SchedulePickerDialog';

describe('buildTimeSlots', () => {
  it('returns 60 slots between 07:00 and 21:45 inclusive for the default window', () => {
    const slots = buildTimeSlots(DEFAULT_SCHEDULE_WINDOW);
    expect(slots).toHaveLength(60);
    expect(slots[0]).toEqual({ value: '07:00', label: '7:00 AM' });
    expect(slots[slots.length - 1]).toEqual({ value: '21:45', label: '9:45 PM' });
  });

  it('emits every 15-min boundary between start and end inclusive', () => {
    const slots = buildTimeSlots({ start: '08:00', end: '10:00' });
    // 08:00, 08:15, 08:30, 08:45, 09:00, 09:15, 09:30, 09:45, 10:00 → 9 entries
    expect(slots.map((s) => s.value)).toEqual([
      '08:00',
      '08:15',
      '08:30',
      '08:45',
      '09:00',
      '09:15',
      '09:30',
      '09:45',
      '10:00',
    ]);
  });

  it('rounds a non-15-min-aligned start up to the next slot', () => {
    const slots = buildTimeSlots({ start: '07:05', end: '08:00' });
    expect(slots.map((s) => s.value)).toEqual(['07:15', '07:30', '07:45', '08:00']);
  });

  it('returns an empty list when end is before start', () => {
    expect(buildTimeSlots({ start: '20:00', end: '10:00' })).toEqual([]);
  });

  it('labels PM hours correctly', () => {
    const slots = buildTimeSlots({ start: '12:00', end: '13:00' });
    expect(slots[0]).toEqual({ value: '12:00', label: '12:00 PM' });
    expect(slots[slots.length - 1]).toEqual({ value: '13:00', label: '1:00 PM' });
  });
});

describe('SchedulePickerDialog', () => {
  it('disables Schedule and surfaces the window error when the default time is outside a narrower window', () => {
    render(
      <SchedulePickerDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        scheduleWindow={{ start: '10:00', end: '20:00' }}
      />,
    );

    // Default `time` is '09:00', outside the stubbed 10:00–20:00 window.
    const alert = screen.getByRole('alert');
    expect(alert.textContent ?? '').toMatch(/outside the allowed sending window/i);
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled();
  });

  it('leaves Schedule disabled until a date is picked, even with a valid time', () => {
    render(<SchedulePickerDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    // No date picked and default time 09:00 is inside the default window.
    // Validation falls through to the "Pick a date first" branch — button stays disabled.
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled();
  });
});
