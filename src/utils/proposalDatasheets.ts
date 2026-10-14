import type { ProjectSimulation } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { getProjectPanels, getProjectInverters, getProjectBatteries } from './equipmentSpecsUtils';

/** Only exact catalog identities are eligible; guessing could attach a different model. */
export function proposalDatasheets(project: ProjectSimulation, catalog: SolarEquipmentItem[]) {
  const groups = [
    ...getProjectPanels(project.specs).map(group => ({ ...group, type: 'panel' })),
    ...getProjectInverters(project.specs).map(group => ({ ...group, type: 'inverter' })),
    ...getProjectBatteries(project.specs).map(group => ({ ...group, type: 'battery' })),
  ];
  const seen = new Set<string>();
  return groups.filter(group => group.count > 0).flatMap(group => {
    const matches = catalog.filter(item => item.type === group.type && item.displayName === group.brandModel);
    if (matches.length !== 1) return [];
    const item = matches[0];
    const key = item.datasheetAssetId || item.datasheetUrl;
    if (!key || seen.has(key) || (item.datasheetName && !item.datasheetName.toLowerCase().endsWith('.pdf'))) return [];
    seen.add(key);
    return [{ key, item }];
  });
}
