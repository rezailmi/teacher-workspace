import { Input, Label } from '~/components/ui';

interface DueDateSectionProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

function DueDateSection({ value, onChange, required = false }: DueDateSectionProps) {
  // Pgw-web rejects past due dates and also disables reminder options when
  // `dueDate < today + 2`. Gate the picker at the source so a user can't
  // accidentally pick a date that makes the reminder window empty.
  const todayIso = formatTodayIso();

  return (
    <div className="space-y-1.5">
      <Label htmlFor="due-date">
        Due Date (SGT)
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <p className="text-sm text-muted-foreground">
        The latest date by which parents must respond to this post.
      </p>
      <Input
        id="due-date"
        type="date"
        value={value}
        required={required}
        min={todayIso}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[240px]"
      />
    </div>
  );
}

function formatTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export { DueDateSection };
export type { DueDateSectionProps };
