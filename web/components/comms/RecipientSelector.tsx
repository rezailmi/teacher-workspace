import { Typography } from '@flow/core';

import { Badge, Checkbox } from '~/components/ui';

interface ClassOption {
  id: string;
  label: string;
  students: string[];
}

interface RecipientSelectorProps {
  classes: ClassOption[];
  selectedClasses: string[];
  onToggleClass: (classId: string) => void;
}

function RecipientSelector({
  classes,
  selectedClasses,
  onToggleClass,
}: RecipientSelectorProps) {
  const totalStudents = classes
    .filter((c) => selectedClasses.includes(c.id))
    .reduce((sum, c) => sum + c.students.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Typography variant="body-sm" className="text-muted-foreground">
          Selected
        </Typography>
        <Badge variant="secondary">{totalStudents} students</Badge>
      </div>

      <div className="rounded-xl border p-4 space-y-4">
        {classes.map((cls) => {
          const isSelected = selectedClasses.includes(cls.id);
          return (
            <div key={cls.id} className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleClass(cls.id)}
                />
                <Typography variant="body-md" className="font-medium">
                  {cls.label}
                </Typography>
                <Typography
                  variant="body-sm"
                  className="text-muted-foreground"
                >
                  ({cls.students.length} students)
                </Typography>
              </label>

              {isSelected && (
                <div className="ml-8">
                  <Typography
                    variant="body-sm"
                    className="text-muted-foreground"
                  >
                    {cls.students.join(', ')}
                  </Typography>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { RecipientSelector };
export type { RecipientSelectorProps };
