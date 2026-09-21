import { SystemSpecs, PanelItemSpec, InverterItemSpec, BatteryItemSpec } from '../types';

/**
 * Returns a normalized array of panel models for the project.
 * If specs.panels is set and non-empty, returns it.
 * Otherwise, synthesizes a single PanelItemSpec from the base fields for 100% backward compatibility.
 */
export function getProjectPanels(specs: SystemSpecs): PanelItemSpec[] {
  if (specs.panels && Array.isArray(specs.panels) && specs.panels.length > 0) {
    return specs.panels;
  }
  return [
    {
      id: 'primary-panel',
      brandModel: specs.panelBrandModel || 'Módulo Canadian Solar TOPBiHiKu6 620W',
      powerW: specs.panelPowerW || 620,
      count: specs.panelCount || 0,
      unitPriceUSD: specs.panelUnitPriceUSD,
      weightKilos: specs.panelWeightKilos,
      efficiencyPct: specs.panelEfficiency,
      tempCoeff: specs.tempCoeff,
      annualDegradation: specs.annualDegradation,
      selectedSupplierInfo: specs.selectedSupplierInfo?.panel
        ? {
            supplierName: specs.selectedSupplierInfo.panel.supplierName,
            priceUSD: specs.selectedSupplierInfo.panel.priceUSD,
            updatedAt: specs.selectedSupplierInfo.panel.updatedAt,
            supplierPriceId: specs.selectedSupplierInfo.panel.supplierPriceId,
          }
        : undefined,
    },
  ];
}

/**
 * Returns a normalized array of inverter models for the project.
 * If specs.inverters is set and non-empty, returns it.
 * Otherwise, synthesizes a single InverterItemSpec from the base fields for 100% backward compatibility.
 */
export function getProjectInverters(specs: SystemSpecs): InverterItemSpec[] {
  if (specs.inverters && Array.isArray(specs.inverters) && specs.inverters.length > 0) {
    return specs.inverters;
  }
  return [
    {
      id: 'primary-inverter',
      brandModel: specs.inverterBrandModel || 'Inversor Solar Inteligente',
      powerKW: specs.inverterPowerKW || 8,
      count: specs.inverterCount !== undefined ? specs.inverterCount : 1,
      unitPriceUSD: specs.inverterUnitPriceUSD,
      weightKilos: specs.inverterWeightKilos,
      efficiencyPct: specs.inverterEfficiencyPct,
      selectedSupplierInfo: specs.selectedSupplierInfo?.inverter
        ? {
            supplierName: specs.selectedSupplierInfo.inverter.supplierName,
            priceUSD: specs.selectedSupplierInfo.inverter.priceUSD,
            updatedAt: specs.selectedSupplierInfo.inverter.updatedAt,
            supplierPriceId: specs.selectedSupplierInfo.inverter.supplierPriceId,
          }
        : undefined,
    },
  ];
}

/**
 * Returns a normalized array of battery models for the project.
 * If specs.hasBattery is false, returns an empty array.
 * If specs.batteries is set and non-empty, returns it.
 * Otherwise, synthesizes a single BatteryItemSpec from the base fields for 100% backward compatibility.
 */
export function getProjectBatteries(specs: SystemSpecs): BatteryItemSpec[] {
  if (!specs.hasBattery) return [];
  if (specs.batteries && Array.isArray(specs.batteries) && specs.batteries.length > 0) {
    return specs.batteries;
  }
  return [
    {
      id: 'primary-battery',
      brandModel: specs.batteryBrandModel || 'Batería de Litio LiFePO4',
      capacityKWh: specs.batteryCapacityKWh || 16.08,
      count: specs.batteryCount !== undefined ? specs.batteryCount : 1,
      unitPriceUSD: specs.batteryUnitPriceUSD,
      weightKilos: specs.batteryWeightKilos,
      dodPct: specs.batteryDOD || 90,
      efficiencyPct: specs.batteryEfficiencyPct || 95,
      lifespanYears: specs.batteryLifespanYears || 10,
      replacementCostUSD: specs.batteryReplacementCostUSD,
      selectedSupplierInfo: specs.selectedSupplierInfo?.battery
        ? {
            supplierName: specs.selectedSupplierInfo.battery.supplierName,
            priceUSD: specs.selectedSupplierInfo.battery.priceUSD,
            updatedAt: specs.selectedSupplierInfo.battery.updatedAt,
            supplierPriceId: specs.selectedSupplierInfo.battery.supplierPriceId,
          }
        : undefined,
    },
  ];
}

