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

/**
 * «Margen bruto objetivo» de fábrica (%): el factor de venta con que nace TODA propuesta nueva (fábrica única, ADR 0009) y la
 * línea de catálogo de una cotización. 40 % = factor 1,40 (decisión del dueño; antes 28 %).
 *
 * Ojo: los ajustes se guardan ENTEROS en cada guardado, así que toda instalación con estado guardado tiene
 * `defaultTargetMarginPct` escrito aunque nunca lo tocara (28, el valor de fábrica anterior). No se migra: esas
 * instalaciones siguen naciendo con 1,28 hasta que el usuario lo cambie en Ajustes → Costos y margen. Si el dueño decide
 * migrar, el punto es `migrateDefaultSimulationSettings` (28 → 40 solo si sigue siendo el valor anterior, con aviso). ADR 0009.
 */
export const DEFAULT_TARGET_MARGIN_PCT = 40;
/** Valor de fábrica anterior a F2b; el que tienen guardado las instalaciones que nunca cambiaron el margen. */
export const PREVIOUS_DEFAULT_TARGET_MARGIN_PCT = 28;

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
