/**
 * Propuesta «incompleta» (F2b; ADR 0009). Pura y derivada: no se guarda nada en la propuesta, así que no cambia el formato
 * sincronizado ni el del visor. Una propuesta está incompleta si le falta algún mínimo para que el motor calcule con datos y
 * no con rellenos (el motor no falla: sin consumo asume 36.000 kWh/año, un equipo sin precio cuenta 0 y el retorno sale ≈0):
 * - consumo: doce meses finitos ≥ 0 con algo de consumo;
 * - un panel y un inversor con potencia y cantidad;
 * - tarifa o precio de la energía (con red): un precio del kWh > 0 o la fila de la tarifa guardada;
 * - precio en cada equipo en uso (matriz de costos; en precio directo $/W los costos unitarios no fijan el precio).
 * Mientras esté incompleta, los resultados se muestran vacíos con su motivo (nunca en cero) y no se exporta el PDF, no se
 * comparte ni se convierte a cotización. Una propuesta completa no cambia en nada: `proposalResults` da el resumen del motor tal cual.
 */
import type { FinancialSummaryResult, ProjectSimulation } from '../types';
import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import { readEquipment } from '../../shared/equipment';
import { proposalBillingTariff } from '../../shared/tariffBilling';
import { resolveGridConnection } from '../../shared/gridConnection';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';

export type IncompleteReasonCode = 'missing_consumption' | 'missing_panel' | 'missing_inverter' | 'missing_energy_price' | 'missing_equipment_price';

export interface IncompleteReason {
  code: IncompleteReasonCode;
  /** Qué falta y cómo completarlo, en español. */
  message: string;
  /** Ruta del registro de campos donde se corrige (para el resaltado del dock y el asistente). */
  path: string;
}

export interface ProposalCompleteness {
  incomplete: boolean;
  reasons: IncompleteReason[];
}

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const LIST_LABEL = { panels: 'paneles', inverters: 'inversores', batteries: 'baterías' } as const;

/** Mínimos para calcular. Ver el encabezado del módulo. */
export function proposalCompleteness(project: ProjectSimulation): ProposalCompleteness {
  const reasons: IncompleteReason[] = [];
  const months = project.monthlyConsumption;
  if (!Array.isArray(months) || months.length !== 12 || months.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0) || !months.some((value) => value > 0)) {
    reasons.push({ code: 'missing_consumption', path: 'monthlyConsumption', message: 'Falta el consumo: indica los doce meses (o un promedio) para calcular la producción y el ahorro.' });
  }
  // Una lista guardada vacía es «sin equipo»: `readEquipment` la rellenaría con el grupo heredado y su precio por defecto,
  // que es justo el dato inventado que esta función detecta. Sin lista (formato heredado), los grupos que deriva.
  const derived = readEquipment(project.specs ?? {});
  const stored = <K extends 'panels' | 'inverters' | 'batteries'>(list: K) =>
    (Array.isArray(project.specs?.[list]) && project.specs[list]!.length === 0 ? [] : derived[list]) as typeof derived[K];
  const equipment = { panels: stored('panels'), inverters: stored('inverters'), batteries: project.specs?.hasBattery ? stored('batteries') : [] };
  if (!equipment.panels.some((group) => positive(group.powerW) && positive(group.count))) {
    reasons.push({ code: 'missing_panel', path: 'specs.panels', message: 'Falta un panel con potencia y cantidad.' });
  }
  if (!equipment.inverters.some((group) => positive(group.powerKW) && positive(group.count))) {
    reasons.push({ code: 'missing_inverter', path: 'specs.inverters', message: 'Falta un inversor con potencia y cantidad.' });
  }
  const rates = project.rates ?? {};
  const billing = proposalBillingTariff(rates);
  const billedByBlocks = !!billing?.energyBlocks?.some((block) => positive(block.rateDOP));
  if (resolveGridConnection(rates) !== 'off_grid' && !positive(rates.energyCostPerKWh) && !billedByBlocks) {
    reasons.push({ code: 'missing_energy_price', path: 'rates.energyCostPerKWh', message: 'Falta el precio de la energía: elige la tarifa de la distribuidora o escribe el precio del kWh.' });
  }
  if (project.specs?.pricingMode !== 'direct_watt') {
    const unpriced: { path: string; name: string }[] = [];
    for (const list of ['panels', 'inverters', 'batteries'] as const) {
      equipment[list].forEach((group, index) => {
        if (positive(group.count) && !positive(group.unitPriceUSD)) unpriced.push({ path: `specs.${list}[${index}].unitPriceUSD`, name: group.brandModel?.trim() || LIST_LABEL[list] });
      });
    }
    if (unpriced.length) {
      reasons.push({
        code: 'missing_equipment_price', path: unpriced[0].path,
        message: `Falta el precio de ${unpriced.map((entry) => entry.name).join(', ')}: elige una oferta de proveedor o escribe el costo unitario.`,
      });
    }
  }
  return { incomplete: reasons.length > 0, reasons };
}

export interface ProposalResults extends ProposalCompleteness {
  /** El resumen del motor, o `null` mientras la propuesta esté incompleta (los resultados se muestran vacíos, no en cero). */
  summary: FinancialSummaryResult | null;
}

/** Resultados para mostrar: los del motor si está completa; si no, ninguno, con los motivos. */
export function proposalResults(project: ProjectSimulation, calculationMode: EnergyCalculationMode = 'legacy'): ProposalResults {
  const completeness = proposalCompleteness(project);
  return { ...completeness, summary: completeness.incomplete ? null : calculateProjectFinancialSummary(project, calculationMode) };
}

/** Texto corto de los motivos, para un tooltip o un aviso. */
export const incompleteReasonsText = (completeness: ProposalCompleteness): string => completeness.reasons.map((reason) => reason.message).join(' ');

/** Bloqueo de exportar el PDF, compartir y convertir a cotización, con su motivo. */
export function proposalActionBlock(project: ProjectSimulation): { blocked: boolean; reason: string | null } {
  const completeness = proposalCompleteness(project);
  return completeness.incomplete
    ? { blocked: true, reason: `Completa la propuesta para exportar el PDF, compartirla o convertirla en cotización. ${incompleteReasonsText(completeness)}` }
    : { blocked: false, reason: null };
}
