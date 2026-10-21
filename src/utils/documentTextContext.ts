import { cleanClientName } from '../../shared/proposalPresentation';
import { createDocumentTextContext, type DocumentTextContext } from '../../shared/documentTexts';
import type { CompanyProfile, FinancialSummaryResult, ProjectSimulation } from '../types';
import {
  calculateTotalBatteryCapacityKWh,
  formatBatteriesSummary,
  formatInvertersSummary,
  formatPanelsSummary,
} from './equipmentSpecsUtils';

type SummaryFields = Pick<FinancialSummaryResult, 'annualConsumptionKWh' | 'annualProductionKWh' | 'systemCapacityKWp' | 'energyCoveragePct'>;

/** Contexto de los textos dinámicos a partir del proyecto y su resumen financiero. */
export function buildDocumentTextContext(
  project: ProjectSimulation,
  summary: SummaryFields,
  options: { currentDateStr: string; company?: CompanyProfile },
): DocumentTextContext {
  const { specs, client, rates } = project;
  const clientName = cleanClientName(client.name || 'Cliente');

  const rawPanelModel = specs.panelBrandModel || 'Módulos Monocristalinos TOPCon';
  const panelModel = rawPanelModel.toLowerCase().includes('w') || (specs.panelPowerW || 0) <= 0 ? rawPanelModel : `${rawPanelModel} (${specs.panelPowerW}W)`;
  const rawInverterModel = specs.inverterBrandModel || 'Inversor Solar Inteligente';
  const inverterModel = rawInverterModel.toLowerCase().includes('kw') || (specs.inverterPowerKW || 0) <= 0
    ? rawInverterModel
    : `${rawInverterModel} (${specs.inverterPowerKW || (summary.systemCapacityKWp * 0.9).toFixed(1)} kW)`;
  const rawBatteryModel = specs.batteryBrandModel || 'Batería de Litio LiFePO4';
  const batteryModel = rawBatteryModel.toLowerCase().includes('kwh') || (specs.batteryCapacityKWh || 0) <= 0
    ? rawBatteryModel
    : `${rawBatteryModel} (${specs.batteryCapacityKWh} kWh)`;

  const multiPanels = !!(specs.panels && specs.panels.length > 1);
  const multiInverters = !!(specs.inverters && specs.inverters.length > 1);
  const multiBatteries = !!(specs.batteries && specs.batteries.length > 1);
  const panelsSummaryText = multiPanels ? formatPanelsSummary(specs) : `${specs.panelCount} ${panelModel}`;
  const invertersSummaryText = multiInverters ? formatInvertersSummary(specs) : `${specs.inverterCount || 1} ${inverterModel}`;
  const batteriesSummaryText = multiBatteries ? formatBatteriesSummary(specs) : `${specs.batteryCount || 1} ${batteryModel}`;
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
    hasBatteryStorage: !!specs.hasBattery && calculateTotalBatteryCapacityKWh(specs) > 0,
    annualConsumptionKWh: summary.annualConsumptionKWh,
    annualProductionKWh: summary.annualProductionKWh,
    systemCapacityKWp: summary.systemCapacityKWp,
    energyCoveragePct: summary.energyCoveragePct,
    panelCount: specs.panelCount,
    panelsSummaryText,
    panelModelText: multiPanels ? panelsSummaryText : panelModel,
    inverterCount: specs.inverterCount || 1,
    invertersSummaryText,
    inverterModelText: multiInverters ? invertersSummaryText : inverterModel,
    batteryCount: specs.batteryCount || 1,
    batteryCapacityKWh: specs.batteryCapacityKWh || 0,
    batteriesSummaryText,
    batteryModelText: multiBatteries ? batteriesSummaryText : batteryModel,
  });
}
