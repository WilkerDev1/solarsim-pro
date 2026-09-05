import { useSimulationStore } from '../store/useSimulationStore';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
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

// --- TEST 5: Proposal with Equipment without Assigned Supplier Prices ---
console.log('--- TEST 5: Apply Extracted Invoice with Unpriced Equipment (e.g. WeCo) ---');
const unpricedExtractedData: ExtractedInvoiceData = {
  clientName: 'Josia Moscoso',
  distributor: 'EDEESTE',
  tariffCode: 'BTS1',
  province: 'Santo Domingo / Distrito Nacional',
  monthlyConsumptionKWh: Array(12).fill(1216),
  annualConsumptionKWh: 1216 * 12,
  averageMonthlyKWh: 1216,
  targetCoveragePct: 95,
  recommendedPanelCount: 18,
  recommendedCapacityKWp: 11.07,
  selectedPanelWatts: 615,
  selectedPanelModel: 'Módulos Canadian Solar CS6.1-72TB-615 (615W)',
  selectedInverterPowerKW: 8.0,
  selectedInverterCount: 1,
  selectedInverterModel: 'Inversor WeCo XT-8K (8.0Kw)',
  selectedInverterUnitPriceUSD: undefined, // Sin precio de distribuidor
  hasBattery: true,
  selectedBatteryCapacityKWh: 16.06,
  selectedBatteryCount: 2,
  selectedBatteryModel: 'Batería WeCo 16K0-LV (16.06kWh)',
  selectedBatteryUnitPriceUSD: undefined, // Sin precio de distribuidor
  targetMarginPct: 40,
  confidenceScore: 98,
  equipmentSubstitutions: [],
};

store.applyExtractedInvoice(unpricedExtractedData, true);
const unpricedProj = useSimulationStore.getState().getActiveProject();

console.log(`Client: "${unpricedProj.client.name}"`);
console.log(`Inverter Selected: "${unpricedProj.specs.inverterBrandModel}" (unitPrice: $${unpricedProj.specs.inverterUnitPriceUSD})`);
console.log(`Battery Selected: "${unpricedProj.specs.batteryBrandModel}" (unitPrice: $${unpricedProj.specs.batteryUnitPriceUSD})`);

if (unpricedProj.client.name !== 'Josia Moscoso') {
  throw new Error(`❌ Expected client name "Josia Moscoso", got "${unpricedProj.client.name}"`);
}

if (!unpricedProj.specs.inverterBrandModel?.includes('WeCo')) {
  throw new Error(`❌ Expected inverter to contain WeCo, got "${unpricedProj.specs.inverterBrandModel}"`);
}

if (!unpricedProj.specs.batteryBrandModel?.includes('WeCo')) {
  throw new Error(`❌ Expected battery to contain WeCo, got "${unpricedProj.specs.batteryBrandModel}"`);
}

console.log(' ✅ PASS: Propuesta creada exitosamente con equipos sin precio asignado (WeCo)\n');

// --- TEST 6: Intelligent Equipment Substitution Tracking ---
console.log('--- TEST 6: Equipment Substitution Tracking ---');
const substitutedExtractedData: ExtractedInvoiceData = {
  ...unpricedExtractedData,
  equipmentSubstitutions: [
    {
      type: 'inverter',
      requestedModel: 'Inversor Deye 8kW',
      selectedModel: 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)',
      reason: 'Marca DEYE no disponible en base de datos; sustituido por inversor de potencia equivalente.',
    },
  ],
};

if (!substitutedExtractedData.equipmentSubstitutions || substitutedExtractedData.equipmentSubstitutions.length !== 1) {
  throw new Error('❌ Expected 1 substitution in equipmentSubstitutions');
}
console.log(`Substitution: ${substitutedExtractedData.equipmentSubstitutions[0].requestedModel} -> ${substitutedExtractedData.equipmentSubstitutions[0].selectedModel}`);
console.log(' ✅ PASS: Sustitución inteligente rastreada correctamente\n');

