/**
 * Datos del resumen de una propuesta, puros: los usan el resumen (`ProjectHubView`) y el visor de solo lectura del
 * editor de cotización. Nunca escriben.
 */
import { hasSavingsComparison, resolveSavingsBasis, type SavingsBasis } from '../../../shared/offGridSupply';
import { PAYBACK_NOT_REACHED_LABEL, isPaybackReached } from '../../../shared/returnIndicators';
import type { FinancialSummaryResult, ProjectSimulation } from '../../types';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from '../../utils/equipmentSpecsUtils';

/** Dólares sin decimales, como el resumen; «—» si no es un número. */
export const summaryMoney = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString('es-DO', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';

export interface ProposalDevice { id: string; name: string; count: number; nominal: string; kind: string }

/** Equipos en uso (paneles, inversores y baterías con cantidad). */
export function proposalDevices(project: ProjectSimulation): ProposalDevice[] {
  return [
    ...getProjectPanels(project.specs).map((p) => ({ id: `panel-${p.id}`, name: p.brandModel, count: p.count, nominal: `${p.powerW} W`, kind: 'Panel' })),
    ...getProjectInverters(project.specs).map((p) => ({ id: `inverter-${p.id}`, name: p.brandModel, count: p.count, nominal: `${p.powerKW} kW`, kind: 'Inversor' })),
    ...getProjectBatteries(project.specs).map((p) => ({ id: `battery-${p.id}`, name: p.brandModel, count: p.count, nominal: `${p.capacityKWh} kWh`, kind: 'Batería' })),
  ].filter((device) => device.count > 0);
}

/** Sistema aislado sin comparación (o generador sin costo): estado explícito en vez de ceros. */
export interface SavingsPresentation { basis: SavingsBasis; comparable: boolean; noSavingsLabel: string }
export function savingsPresentation(project: Pick<ProjectSimulation, 'rates'> | undefined): SavingsPresentation {
  const basis = resolveSavingsBasis(project?.rates);
  return { basis, comparable: hasSavingsComparison(basis), noSavingsLabel: basis === 'generator_missing_cost' ? 'Falta costo del generador' : 'Sin comparación' };
}

/** «N años» de retorno simple, «no se alcanza» o el estado sin comparación. */
export function paybackLabel(summary: FinancialSummaryResult, savings: SavingsPresentation): string {
  if (!savings.comparable) return savings.noSavingsLabel;
  return isPaybackReached(summary) && Number.isFinite(summary.paybackYears) && summary.paybackYears > 0
    ? `${summary.paybackYears.toFixed(1)} años`
    : PAYBACK_NOT_REACHED_LABEL;
}
