import { SystemSpecs, ProjectSimulation } from '../types';
import {
  getProjectPanels,
  getProjectInverters,
  getProjectBatteries,
  calculateTotalDCCapacityKWp,
  calculateTotalPanelCount,
  calculateTotalInverterPowerKW,
  calculateTotalInverterCount,
  calculateTotalBatteryCapacityKWh,
  calculateTotalBatteryCount,
  formatInvertersSummary,
  formatPanelsSummary,
  formatBatteriesSummary,
} from '../utils/equipmentSpecsUtils';
import { calculateCostMatrixSummary, calculateFinancialSummary } from '../engine/financeEngine';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';

console.log('=====================================================');
console.log('🧪 RUNNING MULTI-EQUIPMENT (INVERTERS, PANELS, BESS) TEST SUITE');
console.log('=====================================================\n');

// --------------------------------------------------------------------------
// TEST 1: Multi-Inverter Capacity, Count, and Summary Formatting
// User scenario: 4 inverters total (2 of 10 kW and 2 of 5 kW)
// --------------------------------------------------------------------------
console.log('--- TEST 1: Multi-Inverter (2x 10kW + 2x 5kW = 30kW AC) ---');
const multiInverterSpecs: SystemSpecs = {
  ...BENCHMARK_PROJECT.specs,
  inverterCount: 2,
  inverterPowerKW: 10,
  inverterBrandModel: 'Inversor Luxpower LXP 10K',
  inverters: [
    {
      id: 'inv-1',
      brandModel: 'Inversor Luxpower LXP 10K',
      powerKW: 10,
      count: 2,
      unitPriceUSD: 2400,
      weightKilos: 45,
    },
    {
      id: 'inv-2',
      brandModel: 'Inversor Luxpower LXP 5K',
      powerKW: 5,
      count: 2,
      unitPriceUSD: 1400,
      weightKilos: 25,
    },
  ],
};

const normalizedInverters = getProjectInverters(multiInverterSpecs);
if (normalizedInverters.length !== 2) {
  throw new Error(`❌ Expected 2 inverter models, found ${normalizedInverters.length}`);
}

const totalInverterPower = calculateTotalInverterPowerKW(multiInverterSpecs);
if (totalInverterPower !== 30) {
  throw new Error(`❌ Expected 30 kW total inverter capacity, got ${totalInverterPower}`);
}

const totalInverterCount = calculateTotalInverterCount(multiInverterSpecs);
if (totalInverterCount !== 4) {
  throw new Error(`❌ Expected 4 total inverters, got ${totalInverterCount}`);
}

const invertersSummary = formatInvertersSummary(multiInverterSpecs);
console.log(`Formatted Inverters Summary: "${invertersSummary}"`);
if (!invertersSummary.includes('2 Inversores') || !invertersSummary.includes('10K') || !invertersSummary.includes('5K')) {
  throw new Error(`❌ Inverter summary did not format properly: ${invertersSummary}`);
}
console.log(' ✅ PASS: Multi-inverter power (30kW), count (4), and formatting verified.\n');

// --------------------------------------------------------------------------
// TEST 2: Multi-Panel Capacity, Count, and Solar Generation
// Scenario: 20 panels of 620W + 10 panels of 550W = 17.9 kWp DC
// --------------------------------------------------------------------------
console.log('--- TEST 2: Multi-Panel (20x 620W + 10x 550W = 17.9 kWp DC) ---');
const multiPanelSpecs: SystemSpecs = {
  ...multiInverterSpecs,
  panelCount: 20,
  panelPowerW: 620,
  panelBrandModel: 'Módulos Canadian Solar 620W TOPCon',
  panels: [
    {
      id: 'panel-1',
      brandModel: 'Módulos Canadian Solar 620W TOPCon',
      powerW: 620,
      count: 20,
      unitPriceUSD: 120,
      weightKilos: 32,
    },
    {
      id: 'panel-2',
      brandModel: 'Módulos JA Solar 550W Monocristalino',
      powerW: 550,
      count: 10,
      unitPriceUSD: 95,
      weightKilos: 28,
    },
  ],
};

