import type { PGApiSchoolStaff } from '~/api/types';

import { EntitySelector } from './entity-selector';
import type { EntityItem, EntityScope, SearchResults, SelectedEntity } from './entity-selector';

export type { SelectedEntity as SelectedStaff };

interface StaffSelectorProps {
  value: SelectedEntity[];
  onChange: (staff: SelectedEntity[]) => void;
  staff: PGApiSchoolStaff[];
}

export function StaffSelector({ value, onChange, staff }: StaffSelectorProps) {
  const individualItems: EntityItem[] = staff.map((s) => ({
    id: s.staffId.toString(),
    label: s.name,
    sublabel: [s.className, s.email].filter(Boolean).join(' · '),
    type: 'individual',
    count: 1,
  }));

  // Staff-only scopes: PG doesn't currently expose level-team / school-team
  // membership via the proxied endpoints, so those tabs would always be empty.
  // Leaving them mounted with `items: []` makes the UI look broken — drop them
  // entirely until pgw-web surfaces the data. See plan R8: "DO NOT leave them
  // as empty-item-array populated tabs that look functional but return nothing".
  const scopes: EntityScope[] = [{ id: 'individual', label: 'Individual', items: individualItems }];

  function searchFn(query: string): SearchResults {
    const q = query.toLowerCase();
    if (!q) return { groups: [], individuals: individualItems };
    return {
      groups: [],
      individuals: individualItems.filter(
        (s) =>
          s.label.toLowerCase().includes(q) || (s.sublabel?.toLowerCase().includes(q) ?? false),
      ),
    };
  }

  return (
    <EntitySelector
      value={value}
      onChange={onChange}
      scopes={scopes}
      searchFn={searchFn}
      placeholder="Search staff by name or group…"
      searchPlaceholder="Search staff…"
      noResultsText="No staff found"
    />
  );
}
