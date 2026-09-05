import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { findCatalogMatchForVariant } from '../components/common/AIDatasheetScannerModal';
import { ExtractedEquipmentVariant, SolarEquipmentItem } from '../types/equipment';

console.log('=====================================================');
console.log('🧪 RUNNING EQUIPMENT CATALOG CRUD & DUPLICATION TEST SUITE');
console.log('=====================================================\n');

// --- TEST 1: Verificar que DEFAULT_EQUIPMENT_CATALOG no contenga modelos HinaESS duplicados ---
console.log('--- TEST 1: Default Catalog Integrity (Zero Duplicates) ---');
const hinaessBatteries = DEFAULT_EQUIPMENT_CATALOG.filter(
  (e) => e.type === 'battery' && (e.brand.toLowerCase().includes('hinaess') || e.displayName.toLowerCase().includes('hinaess'))
);

console.log(`HinaESS batteries in default catalog: ${hinaessBatteries.length}`);
hinaessBatteries.forEach((b) => console.log(`  - [${b.id}] ${b.displayName} (${b.capacityKWh} kWh)`));

if (hinaessBatteries.length !== 1) {
  throw new Error(`❌ Expected exactly 1 HinaESS battery in defaults, found ${hinaessBatteries.length}`);
}

if (DEFAULT_EQUIPMENT_CATALOG.some((e) => e.id === 'eq-bat-hinaess-powergem-max')) {
  throw new Error('❌ Redundant eq-bat-hinaess-powergem-max still found in DEFAULT_EQUIPMENT_CATALOG');
}
console.log(' ✅ PASS: Catálogo por defecto libre de duplicados redundantes de HinaESS\n');

// --- TEST 2: CRUD removeEquipmentItem & deletedEquipmentIds tombstoning ---
console.log('--- TEST 2: removeEquipmentItem & deletedEquipmentIds Tombstoning ---');
const store = useSimulationStore.getState();

