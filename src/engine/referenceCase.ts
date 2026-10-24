import { LegacyProjectSpecs, ProjectSimulation } from '../types';
import { migrateLegacySpecs } from '../../shared/equipment';

/** DOD (%) del caso de referencia. Solo describe este caso: no es el default de proyectos (ver `DEFAULT_BATTERY_DOD_PCT`). */
export const BENCHMARK_BATTERY_DOD_PCT = 80;

/**
 * Equipos del caso de referencia tal como los capturó la planilla auditada: un modelo por tipo, con los campos
 * sueltos del formato heredado. `BENCHMARK_PROJECT` los guarda ya como grupos (`migrateLegacySpecs` es invariante:
 * kWp, costos y finanzas no cambian), así que ningún proyecto nuevo nace con el espejo.
 */
export const BENCHMARK_LEGACY_SPECS: LegacyProjectSpecs = {
  isDetailed: true,
  panelPowerW: 620,
  autoCalculatePanels: false,
  panelCount: 38, // 23.56 kWp DC
  pricePerWattUSD: 1.134971,
  panelBrandModel: 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)',
  inverterPowerKW: 8,
  inverterCount: 2,
  inverterBrandModel: 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)',
  hasBattery: true,
  batteryCapacityKWh: 48, // 3 batteries of 16 kWh
  batteryCount: 3,
  batteryCostUSD: 0,
  batteryBrandModel: 'Batería Hinaess 16 KwH-48 vdc.',
  installationServicesDesc: 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).',
  dopExchangeRate: 60.0,
  saleMarginMultiplier: 1.25,
  panelUnitPriceUSD: 103.32,
  inverterUnitPriceUSD: 2300.0,
  batteryUnitPriceUSD: 1990.0,
  installationUnitPriceUSD: 170.0,
  panelWeightKilos: 29.01882,
  panelEfficiency: 21.8,
  tempCoeff: -0.35,
  systemLosses: 14.0,
  annualDegradation: 0.5,
  batteryDOD: BENCHMARK_BATTERY_DOD_PCT,
};

export const BENCHMARK_PROJECT: ProjectSimulation = {
  id: 'benchmark-centro-medico',
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-06T15:00:00Z',
  status: 'Final',
  client: {
    name: 'CENTRO MEDICO HISPANICO',
    company: 'CENTRO MEDICO HISPANICO SRL',
    location: 'Santo Domingo, RD',
    province: 'Santo Domingo / Distrito Nacional',
    coordinates: '18.4861, -69.9312',
    address: 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.',
    projectId: 'SP-2024-089',
    distributor: 'EDEESTE',
    tariffCode: 'BTS2',
    contactEmail: 'contacto@centromedico.do',
    contactPhone: '809-555-0199',
    quoteNumber: 'C-0030',
    quoteValidityDays: 7,
  },
  specs: migrateLegacySpecs(BENCHMARK_LEGACY_SPECS),
  rates: {
    energyCostPerKWh: 0.221,
    distributor: 'EDESUR',
    targetCoveragePct: 95,
    tariffCode: 'BTS2',
    currency: 'USD',
    usdExchangeRate: 60.0,
    gridExportFeePct: 25.0,
    annualEnergyInflationPct: 3.5,
  },
  financials: {
    applyLey5707: true,
    applyITBISExemption: true,
    customITBISSavedUSD: 1770.46,
    pricePerWattUSD: 1.135,
    discountRatePct: 10.0,
    projectLifespanYears: 25,
    co2FactorKgPerKWh: 0.481,
  },
  monthlyConsumption: Array(12).fill(3279), // 39,348 kWh total
};
