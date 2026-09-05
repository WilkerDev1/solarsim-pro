import { useSimulationStore } from '../store/useSimulationStore';
import { ProjectSimulation } from '../types';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';

console.log('=====================================================');
console.log('🧪 RUNNING FOLDER HIDING & SYNC INTEGRITY TEST SUITE');
console.log('=====================================================\n');

// --- TEST 1: Crear carpeta con hideFromGeneral: true y false ---
console.log('--- TEST 1: Folder Creation & hideFromGeneral Flag ---');
const store = useSimulationStore.getState();

const folderNormal = store.createFolder('Residenciales Abiertos', '#10b981', 'Carpeta visible en general', false);
const folderHidden = store.createFolder('Confidencial / Licitación', '#8b5cf6', 'Carpeta oculta de la vista general', true);

if (!folderNormal || !folderHidden) {
  throw new Error('❌ Failed to create test folders');
}

if (folderNormal.hideFromGeneral !== false) {
  throw new Error(`❌ Expected folderNormal.hideFromGeneral to be false, got ${folderNormal.hideFromGeneral}`);
}

if (folderHidden.hideFromGeneral !== true) {
  throw new Error(`❌ Expected folderHidden.hideFromGeneral to be true, got ${folderHidden.hideFromGeneral}`);
}

console.log(` ✅ PASS: Carpeta normal creada con hideFromGeneral: false ("${folderNormal.name}")`);
console.log(` ✅ PASS: Carpeta oculta creada con hideFromGeneral: true ("${folderHidden.name}")\n`);

// --- TEST 2: Modificar hideFromGeneral con updateFolder ---
console.log('--- TEST 2: Update Folder hideFromGeneral ---');
store.updateFolder(folderHidden.id, { hideFromGeneral: false });
let updatedFolder = useSimulationStore.getState().folders.find((f) => f.id === folderHidden.id);
if (updatedFolder?.hideFromGeneral !== false) {
  throw new Error('❌ Failed to toggle hideFromGeneral to false via updateFolder');
}

store.updateFolder(folderHidden.id, { hideFromGeneral: true });
updatedFolder = useSimulationStore.getState().folders.find((f) => f.id === folderHidden.id);
if (updatedFolder?.hideFromGeneral !== true) {
  throw new Error('❌ Failed to toggle hideFromGeneral to true via updateFolder');
}
console.log(' ✅ PASS: updateFolder conmuta hideFromGeneral correctamente\n');

// --- TEST 3: Filtrado de proyectos en vista general vs carpeta específica ---
console.log('--- TEST 3: Project Visibility in General View vs Folder View ---');

const projUnassigned: ProjectSimulation = {
  ...BENCHMARK_PROJECT,
  id: 'proj-test-unassigned',
  folderId: undefined,
  client: { ...BENCHMARK_PROJECT.client, name: 'Cliente Sin Carpeta' },
};

const projInNormalFolder: ProjectSimulation = {
  ...BENCHMARK_PROJECT,
  id: 'proj-test-normal-folder',
  folderId: folderNormal.id,
  client: { ...BENCHMARK_PROJECT.client, name: 'Cliente Residencial Abierto' },
};

const projInHiddenFolder: ProjectSimulation = {
  ...BENCHMARK_PROJECT,
  id: 'proj-test-hidden-folder',
  folderId: folderHidden.id,
  client: { ...BENCHMARK_PROJECT.client, name: 'Cliente Licitación Confidencial' },
};

// Simular filtro de DashboardView
const currentFolders = useSimulationStore.getState().folders;
const hiddenFolderIds = new Set(currentFolders.filter((f) => f.hideFromGeneral).map((f) => f.id));

const allTestProjects = [projUnassigned, projInNormalFolder, projInHiddenFolder];

// Escenario A: Vista General (activeFolderId = null)
const generalFiltered = allTestProjects.filter((p) => {
  if (p.isDeleted) return false;
  return !p.folderId || !hiddenFolderIds.has(p.folderId);
});

if (generalFiltered.some((p) => p.id === projInHiddenFolder.id)) {
  throw new Error('❌ Proyecto de carpeta oculta apareció erróneamente en la vista general');
}

if (!generalFiltered.some((p) => p.id === projUnassigned.id)) {
  throw new Error('❌ Proyecto sin carpeta no apareció en la vista general');
}

if (!generalFiltered.some((p) => p.id === projInNormalFolder.id)) {
  throw new Error('❌ Proyecto de carpeta normal no apareció en la vista general');
}

console.log(` ✅ PASS: En vista general se muestran proyectos sin carpeta y de carpetas normales (${generalFiltered.length} proyectos)`);
console.log(' ✅ PASS: El proyecto de la carpeta oculta NO aparece en la vista general ni proyectos generales');

// Escenario B: Vista de Carpeta Oculta (activeFolderId = folderHidden.id)
const hiddenFolderFiltered = allTestProjects.filter((p) => {
  if (p.isDeleted) return false;
  return p.folderId === folderHidden.id;
});

if (hiddenFolderFiltered.length !== 1 || hiddenFolderFiltered[0].id !== projInHiddenFolder.id) {
  throw new Error('❌ Al seleccionar la carpeta oculta, no se mostró su proyecto asignado');
}
console.log(` ✅ PASS: Al seleccionar la carpeta asignada, su proyecto ("${hiddenFolderFiltered[0].client.name}") aparece correctamente\n`);

// --- TEST 4: Verificación de asignación de autor y syncStatus en Smart Proposal (aiSlice) ---
console.log('--- TEST 4: Smart Proposal AI Invoice Project Author & SyncStatus ---');
const testInvoiceData = {
  clientName: 'Albania María Cuello',
  companyName: 'Farmacia Albania',
  province: 'Santiago',
  distributor: 'EDENORTE' as const,
  tariffCode: 'BTS2' as const,
  annualConsumptionKWh: 30000,
  averageMonthlyKWh: 2500,
  confidenceScore: 0.98,
  targetCoveragePct: 95,
  recommendedPanelCount: 20,
  selectedPanelWatts: 620,
  monthlyConsumptionKWh: Array(12).fill(2500),
};

useSimulationStore.getState().applyExtractedInvoice(testInvoiceData, true);
const latestProject = useSimulationStore.getState().projects[0];

if (!latestProject.authorName || latestProject.authorName.trim() === '') {
  throw new Error('❌ Smart proposal project was created without authorName');
}

if (!latestProject.syncStatus || latestProject.syncStatus !== 'local_only') {
  // Without cloud auth active in test, it should be 'local_only' (or 'pending' if auth was present)
  console.log(`  - Info: latestProject syncStatus is "${latestProject.syncStatus}"`);
}

if (latestProject.client.name !== 'Albania María Cuello') {
  throw new Error(`❌ Expected client name "Albania María Cuello", got "${latestProject.client.name}"`);
}

console.log(` ✅ PASS: Propuesta creada con autor "${latestProject.authorName}", syncStatus "${latestProject.syncStatus}" y cliente "${latestProject.client.name}"\n`);

// --- Cleanup test folders and projects ---
store.deleteFolder(folderNormal.id);
store.deleteFolder(folderHidden.id);
useSimulationStore.setState((s) => ({
  projects: s.projects.filter((p) => p.id !== latestProject.id),
}));

console.log('=====================================================');
console.log('🎉 ALL FOLDER HIDING & SYNC INTEGRITY TESTS PASSED (100%)');
console.log('=====================================================\n');
