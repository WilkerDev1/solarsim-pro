import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { migrateLegacySpecs } from '../../shared/equipment';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { regulatoryNoteDefault } from '../../shared/documentTexts';
import { createDocumentTextContext } from '../../shared/documentTexts/context';
import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import type { FinancialSummaryResult, LegacyProjectSpecs, ProjectSimulation, UtilityRates } from '../types';

/**
 * Caracterización del régimen de medición neta ACTUAL (fase 0 del plan tarifario).
 *
 * Fija ahorro, exportación, retención y factura neta del motor para los casos que las fases siguientes
 * van a tocar (BTS-1 bajo y sobre 700 kWh, BTD, inyección cero y batería), en modo legacy y en la proyección
 * física de autoconsumo. Es la red de seguridad: una propuesta guardada debe dar exactamente estas cifras
 * aunque cambien la matriz de fábrica, la tarifa de referencia o el texto regulatorio.
 *
 * Para volver a capturar las cifras (solo si el cambio de motor es intencional): `CAPTURE=1 npx tsx src/tests/testNetMeteringRegime.ts`.
 */

const legacySpecs = (overrides: Partial<LegacyProjectSpecs>): LegacyProjectSpecs => ({
  isDetailed: true,
  pricePerWattUSD: 1.13,
  panelPowerW: 600,
  panelCount: 10,
  autoCalculatePanels: false,
  panelBrandModel: 'Panel Caracterización (600W)',
  inverterPowerKW: 5,
  inverterCount: 1,
  inverterBrandModel: 'Inversor Caracterización (5 kW)',
  hasBattery: false,
  batteryCapacityKWh: 0,
  batteryCount: 0,
  dopExchangeRate: 60,
  saleMarginMultiplier: 1.25,
  panelUnitPriceUSD: 100,
  inverterUnitPriceUSD: 1500,
  batteryUnitPriceUSD: 2000,
  installationUnitPriceUSD: 170,
  systemLosses: 14,
  annualDegradation: 0.5,
  batteryDOD: 90,
  ...overrides,
}) as LegacyProjectSpecs;

const project = (id: string, specs: Partial<LegacyProjectSpecs>, rates: Partial<UtilityRates>, monthlyKWh: number): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id,
  client: { ...structuredClone(BENCHMARK_PROJECT.client), province: 'Santiago', distributor: rates.distributor ?? 'EDESUR', tariffCode: rates.tariffCode ?? 'BTS1' },
  specs: migrateLegacySpecs(legacySpecs(specs)),
  rates: {
    energyCostPerKWh: 0.2,
    distributor: 'EDESUR',
    targetCoveragePct: 95,
    tariffCode: 'BTS1',
    currency: 'USD',
    usdExchangeRate: 60,
    gridExportFeePct: 25,
    annualEnergyInflationPct: 3.5,
    ...rates,
  },
  financials: { ...structuredClone(BENCHMARK_PROJECT.financials), customITBISSavedUSD: 0 },
  monthlyConsumption: Array(12).fill(monthlyKWh),
});

/** Cinco suministros típicos; tarifas escalares guardadas en la propuesta (USD/kWh), como hoy. */
const CASES: Record<string, ProjectSimulation> = {
  // EDENORTE BTS-1 de poco consumo: 6.68 RD$/kWh ≈ 0.111 USD; exporta buena parte de lo que produce.
  bts1Low: project('bts1-low', { panelCount: 4 }, { distributor: 'EDENORTE', tariffCode: 'BTS1', energyCostPerKWh: 0.111 }, 250),
  // EDESUR BTS-1 por encima de 700 kWh.
  bts1High: project('bts1-high', { panelCount: 9 }, { distributor: 'EDESUR', tariffCode: 'BTS1', energyCostPerKWh: 0.188 }, 1000),
  // EDESUR BTD (tarifa con potencia), excedente grande.
  btd: project('btd', { panelCount: 60, inverterPowerKW: 15, inverterCount: 2 }, { distributor: 'EDESUR', tariffCode: 'BTD', energyCostPerKWh: 0.15 }, 3000),
  // EDEESTE BTS-2 con inyección cero.
  zeroExport: project('zero-export', { panelCount: 10 }, { distributor: 'EDEESTE', tariffCode: 'BTS2', energyCostPerKWh: 0.22, isZeroExport: true }, 800),
  // EDEESTE BTS-1 con banco de baterías.
  battery: project('battery', { panelCount: 14, hasBattery: true, batteryCapacityKWh: 20, batteryCount: 2 }, { distributor: 'EDEESTE', tariffCode: 'BTS1', energyCostPerKWh: 0.2 }, 1200),
};

