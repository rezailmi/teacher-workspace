import { Typography } from '@flow/core';

import { Label, RadioGroup, RadioGroupItem } from '~/components/ui';
import { RESPONSE_TYPE_META, type ResponseType } from '~/data/mock-pg-announcements';

interface ResponseTypeSelectorProps {
  value: ResponseType;
  onChange: (value: ResponseType) => void;
  children?: React.ReactNode;
}

const RESPONSE_OPTIONS = (
  Object.entries(RESPONSE_TYPE_META) as [ResponseType, (typeof RESPONSE_TYPE_META)[ResponseType]][]
).map(([value, meta]) => ({ value, ...meta }));

function ResponseTypeSelector({
  value,
  onChange,
  children,
}: ResponseTypeSelectorProps) {
  const showChildren = value === 'acknowledge' || value === 'yes-no';

  return (
    <div className="space-y-4">
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as ResponseType)}
        className="gap-3"
      >
        {RESPONSE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-start gap-3 cursor-pointer"
          >
            <RadioGroupItem value={option.value} className="mt-0.5" />
            <div>
              <Label className="cursor-pointer">{option.label}</Label>
              <Typography
                variant="body-sm"
                className="text-muted-foreground"
              >
                {option.description}
              </Typography>
            </div>
          </label>
        ))}
      </RadioGroup>

      {showChildren && children}
    </div>
  );
}

export { ResponseTypeSelector };
export type { ResponseTypeSelectorProps };
