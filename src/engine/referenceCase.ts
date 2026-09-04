import { ProjectSimulation, FinancialSummaryResult } from '../types';
import { calculateFinancialSummary } from './financeEngine';

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
  specs: {
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
    batteryDOD: 80,
  },
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

export function validateReferenceCase(): { pass: boolean; summary: FinancialSummaryResult; diffs: string[] } {
  const summary = calculateFinancialSummary(
    BENCHMARK_PROJECT.client.province,
    BENCHMARK_PROJECT.specs,
    BENCHMARK_PROJECT.rates,
    BENCHMARK_PROJECT.financials,
    BENCHMARK_PROJECT.monthlyConsumption
  );

  const diffs: string[] = [];

  if (Math.abs(summary.systemCapacityKWp - 23.56) > 0.1) {
    diffs.push(`Capacidad DC: esperado 23.56 kWp, obtenido ${summary.systemCapacityKWp} kWp`);
  }

  if (Math.abs(summary.grossInvestmentUSD - 25371.12) > 1.0) {
    diffs.push(`Inversión bruta: esperada $25,371.12, obtenida $${summary.grossInvestmentUSD}`);
  }

  if (Math.abs(summary.ley5707CreditUSD - 7785.38) > 1.0) {
    diffs.push(`Crédito Ley 57-07: esperado $7,785.38, obtenido $${summary.ley5707CreditUSD}`);
  }

  if (Math.abs(summary.itbisSavedUSD - 1770.46) > 1.0) {
    diffs.push(`ITBIS exonerado: esperado $1,770.46, obtenido $${summary.itbisSavedUSD}`);
  }

  if (Math.abs(summary.paybackYears - 2.3) > 0.8) {
    diffs.push(`Payback: esperado ~2.3 años, obtenido ${summary.paybackYears} años`);
  }

  return {
    pass: diffs.length === 0,
    summary,
    diffs,
  };
}
