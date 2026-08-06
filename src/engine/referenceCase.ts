import { ProjectSimulation, FinancialSummaryResult } from '../types';
import { calculateFinancialSummary } from './financeEngine';

export const BENCHMARK_PROJECT: ProjectSimulation = {
  id: 'benchmark-centro-medico',
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-06T15:00:00Z',
  status: 'Final',
  client: {
    name: 'Centro Médico Hispánico',
    company: 'Health Solutions Corp.',
    location: 'Santo Domingo',
    province: 'Santo Domingo / Distrito Nacional',
    projectId: 'SP-2024-089',
    distributor: 'EDEESTE',
    tariffCode: 'BTS-2',
    contactEmail: 'contacto@centromedico.do',
    contactPhone: '809-555-0199',
  },
  specs: {
    isDetailed: false,
    panelPowerW: 561,
    panelCount: 42, // 23.56 kWp DC
    panelBrandModel: 'JA Solar 565W Mono PERC',
    inverterPowerKW: 20,
    inverterBrandModel: 'Growatt MAC 20KTL3-X LV',
    hasBattery: false,
    batteryCapacityKWh: 0,
    panelEfficiency: 21.8,
    tempCoeff: -0.35,
    systemLosses: 14.0,
    annualDegradation: 0.55,
    batteryDOD: 80,
  },
  rates: {
    energyCostPerKWh: 0.22, // ~$13.20 DOP per kWh
    currency: 'USD',
    usdExchangeRate: 60.0,
    gridExportFeePct: 25.0, // SIE-007-2026-REG
    annualEnergyInflationPct: 3.5,
  },
  financials: {
    applyLey5707: true,
    applyITBISExemption: true,
    pricePerWattUSD: 1.135,
    customCostUSD: 26739.92,
    discountRatePct: 10.0,
    projectLifespanYears: 25,
    co2FactorKgPerKWh: 0.65,
  },
  monthlyConsumption: [3200, 3100, 3500, 3400, 3600, 3550, 3650, 3450, 3350, 3250, 3100, 3198],
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

  if (Math.abs(summary.grossInvestmentUSD - 26739.92) > 1.0) {
    diffs.push(`Inversión bruta: esperada $26,739.92, obtenida $${summary.grossInvestmentUSD}`);
  }

  if (Math.abs(summary.paybackYears - 3.0) > 0.8) {
    diffs.push(`Payback: esperado ~3.0 años, obtenido ${summary.paybackYears} años`);
  }

  return {
    pass: diffs.length === 0,
    summary,
    diffs,
  };
}