const MODES: EnergyCalculationMode[] = ['legacy', 'self_consumption'];
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Fingerprint {
  year1SavingsUSD: number;
  exportedKWh: number;
  retainedKWh: number;
  netCreditKWh: number;
  selfConsumedKWh: number;
  originalBillUSD: number;
  netBillUSD: number;
  januarySavingsUSD: number;
  paybackYears: number;
}

function fingerprint(summary: FinancialSummaryResult): Fingerprint {
  const months = summary.monthlyBreakdown;
  const sum = (pick: (m: (typeof months)[number]) => number) => r2(months.reduce((total, m) => total + pick(m), 0));
  return {
    year1SavingsUSD: r2(summary.year1SavingsUSD),
    exportedKWh: sum((m) => m.gridExportedKWh),
    retainedKWh: sum((m) => m.retainedExportKWh),
    netCreditKWh: sum((m) => m.netExportCreditKWh),
    selfConsumedKWh: sum((m) => m.solarSelfConsumedKWh),
    originalBillUSD: sum((m) => m.originalBillUSD),
    netBillUSD: sum((m) => m.netBillUSD),
    januarySavingsUSD: r2(months[0].savingsUSD),
    paybackYears: r2(summary.paybackYears),
  };
}

// Cifras del motor actual, capturadas antes de introducir el régimen regulatorio.
const EXPECTED: Record<string, Record<EnergyCalculationMode, Fingerprint>> = {
  bts1Low: {
    legacy: { year1SavingsUSD: 424.05, exportedKWh: 1191.7, retainedKWh: 298.1, netCreditKWh: 893.6, selfConsumedKWh: 2926.7, originalBillUSD: 333, netBillUSD: 0, januarySavingsUSD: 33.95, paybackYears: 4.5 },
    self_consumption: { year1SavingsUSD: 372.01, exportedKWh: 3068.4, retainedKWh: 767, netCreditKWh: 2301.4, selfConsumedKWh: 1050, originalBillUSD: 333, netBillUSD: 0.58, januarySavingsUSD: 29.59, paybackYears: 5.1 },
  },
  bts1High: {
    legacy: { year1SavingsUSD: 1633.24, exportedKWh: 2316.4, retainedKWh: 579.2, netCreditKWh: 1737.2, selfConsumedKWh: 6950.2, originalBillUSD: 2256, netBillUSD: 622.76, januarySavingsUSD: 129.4, paybackYears: 2.1 },
    self_consumption: { year1SavingsUSD: 1504.01, exportedKWh: 5066.6, retainedKWh: 1266.5, netCreditKWh: 3800.1, selfConsumedKWh: 4200, originalBillUSD: 2256, netBillUSD: 751.99, januarySavingsUSD: 119.98, paybackYears: 2.3 },
  },
  btd: {
    legacy: { year1SavingsUSD: 8300.02, exportedKWh: 25777.5, retainedKWh: 6444.1, netCreditKWh: 19333.4, selfConsumedKWh: 36000, originalBillUSD: 5400, netBillUSD: 0, januarySavingsUSD: 663.17, paybackYears: 2 },
    self_consumption: { year1SavingsUSD: 7962.54, exportedKWh: 34777.5, retainedKWh: 8694.1, netCreditKWh: 26083.4, selfConsumedKWh: 27000, originalBillUSD: 5400, netBillUSD: 0, januarySavingsUSD: 635.04, paybackYears: 2.1 },
  },
  zeroExport: {
    legacy: { year1SavingsUSD: 1698.85, exportedKWh: 0, retainedKWh: 0, netCreditKWh: 0, selfConsumedKWh: 7721.9, originalBillUSD: 2112, netBillUSD: 413.15, januarySavingsUSD: 134.6, paybackYears: 2.2 },
    self_consumption: { year1SavingsUSD: 739.2, exportedKWh: 0, retainedKWh: 0, netCreditKWh: 0, selfConsumedKWh: 3360, originalBillUSD: 2112, netBillUSD: 1372.8, januarySavingsUSD: 61.6, paybackYears: 4.3 },
  },
  battery: {
    legacy: { year1SavingsUSD: 2810.94, exportedKWh: 1441.3, retainedKWh: 360.2, netCreditKWh: 1081.1, selfConsumedKWh: 12973.6, originalBillUSD: 2880, netBillUSD: 140.88, januarySavingsUSD: 222.72, paybackYears: 2.8 },
    self_consumption: { year1SavingsUSD: 2855.36, exportedKWh: 552.9, retainedKWh: 138.1, netCreditKWh: 414.8, selfConsumedKWh: 13862, originalBillUSD: 2880, netBillUSD: 107.6, januarySavingsUSD: 228.42, paybackYears: 2.8 },
  },
};

