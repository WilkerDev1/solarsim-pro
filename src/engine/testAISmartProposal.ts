import { useSimulationStore } from '../store/useSimulationStore';
import { calculateRecommendedPanelCount } from './solarEngine';
import { ExtractedInvoiceData } from '../types/aiInvoice';

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

// --- TEST 2: Creation of New Project via applyExtractedInvoice ---
console.log('--- TEST 2: Apply AI Invoice as New Project (Clean Specs) ---');
const store = useSimulationStore.getState();

const mockExtractedData: ExtractedInvoiceData = {
  clientName: 'Juan Pérez Automotriz SRL',
  distributor: 'EDESUR',
  tariffCode: 'BTS2',
  nic: '7333529',
  province: 'Santo Domingo / Distrito Nacional',
  monthlyConsumptionKWh: monthlyConsumption,
  annualConsumptionKWh: monthlyConsumption.reduce((a, b) => a + b, 0),
  averageMonthlyKWh: Math.round(monthlyConsumption.reduce((a, b) => a + b, 0) / 12),
  targetCoveragePct: 95,
  recommendedPanelCount: sizingResult.recommendedPanelCount,
  recommendedCapacityKWp: sizingResult.recommendedCapacityKWp,
  selectedPanelWatts: 615,
  selectedPanelModel: 'Canadian Solar CS6.1-72TB-615 (615W)',
  selectedInverterPowerKW: 8.0,
  selectedInverterCount: 2,
  selectedInverterModel: 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)',
  hasBattery: true,
  selectedBatteryCapacityKWh: 16.08,
  selectedBatteryCount: 2,
  selectedBatteryModel: 'HinaESS PowerGem Max 16.08kWh',
  targetMarginPct: 40,
  confidenceScore: 98,
  specialTechnicalNotes:
    'Incluye 1 limitador de potencia / CT inteligente para inyección cero y balance de fases. Configuración de 2 inversores LuxPower de 8 kW en paralelo.',
};

store.applyExtractedInvoice(mockExtractedData, true);

const updatedStore = useSimulationStore.getState();
const activeProj = updatedStore.getActiveProject();

console.log(`Created Project Name: "${activeProj.client.name}"`);
console.log(`Target Coverage in Rates: ${activeProj.rates.targetCoveragePct}%`);
console.log(`Installation Description: "${activeProj.specs.installationServicesDesc}"`);

if (activeProj.rates.targetCoveragePct !== 95) {
  throw new Error(`❌ Expected targetCoveragePct to be 95, got ${activeProj.rates.targetCoveragePct}`);
}

if (activeProj.specs.installationServicesDesc?.includes('Notas del Sistema:')) {
  throw new Error('❌ installationServicesDesc should NOT contain "Notas del Sistema:"');
}

console.log(' ✅ PASS: Nuevo proyecto creado con cobertura al 95% y descripción de instalación limpia\n');

// --- TEST 3: Sanitization of Polluted installationServicesDesc on Active Project ---
console.log('--- TEST 3: Sanitization of Bloated installationServicesDesc ---');
// Simular que el proyecto tenía la super descripción concatenada
const pollutedDesc =
  'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.). Notas del Sistema: Incluye 1 limitador de potencia / CT inteligente para inyección cero y balance de fases. Configuración de 2 inversores LuxPower de 8 kW en paralelo. Notas del Sistema: Incluye 1 limitador de potencia...';

store.updateSpecs({
  installationServicesDesc: pollutedDesc,
});

// Verificar que se haya asignado el texto sucio para la prueba
if (!useSimulationStore.getState().getActiveProject().specs.installationServicesDesc?.includes('Notas del Sistema:')) {
  throw new Error('Setup failed: polluted desc was not applied');
}

// Aplicar al proyecto activo (applyExtractedInvoice con isNew=false)
store.applyExtractedInvoice(mockExtractedData, false);

const sanitizedProj = useSimulationStore.getState().getActiveProject();
console.log(`Sanitized Installation Desc: "${sanitizedProj.specs.installationServicesDesc}"`);

if (sanitizedProj.specs.installationServicesDesc?.includes('Notas del Sistema:')) {
  throw new Error('❌ Failed to sanitize installationServicesDesc; still contains "Notas del Sistema:"');
}

if (!sanitizedProj.specs.installationServicesDesc?.startsWith('Instalación y Accesorios')) {
  throw new Error('❌ installationServicesDesc does not start with "Instalación y Accesorios"');
}

console.log(' ✅ PASS: Descripción contaminada fue sanitizada exitosamente al valor conciso base\n');

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

console.log(' ✅ PASS: El recálculo dinámico de cobertura meta aumenta proporcionalmente la cantidad de paneles\n');

console.log('=====================================================');
console.log('🎉 ALL AI SMART PROPOSAL & SIZING TESTS PASSED (100% SUCCESS)');
console.log('=====================================================\n');