// Crear un equipo de prueba
const dummyItem: SolarEquipmentItem = {
  id: 'eq-test-dummy-123',
  type: 'battery',
  brand: 'TestBrand',
  modelSeries: 'TestSeries',
  displayName: 'Batería de Prueba 10kWh',
  capacityKWh: 10,
  isCustom: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

store.addEquipmentItem(dummyItem);
let currentCatalog = useSimulationStore.getState().equipmentCatalog;
if (!currentCatalog.some((e) => e.id === dummyItem.id)) {
  throw new Error('❌ Failed to add dummy item to catalog');
}
console.log(`Dummy item agregado: ${dummyItem.displayName}`);

// Eliminar el equipo
store.removeEquipmentItem(dummyItem.id);
const storeAfterDelete = useSimulationStore.getState();

if (storeAfterDelete.equipmentCatalog.some((e) => e.id === dummyItem.id)) {
  throw new Error('❌ Item still present in equipmentCatalog after removeEquipmentItem');
}

if (!storeAfterDelete.deletedEquipmentIds?.includes(dummyItem.id)) {
  throw new Error('❌ Item ID was not recorded in deletedEquipmentIds tombstone array');
}
console.log(' ✅ PASS: Ítem eliminado y registrado en deletedEquipmentIds exitosamente\n');

// --- TEST 3: Smart Match Detection for Datasheet Scanner ---
console.log('--- TEST 3: Smart Match Detection (Datasheet vs Catalog) ---');

// 3a. Batería similar a HinaESS 16kWh verificada
const scannedHinaessVariant: ExtractedEquipmentVariant = {
  id: 'var-hinaess-scan',
  displayName: 'Batería HinaESS PowerGem Max (16.08kWh)',
  modelCode: 'PowerGem Max',
  capacityKWh: 16.08,
  capacityAh: 314,
  voltageV: 51.2,
  dodPct: 90,
  cycles: 8000,
  chemistry: 'LiFePO4',
};

const matchBattery = findCatalogMatchForVariant(
  scannedHinaessVariant,
  'battery',
  'HinaESS',
  DEFAULT_EQUIPMENT_CATALOG
);

console.log('Battery match result:', matchBattery ? {
  matchedId: matchBattery.matchedItem.id,
  matchedName: matchBattery.matchedItem.displayName,
  score: matchBattery.score,
  reason: matchBattery.reason,
} : 'NO MATCH');

if (!matchBattery || matchBattery.matchedItem.id !== 'eq-bat-hinaess-16k' || matchBattery.score < 0.85) {
  throw new Error('❌ Failed to match scanned HinaESS battery to existing catalog item');
}
console.log(' ✅ PASS: Coincidencia inteligente detectada con alta certeza para Batería HinaESS\n');

// 3b. Panel Canadian Solar 615W
const scannedPanelVariant: ExtractedEquipmentVariant = {
  id: 'var-cs-615-scan',
  displayName: 'CS6.1-72TB-615 Bimax',
  modelCode: 'CS6.1-72TB-615',
  powerW: 615,
  efficiencyPct: 22.8,
  voc: 50.2,
  isc: 15.6,
};

const matchPanel = findCatalogMatchForVariant(
  scannedPanelVariant,
  'panel',
  'Canadian Solar',
  DEFAULT_EQUIPMENT_CATALOG
);

console.log('Panel match result:', matchPanel ? {
  matchedId: matchPanel.matchedItem.id,
  matchedName: matchPanel.matchedItem.displayName,
  score: matchPanel.score,
  reason: matchPanel.reason,
} : 'NO MATCH');

if (!matchPanel || matchPanel.matchedItem.id !== 'eq-mod-cs-615' || matchPanel.score < 0.85) {
  throw new Error('❌ Failed to match Canadian Solar 615W panel');
}
console.log(' ✅ PASS: Coincidencia inteligente detectada para panel Canadian Solar 615W\n');

// 3c. Batería claramente diferente (no debe coincidir falsamente)
const differentBatteryVariant: ExtractedEquipmentVariant = {
  id: 'var-hinaess-mini',
  displayName: 'HinaESS PowerGem Mini 5.12kWh',
  modelCode: 'PowerGem Mini 5k',
  capacityKWh: 5.12,
  capacityAh: 100,
  voltageV: 51.2,
};

const matchDifferent = findCatalogMatchForVariant(
  differentBatteryVariant,
  'battery',
  'HinaESS',
  DEFAULT_EQUIPMENT_CATALOG
);

console.log('Different battery match result:', matchDifferent ? matchDifferent.matchedItem.displayName : 'NO MATCH (Correct)');
if (matchDifferent !== null) {
  throw new Error(`❌ False positive match: 5.12 kWh battery matched with ${matchDifferent.matchedItem.displayName}`);
}
console.log(' ✅ PASS: Falso positivo evitado correctamente para modelo con capacidad distinta\n');

// --- TEST 4: Action handling: Update existing vs Create independent new item ---
console.log('--- TEST 4: Datasheet Action Handling (Update vs Create New) ---');

// 4a. Update existing item
const matchedItemOriginal = DEFAULT_EQUIPMENT_CATALOG.find((e) => e.id === 'eq-bat-hinaess-16k')!;
const initialCycles = matchedItemOriginal.cycles || 6000;

store.updateEquipmentItem('eq-bat-hinaess-16k', {
  cycles: 9999,
  updatedAt: new Date().toISOString(),
});

const updatedItem = useSimulationStore.getState().equipmentCatalog.find((e) => e.id === 'eq-bat-hinaess-16k');
if (updatedItem?.cycles !== 9999) {
  throw new Error(`❌ Update failed: expected cycles to be 9999, got ${updatedItem?.cycles}`);
}
console.log(' ✅ PASS: Acción "update" actualiza el equipo existente sin cambiar su ID');

// Restaurar ciclos originales
store.updateEquipmentItem('eq-bat-hinaess-16k', { cycles: initialCycles });

// 4b. Create independent new item even if matching
const independentItem: SolarEquipmentItem = {
  id: 'eq-bat-hinaess-v2-distinct',
  type: 'battery',
  brand: 'HinaESS',
  modelSeries: 'PowerGem Max Gen 2',
  displayName: 'Batería HinaESS PowerGem Max Gen 2 (16.08kWh)',
  capacityKWh: 16.08,
  capacityAh: 314,
  voltageV: 51.2,
  isCustom: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

store.addEquipmentItem(independentItem);
const catalogWithBoth = useSimulationStore.getState().equipmentCatalog;
const originalInCatalog = catalogWithBoth.find((e) => e.id === 'eq-bat-hinaess-16k');
const newInCatalog = catalogWithBoth.find((e) => e.id === independentItem.id);

if (!originalInCatalog || !newInCatalog) {
  throw new Error('❌ Both items should coexist when user selects "create_new"');
}
console.log(' ✅ PASS: Acción "create_new" permite coexistencia de ambos ítems independientes\n');

// Limpiar el item independiente de prueba
store.removeEquipmentItem(independentItem.id);

// --- TEST 5: Apply Supplier Price to Project for Battery (Model & Feedback Sync) ---
console.log('--- TEST 5: Apply Battery Supplier Price to Project (Sync Model & Selected Info) ---');
const hinaessItem = useSimulationStore.getState().equipmentCatalog.find((e) => e.id === 'eq-bat-hinaess-16k')!;

const testSupplierPrice = {
  id: 'sp-test-yake-1990',
  supplierName: 'YAKE POWER',
  priceUSD: 1990.0,
  updatedAt: new Date().toISOString(),
  stockStatus: 'in_stock' as const,
  source: 'manual' as const,
};

// Agregar precio de proveedor al equipo
store.addOrUpdateSupplierPrice(hinaessItem.id, testSupplierPrice);

// Crear un proyecto activo de prueba para verificar la aplicación
store.createNewProject({ name: 'Proyecto de Prueba Catálogo Batería' });

// Simular que el proyecto activo tenía un nombre legado de batería
store.updateSpecs({
  batteryBrandModel: 'Banco de Baterías de Litio HinaESS PowerGem Max 16.08kWh',
  hasBattery: true,
});

// Aplicar el precio del proveedor al proyecto activo pasando el item
store.applySupplierPriceToProject('battery', testSupplierPrice, hinaessItem);

const activeProject = useSimulationStore.getState().getActiveProject();

console.log(`Battery Model in Project: "${activeProject.specs.batteryBrandModel}"`);
console.log(`Battery Unit Price in Project: $${activeProject.specs.batteryUnitPriceUSD}`);
console.log('Battery Supplier Info in Project:', activeProject.specs.selectedSupplierInfo?.battery);

if (activeProject.specs.batteryUnitPriceUSD !== 1990) {
  throw new Error(`❌ Expected batteryUnitPriceUSD to be 1990, got ${activeProject.specs.batteryUnitPriceUSD}`);
}

if (activeProject.specs.batteryBrandModel !== hinaessItem.displayName) {
  throw new Error(`❌ Expected batteryBrandModel to be synchronized to "${hinaessItem.displayName}", got "${activeProject.specs.batteryBrandModel}"`);
}

if (activeProject.specs.selectedSupplierInfo?.battery?.supplierName !== 'YAKE POWER') {
  throw new Error(`❌ Expected selectedSupplierInfo.battery.supplierName to be "YAKE POWER", got "${activeProject.specs.selectedSupplierInfo?.battery?.supplierName}"`);
}

if (activeProject.specs.selectedSupplierInfo?.battery?.supplierPriceId !== 'sp-test-yake-1990') {
  throw new Error(`❌ Expected supplierPriceId to match "sp-test-yake-1990"`);
}

// Limpiar el precio de prueba y el proyecto
store.removeSupplierPrice(hinaessItem.id, testSupplierPrice.id);
store.deleteProject(activeProject.id);
console.log(' ✅ PASS: Precio de proveedor de batería aplicado y sincronizado correctamente con modelo y feedback visual\n');

// --- TEST 6: Brand Field Support, Matching & Alias Resolution ---
console.log('--- TEST 6: Brand Field Support, Inferred Brands & Alias Matching ---');

// 6a. Comparación de marcas con alias (Luxpower vs LuxpowerTek)
const scannedLuxVariant: ExtractedEquipmentVariant = {
  id: 'var-lux-test',
  displayName: 'Inversor Luxpower LXP-LB-US 8K (8.0Kw)',
  modelCode: 'LXP-LB-US 8k',
  powerKW: 8.0,
  maxAcPowerKW: 8.0,
};

const matchLux = findCatalogMatchForVariant(
  scannedLuxVariant,
  'inverter',
  'Luxpower', // Alias sin el sufijo Tek
  DEFAULT_EQUIPMENT_CATALOG
);

if (!matchLux || matchLux.matchedItem.id !== 'eq-inv-luxpower-8k') {
  throw new Error('❌ Failed to match Luxpower alias to LuxpowerTek catalog item');
}
console.log(' ✅ PASS: Coincidencia de marca con alias (Luxpower <=> LuxpowerTek) exitosa');

// 6b. Coincidencia e inferencia de marca cuando el item del catálogo tenía marca genérica o vacía
const legacyItemWithoutBrand: SolarEquipmentItem = {
  id: 'eq-inv-weco-legacy',
  type: 'inverter',
  brand: 'Fabricante', // Marca genérica legacy
  modelSeries: 'XT-8K',
  displayName: 'Inversor WeCo XT-8K (8.0Kw)',
  powerKW: 8.0,
  maxAcPowerKW: 8.8,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const scannedWecoVariant: ExtractedEquipmentVariant = {
  id: 'var-weco-8k',
  displayName: 'Inversor WeCo XT-8K (8.0Kw)',
  modelCode: 'XT-8K',
  powerKW: 8.0,
  maxAcPowerKW: 8.8,
};

const matchWeco = findCatalogMatchForVariant(
  scannedWecoVariant,
  'inverter',
  'WeCo',
  [...DEFAULT_EQUIPMENT_CATALOG, legacyItemWithoutBrand]
);

if (!matchWeco || matchWeco.matchedItem.id !== 'eq-inv-weco-legacy') {
  throw new Error('❌ Failed to infer brand from displayName when catalog item had generic brand "Fabricante"');
}
console.log(' ✅ PASS: Inferencia de marca desde displayName detectó coincidencia para item con marca "Fabricante"');

// 6c. Registro de nueva marca e indexación en catálogo
const newBrandItem: SolarEquipmentItem = {
  id: 'eq-inv-solis-new-brand',
  type: 'inverter',
  brand: 'Solis',
  modelSeries: 'S6-GR1P5K',
  displayName: 'Inversor Solis S6-GR1P5K 5K (5.0Kw)',
  powerKW: 5.0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

store.addEquipmentItem(newBrandItem);
const catalogAfterNewBrand = useSimulationStore.getState().equipmentCatalog;
const retrievedNewBrand = catalogAfterNewBrand.find((e) => e.brand === 'Solis');

if (!retrievedNewBrand) {
  throw new Error('❌ New brand "Solis" was not properly indexed in equipmentCatalog');
}
console.log(' ✅ PASS: Nueva marca "Solis" agregada e indexada correctamente en catálogo\n');

// Limpiar item de prueba
store.removeEquipmentItem(newBrandItem.id);

console.log('=====================================================');
console.log('🎉 ALL EQUIPMENT CATALOG TESTS PASSED (100% SUCCESS)');
console.log('=====================================================\n');