const actual: Record<string, Record<string, Fingerprint>> = {};
for (const [name, p] of Object.entries(CASES)) {
  actual[name] = {};
  for (const mode of MODES) actual[name][mode] = fingerprint(calculateProjectFinancialSummary(p, mode));
}

if (process.env.CAPTURE) {
  console.log(JSON.stringify(actual, null, 2));
  process.exit(0);
}

// 1. Cifras fijas por caso y modo.
for (const [name, byMode] of Object.entries(EXPECTED)) {
  for (const mode of MODES) assert.deepEqual(actual[name][mode], byMode[mode], `${name} (${mode})`);
}
assert.deepEqual(Object.keys(EXPECTED).sort(), Object.keys(CASES).sort(), 'Todos los casos están fijados');

// 2. Invariantes del régimen actual que las fases siguientes cambiarán solo para propuestas nuevas.
for (const mode of MODES) {
  // Retención uniforme del 25 % sobre lo exportado, también en BTD (tarifa con potencia).
  for (const name of ['bts1Low', 'bts1High', 'btd', 'battery']) {
    for (const m of calculateProjectFinancialSummary(CASES[name], mode).monthlyBreakdown) {
      assert.ok(Math.abs(m.retainedExportKWh - m.gridExportedKWh * 0.25) <= 0.11, `${name} ${mode} ${m.month}: retención 25 % de lo exportado`);
      // Ahorro = (autoconsumo + crédito neto) × tarifa plana guardada en la propuesta.
      assert.equal(m.savingsUSD, Math.round(m.effectiveSavedKWh * CASES[name].rates.energyCostPerKWh * 100) / 100);
    }
  }
  // Inyección cero: sin exportación ni retención.
  for (const m of calculateProjectFinancialSummary(CASES.zeroExport, mode).monthlyBreakdown) {
    assert.equal(m.gridExportedKWh, 0);
    assert.equal(m.retainedExportKWh, 0);
  }
}

// 3. Una propuesta guardada (JSON, sin campos nuevos) produce exactamente las mismas cifras.
for (const [name, p] of Object.entries(CASES)) {
  const saved = JSON.parse(JSON.stringify(p)) as ProjectSimulation;
  const rehydrated = { ...saved, specs: migrateLegacySpecs(saved.specs) };
  for (const mode of MODES) {
    assert.deepEqual(calculateProjectFinancialSummary(saved, mode), calculateProjectFinancialSummary(p, mode), `${name} guardada (${mode})`);
    assert.deepEqual(calculateProjectFinancialSummary(rehydrated, mode), calculateProjectFinancialSummary(p, mode), `${name} rehidratada (${mode})`);
  }
}

// 4. Las cifras de una propuesta guardada no dependen de la matriz de tarifas de fábrica.
const original = structuredClone(DEFAULT_RD_TARIFF_MATRIX);
const before = Object.fromEntries(Object.entries(CASES).map(([name, p]) => [name, calculateProjectFinancialSummary(p, 'legacy')]));
for (const schedule of Object.values(DEFAULT_RD_TARIFF_MATRIX.schedules)) {
  for (const tariff of Object.values(schedule.tariffs)) {
    tariff.baseEnergyRateDOP = 999;
    tariff.fixedChargeDOP = 999;
    tariff.netMeteringRetentionPct = 99;
    tariff.blocks = tariff.blocks?.map((block) => ({ ...block, rateDOP: 999 }));
  }
}
try {
  for (const [name, p] of Object.entries(CASES)) assert.deepEqual(calculateProjectFinancialSummary(p, 'legacy'), before[name], `${name}: la matriz no entra en el cálculo`);
} finally {
  Object.assign(DEFAULT_RD_TARIFF_MATRIX, original);
}