const totalDCCapacity = calculateTotalDCCapacityKWp(multiPanelSpecs);
const expectedDCCapacity = (20 * 620 + 10 * 550) / 1000; // 17.9 kWp
if (Math.abs(totalDCCapacity - expectedDCCapacity) > 0.001) {
  throw new Error(`❌ Expected ${expectedDCCapacity} kWp DC, got ${totalDCCapacity}`);
}

const totalPanelCount = calculateTotalPanelCount(multiPanelSpecs);
if (totalPanelCount !== 30) {
  throw new Error(`❌ Expected 30 total panels, got ${totalPanelCount}`);
}

const panelsSummary = formatPanelsSummary(multiPanelSpecs);
console.log(`Formatted Panels Summary: "${panelsSummary}"`);
if (!panelsSummary.includes('20 Módulos') || !panelsSummary.includes('10 Módulos')) {
  throw new Error(`❌ Panels summary did not format properly: ${panelsSummary}`);
}

// Check that solar generation engine uses aggregated DC capacity
const solarMonthly = calculateMonthlySolarProduction('Distrito Nacional', multiPanelSpecs, new Array(12).fill(3000), 11.5, 25);
const annualSolarGen = solarMonthly.reduce((s, m) => s + m.productionKWh, 0);
console.log(`Annual Solar Generation for 17.9 kWp: ${annualSolarGen.toFixed(1)} kWh`);
if (annualSolarGen <= 0 || annualSolarGen < 20000) {
  throw new Error(`❌ Annual solar generation seems too low for 17.9 kWp: ${annualSolarGen}`);
}
console.log(' ✅ PASS: Multi-panel capacity (17.9 kWp), count (30), and solar production verified.\n');

// --------------------------------------------------------------------------
// TEST 3: Multi-Battery BESS Capacity, Count, and Autonomy
// Scenario: 1x 16.08 kWh + 2x 5.12 kWh = 26.32 kWh
// --------------------------------------------------------------------------
console.log('--- TEST 3: Multi-Battery BESS (1x 16.08kWh + 2x 5.12kWh = 26.32 kWh) ---');
const multiBatterySpecs: SystemSpecs = {
  ...multiPanelSpecs,
  hasBattery: true,
  batteryCount: 1,
  batteryCapacityKWh: 16.08,
  batteryBrandModel: 'Batería HinaESS PowerGem Max 16.08kWh',
  batteries: [
    {
      id: 'bat-1',
      brandModel: 'Batería HinaESS PowerGem Max 16.08kWh',
      capacityKWh: 16.08,
      count: 1,
      unitPriceUSD: 3800,
      weightKilos: 140,
      dodPct: 90,
      efficiencyPct: 95,
      lifespanYears: 10,
    },
    {
      id: 'bat-2',
      brandModel: 'Batería HinaESS PowerGem Plus 5.12kWh',
      capacityKWh: 5.12,
      count: 2,
      unitPriceUSD: 1300,
      weightKilos: 50,
      dodPct: 90,
      efficiencyPct: 95,
      lifespanYears: 10,
    },
  ],
};

const totalBESSKWh = calculateTotalBatteryCapacityKWh(multiBatterySpecs);
const expectedBESSKWh = 16.08 + 2 * 5.12; // 26.32 kWh
if (Math.abs(totalBESSKWh - expectedBESSKWh) > 0.001) {
  throw new Error(`❌ Expected ${expectedBESSKWh} kWh BESS, got ${totalBESSKWh}`);
}

const totalBatteryCount = calculateTotalBatteryCount(multiBatterySpecs);
if (totalBatteryCount !== 3) {
  throw new Error(`❌ Expected 3 total batteries, got ${totalBatteryCount}`);
}

const batteriesSummary = formatBatteriesSummary(multiBatterySpecs);
console.log(`Formatted Batteries Summary: "${batteriesSummary}"`);
if (!batteriesSummary.includes('1 Batería') || !batteriesSummary.includes('2 Baterías')) {
  throw new Error(`❌ Batteries summary did not format properly: ${batteriesSummary}`);
}
console.log(' ✅ PASS: Multi-battery BESS (26.32 kWh) and count (3) verified.\n');

