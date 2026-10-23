import type { ProjectSimulation } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { getProjectPanels, getProjectInverters, getProjectBatteries } from './equipmentSpecsUtils';
import { resolveGroupCatalogItem } from './equipmentGroups';

const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * File name shown for a catalog datasheet. The server deduplicates identical files and keeps the first
 * upload's name (often a hash like `5f3b762bf4e99b1.pdf`), so the name always comes from the model.
 */
export function datasheetFileName(displayName: string, mimeType = 'application/pdf'): string {
  const clean = displayName.replace(/[\\/]+/g, '-').replace(/[<>:"|?*\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim();
  return `Ficha técnica${clean ? ` - ${clean}` : ''}.${EXTENSIONS[mimeType] || 'pdf'}`;
}

const MIME_BY_EXTENSION: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Friendly name of an item's datasheet; the stored name only contributes its extension (PDF or image). */
export function datasheetDisplayName(item: Pick<SolarEquipmentItem, 'displayName' | 'datasheetName'>): string {
  const extension = item.datasheetName?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || 'pdf';
  return datasheetFileName(item.displayName, MIME_BY_EXTENSION[extension]);
}

/** Equipment in use (count > 0) whose catalog item has a PDF datasheet; variants sharing one asset appear once. */
export function proposalDatasheets(project: ProjectSimulation, catalog: SolarEquipmentItem[]) {
  const groups = [
    ...getProjectPanels(project.specs).map(group => ({ group, kind: 'panel' as const })),
    ...getProjectInverters(project.specs).map(group => ({ group, kind: 'inverter' as const })),
    ...getProjectBatteries(project.specs).map(group => ({ group, kind: 'battery' as const })),
  ];
  const seen = new Set<string>();
  return groups.filter(({ group }) => group.count > 0).flatMap(({ group, kind }) => {
    const item = resolveGroupCatalogItem(group, kind, catalog);
    if (!item) return [];
    const key = item.datasheetAssetId || item.datasheetUrl;
    if (!key || seen.has(key) || (item.datasheetName && !item.datasheetName.toLowerCase().endsWith('.pdf'))) return [];
    seen.add(key);
    return [{ key, item }];
  });
}
