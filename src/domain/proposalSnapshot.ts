/**
 * Estado compacto de una propuesta para las herramientas del asistente (F3a). Puro: sin store ni reloj. Es el «contexto
 * vivo» que viaja DENTRO de cada resultado de herramienta (functionResponse.response), nunca como texto aparte:
 * - `engineResults`: los resultados del motor, o los motivos de «incompleta» en su lugar (nunca ceros ni rellenos, ADR 0009);
 * - `proposalStateSummary`: cliente, tarifa, consumo, equipos con su precio y procedencia, precio y completitud;
 * - `proposalWarnings`: avisos que el asistente debe repetir (consumo estimado, precio genérico, equipo sin precio);
 * - `editableFieldPaths`: las rutas editables, generadas del registro de campos (`projectFields.ts`).
 */
import type { ProjectSimulation } from '../types';
import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import { migrateLegacySpecs } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import { resolveGridConnection } from '../../shared/gridConnection';
import { resolveNetMeteringRegime } from '../../shared/netMetering';
import { proposalCompleteness, type IncompleteReason, type ProposalCompleteness } from './proposalCompleteness';
import { projectEditMetrics, type ProjectEditMetrics } from './projectEditTransaction';
import { PROJECT_FIELDS, type ProjectFieldDefinition } from './projectFields';
import { isConsumptionEstimated } from './newProposal';
import { marginPctFromMultiplier } from './rules/pricingRules';

/** Resultados del motor de una propuesta completa, o los motivos de una incompleta (sin ninguna cifra). */
export type EngineResults =
  | { complete: true; metrics: ProjectEditMetrics }
  | { complete: false; reasons: IncompleteReason[] };

export function engineResults(project: ProjectSimulation, mode: EnergyCalculationMode = 'legacy'): EngineResults {
  const completeness = proposalCompleteness(project);
  return completeness.incomplete ? { complete: false, reasons: completeness.reasons } : { complete: true, metrics: projectEditMetrics(project, mode) };
}

export interface EquipmentGroupSummary {
  index: number;
  brandModel: string;
  count: number;
  /** W del panel, kW del inversor o kWh de la batería. */
  magnitude?: number;
  unitPriceUSD?: number;
  /** `supplier` (oferta), `generic` (precio genérico, sin proveedor), `manual` o sin procedencia. */
  priceSource?: string;
  supplierName?: string;
  catalogItemId?: string;
}

export interface ProposalStateSummary {
  id: string;
  name: string;
  code?: string;
  status: string;
  /** Es la propuesta abierta en el simulador. */
  open: boolean;
  province: string;
  distributor?: string;
  tariffCode?: string;
  gridConnection: string;
  netMeteringRegime: string;
  consumption: { annualKWh: number; estimated: boolean };
  hasBattery: boolean;
  equipment: { panels: EquipmentGroupSummary[]; inverters: EquipmentGroupSummary[]; batteries: EquipmentGroupSummary[] };
  pricing: { mode: string; marginPct: number; laborUSDPerKWp: number };
  customItems: { id: string; description: string; quantity: number; unitPriceUSD: number }[];
  customDiscounts: { id: string; description: string; type: string; value: number }[];
  completeness: ProposalCompleteness;
}

const MAX_LIST = 12;
const groups = (list: readonly Record<string, unknown>[] | undefined, magnitude: string): EquipmentGroupSummary[] =>
  (list ?? []).slice(0, MAX_LIST).map((group, index) => {
    const supplier = group.selectedSupplierInfo as { supplierName?: string } | undefined;
    return {
      index,
      brandModel: String(group.brandModel ?? ''),
      count: Number(group.count ?? 0),
      ...(typeof group[magnitude] === 'number' ? { magnitude: group[magnitude] as number } : {}),
      ...(typeof group.unitPriceUSD === 'number' ? { unitPriceUSD: group.unitPriceUSD } : {}),
      ...(typeof group.priceSource === 'string' ? { priceSource: group.priceSource } : {}),
      ...(supplier?.supplierName ? { supplierName: supplier.supplierName } : {}),
      ...(typeof group.catalogItemId === 'string' ? { catalogItemId: group.catalogItemId } : {}),
    };
  });

