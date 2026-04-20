import type {
  PGApiCustomGroupSummary,
  PGApiGroupsAssigned,
  PGApiSchoolClass,
  PGApiSchoolStudent,
} from '~/api/types';

import { EntitySelector } from './entity-selector';
import type { EntityItem, EntityScope, SearchResults, SelectedEntity } from './entity-selector';

export type { SelectedEntity as SelectedRecipient };

interface StudentRecipientSelectorProps {
  value: SelectedEntity[];
  onChange: (recipients: SelectedEntity[]) => void;
  classes: PGApiSchoolClass[];
  students: PGApiSchoolStudent[];
  /**
   * Level + CCA scopes source from `/groups/assigned` — the `classes` entries
   * carry `level` strings, and `ccaGroups` supplies the CCA tab. Optional so
   * existing callers that don't yet wire this loader keep compiling; unwired
   * callers get empty Level/CCA tabs (the prior behaviour).
   */
  groupsAssigned?: PGApiGroupsAssigned;
  /** Custom Groups scope — from `/groups/custom`. Read-only in this slice. */
  customGroups?: PGApiCustomGroupSummary[];
}

// Classes from /school/groups use labels like "P6 BEST (2026)"; students'
// className drops the year — strip it to match.
function stripYear(label: string): string {
  return label.replace(/ \(\d{4}\)$/, '');
}

export function StudentRecipientSelector({
  value,
  onChange,
  classes,
  students,
  groupsAssigned,
  customGroups,
}: StudentRecipientSelectorProps) {
  const byClassName = new Map<string, PGApiSchoolStudent[]>();
  for (const s of students) {
    const list = byClassName.get(s.className) ?? [];
    list.push(s);
    byClassName.set(s.className, list);
  }

  const classItems: EntityItem[] = classes.map((c) => {
    const roster = byClassName.get(stripYear(c.label)) ?? [];
    return {
      id: c.value.toString(),
      label: c.label,
      type: 'group',
      count: roster.length,
      memberNames: roster.map((s) => s.studentName),
      memberDetails: roster.map((s) => ({
        name: s.studentName,
        sublabel: s.uinFinNo,
      })),
      groupType: 'class',
    };
  });

  // Level entries come from /groups/assigned.classes' distinct `level` strings.
  // PG doesn't return level IDs directly; derive a stable numeric ID per level
  // so the selector can track selection, and roll up student counts across
  // every assigned class sharing the level. If PG later exposes a proper
  // /levels endpoint this block collapses to a direct map.
  const levelItems: EntityItem[] = (() => {
    if (!groupsAssigned?.classes.length) return [];
    const byLevel = new Map<string, { count: number; firstClassId: number }>();
    for (const c of groupsAssigned.classes) {
      const existing = byLevel.get(c.level);
      if (existing) existing.count += c.studentCount;
      else byLevel.set(c.level, { count: c.studentCount, firstClassId: c.classId });
    }
    return Array.from(byLevel.entries()).map(([level, meta]) => ({
      // Level ID = the first class ID that maps to this level. Stable per
      // dataset + uniquely identifies the level in the outbound `levelIds`.
      id: meta.firstClassId.toString(),
      label: level,
      type: 'group' as const,
      count: meta.count,
      groupType: 'level' as const,
    }));
  })();

  const ccaItems: EntityItem[] =
    groupsAssigned?.ccaGroups.map((g) => ({
      id: g.ccaId.toString(),
      label: g.ccaDescription,
      type: 'group',
      count: g.studentCount,
      groupType: 'cca',
    })) ?? [];

  const customGroupItems: EntityItem[] =
    customGroups?.map((g) => ({
      id: g.customGroupId.toString(),
      label: g.name,
      type: 'group',
      count: g.studentCount,
      groupType: 'custom',
    })) ?? [];

  const individualItems: EntityItem[] = students.map((s) => ({
    id: s.studentId.toString(),
    label: s.studentName,
    sublabel: `${s.className} · ${s.uinFinNo}`,
    type: 'individual',
    count: 1,
  }));

  const scopes: EntityScope[] = [
    { id: 'class', label: 'Class', items: classItems },
    { id: 'level', label: 'Level', items: levelItems },
    { id: 'cca', label: 'CCA', items: ccaItems },
    { id: 'custom', label: 'Custom Groups', items: customGroupItems },
  ];

  function searchFn(query: string): SearchResults {
    const q = query.toLowerCase();
    const allGroups = [...classItems, ...levelItems, ...ccaItems, ...customGroupItems];
    if (!q) return { groups: allGroups, individuals: individualItems };
    return {
      groups: allGroups.filter((g) => g.label.toLowerCase().includes(q)),
      individuals: individualItems
        .filter(
          (s) =>
            s.label.toLowerCase().includes(q) || (s.sublabel?.toLowerCase().includes(q) ?? false),
        )
        .slice(0, 20),
    };
  }

  return (
    <EntitySelector
      value={value}
      onChange={onChange}
      scopes={scopes}
      searchFn={searchFn}
      placeholder="Search students, classes, CCAs…"
      searchPlaceholder="Search by name, class, or group…"
      noResultsText="No students or groups found"
      emptyTabText="No items in this category"
    />
  );
}
