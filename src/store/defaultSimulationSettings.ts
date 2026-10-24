import type { DefaultSimulationSettings } from "./types";
import { DEFAULT_BATTERY_CAPACITY_KWH, DEFAULT_BATTERY_DOD_PCT } from "../../shared/projectDefaults";
import {
  DEFAULT_ANNUAL_DEGRADATION_PCT,
  DEFAULT_DISCOUNT_RATE_PCT,
  DEFAULT_ENERGY_INFLATION_PCT,
  DEFAULT_PRICE_PER_WATT_USD,
  DEFAULT_PROJECT_LIFESPAN_YEARS,
  DEFAULT_QUOTE_VALIDITY_DAYS,
  DEFAULT_SYSTEM_LOSSES_PCT,
  DEFAULT_TARGET_COVERAGE_PCT,
} from "../../shared/assumptions";

/** Margen objetivo (%) que siembra las propuestas de IA; las propuestas nuevas parten del multiplicador compartido. */
export const DEFAULT_TARGET_MARGIN_PCT = 28;

/**
 * Ajustes de fábrica del usuario. Los supuestos del proyecto se toman de `shared/assumptions.ts` (ADR 0003): estos valores
 * solo siembran propuestas NUEVAS; una propuesta guardada a la que le falta un dato usa la constante compartida.
 */
export const DEFAULT_SIMULATION_SETTINGS: DefaultSimulationSettings = {
  // 1. Proyecto y Cliente
  defaultProvince: "Santo Domingo / Distrito Nacional",
  defaultDistributor: "EDEESTE",
  defaultTariffCode: "BTS2",
  defaultQuoteValidityDays: DEFAULT_QUOTE_VALIDITY_DAYS,

  // 2. Tarifas y Distribuidora
  defaultTargetCoveragePct: DEFAULT_TARGET_COVERAGE_PCT,
  defaultZeroExport: false,
  defaultApplySieRetention: true,
  defaultEstimatedEnergyRateDOP: 10.35,
  defaultEstimatedExportRateDOP: 5.5,

  // 3. Equipamiento y Sistema
  defaultPanelPowerW: 620,
  defaultPanelModel: "Canadian Solar TOPBiHiKu6 CS6W-620TB-AG (620W)",
  defaultInverterPowerKW: 8.0,
  defaultSystemLosses: DEFAULT_SYSTEM_LOSSES_PCT,
  defaultAnnualDegradation: DEFAULT_ANNUAL_DEGRADATION_PCT,
  defaultAutoCalculatePanels: false,
  defaultHasBattery: false,
  defaultBatteryCapacityKWh: DEFAULT_BATTERY_CAPACITY_KWH,
  defaultBatteryDOD: DEFAULT_BATTERY_DOD_PCT,

  // 4. Costos y Margen de Venta
  defaultPricingMode: "matrix",
  defaultDirectPriceUSDPerWp: DEFAULT_PRICE_PER_WATT_USD,
  defaultTargetMarginPct: DEFAULT_TARGET_MARGIN_PCT,
  defaultExcessEnergyDestiny: "net_metering",

  // 5. Finanzas e Incentivos (Ley 57-07)
  currency: "USD",
  taxRatePct: 18,
  discountRatePct: DEFAULT_DISCOUNT_RATE_PCT,
  applyITBISExemption: true,
  applyLey5707: true,
  ley5707AmortizationYears: 3,
  lifespanYears: DEFAULT_PROJECT_LIFESPAN_YEARS,
  annualEnergyTariffEscalationPct: DEFAULT_ENERGY_INFLATION_PCT,
};

/**
 * Before 2.7 the factory default was price-per-W ("direct") and it was persisted with every install, so a saved
 * "direct" cannot be told apart from an inherited default. Only an explicit choice (pricingModeChosenByUser) keeps it.
 */
export function migrateDefaultSimulationSettings(settings: DefaultSimulationSettings): DefaultSimulationSettings {
  if (!settings || settings.pricingModeChosenByUser || settings.defaultPricingMode !== "direct") return settings;
  return { ...settings, defaultPricingMode: "matrix" };
}
