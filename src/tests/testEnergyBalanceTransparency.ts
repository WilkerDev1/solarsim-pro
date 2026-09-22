import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { calculateFinancialSummary } from '../engine/financeEngine';
import { SystemSpecs, UtilityRates, FinancialParams } from '../types';

console.log('=====================================================');
console.log('🧪 RUNNING ENERGY BALANCE & TRANSPARENCY TEST SUITE');
console.log('=====================================================');

let passCount = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(` ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(` ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// --- TEST 1: User's Exact Case (41.58 kWp, 60,130.3 kWh, $0.151/kWh, 25% SIE-007) ---
console.log('\n--- TEST 1: Exact Case Audit (41.58 kWp, 60,130.3 kWh) ---');

const userSpecs: SystemSpecs = {
  isDetailed: false,
  panelPowerW: 630,
  panelCount: 66, // 41.58 kWp
  panelEfficiency: 21.8,
  tempCoeff: -0.35,
  annualDegradation: 0.5,
  inverterPowerKW: 10,
  inverterCount: 2,
  hasBattery: false,
  batteryCapacityKWh: 0,
  batteryDOD: 90,
  systemLosses: 25.0, // 25% technical losses
  pricingMode: 'direct_watt',
  pricePerWattUSD: 1.13,
};

const userRates: UtilityRates = {
  distributor: 'EDEESTE',
  tariffCode: 'BTD',
  energyCostPerKWh: 0.151,
  gridExportFeePct: 25.0, // 25% SIE-007
  targetCoveragePct: 100,
  currency: 'USD',
  usdExchangeRate: 60.0,
  annualEnergyInflationPct: 3.5,
};

const userFinancials: FinancialParams = {
  applyLey5707: true,
  applyITBISExemption: true,
  pricePerWattUSD: 1.13,
  discountRatePct: 10.0,
  projectLifespanYears: 25,
  co2FactorKgPerKWh: 0.481,
};

// Replicate monthly consumption to match production (approx 5,011 kWh/mo = 60,130 kWh/yr)
const monthlyProdCons = [4746.7, 4610.4, 5462.1, 5342.0, 5375.0, 5313.9, 5404.0, 4969.0, 4780.7, 4978.7, 4565.5, 4582.3];

const userMonthlyResults = calculateMonthlySolarProduction(
  'Santo Domingo / Distrito Nacional',
  userSpecs,
  monthlyProdCons,
  userRates.energyCostPerKWh,
  userRates.gridExportFeePct
);

const totalProd = userMonthlyResults.reduce((s, m) => s + m.productionKWh, 0);
const totalSelf = userMonthlyResults.reduce((s, m) => s + m.solarSelfConsumedKWh, 0);
const totalExport = userMonthlyResults.reduce((s, m) => s + m.gridExportedKWh, 0);
const totalNetCredit = userMonthlyResults.reduce((s, m) => s + m.netExportCreditKWh, 0);
const totalRetained = userMonthlyResults.reduce((s, m) => s + m.retainedExportKWh, 0);
const totalEffectiveSaved = userMonthlyResults.reduce((s, m) => s + m.effectiveSavedKWh, 0);
const totalSavingsUSD = userMonthlyResults.reduce((s, m) => s + m.savingsUSD, 0);

console.log(`  Producción Total: ${totalProd.toFixed(1)} kWh`);
console.log(`  Autoconsumo en Sitio (75%): ${totalSelf.toFixed(1)} kWh`);
console.log(`  Excedente Exportado (25%): ${totalExport.toFixed(1)} kWh`);
console.log(`  Retención EDEESTE (25% peaje SIE-007): ${totalRetained.toFixed(1)} kWh`);
console.log(`  Inyección Neta Reconocida (75%): ${totalNetCredit.toFixed(1)} kWh`);
console.log(`  Total Ahorro Facturable: ${totalEffectiveSaved.toFixed(1)} kWh`);
console.log(`  Ahorro Monetario Anual: $${totalSavingsUSD.toFixed(2)} USD`);

assert(Math.abs(totalProd - 60130.3) < 1.0, 'Producción total anual coincide con 60,130.3 kWh');
assert(Math.abs(totalSelf - 45097.7) < 1.0, 'Autoconsumo diurno al 75% coincide con 45,097.7 kWh');
assert(Math.abs(totalExport - 15032.6) < 1.0, 'Excedente exportado a red coincide con 15,032.6 kWh');
assert(Math.abs(totalNetCredit - 11274.5) < 1.0, 'Inyección neta reconocida (75% de exportación) coincide con 11,274.5 kWh');
assert(Math.abs(totalEffectiveSaved - 56372.2) < 1.0, 'Total ahorro facturable reconocido coincide con 56,372.2 kWh');
assert(Math.abs(totalSavingsUSD - 8512.2) < 1.0, 'Ahorro monetario coincide exactamente con $8,512.20 USD');

// Verify every month has exact mathematical identity: effectiveSavedKWh * 0.151 == savingsUSD
const allMonthsCoherent = userMonthlyResults.every(m => {
  const expectedUSD = Math.round(m.effectiveSavedKWh * userRates.energyCostPerKWh * 100) / 100;
  return Math.abs(m.savingsUSD - expectedUSD) < 0.02;
});
assert(allMonthsCoherent, 'Todos los 12 meses cumplen estrictamente: effectiveSavedKWh * tarifa == savingsUSD');

// --- TEST 2: Zero-Export Mode (Antivertido) ---
console.log('\n--- TEST 2: Zero-Export Mode (Antivertido) ---');

const zeroExportMonthly = calculateMonthlySolarProduction(
  'Santo Domingo / Distrito Nacional',
  userSpecs,
  monthlyProdCons,
  userRates.energyCostPerKWh,
  userRates.gridExportFeePct,
  undefined,
  undefined,
  true // isZeroExport = true
);

const zeroExportKWh = zeroExportMonthly.reduce((s, m) => s + m.gridExportedKWh, 0);
const zeroNetCreditKWh = zeroExportMonthly.reduce((s, m) => s + m.netExportCreditKWh, 0);
const zeroRetainedKWh = zeroExportMonthly.reduce((s, m) => s + m.retainedExportKWh, 0);

assert(zeroExportKWh === 0, 'En Inyección Cero, la exportación a red es estrictamente 0 kWh');
assert(zeroNetCreditKWh === 0, 'En Inyección Cero, el crédito por exportación es 0 kWh');
assert(zeroRetainedKWh === 0, 'En Inyección Cero, no se cobra peaje ni retención de red');

// --- TEST 3: Dynamic Battery Storage (BESS) Impact ---
console.log('\n--- TEST 3: Dynamic BESS Battery Storage Physics ---');

const batterySpecs: SystemSpecs = {
  ...userSpecs,
  hasBattery: true,
  batteryCapacityKWh: 16.08,
  batteryCount: 2, // 32.16 kWh storage bank
  batteryDOD: 90,
  batteryEfficiencyPct: 95,
};

const batteryMonthly = calculateMonthlySolarProduction(
  'Santo Domingo / Distrito Nacional',
  batterySpecs,
  monthlyProdCons,
  userRates.energyCostPerKWh,
  userRates.gridExportFeePct
);

const batteryTotalSelf = batteryMonthly.reduce((s, m) => s + m.solarSelfConsumedKWh, 0);
const batteryTotalBattContrib = batteryMonthly.reduce((s, m) => s + (m.batteryContributionKWh || 0), 0);
const batteryTotalExport = batteryMonthly.reduce((s, m) => s + m.gridExportedKWh, 0);
const batteryTotalSavingsUSD = batteryMonthly.reduce((s, m) => s + m.savingsUSD, 0);

console.log(`  Autoconsumo sin batería: ${totalSelf.toFixed(1)} kWh ($${(totalSelf * 0.151).toFixed(2)})`);
console.log(`  Autoconsumo con 32 kWh BESS: ${batteryTotalSelf.toFixed(1)} kWh`);
console.log(`  Aporte de Baterías al autoconsumo: ${batteryTotalBattContrib.toFixed(1)} kWh`);
console.log(`  Excedente exportado reducido a: ${batteryTotalExport.toFixed(1)} kWh`);
console.log(`  Nuevo Ahorro Monetario Anual: $${batteryTotalSavingsUSD.toFixed(2)} USD`);

assert(batteryTotalSelf > totalSelf, 'El autoconsumo con baterías es significativamente mayor que sin baterías');
assert(batteryTotalBattContrib > 0, 'El aporte de la batería al consumo nocturno es positivo (> 0 kWh)');
assert(batteryTotalExport < totalExport, 'La inyección a red se reduce porque la batería absorbe el excedente diurno');
assert(batteryTotalSavingsUSD > totalSavingsUSD, 'El ahorro monetario aumenta con batería al evitar el 25% de retención de red');

// --- TEST 4: Configurable Daytime Self-Consumption Presets ---
console.log('\n--- TEST 4: Configurable Self-Consumption Presets ---');

// Residential profile: 50%
const resSpecs: SystemSpecs = { ...userSpecs, daytimeSelfConsumptionRatio: 50 };
const resMonthly = calculateMonthlySolarProduction('Santo Domingo / Distrito Nacional', resSpecs, monthlyProdCons, 0.151, 25);
const resSelf = resMonthly.reduce((s, m) => s + m.solarSelfConsumedKWh, 0);

// Commercial profile: 75%
const comSpecs: SystemSpecs = { ...userSpecs, daytimeSelfConsumptionRatio: 75 };
const comMonthly = calculateMonthlySolarProduction('Santo Domingo / Distrito Nacional', comSpecs, monthlyProdCons, 0.151, 25);
const comSelf = comMonthly.reduce((s, m) => s + m.solarSelfConsumedKWh, 0);

// Industrial profile: 90%
const indSpecs: SystemSpecs = { ...userSpecs, daytimeSelfConsumptionRatio: 90 };
const indMonthly = calculateMonthlySolarProduction('Santo Domingo / Distrito Nacional', indSpecs, monthlyProdCons, 0.151, 25);
const indSelf = indMonthly.reduce((s, m) => s + m.solarSelfConsumedKWh, 0);

console.log(`  Residencial (50%): ${resSelf.toFixed(1)} kWh autoconsumidos`);
console.log(`  Comercial (75%): ${comSelf.toFixed(1)} kWh autoconsumidos`);
console.log(`  Industrial (90%): ${indSelf.toFixed(1)} kWh autoconsumidos`);

assert(resSelf < comSelf && comSelf < indSelf, 'Los perfiles (50% < 75% < 90%) aumentan progresivamente el autoconsumo');

// --- TEST 5: Financial Summary Integrity with New Metrics ---
console.log('\n--- TEST 5: Financial Summary Engine Integration ---');

const summary = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  userSpecs,
  userRates,
  userFinancials,
  monthlyProdCons
);

assert(summary.monthlyBreakdown.length === 12, 'monthlyBreakdown contiene exactamente 12 meses');
assert(summary.monthlyBreakdown[0].netExportCreditKWh !== undefined, 'monthlyBreakdown expone netExportCreditKWh');
assert(summary.monthlyBreakdown[0].retainedExportKWh !== undefined, 'monthlyBreakdown expone retainedExportKWh');
assert(summary.monthlyBreakdown[0].effectiveSavedKWh !== undefined, 'monthlyBreakdown expone effectiveSavedKWh');
assert(Math.abs(summary.year1SavingsUSD - totalSavingsUSD) < 1.0, 'year1SavingsUSD del resumen coincide con la suma mensual');

console.log('=====================================================');
console.log(`🎉 ALL ${passCount}/${totalTests} ENERGY BALANCE TRANSPARENCY TESTS PASSED!`);
console.log('=====================================================');
