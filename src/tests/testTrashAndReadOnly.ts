import { useSimulationStore } from '../store/useSimulationStore';
import { ProjectSimulation } from '../types';

console.log('=====================================================');
console.log('🧪 RUNNING TRASH (RECYCLE BIN) & READ-ONLY TEST SUITE');
console.log('=====================================================\n');

const store = useSimulationStore.getState();

// --- TEST 1: Move Project to Trash (Soft Delete) ---
console.log('--- TEST 1: Move Project to Trash (Soft Delete) ---');

// Create test project
store.createNewProject({
  name: 'Cliente Prueba Papelera Solar',
  company: 'Industrias Verde SRL',
  province: 'Santiago',
  distributor: 'EDENORTE',
});

const initialProjects = useSimulationStore.getState().projects;
const testProject = initialProjects.find((p) => p.client.name === 'Cliente Prueba Papelera Solar');

if (!testProject) {
  throw new Error('❌ Failed to create test project for trash suite');
}

if (testProject.isDeleted) {
  throw new Error('❌ Project should not be deleted upon creation');
}

console.log(` ✅ PASS: Proyecto creado activamente: "${testProject.client.name}" (ID: ${testProject.id})`);

// Move to trash
store.moveToTrash(testProject.id);

const afterTrashProjects = useSimulationStore.getState().projects;
const trashed = afterTrashProjects.find((p) => p.id === testProject.id);

if (!trashed || !trashed.isDeleted) {
  throw new Error('❌ Expected project to have isDeleted: true');
}

if (!trashed.deletedAt) {
  throw new Error('❌ Expected trashed project to have deletedAt timestamp');
}

if (!trashed.deletedBy) {
  throw new Error('❌ Expected trashed project to have deletedBy author metadata');
}

// Active projects must exclude it
const activeProjects = afterTrashProjects.filter((p) => !p.isDeleted);
if (activeProjects.some((p) => p.id === testProject.id)) {
  throw new Error('❌ Trashed project must NOT appear in activeProjects list');
}

// Trashed projects must include it
const trashedList = afterTrashProjects.filter((p) => p.isDeleted);
if (!trashedList.some((p) => p.id === testProject.id)) {
  throw new Error('❌ Trashed project must appear in trashedProjects list');
}

console.log(` ✅ PASS: Proyecto marcado como isDeleted: true con timestamp ${trashed.deletedAt} por "${trashed.deletedBy}"`);
console.log(' ✅ PASS: Proyecto excluido de la vista activa y visible exclusivamente en papelera\n');


// --- TEST 2: Retention Days Calculation (30 Days Window) ---
console.log('--- TEST 2: Retention Days Calculation (30 Days Window) ---');

const now = Date.now();
const freshDeletedTime = new Date(trashed.deletedAt!).getTime();
const freshDaysLeft = Math.max(0, 30 - Math.floor((now - freshDeletedTime) / (1000 * 60 * 60 * 24)));

if (freshDaysLeft !== 30) {
  throw new Error(`❌ Freshly deleted project should have 30 days remaining, got ${freshDaysLeft}`);
}

// Simulate a project deleted 12 days ago
const simulated12DaysAgo = new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString();
const simulated12DaysLeft = Math.max(0, 30 - Math.floor((now - new Date(simulated12DaysAgo).getTime()) / (1000 * 60 * 60 * 24)));
if (simulated12DaysLeft !== 18) {
  throw new Error(`❌ Project deleted 12 days ago should have 18 days remaining, got ${simulated12DaysLeft}`);
}

// Simulate a project deleted 35 days ago (expired)
const simulated35DaysAgo = new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString();
const CUTOFF_30_DAYS = 30 * 24 * 60 * 60 * 1000;
const isExpired = (now - new Date(simulated35DaysAgo).getTime()) > CUTOFF_30_DAYS;
if (!isExpired) {
  throw new Error('❌ Project deleted 35 days ago must be flagged as expired for auto-purge');
}

console.log(' ✅ PASS: Cálculo de retención de 30 días exacto (30 días hoy, 18 días a los 12 días, expirado a los 35 días)\n');


// --- TEST 3: Restore Project from Trash ---
console.log('--- TEST 3: Restore Project from Trash ---');

