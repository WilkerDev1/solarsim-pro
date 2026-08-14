import { calculateFinancialSummary } from './financeEngine';
import { SystemSpecs, UtilityRates, FinancialParams } from '../types';

console.log('=====================================================');
console.log('🧪 RUNNING COMPREHENSIVE FINANCIAL ENGINE AUDIT');
console.log('=====================================================');

let allPassed = true;
function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(` ✅ PASS: ${testName}`);
  } else {
    console.error(` ❌ FAIL: ${testName} -> ${detail || 'Assertion failed'}`);
    allPassed = false;
  }
}

// Base Setup
const defaultSpecs: SystemSpecs = {
  isDetailed: false,
  panelPowerW: 620,
  panelCount: 11, // 6.82 kWp
  pricePerWattUSD: 1.13,
  inverterPowerKW: 8,
  inverterCount: 2,
  hasBattery: false,
  batteryCapacityKWh: 0,
  batteryCount: 0,
  batteryUnitPriceUSD: 1990,
  panelEfficiency: 21.8,
  tempCoeff: -0.35,
  systemLosses: 14.0,
  annualDegradation: 0.5,
  batteryDOD: 80,
};

const defaultRates: UtilityRates = {
  energyCostPerKWh: 0.22,
  distributor: 'EDEESTE',
  targetCoveragePct: 95,
  tariffCode: 'BTS1',
  currency: 'USD',
  usdExchangeRate: 60.0,
  gridExportFeePct: 25.0,
  annualEnergyInflationPct: 3.5,
};

const defaultFinancials: FinancialParams = {
  applyLey5707: true,
  applyITBISExemption: true,
  pricePerWattUSD: 1.13,
  discountRatePct: 10.0,
  projectLifespanYears: 25,
  co2FactorKgPerKWh: 0.481,
};

const monthlyConsumption = Array(12).fill(1000); // 12,000 kWh/year

// TEST 1: Solar Only (Simple Mode)
console.log('\n--- TEST 1: Solar Only (Simple Mode) ---');
const resSolarOnly = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  defaultSpecs,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

assert(resSolarOnly.systemCapacityKWp === 6.82, 'Capacidad DC correcta (6.82 kWp)');
const expectedSolarCost = 6.82 * 1000 * 1.13; // 7706.60
assert(Math.abs(resSolarOnly.grossInvestmentUSD - expectedSolarCost) < 0.1, 'Inversión Bruta Solar coincide');
assert(resSolarOnly.batteryInvestmentUSD === 0, 'Inversión Baterías es 0');
assert(resSolarOnly.itbisSavedUSD > 0, 'ITBIS Exonerado > 0 cuando applyITBISExemption es true');
assert(resSolarOnly.ley5707CreditUSD > 0, 'Crédito Ley 57-07 > 0 cuando applyLey5707 es true');
assert(
  resSolarOnly.netInvestmentUSD === Math.round((resSolarOnly.grossInvestmentUSD - resSolarOnly.itbisSavedUSD - resSolarOnly.ley5707CreditUSD) * 100) / 100,
  'netInvestmentUSD = Gross - ITBIS - Ley5707'
);

// TEST 2: Adding Storage (3 Batteries)
console.log('\n--- TEST 2: Dynamic Storage Addition (3 Batteries) ---');
const specsWithBattery: SystemSpecs = {
  ...defaultSpecs,
  hasBattery: true,
  batteryCount: 3,
  batteryCapacityKWh: 48,
  batteryUnitPriceUSD: 1990,
};

const financialsWithBattery: FinancialParams = {
  ...defaultFinancials,
  pricePerWattUSD: 2.59,
};

const resWithBattery = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsWithBattery,
  defaultRates,
  financialsWithBattery,
  monthlyConsumption
);

assert(resWithBattery.batteryInvestmentUSD > 0, 'Inversión Baterías > 0 cuando hasBattery es true');
assert(
  resWithBattery.grossInvestmentUSD > resSolarOnly.grossInvestmentUSD,
  'Inversión con baterías es mayor que sin baterías'
);

// TEST 3: ITBIS Exemption Toggle
console.log('\n--- TEST 3: ITBIS Exemption Toggle (ON vs OFF) ---');
const financialsNoITBIS: FinancialParams = {
  ...financialsWithBattery,
  applyITBISExemption: false,
};

const resNoITBIS = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsWithBattery,
  defaultRates,
  financialsNoITBIS,
  monthlyConsumption
);

assert(resNoITBIS.itbisSavedUSD === 0, 'itbisSavedUSD es 0 cuando applyITBISExemption es false');
assert(
  resNoITBIS.netInvestmentUSD === Math.round((resWithBattery.netInvestmentUSD + resWithBattery.itbisSavedUSD) * 100) / 100,
  'Precio neto final aumenta exactamente por el monto del ITBIS cuando se desactiva la exoneración'
);
assert(
  resNoITBIS.paybackYears >= resWithBattery.paybackYears,
  'Payback es más largo sin exoneración de ITBIS'
);

