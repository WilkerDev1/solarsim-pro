import type { DiffFieldChange, ProjectSimulation } from '../../types';

/** Compare editable content, excluding transport versions and local UI metadata. */
export function projectDifferences(server: ProjectSimulation, local: ProjectSimulation): DiffFieldChange[] {
  const differences: DiffFieldChange[] = [];
  const domains = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization', 'status'] as const;
  for (const section of domains) {
    const before = server[section];
    const after = local[section];
    if (JSON.stringify(before) !== JSON.stringify(after)) differences.push({
      field: section, section, oldValue: before, newValue: after,
      formattedOld: typeof before === 'object' ? JSON.stringify(before) : String(before ?? '—'),
      formattedNew: typeof after === 'object' ? JSON.stringify(after) : String(after ?? '—'),
    });
  }
  return differences;
}