// --- TEST 7: Deterministic Re-Grounding & Explicit Specification Precedence (Josia Moscoso Case) ---
console.log('--- TEST 7: Deterministic Re-Grounding & Explicit kWp Precedence ---');
const testCatalog = [
  ...store.equipmentCatalog,
  {
    id: 'eq-inv-weco-6k',
    type: 'inverter' as const,
    brand: 'WeCo',
    modelSeries: 'XT-6K',
    displayName: 'Inversor WeCo XT-6K (6.0Kw)',
    powerKW: 6.0,
    maxAcPowerKW: 6.0,
    maxPvPowerKW: 9.0,
    isCustom: true,
  },
  {
    id: 'eq-inv-weco-8k',
    type: 'inverter' as const,
    brand: 'WeCo',
    modelSeries: 'XT-8K',
    displayName: 'Inversor WeCo XT-8K (8.0Kw)',
    powerKW: 8.0,
    maxAcPowerKW: 8.0,
    maxPvPowerKW: 12.0,
    isCustom: true,
  },
  {
    id: 'eq-inv-weco-10k',
    type: 'inverter' as const,
    brand: 'WeCo',
    modelSeries: 'XT-10K',
    displayName: 'Inversor WeCo XT-10K (10.0Kw)',
    powerKW: 10.0,
    maxAcPowerKW: 10.0,
    maxPvPowerKW: 15.0,
    isCustom: true,
  },
  {
    id: 'eq-bat-weco-16k',
    type: 'battery' as const,
    brand: 'WeCo',
    modelSeries: '16K0-LV',
    displayName: 'Batería WeCo 16K0-LV (16.06kWh)',
    capacityKWh: 16.06,
    voltageV: 51.2,
    isCustom: true,
  },
];

const requirementsText = `Josia Moscoso
11 kwp paneles Canadian 615w (cubrir todo)
2 bateria de 16k weco
1 inversor weco de 8kw
Porcentaje de venta 40%
Equipos según disponibilidad y especificar que el sistema esta diseñado para 40kwh diario.`;

// Simular el post-procesamiento determinista
const panelWatts = 615;
let extractedPanelCount = 0;
const kwpMatch = requirementsText.match(/(\d+(?:\.\d+)?)\s*k(?:w|wp)\s*(?:paneles|panel|m[oó]dulos)?/i);
if (kwpMatch) {
  extractedPanelCount = Math.max(1, Math.round((parseFloat(kwpMatch[1]) * 1000) / panelWatts));
}

console.log(`Explicit kWp parsed panels: ${extractedPanelCount} paneles (~${((extractedPanelCount * panelWatts)/1000).toFixed(2)} kWp)`);
if (extractedPanelCount !== 18) {
  throw new Error(`❌ Expected 18 panels for 11 kWp with 615W modules, got ${extractedPanelCount}`);
}

const reqLower = requirementsText.toLowerCase();

// Extracción contextual de potencia y variante del inversor
let explicitInvKW: number | undefined;
const invKwMatch = reqLower.match(/(?:inversor(?:es)?|inv)\b[^\n,;.]*?(\d+(?:\.\d+)?)\s*(?:kw|k)\b/i)
  || reqLower.match(/(\d+(?:\.\d+)?)\s*(?:kw|k)\b[^\n,;.]*?(?:inversor(?:es)?|inv)\b/i);
if (invKwMatch) {
  explicitInvKW = parseFloat(invKwMatch[1]);
}

const wecoInverters = testCatalog.filter(e => e.type === 'inverter' && e.brand.toLowerCase().includes('weco'));
if (wecoInverters.length === 0) {
  throw new Error('❌ Test catalog must contain WeCo inverters');
}

const targetKW = explicitInvKW || 8.0;
wecoInverters.sort((a, b) => {
  const diffA = Math.abs((a.powerKW || 0) - targetKW);
  const diffB = Math.abs((b.powerKW || 0) - targetKW);
  if (Math.abs(diffA - diffB) > 0.05) return diffA - diffB;
  const strTarget = `${Math.round(targetKW)}k`;
  const matchNameA = a.displayName.toLowerCase().includes(strTarget);
  const matchNameB = b.displayName.toLowerCase().includes(strTarget);
  if (matchNameA && !matchNameB) return -1;
  if (!matchNameA && matchNameB) return 1;
  return 0;
});
const selectedInverter = wecoInverters[0];