// TEST 4: Ley 57-07 40% Tax Credit Toggle
console.log('\n--- TEST 4: Ley 57-07 40% Credit Toggle (ON vs OFF) ---');
const financialsNoLey: FinancialParams = {
  ...financialsWithBattery,
  applyLey5707: false,
};

const resNoLey = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsWithBattery,
  defaultRates,
  financialsNoLey,
  monthlyConsumption
);

assert(resNoLey.ley5707CreditUSD === 0, 'ley5707CreditUSD es 0 cuando applyLey5707 es false');
assert(
  resNoLey.netInvestmentUSD === Math.round((resWithBattery.grossInvestmentUSD - resWithBattery.itbisSavedUSD) * 100) / 100,
  'Inversión neta sin Ley 57-07 es igual a la inversión bruta menos ITBIS'
);

// TEST 5: Cash Flow Year 0 and Multi-Year Integrity
console.log('\n--- TEST 5: 25-Year Cash Flow Projection Integrity ---');
assert(resWithBattery.cashFlow25Years.length === 25, '25 años de flujo de caja generados');
const cfYear1 = resWithBattery.cashFlow25Years[0];
const expectedAnnualTaxCredit = resWithBattery.ley5707CreditUSD / 3;
assert(
  Math.abs(cfYear1.taxCreditUSD - expectedAnnualTaxCredit) < 0.1,
  'Crédito fiscal de Año 1 es exactamente 1/3 de la deducción total'
);
const cfYear4 = resWithBattery.cashFlow25Years[3];
assert(cfYear4.taxCreditUSD === 0, 'Crédito fiscal es 0 después del Año 3');

// TEST 6: Battery Replacement Cost in Year 10
console.log('\n--- TEST 6: Battery Replacement Cost in Year 10 ---');
const specsWithReplacement: SystemSpecs = {
  ...specsWithBattery,
  batteryLifespanYears: 10,
  batteryReplacementCostUSD: 3500,
};

const resWithReplacement = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsWithReplacement,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

const cfYear10WithoutRep = resWithBattery.cashFlow25Years[9].netCashFlowUSD;
const cfYear10WithRep = resWithReplacement.cashFlow25Years[9].netCashFlowUSD;
assert(
  Math.abs(cfYear10WithoutRep - cfYear10WithRep - 3500) < 0.1,
  'Flujo de caja de Año 10 descuenta exactamente $3,500 de reemplazo de batería'
);

// TEST 7: Detailed Cost Matrix Mode
console.log('\n--- TEST 7: Detailed Cost Matrix Mode ---');
const specsDetailed: SystemSpecs = {
  ...specsWithBattery,
  isDetailed: true,
  panelUnitPriceUSD: 103.32,
  inverterUnitPriceUSD: 2300,
  batteryUnitPriceUSD: 1990,
  installationUnitPriceUSD: 170,
  saleMarginMultiplier: 1.25,
};

const resDetailed = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsDetailed,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

assert(resDetailed.costMatrix.items.length === 4, 'Matriz de costos contiene los 4 renglones');
assert(resDetailed.costMatrix.porcentajeVentaUSD > 0, 'Precio de venta con margen calculado');
assert(resDetailed.costMatrix.gananciaUSD > 0, 'Ganancia bruta calculada');
assert(resDetailed.grossInvestmentUSD === Math.round(resDetailed.costMatrix.porcentajeVentaUSD * 100) / 100, 'Inversión bruta usa la matriz en modo detallado');

// TEST 8: Zero Division / Extreme Values Resilience
console.log('\n--- TEST 8: Extreme Values and Zero-Division Resilience ---');
const zeroSpecs: SystemSpecs = {
  ...defaultSpecs,
  panelCount: 0,
};
const resZero = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  zeroSpecs,
  defaultRates,
  defaultFinancials,
  Array(12).fill(0)
);

assert(!isNaN(resZero.paybackYears) && isFinite(resZero.paybackYears), 'Payback no es NaN con 0 paneles');
assert(!isNaN(resZero.irrPct) && isFinite(resZero.irrPct), 'IRR no es NaN con 0 paneles');
assert(!isNaN(resZero.npvUSD) && isFinite(resZero.npvUSD), 'NPV no es NaN con 0 paneles');
assert(!isNaN(resZero.roi25YrPct) && isFinite(resZero.roi25YrPct), 'ROI no es NaN con 0 paneles');

console.log('\n=====================================================');
if (allPassed) {
  console.log('🎉 ALL FINANCIAL ENGINE AUDIT TESTS PASSED (100% SUCCESS)');
} else {
  console.error('❌ SOME TESTS FAILED. PLEASE REVIEW AUDIT LOGS.');
}
console.log('=====================================================\n');
