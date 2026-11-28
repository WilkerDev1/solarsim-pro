import { calculateRecommendedPanelCount } from '../engine/solarEngine';

console.log('=====================================================');
console.log('🧪 RUNNING AI SMART PROPOSAL & SIZING TEST SUITE');
console.log('=====================================================\n');

// --- TEST 1: Sizing Calculation with 95% Default Target Coverage ---
console.log('--- TEST 1: Sizing with 95% Target Coverage ---');
const monthlyConsumption = [
  1500, 1450, 1600, 1550, 1650, 1700, 1750, 1600, 1550, 1500, 1450, 1540,
]; // ~18,840 kWh/year
const panelPowerW = 615;
const targetCoveragePct = 95;
const systemLossesPct = 25.0;
const province = 'Santo Domingo / Distrito Nacional';

const sizingResult = calculateRecommendedPanelCount(
  province,
  monthlyConsumption,
  panelPowerW,
  targetCoveragePct,
  systemLossesPct
);

console.log(`Annual Consumption: ${monthlyConsumption.reduce((a, b) => a + b, 0)} kWh`);
console.log(`Recommended Panels (615W): ${sizingResult.recommendedPanelCount}`);
console.log(`Recommended Capacity: ${sizingResult.recommendedCapacityKWp} kWp`);

if (sizingResult.recommendedPanelCount <= 0 || sizingResult.recommendedCapacityKWp <= 0) {
  throw new Error('❌ Sizing failed: panel count or capacity is <= 0');
}
console.log(' ✅ PASS: Dimensionamiento calculado correctamente para 95% de cobertura\n');

// --- TEST 4: Coverage Modification Recalculation ---
console.log('--- TEST 4: Coverage Modification (95% -> 110%) ---');
const sizing110 = calculateRecommendedPanelCount(
  province,
  monthlyConsumption,
  panelPowerW,
  110,
  systemLossesPct
);

console.log(`Paneles para 95%: ${sizingResult.recommendedPanelCount} (${sizingResult.recommendedCapacityKWp} kWp)`);
console.log(`Paneles para 110%: ${sizing110.recommendedPanelCount} (${sizing110.recommendedCapacityKWp} kWp)`);

if (sizing110.recommendedPanelCount <= sizingResult.recommendedPanelCount) {
  throw new Error('❌ Increasing target coverage to 110% should yield more panels');
}

// --- TEST 6: Dimensionamiento de 900 kWh/mes en Punta Cana ---
// Comprobar dimensionamiento solar del motor para 900 kWh/mes en La Altagracia (Punta Cana)
const alfredoMonthlyConsumption = Array(12).fill(900); // 10,800 kWh/año
const alfredoSizing = calculateRecommendedPanelCount(
  'La Altagracia (Punta Cana / Higüey)',
  alfredoMonthlyConsumption,
  615, // Canadian Solar 615W
  95,  // 95% target
  25.0 // 25% losses
);

console.log(`Alfredo Recommended Panels (615W): ${alfredoSizing.recommendedPanelCount} paneles`);
console.log(`Alfredo Recommended Capacity: ${alfredoSizing.recommendedCapacityKWp} kWp`);

if (alfredoSizing.recommendedPanelCount < 11 || alfredoSizing.recommendedPanelCount > 14) {
  throw new Error(`❌ Expected between 11 and 14 panels for 900 kWh/month in Punta Cana, got ${alfredoSizing.recommendedPanelCount}`);
}

console.log(' ✅ PASS: 900 kWh/mes en Punta Cana dimensiona entre 11 y 14 paneles\n');

console.log('=====================================================');
console.log('🎉 ALL AI SMART PROPOSAL & SIZING TESTS PASSED (100% SUCCESS)');
console.log('=====================================================\n');