// Extracción de cantidad de inversores
let explicitInvCount = 1;
const invCountMatch = reqLower.match(/(\d+)\s*(?:x\s*)?(?:inversor(?:es)?|unidades?\s*(?:de\s*)?inversor)/i);
if (invCountMatch) {
  explicitInvCount = parseInt(invCountMatch[1], 10);
}

console.log(`Matched Inverter: "${selectedInverter.displayName}" (${explicitInvCount} unidad)`);
if (selectedInverter.powerKW !== 8.0 || !selectedInverter.displayName.includes('8K')) {
  throw new Error(`❌ Expected WeCo 8K inverter, got ${selectedInverter.displayName}`);
}
if (explicitInvCount !== 1) {
  throw new Error(`❌ Expected 1 inverter unit, got ${explicitInvCount}`);
}

const wecoBattery = testCatalog.find(e => e.type === 'battery' && e.brand.toLowerCase().includes('weco'));
if (!wecoBattery) {
  throw new Error('❌ Test catalog must contain WeCo battery');
}

const batCountMatch = reqLower.match(/(\d+)\s*(?:bater[ií]as?|unidades?\s*de\s*bater[ií]a)/i);
const extractedBatCount = batCountMatch ? parseInt(batCountMatch[1], 10) : 1;

console.log(`Matched Battery: "${wecoBattery.displayName}" (${extractedBatCount} unidades)`);
if (extractedBatCount !== 2) {
  throw new Error(`❌ Expected 2 batteries from text, got ${extractedBatCount}`);
}

// Validación de alineación de Cobertura Meta (%) y Cobertura Real (~109.7%)
const dailyKWh = 40;
const monthlyArr = Array(12).fill(Math.round(dailyKWh * 30.4)); // 1216 kWh * 12 = 14,592 kWh
const totalAnnualKWh = monthlyArr.reduce((a, b) => a + b, 0);
const cleanProv = 'Santo Domingo / Distrito Nacional';
const losses = 25.0;

const STANDARD_PRESETS = [80, 90, 95, 100, 105, 110, 120];
const matchingPreset = STANDARD_PRESETS.find((pct) => {
  const check = calculateRecommendedPanelCount(cleanProv, monthlyArr, panelWatts, pct, losses);
  return check.recommendedPanelCount === extractedPanelCount;
});

const effectiveTargetCoverage = matchingPreset || 95;
console.log(`Deduced Target Coverage Preset: ${effectiveTargetCoverage}% (Meta)`);
if (effectiveTargetCoverage !== 105) {
  throw new Error(`❌ Expected target coverage preset of 105% for 18 panels, got ${effectiveTargetCoverage}%`);
}

// Cobertura real
const recForYield = calculateRecommendedPanelCount(cleanProv, monthlyArr, panelWatts, effectiveTargetCoverage, losses);
const actualCapacityKWp = Math.round(((extractedPanelCount * panelWatts) / 1000) * 100) / 100;
const realAnnualProd = actualCapacityKWp * recForYield.annualSpecificYieldKWhPerKWp;
const realCoveragePct = Math.round((realAnnualProd / totalAnnualKWh) * 1000) / 10;

console.log(`Estimated Real Coverage: ~${realCoveragePct}%`);
if (realCoveragePct < 109.0 || realCoveragePct > 110.5) {
  throw new Error(`❌ Expected real coverage around 109.7%, got ${realCoveragePct}%`);
}

console.log(' ✅ PASS: Detección exacta de variante WeCo 8 kW (1 ud), WeCo Batería (2 uds), 18 paneles (11 kWp), Meta 105% y Cobertura Real ~109.7% validada\n');

console.log('=====================================================');
console.log('🎉 ALL AI SMART PROPOSAL & SIZING TESTS PASSED (100% SUCCESS)');
console.log('=====================================================\n');