/**
 * Calculates total DC peak capacity in kWp across all panel models.
 */
export function calculateTotalDCCapacityKWp(specs: SystemSpecs): number {
  const panels = getProjectPanels(specs);
  const totalWatts = panels.reduce((sum, p) => sum + (p.powerW || 0) * (p.count || 0), 0);
  return Math.round((totalWatts / 1000) * 1000) / 1000;
}

/**
 * Calculates total count of solar panels across all models.
 */
export function calculateTotalPanelCount(specs: SystemSpecs): number {
  const panels = getProjectPanels(specs);
  return panels.reduce((sum, p) => sum + (p.count || 0), 0);
}

/**
 * Calculates total nominal inverter capacity in kW across all inverter models.
 */
export function calculateTotalInverterPowerKW(specs: SystemSpecs): number {
  const inverters = getProjectInverters(specs);
  const totalKW = inverters.reduce((sum, inv) => sum + (inv.powerKW || 0) * (inv.count || 0), 0);
  return Math.round(totalKW * 100) / 100;
}

/**
 * Calculates total count of inverters across all models.
 */
export function calculateTotalInverterCount(specs: SystemSpecs): number {
  const inverters = getProjectInverters(specs);
  return inverters.reduce((sum, inv) => sum + (inv.count || 0), 0);
}

/**
 * Calculates total nominal BESS battery capacity in kWh across all battery models.
 */
export function calculateTotalBatteryCapacityKWh(specs: SystemSpecs): number {
  if (!specs.hasBattery) return 0;
  const batteries = getProjectBatteries(specs);
  const totalKWh = batteries.reduce((sum, b) => sum + (b.capacityKWh || 0) * (b.count || 0), 0);
  return Math.round(totalKWh * 100) / 100;
}

/**
 * Calculates total count of batteries across all models.
 */
export function calculateTotalBatteryCount(specs: SystemSpecs): number {
  if (!specs.hasBattery) return 0;
  const batteries = getProjectBatteries(specs);
  return batteries.reduce((sum, b) => sum + (b.count || 0), 0);
}

/**
 * Formats a natural language technical summary of inverters.
 * Example: "2 Inversores Luxpower 10k y 2 Inversores Luxpower 5k"
 */
export function formatInvertersSummary(specs: SystemSpecs): string {
  const inverters = getProjectInverters(specs);
  if (inverters.length === 0) return 'Inversor Solar';
  return inverters
    .map((inv) => {
      const brand = inv.brandModel || `${inv.powerKW} kW`;
      const prefix = brand.toLowerCase().startsWith('inversor') ? '' : 'Inversor ';
      const unit = inv.count === 1 ? 'Inversor' : 'Inversores';
      const cleanBrand = brand.replace(/^inversor(?:es)?\s+/i, '').trim();
      return `${inv.count} ${inv.count === 1 ? 'Inversor' : 'Inversores'} ${cleanBrand}`;
    })
    .join(' y ');
}

/**
 * Formats a natural language technical summary of panels.
 * Example: "24 Módulos JA Solar 630W y 10 Módulos Canadian Solar 600W"
 */
export function formatPanelsSummary(specs: SystemSpecs): string {
  const panels = getProjectPanels(specs);
  if (panels.length === 0) return 'Módulos Solares Fotovoltaicos';
  return panels
    .map((p) => {
      const cleanBrand = (p.brandModel || `${p.powerW}W`).replace(/^m[oó]dulos?\s+/i, '').trim();
      return `${p.count} ${p.count === 1 ? 'Módulo' : 'Módulos'} ${cleanBrand}`;
    })
    .join(' y ');
}

/**
 * Formats a natural language technical summary of batteries.
 * Example: "1 Batería Hinaess 16.08 kWh y 2 Baterías Hinaess 5.12 kWh"
 */
export function formatBatteriesSummary(specs: SystemSpecs): string {
  if (!specs.hasBattery) return '';
  const batteries = getProjectBatteries(specs);
  if (batteries.length === 0) return '';
  return batteries
    .map((b) => {
      const cleanBrand = (b.brandModel || `${b.capacityKWh} kWh`).replace(/^bater[ií]as?\s+/i, '').trim();
      return `${b.count} ${b.count === 1 ? 'Batería' : 'Baterías'} ${cleanBrand}`;
    })
    .join(' y ');
}
