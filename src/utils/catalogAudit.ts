import type { ProjectSimulation } from '../types';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from './equipmentSpecsUtils';
import type { SolarEquipmentItem } from '../types/equipment';

export type CatalogAuditCode =
  | 'missing_price' | 'stale_price' | 'missing_datasheet' | 'missing_image' | 'missing_nominal'
  | 'duplicate_model' | 'no_stock' | 'price_outlier' | 'unmatched_proposal_equipment';

export interface CatalogAuditFinding {
  code: CatalogAuditCode;
  severity: 'info' | 'warning' | 'error';
  equipmentId?: string;
  projectId?: string;
  message: string;
}

export interface CatalogAuditReport {
  findings: CatalogAuditFinding[];
  summary: { total: number; byCode: Partial<Record<CatalogAuditCode, number>>; equipmentCount: number };
}

const DAY = 86_400_000;
const nominal = (item: SolarEquipmentItem) =>
  item.type === 'panel' ? item.powerW : item.type === 'inverter' ? item.powerKW : item.capacityKWh;
/** Price per nominal unit (W, kW or kWh) of the cheapest positive offer. */
const unitPrice = (item: SolarEquipmentItem) => {
  const prices = (item.supplierPrices || []).map((o) => o.priceUSD).filter((p) => Number.isFinite(p) && p > 0);
  const n = nominal(item);
  return prices.length && n && n > 0 ? Math.min(...prices) / n : undefined;
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const normalizeName = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Pure inventory audit used by agents and the catalog UI. */
export function auditCatalog(
  catalog: SolarEquipmentItem[],
  projects: ProjectSimulation[],
  options: { now: Date; staleDays?: number; type?: SolarEquipmentItem['type'] }
): CatalogAuditReport {
  const items = catalog.filter((item) => !options.type || item.type === options.type);
  const staleMs = (options.staleDays ?? 90) * DAY;
  const findings: CatalogAuditFinding[] = [];
  const add = (finding: CatalogAuditFinding) => findings.push(finding);

  const ratios = new Map<SolarEquipmentItem['type'], number[]>();
  for (const item of items) {
    const ratio = unitPrice(item);
    if (ratio !== undefined) ratios.set(item.type, [...(ratios.get(item.type) || []), ratio]);
  }
  const names = new Map<string, SolarEquipmentItem[]>();
  for (const item of items) {
    const key = `${item.type}|${normalizeName(item.displayName || '')}`;
    names.set(key, [...(names.get(key) || []), item]);
  }

  for (const item of items) {
    const offers = (item.supplierPrices || []).filter((o) => Number.isFinite(o.priceUSD) && o.priceUSD > 0);
    const label = item.displayName || item.id;
    if (!offers.length) add({ code: 'missing_price', severity: 'warning', equipmentId: item.id, message: `${label} no tiene ofertas con precio.` });
    else {
      const newest = Math.max(...offers.map((o) => Date.parse(o.updatedAt) || 0));
      if (options.now.getTime() - newest > staleMs)
        add({ code: 'stale_price', severity: 'info', equipmentId: item.id, message: `${label}: el precio más reciente tiene más de ${options.staleDays ?? 90} días.` });
      if (offers.every((o) => o.stockStatus === 'out_of_stock'))
        add({ code: 'no_stock', severity: 'warning', equipmentId: item.id, message: `${label}: todas sus ofertas están agotadas.` });
    }
    if (!item.datasheetAssetId && !item.datasheetUrl)
      add({ code: 'missing_datasheet', severity: 'info', equipmentId: item.id, message: `${label} no tiene ficha técnica vinculada.` });
    if (!item.imageAssetIds?.length) add({ code: 'missing_image', severity: 'info', equipmentId: item.id, message: `${label} no tiene imágenes.` });
    const n = nominal(item);
    if (!n || !Number.isFinite(n) || n <= 0)
      add({ code: 'missing_nominal', severity: 'error', equipmentId: item.id, message: `${label} no tiene potencia o capacidad nominal válida.` });
    if ((names.get(`${item.type}|${normalizeName(item.displayName || '')}`) || []).length > 1)
      add({ code: 'duplicate_model', severity: 'warning', equipmentId: item.id, message: `${label} aparece más de una vez en el catálogo.` });
    const ratio = unitPrice(item);
    const peers = ratios.get(item.type) || [];
    if (ratio !== undefined && peers.length >= 3) {
      const m = median(peers);
      if (ratio > m * 3 || ratio < m / 3)
        add({ code: 'price_outlier', severity: 'warning', equipmentId: item.id, message: `${label}: el precio por unidad nominal se aleja mucho de la mediana de su tipo.` });
    }
  }

  for (const project of projects) {
    if (project.isDeleted) continue;
    // Compatibility readers cover 2.6.0 proposals that only have the scalar mirror; nothing is migrated here.
    const groups = [
      ...getProjectPanels(project.specs).map((g) => ({ ...g, type: 'panel' as const })),
      ...getProjectInverters(project.specs).map((g) => ({ ...g, type: 'inverter' as const })),
      ...(project.specs.hasBattery ? getProjectBatteries(project.specs) : []).map((g) => ({ ...g, type: 'battery' as const })),
    ].filter((g) => g.count > 0 && (!options.type || g.type === options.type));
    for (const group of groups) {
      const resolved = catalog.some((item) => item.type === group.type &&
        (item.id === group.catalogItemId || item.id === group.id || normalizeName(item.displayName || '') === normalizeName(group.brandModel || '')));
      if (!resolved)
        add({ code: 'unmatched_proposal_equipment', severity: 'warning', projectId: project.id,
          message: `${project.client.name}: «${group.brandModel}» no está en el catálogo.` });
    }
  }

  const byCode: CatalogAuditReport['summary']['byCode'] = {};
  for (const f of findings) byCode[f.code] = (byCode[f.code] || 0) + 1;
  return { findings, summary: { total: findings.length, byCode, equipmentCount: items.length } };
}
