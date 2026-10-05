import type { DefaultSimulationSettings } from "./types";
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
  defaultSystemLosses: 25.0,
  defaultAnnualDegradation: 0.4,
  defaultAutoCalculatePanels: false,
  defaultHasBattery: false,
  defaultBatteryCapacityKWh: 16.08,
  defaultBatteryDOD: 90,

  // 4. Costos y Margen de Venta
  defaultPricingMode: "direct",
  defaultDirectPriceUSDPerWp: 1.05,
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