export function proposalStateSummary(project: ProjectSimulation, options: { open?: boolean } = {}): ProposalStateSummary {
  const specs = migrateLegacySpecs(project.specs);
  const assumptions = resolveAssumptions(project);
  const annualKWh = (project.monthlyConsumption ?? []).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  return {
    id: project.id,
    name: project.client?.name ?? '',
    ...(project.client?.projectId ? { code: project.client.projectId } : {}),
    status: project.status,
    open: !!options.open,
    province: project.client?.province ?? '',
    distributor: project.rates?.distributor,
    tariffCode: project.rates?.tariffCode,
    gridConnection: resolveGridConnection(project.rates ?? {}),
    netMeteringRegime: resolveNetMeteringRegime(project.rates?.netMeteringRegime),
    consumption: { annualKWh, estimated: isConsumptionEstimated(project) },
    hasBattery: !!specs.hasBattery,
    equipment: {
      panels: groups(specs.panels as never, 'powerW'),
      inverters: groups(specs.inverters as never, 'powerKW'),
      batteries: groups(specs.batteries as never, 'capacityKWh'),
    },
    pricing: {
      mode: specs.pricingMode ?? 'cost_matrix',
      marginPct: marginPctFromMultiplier(specs.saleMarginMultiplier),
      laborUSDPerKWp: assumptions.installationUsdPerKwp,
    },
    customItems: (project.financials?.customItems ?? []).slice(0, MAX_LIST).map((item) => ({ id: item.id, description: item.description, quantity: item.quantity, unitPriceUSD: item.unitPriceUSD })),
    customDiscounts: (project.financials?.customDiscounts ?? []).slice(0, MAX_LIST).map((d) => ({ id: d.id, description: d.description, type: d.type, value: d.value })),
    completeness: proposalCompleteness(project),
  };
}

/** Avisos que el asistente debe repetir al usuario: nunca se presentan como cifras firmes. */
export function proposalWarnings(project: ProjectSimulation): string[] {
  const warnings: string[] = [];
  if (isConsumptionEstimated(project)) {
    warnings.push(`Consumo estimado: ${project.consumptionEstimate!.monthlyKWh.toLocaleString('es-DO')} kWh/mes los doce meses (no se indicó consumo). Pide la factura o los consumos reales.`);
  }
  const specs = migrateLegacySpecs(project.specs);
  const inUse = [...(specs.panels ?? []), ...(specs.inverters ?? []), ...(specs.hasBattery ? specs.batteries ?? [] : [])].filter((g) => (g.count ?? 0) > 0);
  const generic = inUse.filter((g) => g.priceSource === 'generic' && typeof g.unitPriceUSD === 'number');
  if (generic.length) {
    warnings.push(`Precio genérico, sin proveedor: ${generic.map((g) => `${g.brandModel} (US$ ${g.unitPriceUSD!.toFixed(2)})`).join(', ')}. Confírmalo con una oferta de proveedor antes de enviar la propuesta.`);
  }
  for (const reason of proposalCompleteness(project).reasons) warnings.push(`Incompleta: ${reason.message}`);
  return warnings;
}

export interface EditableFieldPath {
  /** Patrón de la ruta: `[n]` es el índice de un elemento de la lista. */
  path: string;
  label: string;
  type: ProjectFieldDefinition['type'];
  min?: number;
  max?: number;
  values?: readonly (string | boolean)[];
  optional?: boolean;
  note?: string;
}

/** Rutas que admite `edit_proposal` con `set`, generadas del registro (lo de solo lectura queda fuera). */
export function editableFieldPaths(): EditableFieldPath[] {
  return PROJECT_FIELDS.filter((def) => !def.readOnly).map((def) => ({
    path: def.path.replace(/\[\]/g, '[n]'),
    label: def.label,
    type: def.type,
    ...(def.min !== undefined ? { min: def.min } : {}),
    ...(def.max !== undefined ? { max: def.max } : {}),
    ...(def.values ? { values: def.values } : {}),
    ...(def.optional ? { optional: true } : {}),
  }));
}

/** Las rutas editables en una línea por sección («specs.panels[n]: brandModel, powerW…»), para la descripción del esquema. */
export function editablePathsDigest(): string {
  const bySection = new Map<string, string[]>();
  for (const { path } of editableFieldPaths()) {
    const at = path.lastIndexOf('.');
    const [section, field] = at < 0 ? [path, ''] : [path.slice(0, at), path.slice(at + 1)];
    const list = bySection.get(section) ?? [];
    if (field) list.push(field);
    bySection.set(section, list);
  }
  return [...bySection.entries()].map(([section, fields]) => (fields.length ? `${section}: ${fields.join(', ')}` : section)).join('; ');
}
