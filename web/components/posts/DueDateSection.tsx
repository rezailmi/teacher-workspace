import { Input, Label } from '~/components/ui';

interface DueDateSectionProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

function DueDateSection({ value, onChange, required = false }: DueDateSectionProps) {
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
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[240px]"
      />
    </div>
  );
}

export { DueDateSection };
export type { DueDateSectionProps };
