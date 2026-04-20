import { Input, Label } from '~/components/ui';

const MAX_VENUE_LENGTH = 120;

interface VenueSectionProps {
  value?: string;
  onChange: (value: string) => void;
}

function VenueSection({ value, onChange }: VenueSectionProps) {
  const venue = value ?? '';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor="event-venue">Venue</Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {venue.length}/{MAX_VENUE_LENGTH}
        </span>
      </div>
      <Input
        id="event-venue"
        placeholder="e.g. School Hall, Block A"
        value={venue}
        maxLength={MAX_VENUE_LENGTH}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export { VenueSection };
export type { VenueSectionProps };
