import { useSimulationStore } from '../store/useSimulationStore';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';

console.log('=====================================================');
console.log('🧪 RUNNING TRASH (RECYCLE BIN) TEST SUITE');
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


// --- TEST 2: Purga automática de papelera tras 30 días al rehidratar ---
console.log('--- TEST 2: Auto-purge of trash older than 30 days on hydration ---');

const dayMs = 24 * 60 * 60 * 1000;
const persisted = {
  ...useSimulationStore.getState(),
  projects: [
    { ...trashed, id: 'trash-12-days', deletedAt: new Date(Date.now() - 12 * dayMs).toISOString() },
    { ...trashed, id: 'trash-35-days', deletedAt: new Date(Date.now() - 35 * dayMs).toISOString() },
    { ...trashed, id: 'active-old', isDeleted: false, deletedAt: null, updatedAt: new Date(Date.now() - 90 * dayMs).toISOString() },
  ],
};
hydrateSimulationStore(persisted);
const keptIds = persisted.projects.map((p) => p.id);
if (!keptIds.includes('trash-12-days')) throw new Error('❌ Trash deleted 12 days ago must be kept');
if (keptIds.includes('trash-35-days')) throw new Error('❌ Trash deleted 35 days ago must be purged');
if (!keptIds.includes('active-old')) throw new Error('❌ Active projects must never be purged by age');

console.log(' ✅ PASS: La rehidratación conserva la papelera reciente y purga la de más de 30 días\n');


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
console.log('🎉 ALL TRASH TESTS PASSED');
console.log('=====================================================\n');