// --------------------------------------------------------------------------
// TEST 4: Cost Matrix Generation & Individual Line Items
// --------------------------------------------------------------------------
console.log('--- TEST 4: Cost Matrix Breakdown with Multi-Equipment ---');
const costMatrix = calculateCostMatrixSummary(multiBatterySpecs, 17.9);
console.log(`Cost Matrix items count: ${costMatrix.items.length}`);
costMatrix.items.forEach((item, idx) => {
  console.log(`  [${idx + 1}] ${item.name} | Cant: ${item.quantity} | P.Unit: $${item.unitPriceUSD} | Total: $${item.totalPriceUSD.toFixed(2)}`);
});

// Verify each item is present:
// 2 Panel rows, 2 Inverter rows, 2 Battery rows, 1 Installation row = 7 items
if (costMatrix.items.length !== 7) {
  throw new Error(`❌ Expected 7 cost matrix items (2 panels + 2 inverters + 2 batteries + 1 labor), got ${costMatrix.items.length}`);
}

const panelRows = costMatrix.items.filter((i) => i.name.toLowerCase().includes('panel') || i.name.toLowerCase().includes('módulo') || i.name.toLowerCase().includes('canadian') || i.name.toLowerCase().includes('ja solar'));
const inverterRows = costMatrix.items.filter((i) => i.name.toLowerCase().includes('inversor') || i.name.toLowerCase().includes('luxpower'));
const batteryRows = costMatrix.items.filter((i) => i.name.toLowerCase().includes('batería') || i.name.toLowerCase().includes('hinaess'));

if (panelRows.length !== 2) {
  throw new Error(`❌ Expected 2 panel rows in cost matrix, found ${panelRows.length}`);
}
if (inverterRows.length !== 2) {
  throw new Error(`❌ Expected 2 inverter rows in cost matrix, found ${inverterRows.length}`);
}
if (batteryRows.length !== 2) {
  throw new Error(`❌ Expected 2 battery rows in cost matrix, found ${batteryRows.length}`);
}

// Check equipment total matches individual sums
const expectedPanelsTotal = (20 * 120) + (10 * 95); // 2400 + 950 = 3350
const expectedInvertersTotal = (2 * 2400) + (2 * 1400); // 4800 + 2800 = 7600
const expectedBatteriesTotal = (1 * 3800) + (2 * 1300); // 3800 + 2600 = 6400

const calculatedPanelsTotal = panelRows.reduce((sum, r) => sum + r.totalPriceUSD, 0);
const calculatedInvertersTotal = inverterRows.reduce((sum, r) => sum + r.totalPriceUSD, 0);
const calculatedBatteriesTotal = batteryRows.reduce((sum, r) => sum + r.totalPriceUSD, 0);

if (calculatedPanelsTotal !== expectedPanelsTotal) {
  throw new Error(`❌ Panels total mismatch: expected $${expectedPanelsTotal}, got $${calculatedPanelsTotal}`);
}
if (calculatedInvertersTotal !== expectedInvertersTotal) {
  throw new Error(`❌ Inverters total mismatch: expected $${expectedInvertersTotal}, got $${calculatedInvertersTotal}`);
}
if (calculatedBatteriesTotal !== expectedBatteriesTotal) {
  throw new Error(`❌ Batteries total mismatch: expected $${expectedBatteriesTotal}, got $${calculatedBatteriesTotal}`);
}

console.log(' ✅ PASS: Cost Matrix rows and equipment totals perfectly calculated.\n');

// --------------------------------------------------------------------------
// TEST 5: Financial Summary, Ley 57-07, and Tax Exonerations
// --------------------------------------------------------------------------
console.log('--- TEST 5: Financial Summary with Multi-Equipment ---');
const financialSummary = calculateFinancialSummary(
  'Distrito Nacional',
  multiBatterySpecs,
  BENCHMARK_PROJECT.rates,
  BENCHMARK_PROJECT.financials,
  BENCHMARK_PROJECT.monthlyConsumption
);
console.log(`Gross Investment: $${financialSummary.grossInvestmentUSD.toFixed(2)}`);
console.log(`ITBIS Saved (Ley 57-07): $${financialSummary.itbisSavedUSD.toFixed(2)}`);
console.log(`Ley 57-07 Credit (40%): $${financialSummary.ley5707CreditUSD.toFixed(2)}`);
console.log(`Battery Usable Storage: ${financialSummary.batteryUsableKWh} kWh`);

