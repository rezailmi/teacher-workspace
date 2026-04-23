import {
  Collapsible,
  CollapsiblePanel,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '~/components/ui';
import type { ReminderConfig } from '~/data/mock-pg-announcements';
import { formatLocalDate } from '~/helpers/dateTime';

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
  /** The consent-by date in `YYYY-MM-DD` form. Used to display the default
   *  reminder info line ("Default reminder will be sent on [date]"). */
  consentByDate?: string;
}

function ReminderSection({ value, onChange, consentByDate }: ReminderSectionProps) {
  // Stash the picked date on the NONE branch so ONE_TIME/DAILY toggles
  // restore it. Living in state (not a ref) means it survives remounts and
  // shows up in devtools.
  const lastDate = value.type === 'NONE' ? (value.lastDate ?? '') : value.date;

  function handleRadioChange(next: ReminderRadioValue) {
    if (next === 'NONE') {
      onChange({ type: 'NONE', lastDate: value.type === 'NONE' ? value.lastDate : value.date });
      return;
    }
    onChange({ type: next, date: lastDate });
  }

  function handleDateChange(nextDate: string) {
    if (value.type === 'NONE') return;
    onChange({ type: value.type, date: nextDate });
  }

  const showPicker = value.type === 'ONE_TIME' || value.type === 'DAILY';
  const pickerLabel = value.type === 'DAILY' ? 'Starting (SGT)' : 'Date (SGT)';
  // Empty display on NONE so the hidden picker doesn't flash a stale date.
  const displayDate = value.type === 'NONE' ? '' : value.date;

  const defaultReminderFormatted = consentByDate ? (formatLocalDate(consentByDate) ?? '-') : '-';

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Reminder</p>
        <p className="text-sm text-muted-foreground">Remind parents who have not yet responded.</p>
      </div>

      <p className="text-sm">
        Default reminder will be sent on{' '}
        <span className="font-medium">{defaultReminderFormatted}</span>
      </p>

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