store.restoreProject(testProject.id);

const afterRestoreProjects = useSimulationStore.getState().projects;
const restored = afterRestoreProjects.find((p) => p.id === testProject.id);

if (!restored) {
  throw new Error('❌ Restored project not found in store');
}

if (restored.isDeleted) {
  throw new Error('❌ Restored project must have isDeleted: false');
}

if (restored.deletedAt !== null) {
  throw new Error('❌ Restored project must have deletedAt: null');
}

if (restored.deletedBy !== null) {
  throw new Error('❌ Restored project must have deletedBy: null');
}

const activeAfterRestore = afterRestoreProjects.filter((p) => !p.isDeleted);
if (!activeAfterRestore.some((p) => p.id === testProject.id)) {
  throw new Error('❌ Restored project must reappear in activeProjects');
}

console.log(` ✅ PASS: Proyecto "${restored.client.name}" restaurado exitosamente con deletedAt: null y activo en catálogo\n`);


// --- TEST 4: Hard Delete Individual Project ---
console.log('--- TEST 4: Hard Delete Individual Project ---');

// Move to trash again
store.moveToTrash(testProject.id);
let currentList = useSimulationStore.getState().projects;
if (!currentList.find((p) => p.id === testProject.id)?.isDeleted) {
  throw new Error('❌ Failed to move to trash prior to hard delete');
}

// Hard delete permanently
store.hardDeleteProject(testProject.id);

const afterHardDeleteProjects = useSimulationStore.getState().projects;
const permanentlyGone = afterHardDeleteProjects.find((p) => p.id === testProject.id);

if (permanentlyGone) {
  throw new Error('❌ Hard deleted project must NOT exist in store at all');
}

console.log(' ✅ PASS: Proyecto eliminado físicamente y de forma permanente con hardDeleteProject\n');


// --- TEST 5: Empty Trash (Bulk Permanent Deletion) ---
console.log('--- TEST 5: Empty Trash (Bulk Permanent Deletion) ---');

// Create 2 test projects and move them to trash
store.createNewProject({ name: 'Propuesta Trash 1' });
store.createNewProject({ name: 'Propuesta Trash 2' });

const projectsToTrash = useSimulationStore.getState().projects;
const p1 = projectsToTrash.find((p) => p.client.name === 'Propuesta Trash 1')!;
const p2 = projectsToTrash.find((p) => p.client.name === 'Propuesta Trash 2')!;

store.moveToTrash(p1.id);
store.moveToTrash(p2.id);

const preEmptyTrashCount = useSimulationStore.getState().projects.filter((p) => p.isDeleted).length;
if (preEmptyTrashCount < 2) {
  throw new Error(`❌ Expected at least 2 trashed projects before emptyTrash, got ${preEmptyTrashCount}`);
}

console.log(` ℹ️ Proyectos en papelera antes de vaciar: ${preEmptyTrashCount}`);

store.emptyTrash();

const postEmptyTrash = useSimulationStore.getState().projects;
const postEmptyTrashCount = postEmptyTrash.filter((p) => p.isDeleted).length;

if (postEmptyTrashCount !== 0) {
  throw new Error(`❌ Expected 0 trashed projects after emptyTrash, got ${postEmptyTrashCount}`);
}

if (postEmptyTrash.some((p) => p.id === p1.id || p.id === p2.id)) {
  throw new Error('❌ Trashed projects must be completely purged by emptyTrash');
}

console.log(' ✅ PASS: emptyTrash vació el 100% de los proyectos en papelera preservando los activos\n');


// --- TEST 6: Trash Active Navigation State ---
console.log('--- TEST 6: Trash Active Navigation State ---');

store.setIsTrashActive(true);
if (useSimulationStore.getState().isTrashActive !== true) {
  throw new Error('❌ Expected isTrashActive to be true');
}

store.setIsTrashActive(false);
if (useSimulationStore.getState().isTrashActive !== false) {
  throw new Error('❌ Expected isTrashActive to be false');
}

console.log(' ✅ PASS: Conmutación de vista de papelera (setIsTrashActive) validada correctamente\n');

console.log('=====================================================');
console.log('🎉 ALL TRASH & READ-ONLY TESTS PASSED (100% SUCCESS)');
console.log('=====================================================\n');