if (financialSummary.systemCapacityKWp !== 17.9) {
  throw new Error(`❌ Financial summary systemCapacityKWp expected 17.9, got ${financialSummary.systemCapacityKWp}`);
}

if (financialSummary.batteryUsableKWh !== 19.4) {
  throw new Error(`❌ Financial summary batteryUsableKWh expected 19.4, got ${financialSummary.batteryUsableKWh}`);
}

if (financialSummary.batteryBackupAutonomyHours <= 0) {
  throw new Error(`❌ Financial summary batteryBackupAutonomyHours must be > 0, got ${financialSummary.batteryBackupAutonomyHours}`);
}

if (financialSummary.grossInvestmentUSD <= 0) {
  throw new Error(`❌ Gross investment must be > 0: ${financialSummary.grossInvestmentUSD}`);
}

if (financialSummary.ley5707CreditUSD <= 0) {
  throw new Error(`❌ Ley 57-07 credit must be > 0: ${financialSummary.ley5707CreditUSD}`);
}

console.log(' ✅ PASS: Financial summary, DC kWp, and BESS kWh match multi-equipment.\n');

// --------------------------------------------------------------------------
// TEST 6: Strict Backward Compatibility with BENCHMARK_PROJECT
// --------------------------------------------------------------------------
console.log('--- TEST 6: Strict Backward Compatibility (BENCHMARK_PROJECT) ---');
const benchPanels = getProjectPanels(BENCHMARK_PROJECT.specs);
const benchInverters = getProjectInverters(BENCHMARK_PROJECT.specs);
const benchBatteries = getProjectBatteries(BENCHMARK_PROJECT.specs);

if (benchPanels.length !== 1 || benchPanels[0].count !== BENCHMARK_PROJECT.specs.panelCount) {
  throw new Error(`❌ Benchmark panels fallback failed: ${JSON.stringify(benchPanels)}`);
}
if (benchInverters.length !== 1 || benchInverters[0].count !== BENCHMARK_PROJECT.specs.inverterCount) {
  throw new Error(`❌ Benchmark inverters fallback failed: ${JSON.stringify(benchInverters)}`);
}
if (BENCHMARK_PROJECT.specs.hasBattery && (benchBatteries.length !== 1 || benchBatteries[0].count !== BENCHMARK_PROJECT.specs.batteryCount)) {
  throw new Error(`❌ Benchmark batteries fallback failed: ${JSON.stringify(benchBatteries)}`);
}

const benchDCCapacity = calculateTotalDCCapacityKWp(BENCHMARK_PROJECT.specs);
const expectedBenchDC = (BENCHMARK_PROJECT.specs.panelCount * BENCHMARK_PROJECT.specs.panelPowerW) / 1000;
if (benchDCCapacity !== expectedBenchDC) {
  throw new Error(`❌ Benchmark DC capacity mismatch: expected ${expectedBenchDC}, got ${benchDCCapacity}`);
}

const benchSummary = calculateFinancialSummary(
  BENCHMARK_PROJECT.client.province || 'Distrito Nacional',
  BENCHMARK_PROJECT.specs,
  BENCHMARK_PROJECT.rates,
  BENCHMARK_PROJECT.financials,
  BENCHMARK_PROJECT.monthlyConsumption
);
if (benchSummary.systemCapacityKWp !== expectedBenchDC) {
  throw new Error(`❌ Benchmark financial DC capacity mismatch: expected ${expectedBenchDC}, got ${benchSummary.systemCapacityKWp}`);
}

console.log(' ✅ PASS: 100% backward compatibility preserved for legacy single-equipment projects.\n');

console.log('=====================================================');
console.log('🎉 ALL MULTI-EQUIPMENT TESTS PASSED SUCCESSFULLY (6/6)');
console.log('=====================================================\n');