// 5. Benchmark: el caso de referencia sigue intacto.
const benchmark = calculateProjectFinancialSummary(BENCHMARK_PROJECT, 'legacy');
assert.ok(Math.abs(benchmark.grossInvestmentUSD - 25371.12) <= 1);
assert.ok(Math.abs(benchmark.ley5707CreditUSD - 7785.38) <= 1);

// 6. Nota regulatoria de fábrica (texto que muestra hoy el PDF cuando no se personalizó).
const note = (distributor: string, tariffCode: string, extra: Record<string, unknown> = {}) =>
  regulatoryNoteDefault(createDocumentTextContext({ distributor, tariffCode, gridExportFeePct: 25, isZeroExport: false, hasBattery: false, ...extra }));
const bts1Note = note('EDENORTE', 'BTS1');
const chargeParagraph = (tariffName: string) => `Para la tarifa ${tariffName}, el análisis económico considera el cargo por derecho de uso de la red, equivalente al 25% del valor de la energía excedente exportada, conforme al régimen de Medición Neta y la normativa vigente (Resolución SIE-007-2026-REG). Por esta razón, el sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible. Cuando resulte conveniente, se recomendará la incorporación de baterías de litio para incrementar el aprovechamiento directo de la energía generada.`;
assert.equal(bts1Note.split('\n\n')[3], chargeParagraph('BTS1 (Residencial Monómica)'));
assert.ok(bts1Note.startsWith('La energía generada mensualmente se descontará del consumo tomado de la red de la distribuidora eléctrica (EDES).'));
// Hoy la misma frase del cargo aparece también en tarifas con cargo de potencia (BTD): la fase 1 la condiciona.
const btdNote = note('EDESUR', 'BTD');
assert.equal(btdNote.split('\n\n').length, 4);
assert.ok(btdNote.split('\n\n')[3].includes('equivalente al 25% del valor de la energía excedente exportada'), btdNote);
const zeroNote = note('EDEESTE', 'BTS2', { isZeroExport: true, hasBattery: true });
assert.equal(zeroNote.split('\n\n')[3], 'Al operar con limitador antivertido (inyección cero) y almacenamiento en baterías de litio, la totalidad de la energía solar se aprovecha internamente, por lo que el proyecto no genera cargos por derecho de uso de la red bajo la normativa vigente.');

// Fase 1b: EDESUR y EDENORTE con sus propios valores (SIE-121-2026-TF); EDEESTE no cambia; CEPM RBT-2 según SIE-147-2026-TF.
const REFERENCE_RATES = {
  edesurBts1_150: 0.101,
  edesurBts1_250: 0.109,
  edesurBts1_1000: 0.218, // 1c: desde 701 kWh, todo a 13.09 (art. 4.d)
  edenorteBts1_1000: 0.234, // 1c: todo a 14.04
  edeesteBts2_900: 0.227, // 1c: BTS-2 también, todo a 13.59
  edesurBtd: 0.15,
  cepmRbt1: 0.382,
  cepmRbt2: 0.233,
};
// 7. Tarifa de referencia de fábrica que se propone al crear o escanear (USD/kWh a 60 RD$/USD).
// No entra en propuestas guardadas; la fase 1 la corrige (pliego vigente y regla de 701 kWh).
const reference = (distributor: string, code: string, kWh: number) => getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, distributor, code, kWh, 60);
assert.deepEqual({
  edesurBts1_150: reference('EDESUR', 'BTS1', 150),
  edesurBts1_250: reference('EDESUR', 'BTS1', 250),
  edesurBts1_1000: reference('EDESUR', 'BTS1', 1000),
  edenorteBts1_1000: reference('EDENORTE', 'BTS1', 1000),
  edeesteBts2_900: reference('EDEESTE', 'BTS2', 900),
  edesurBtd: reference('EDESUR', 'BTD', 3000),
  cepmRbt1: reference('CEPM', 'RBT-1', 900),
  cepmRbt2: reference('CEPM', 'RBT-2', 900),
}, REFERENCE_RATES);

console.log('Medición neta: cifras actuales de BTS-1, BTD, inyección cero y batería fijadas en ambos modos.');
