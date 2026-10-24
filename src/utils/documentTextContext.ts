import { cleanClientName } from '../../shared/proposalPresentation';
import { createDocumentTextContext, type DocumentTextContext } from '../../shared/documentTexts';
import type { CompanyProfile, FinancialSummaryResult, ProjectSimulation } from '../types';
import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { formatProposalDate } from './formatDateUtils';
import { mainModelPhrase } from '../../shared/documentTexts/equipmentPhrases';
import { equipmentTotals, readEquipment } from '../../shared/equipment';

type SummaryFields = Pick<FinancialSummaryResult, 'annualConsumptionKWh' | 'annualProductionKWh' | 'systemCapacityKWp' | 'energyCoveragePct'>;

/** Contexto de los textos dinámicos a partir del proyecto y su resumen financiero. */
export function buildDocumentTextContext(
  project: ProjectSimulation,
  summary: SummaryFields,
  options: { currentDateStr: string; company?: CompanyProfile },
): DocumentTextContext {
  const { specs, client, rates } = project;
  const clientName = cleanClientName(client.name || 'Cliente');

  // Equipos solo por `shared/equipment`: frases con el modelo principal y «y N modelo(s) más»; totales de todos los grupos.
  const equipment = readEquipment(specs);
  const totals = equipmentTotals(equipment);
  const panel = mainModelPhrase(equipment, 'panel');
  const panelW = panel.main?.powerW || 0;
  const panelModel = (panel.name.toLowerCase().includes('w') || panelW <= 0 ? panel.name : `${panel.name} (${panelW}W)`) + panel.more;
  const inverterUnit = mainModelPhrase(equipment, 'inverter');
  const inverterKW = inverterUnit.main?.powerKW || 0;
  const inverterModel = (inverterUnit.name.toLowerCase().includes('kw') || inverterKW <= 0 ? inverterUnit.name : `${inverterUnit.name} (${inverterKW} kW)`) + inverterUnit.more;
  const batteryUnit = mainModelPhrase(equipment, 'battery');
  const batteryKWh = batteryUnit.main?.capacityKWh || 0;
  const batteryModel = (batteryUnit.name.toLowerCase().includes('kwh') || batteryKWh <= 0 ? batteryUnit.name : `${batteryUnit.name} (${batteryKWh} kWh)`) + batteryUnit.more;

  const inverterCount = totals.inverterCount || 1;
  const batteryCount = totals.batteryCount || 1;
  const panelsSummaryText = `${totals.panelCount} ${panelModel}`;
  const invertersSummaryText = `${inverterCount} ${inverterModel}`;
  const batteriesSummaryText = `${batteryCount} ${batteryModel}`;
  const company = options.company;

  return createDocumentTextContext({
    clientName,
    clientContactPerson: client.contactPerson || client.company || clientName || '',
    clientPhone: client.contactPhone || '',
    clientEmail: client.contactEmail || '',
    clientProvince: client.province || client.location || '',
    companyName: project.customization?.companyName || company?.name || 'electsun',
    company: company
      ? {
          name: company.name,
          slogan: company.slogan,
          footer: company.address,
          phone: company.phone,
          email: company.email,
          rnc: company.rncOrId,
          website: company.website,
          instagram: company.instagram,
        }
      : undefined,
    currentDateStr: options.currentDateStr,
    quoteValidityDays: client.quoteValidityDays || 7,
    distributor: client.distributor || rates.distributor || 'EDES',
    tariffCode: rates.tariffCode || '',
    isZeroExport: !!rates.isZeroExport,
    gridExportFeePct: rates.gridExportFeePct ?? 25,
    hasBattery: !!specs.hasBattery,
    hasBatteryStorage: totals.batteryNominalKWh > 0,
    annualConsumptionKWh: summary.annualConsumptionKWh,
    annualProductionKWh: summary.annualProductionKWh,
    systemCapacityKWp: summary.systemCapacityKWp,
    energyCoveragePct: summary.energyCoveragePct,
    panelCount: totals.panelCount,
    panelsSummaryText,
    // Con varios modelos el texto sincronizable es el resumen completo (con cantidad); con uno, solo el modelo.
    panelModelText: panel.more ? panelsSummaryText : panelModel,
    inverterCount,
    invertersSummaryText,
    inverterModelText: inverterUnit.more ? invertersSummaryText : inverterModel,
    batteryCount,
    batteryCapacityKWh: totals.batteryNominalKWh,
    batteriesSummaryText,
    batteryModelText: batteryUnit.more ? batteriesSummaryText : batteryModel,
  });
}

/** Contexto para un proyecto del store (resumen financiero con el modo de cálculo efectivo). */
export function documentTextContextFor(
  state: { companies: CompanyProfile[]; activeProjectId: string; getFinancialSummary: () => FinancialSummaryResult },
  project: ProjectSimulation,
  calculationMode?: EnergyCalculationMode,
): DocumentTextContext {
  const summary = project.id === state.activeProjectId ? state.getFinancialSummary() : calculateProjectFinancialSummary(project, calculationMode);
  return buildDocumentTextContext(project, summary, {
    currentDateStr: formatProposalDate(project.client?.quoteDate || project.customization?.quoteDate),
    company: state.companies.find((company) => company.id === project.companyProfileId),
  });
}
