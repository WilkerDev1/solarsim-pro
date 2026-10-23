import type { DefaultSimulationSettings } from "./types";
import { DEFAULT_BATTERY_CAPACITY_KWH, DEFAULT_BATTERY_DOD_PCT, DEFAULT_PRICE_PER_WATT_USD, DEFAULT_SYSTEM_LOSSES_PCT } from "../../shared/projectDefaults";
export const DEFAULT_SIMULATION_SETTINGS: DefaultSimulationSettings = {
  // 1. Proyecto y Cliente
  defaultProvince: "Santo Domingo / Distrito Nacional",
  defaultDistributor: "EDEESTE",
  defaultTariffCode: "BTS2",
  defaultQuoteValidityDays: 7,

  // 2. Tarifas y Distribuidora
  defaultTargetCoveragePct: 95,
  defaultZeroExport: false,
  defaultApplySieRetention: true,
  defaultEstimatedEnergyRateDOP: 10.35,
  defaultEstimatedExportRateDOP: 5.5,

  // 3. Equipamiento y Sistema
  defaultPanelPowerW: 620,
  defaultPanelModel: "Canadian Solar TOPBiHiKu6 CS6W-620TB-AG (620W)",
  defaultInverterPowerKW: 8.0,
  defaultSystemLosses: DEFAULT_SYSTEM_LOSSES_PCT,
  defaultAnnualDegradation: 0.4,
  defaultAutoCalculatePanels: false,
  defaultHasBattery: false,
  defaultBatteryCapacityKWh: DEFAULT_BATTERY_CAPACITY_KWH,
  defaultBatteryDOD: DEFAULT_BATTERY_DOD_PCT,

  // 4. Costos y Margen de Venta
  defaultPricingMode: "matrix",
  defaultDirectPriceUSDPerWp: DEFAULT_PRICE_PER_WATT_USD,
  defaultTargetMarginPct: 28,
  defaultExcessEnergyDestiny: "net_metering",

  // 5. Finanzas e Incentivos (Ley 57-07)
  currency: "USD",
  taxRatePct: 18,
  discountRatePct: 12,
  applyITBISExemption: true,
  applyLey5707: true,
  ley5707AmortizationYears: 3,
  lifespanYears: 25,
  annualEnergyTariffEscalationPct: 3.5,
};

/**
 * Before 2.7 the factory default was price-per-W ("direct") and it was persisted with every install, so a saved
 * "direct" cannot be told apart from an inherited default. Only an explicit choice (pricingModeChosenByUser) keeps it.
 */
export function migrateDefaultSimulationSettings(settings: DefaultSimulationSettings): DefaultSimulationSettings {
  if (!settings || settings.pricingModeChosenByUser || settings.defaultPricingMode !== "direct") return settings;
  return { ...settings, defaultPricingMode: "matrix" };
}
