import { useRef } from 'react';

import {
  Collapsible,
  CollapsiblePanel,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '~/components/ui';
import type { ReminderConfig } from '~/data/mock-pg-announcements';

type ReminderRadioValue = 'NONE' | 'ONE_TIME' | 'DAILY';

const REMINDER_OPTIONS: { value: ReminderRadioValue; label: string; description: string }[] = [
  {
    value: 'NONE',
    label: 'None',
    description: 'No reminder will be sent to parents.',
  },
  {
    value: 'ONE_TIME',
    label: 'One-time',
    description: 'A single reminder on a chosen date.',
  },
  {
    value: 'DAILY',
    label: 'Daily',
    description: 'Daily reminders starting from a chosen date until they respond.',
  },
];

interface ReminderSectionProps {
  value: ReminderConfig;
  onChange: (value: ReminderConfig) => void;
}

function ReminderSection({ value, onChange }: ReminderSectionProps) {
  // Persist the picked date across radio toggles. If the user switches to
  // None and back to One-time, the previously chosen date re-appears rather
  // than resetting to empty. Ref — not state — because the visible value
  // already tracks `value.date`; this stash is only read on radio change.
  const stashedDateRef = useRef<string>(value.type === 'NONE' ? '' : value.date);

  // Keep stash in sync whenever the user edits the date while a narrow
  // (ONE_TIME / DAILY) branch is active.
  if (value.type !== 'NONE' && value.date !== stashedDateRef.current) {
    stashedDateRef.current = value.date;
  }

  function handleRadioChange(next: ReminderRadioValue) {
    if (next === 'NONE') {
      onChange({ type: 'NONE' });
      return;
    }
    const date = stashedDateRef.current;
    onChange({ type: next, date });
  }

  function handleDateChange(nextDate: string) {
    if (value.type === 'NONE') return;
    stashedDateRef.current = nextDate;
    onChange({ type: value.type, date: nextDate });
  }

  const showPicker = value.type === 'ONE_TIME' || value.type === 'DAILY';
  const pickerLabel = value.type === 'DAILY' ? 'Starting (SGT)' : 'Date (SGT)';
  const displayDate = value.type === 'NONE' ? stashedDateRef.current : value.date;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">
          Reminder <span className="text-destructive">*</span>
        </p>
        <p className="text-sm text-muted-foreground">Remind parents who have not yet responded.</p>
      </div>

      <RadioGroup
        value={value.type}
        onValueChange={(v) => handleRadioChange(v as ReminderRadioValue)}
        className="gap-3"
      >
        {REMINDER_OPTIONS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-3">
            <RadioGroupItem value={option.value} className="mt-0.5" />
            <div>
              <Label className="cursor-pointer">{option.label}</Label>
              <p className="text-sm text-muted-foreground">{option.description}</p>
            </div>
          </label>
        ))}
      </RadioGroup>

      <Collapsible open={showPicker}>
        <CollapsiblePanel keepMounted>
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="reminder-date">{pickerLabel}</Label>
            <Input
              id="reminder-date"
              type="date"
              value={displayDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="max-w-[240px]"
            />
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
}

export { ReminderSection };
export type { ReminderSectionProps };
