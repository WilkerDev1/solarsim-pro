import type { AssistantEdit, AssistantSection } from './types';
// Explicit surface: no ids, roles, authorship, remote endpoints, assets or arbitrary store writes.
const fields: Record<AssistantSection, string[]> = {
  client: [
    'name',
    'company',
    'location',
    'province',
    'address',
    'distributor',
    'tariffCode',
    'quoteValidityDays',
    'quoteDate',
    'contactPerson',
    'contactPhone',
    'contactEmail',
    'nic',
    'nis',
    'rnc',
    'contractNumber',
    'circuit',
    'meterNumber',
    'voltagePhase',
  ],
  specs: [
    'panels',
    'inverters',
    'batteries',
    'isDetailed',
    'pricingMode',
    'panelPowerW',
    'panelCount',
    'pricePerWattUSD',
    'pricePerKWpUSD',
    'inverterPowerKW',
    'inverterCount',
    'hasBattery',
    'batteryCapacityKWh',
    'batteryCount',
    'batteryCostUSD',
    'installationServicesDesc',
    'dopExchangeRate',
    'saleMarginMultiplier',
    'panelUnitPriceUSD',
    'inverterUnitPriceUSD',
    'batteryUnitPriceUSD',
    'installationUnitPriceUSD',
    'directPriceSurplusTarget',
    'autoSupplierPricing',
    'panelEfficiency',
    'tempCoeff',
    'systemLosses',
    'annualDegradation',
    'batteryDOD',
    'batteryEfficiencyPct',
    'batteryNightLoadSharePct',
    'batteryLifespanYears',
    'batteryReplacementCostUSD',
    'daytimeSelfConsumptionRatio',
    'daytimeLoadRatio',
    'loadProfilePreset',
    'showSelfConsumptionBreakdown',
    'autoCalculatePanels',
  ],
  rates: [
    'energyCostPerKWh',
    'distributor',
    'targetCoveragePct',
    'tariffCode',
    'currency',
    'usdExchangeRate',
    'gridExportFeePct',
    'isZeroExport',
    'annualEnergyInflationPct',
  ],
  financials: [
    'customItems',
    'customDiscounts',
    'applyLey5707',
    'applyITBISExemption',
    'pricePerWattUSD',
    'discountRatePct',
    'projectLifespanYears',
    'co2FactorKgPerKWh',
  ],
  consumption: ['monthlyConsumption'],
  equipment: [
    'brand',
    'modelSeries',
    'displayName',
    'powerW',
    'efficiencyPct',
    'tempCoeff',
    'annualDegradation',
    'cellType',
    'bifacialityPct',
    'voc',
    'isc',
    'vmp',
    'imp',
    'powerKW',
    'maxAcPowerKW',
    'maxPvPowerKW',
    'maxEfficiencyPct',
    'mpptEfficiencyPct',
    'voltageMPPT',
    'mpptCount',
    'batteryVoltageRange',
    'capacityKWh',
    'capacityAh',
    'voltageV',
    'chargeVoltageV',
    'dodPct',
    'batteryEfficiencyPct',
    'cycles',
    'chemistry',
    'maxChargeCurrentA',
    'maxDischargeCurrentA',
    'category',
    'dimensions',
    'weightKg',
  ],
};
const booleanFields = new Set([
  'isDetailed',
  'hasBattery',
  'autoSupplierPricing',
  'showSelfConsumptionBreakdown',
  'autoCalculatePanels',
  'isZeroExport',
  'applyLey5707',
  'applyITBISExemption',
]);
const textFields = new Set([
  ...fields.client.filter((f) => f !== 'quoteValidityDays'),
  'pricingMode',
  'installationServicesDesc',
  'directPriceSurplusTarget',
  'loadProfilePreset',
  'currency',
  'brand',
  'modelSeries',
  'displayName',
  'cellType',
  'voltageMPPT',
  'batteryVoltageRange',
  'chemistry',
  'category',
  'dimensions',
]);
const enums: Record<string, string[]> = {
  distributor: ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'],
  pricingMode: ['cost_matrix', 'direct_watt'],
  directPriceSurplusTarget: ['margin', 'labor'],
  loadProfilePreset: ['residential', 'commercial', 'industrial', 'custom'],
  currency: ['USD', 'DOP'],
};
const percentages = new Set([
  'systemLosses',
  'panelEfficiency',
  'batteryDOD',
  'batteryEfficiencyPct',
  'batteryNightLoadSharePct',
  'daytimeSelfConsumptionRatio',
  'daytimeLoadRatio',
  'gridExportFeePct',
  'efficiencyPct',
  'bifacialityPct',
  'maxEfficiencyPct',
  'mpptEfficiencyPct',
  'dodPct',
  'annualDegradation',
  'discountRatePct',
]);
export const editableAssistantFields = fields;
export function validateAssistantEdits(
  input: unknown,
  kind: 'project' | 'equipment'
): AssistantEdit[] {
  if (!Array.isArray(input) || !input.length || input.length > 24)
    throw new Error('El cambio debe contener entre 1 y 24 campos.');
  const keys = new Set<string>();
  return input.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Cambio inválido.');
    const { section, field, value } = raw as AssistantEdit;
    if (
      !fields[section]?.includes(field) ||
      (kind === 'equipment') !== (section === 'equipment')
    )
      throw new Error(`Campo no permitido: ${section}.${field}.`);
    const key = `${section}.${field}`;
    if (keys.has(key)) throw new Error('No se puede repetir un campo.');
    keys.add(key);
    if (
      section === 'specs' &&
      ['panels', 'inverters', 'batteries'].includes(field)
    ) {
      if (
        !Array.isArray(value) ||
        value.length > 12 ||
        (field !== 'batteries' && !value.length)
      )
        throw new Error(
          'Indica de 1 a 12 grupos de equipos; baterías puede quedar vacío.'
        );
      const ids = new Set();
      for (const g of value) {
        if (
          !g ||
          typeof g.id !== 'string' ||
          ids.has(g.id) ||
          !Number.isInteger(g.count) ||
          g.count < 1 ||
          g.count > 100000 ||
          typeof g.unitPriceUSD !== 'number' ||
          !Number.isFinite(g.unitPriceUSD) ||
          g.unitPriceUSD < 0 ||
          g.unitPriceUSD > 1e8
        )
          throw new Error(
            'Cada grupo requiere id del catálogo, cantidad entera y costo unitario USD confirmado.'
          );
        ids.add(g.id);
      }
    } else if (
      section === 'financials' &&
      ['customItems', 'customDiscounts'].includes(field)
    ) {
      if (!Array.isArray(value) || value.length > 30)
        throw new Error('Máximo 30 renglones.');
      const ids = new Set();
      for (const row of value) {
        if (
          !row ||
          typeof row.id !== 'string' ||
          !row.id ||
          ids.has(row.id) ||
          typeof row.description !== 'string' ||
          !row.description.trim() ||
          row.description.length > 300
        )
          throw new Error('Renglón inválido o duplicado.');
        ids.add(row.id);
        if (field === 'customItems') {
          if (
            !Number.isFinite(row.quantity) ||
            row.quantity <= 0 ||
            row.quantity > 100000 ||
            !Number.isFinite(row.unitPriceUSD) ||
            row.unitPriceUSD < 0 ||
            row.unitPriceUSD > 1e8 ||
            typeof row.exonerateITBIS !== 'boolean' ||
            (row.applyMargin !== undefined &&
              typeof row.applyMargin !== 'boolean') ||
            Object.keys(row).some(
              (k) =>
                ![
                  'id',
                  'description',
                  'quantity',
                  'unit',
                  'unitPriceUSD',
                  'exonerateITBIS',
                  'applyMargin',
                ].includes(k)
            )
          )
            throw new Error('Ítem adicional inválido.');
          if (
            row.unit !== undefined &&
            (typeof row.unit !== 'string' || row.unit.length > 30)
          )
            throw new Error('Unidad inválida.');
        } else if (
          !['fixed', 'percentage'].includes(row.type) ||
          !Number.isFinite(row.value) ||
          row.value < 0 ||
          row.value > (row.type === 'percentage' ? 100 : 1e8) ||
          (row.target !== undefined &&
            !['general', 'equipment'].includes(row.target)) ||
          Object.keys(row).some(
            (k) => !['id', 'description', 'type', 'value', 'target'].includes(k)
          )
        )
          throw new Error('Descuento inválido.');
      }
    } else if (section === 'consumption') {
      if (
        !Array.isArray(value) ||
        value.length !== 12 ||
        value.some(
          (v) =>
            typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e8
        )
      )
        throw new Error('Indica los doce consumos mensuales válidos.');
    } else if (booleanFields.has(field)) {
      if (typeof value !== 'boolean')
        throw new Error(`${field} requiere sí/no.`);
    } else if (textFields.has(field)) {
      if (
        typeof value !== 'string' ||
        value.length > 1500 ||
        (['name', 'displayName', 'brand', 'modelSeries', 'province'].includes(
          field
        ) &&
          !value.trim())
      )
        throw new Error(`${field} requiere texto válido.`);
      if (enums[field] && !enums[field].includes(value))
        throw new Error(`Valor no permitido para ${field}.`);
    } else {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value > 1e8 ||
        (field === 'tempCoeff' ? value < -10 || value > 10 : value < 0)
      )
        throw new Error(`${field} requiere un número válido.`);
      if (percentages.has(field) && value > 100)
        throw new Error(`${field} no puede superar 100%.`);
      if (
        /Count$|^panelCount$|^cycles$|^mpptCount$|^projectLifespanYears$|^quoteValidityDays$/.test(
          field
        ) &&
        !Number.isInteger(value)
      )
        throw new Error(`${field} requiere un entero.`);
      if (
        [
          'usdExchangeRate',
          'dopExchangeRate',
          'panelPowerW',
          'projectLifespanYears',
          'quoteValidityDays',
        ].includes(field) &&
        value <= 0
      )
        throw new Error(`${field} debe ser mayor que cero.`);
      if (field === 'projectLifespanYears' && value > 100)
        throw new Error('La vida del proyecto debe estar entre 1 y 100 años.');
      if (
        section === 'equipment' &&
        ['powerW', 'powerKW', 'capacityKWh', 'capacityAh', 'voltageV'].includes(
          field
        ) &&
        value <= 0
      )
        throw new Error('La capacidad nominal debe ser mayor que cero.');
      if (field === 'saleMarginMultiplier' && value < 1)
        throw new Error('El factor de venta debe ser al menos 1.');
    }
    return { section, field, value };
  });
}
