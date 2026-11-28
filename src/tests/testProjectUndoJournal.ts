// F2a1: diario de deshacer por propuesta. Primero las funciones puras (reloj inyectado: `now` explícito), luego el store.
// Ctrl+Z y rehacer son LIFO dentro de la propuesta activa y nunca cruzan propuestas.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import {
  EMPTY_UNDO_HISTORY, MAX_UNDO_ENTRIES, MAX_UNDO_JOURNALS, UNDO_COALESCE_WINDOW_MS, UNDO_SECTIONS,
  activateJournal, dropJournal, recordUndo, redoStep, renameJournal, undoAvailability, undoStep, type UndoHistory,
} from '../store/undo/projectUndoJournal';
import type { ProjectSimulation } from '../types';
import { SyncService } from '../services/syncService';

const base = (id: string): ProjectSimulation => ({ ...structuredClone(BENCHMARK_PROJECT), id, syncStatus: 'local_only' });
const withCoverage = (p: ProjectSimulation, value: number): ProjectSimulation => ({ ...p, rates: { ...p.rates, targetCoveragePct: value } });
const withName = (p: ProjectSimulation, name: string): ProjectSimulation => ({ ...p, client: { ...p.client, name } });
const edit = { source: 'user' as const, coalesceKey: 'edit' };

// ── 1. Funciones puras ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  assert.deepEqual([...UNDO_SECTIONS], ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization', 'status'],
    'las mismas secciones que restaura hoy restoreProjectContent');
  const a = base('a');
  let h: UndoHistory = activateJournal(EMPTY_UNDO_HISTORY, a);
  assert.equal(h.activeId, 'a');
  assert.deepEqual(undoAvailability(h, 'a'), { canUndo: false, canRedo: false }, 'activar siembra la base sin pasos');
  assert.equal(activateJournal(h, a), h, 'reactivar la propuesta activa no cambia nada');
  assert.equal(recordUndo(h, a, { ...edit, now: 0 }), h, 'un estado idéntico a la base no es un paso');

  // Coalescencia explícita: misma clave y fuente dentro de la ventana (deslizante, como el debounce) = un paso.
  const a80 = withCoverage(a, 80);
  h = recordUndo(h, a80, { ...edit, now: 1000 });
  h = recordUndo(h, withCoverage(a, 75), { ...edit, now: 1000 + UNDO_COALESCE_WINDOW_MS });
  const a70 = withCoverage(a, 70);
  h = recordUndo(h, a70, { ...edit, now: 1000 + 2 * UNDO_COALESCE_WINDOW_MS });
  let journal = h.journals.a;
  assert.equal(journal.undo.length, 1, 'una ráfaga del dock es un paso, aunque dure más que la ventana');
  assert.deepEqual(journal.undo[0].paths.map((p) => p.path), ['rates']);
  assert.equal((journal.undo[0].paths[0].before as ProjectSimulation['rates']).targetCoveragePct, a.rates.targetCoveragePct);
  assert.equal((journal.undo[0].paths[0].after as ProjectSimulation['rates']).targetCoveragePct, 70);
  assert.equal(journal.undo[0].projectId, 'a');
  assert.equal(journal.undo[0].source, 'user');

  // Pasada la ventana, otro paso. Sin clave (p. ej. un commit del agente) nunca se agrupa.
  const later = 1000 + 3 * UNDO_COALESCE_WINDOW_MS + 1;
  h = recordUndo(h, withName(a70, 'Nombre 1'), { ...edit, now: later });
  h = recordUndo(h, withName(a70, 'Nombre 2'), { source: 'assistant', turnId: 't1', now: later + 1 });
  h = recordUndo(h, withName(a70, 'Nombre 3'), { source: 'assistant', turnId: 't1', now: later + 2 });
  assert.equal(h.journals.a.undo.length, 4, 'sin coalesceKey cada registro es su propio paso');
  assert.equal(h.journals.a.undo[3].turnId, 't1');
  // Otra fuente con la misma clave tampoco se agrupa.
  h = recordUndo(h, withName(a70, 'Nombre 4'), { source: 'dock', coalesceKey: 'edit', now: later + 3 });
  assert.equal(h.journals.a.undo.length, 5);

  // Editar y volver al valor dentro de la ventana no deja paso vacío.
  let g = activateJournal(EMPTY_UNDO_HISTORY, a);
  g = recordUndo(g, a80, { ...edit, now: 0 });
  g = recordUndo(g, a, { ...edit, now: 10 });
  assert.equal(g.journals.a.undo.length, 0, 'ida y vuelta en la ventana = sin paso');

  // LIFO: deshacer y rehacer devuelven la instantánea completa de las secciones.
  let step = undoStep(h, 'a')!;
  assert.equal((step.snapshot.client as ProjectSimulation['client']).name, 'Nombre 3');
  h = step.history;
  assert.deepEqual(undoAvailability(h, 'a'), { canUndo: true, canRedo: true });
  step = redoStep(h, 'a')!;
  assert.equal((step.snapshot.client as ProjectSimulation['client']).name, 'Nombre 4');
  h = step.history;
  // Deshacer todo vuelve a la base exacta.
  for (let i = 0; i < 5; i += 1) h = undoStep(h, 'a')!.history;
  assert.equal(undoStep(h, 'a'), null, 'no se deshace más allá de la base');
  assert.deepEqual(h.journals.a.head.rates, JSON.parse(JSON.stringify(a.rates)));
  assert.equal(h.journals.a.head.client.name, a.client.name);
  // Un paso nuevo tras deshacer vacía rehacer y no se agrupa con el paso deshecho.
  h = recordUndo(h, a80, { ...edit, now: later + 4 });
  assert.equal(h.journals.a.redo.length, 0);
  assert.equal(h.journals.a.undo.length, 1);

  // Nunca cruza propuestas: otra propuesta activa tiene su propio diario.
  const b = base('b');
  let x = activateJournal(EMPTY_UNDO_HISTORY, a);
  x = recordUndo(x, a80, { ...edit, now: 0 });
  x = activateJournal(x, b);
  assert.equal(x.activeId, 'b');
  assert.deepEqual(undoAvailability(x, 'b'), { canUndo: false, canRedo: false });
  assert.equal(undoStep(x, 'b'), null);
  assert.equal(x.journals.a.undo.length, 1, 'el diario de A se conserva');
  // Volver a A con el mismo contenido recupera su historial; si A cambió mientras estaba cerrada, se siembra de nuevo.
  assert.equal(activateJournal(x, a80).journals.a.undo.length, 1, 'volver a A conserva su historial');
  const reseeded = activateJournal(x, withCoverage(a, 50));
  assert.equal(reseeded.journals.a.undo.length, 0, 'A cambió fuera de su diario (sincronización, agente): base nueva');
  assert.equal(reseeded.journals.a.head.rates.targetCoveragePct, 50);
  // Un registro sobre una propuesta que no es la del diario activo siembra su base, nunca hereda.
  const y = recordUndo(x, withCoverage(a, 60), { ...edit, now: 5000 });
  assert.equal(y.activeId, 'a');
  assert.equal(y.journals.a.undo.length, 0, 'sin activar antes, el estado recibido es la base');
  assert.equal(dropJournal(x, 'a').journals.a, undefined, 'cerrar el diario lo olvida');
  assert.equal(dropJournal(x, 'zzz'), x);

  // Límites de memoria: 49 pasos por propuesta (como las 50 instantáneas de antes con la base) y 10 diarios.
  let big = activateJournal(EMPTY_UNDO_HISTORY, a);
  for (let i = 0; i < MAX_UNDO_ENTRIES + 5; i += 1) big = recordUndo(big, withCoverage(a, i), { source: 'user', now: i });
  assert.equal(MAX_UNDO_ENTRIES, 49);
  assert.equal(big.journals.a.undo.length, MAX_UNDO_ENTRIES);
  assert.equal(MAX_UNDO_JOURNALS, 10);
  let many = EMPTY_UNDO_HISTORY;
  for (let i = 0; i < MAX_UNDO_JOURNALS + 3; i += 1) many = activateJournal(many, base(`p${i}`));
  assert.equal(Object.keys(many.journals).length, MAX_UNDO_JOURNALS, 'los diarios menos recientes se olvidan');
  assert.equal(many.journals.p0, undefined);
  assert.ok(many.journals[`p${MAX_UNDO_JOURNALS + 2}`], 'el activo nunca se olvida');

  // Deshacer sobre el contenido ACTUAL: solo vuelven las rutas del paso; lo que cambió fuera del diario se conserva.
  let r = activateJournal(EMPTY_UNDO_HISTORY, a);
  r = recordUndo(r, withName(a, 'Manual'), { ...edit, now: 0 });
  const remote = withCoverage(withName(a, 'Manual'), 33); // un pull que no pasa por el diario
  const back = undoStep(r, 'a', remote)!;
  assert.equal((back.snapshot.client as ProjectSimulation['client']).name, a.client.name);
  assert.equal(back.snapshot.rates.targetCoveragePct, 33, 'el cambio remoto en otra sección no se deshace');
  assert.equal(back.history.journals.a.head.rates.targetCoveragePct, 33, 'la base absorbe el contenido actual');
  const forward = redoStep(back.history, 'a', { ...remote, client: back.snapshot.client })!;
  assert.equal((forward.snapshot.client as ProjectSimulation['client']).name, 'Manual');
  assert.equal(forward.snapshot.rates.targetCoveragePct, 33);

  // Cambio de id (fork del servidor): el diario se traslada al id nuevo con sus pasos.
  let f = activateJournal(EMPTY_UNDO_HISTORY, a);
  f = recordUndo(f, a80, { ...edit, now: 0 });
  f = activateJournal(f, b);
  f = activateJournal(f, a80);
  const moved = renameJournal(f, 'a', 'a2');
  assert.equal(moved.journals.a, undefined);
  assert.equal(moved.activeId, 'a2');
  assert.equal(moved.journals.a2.projectId, 'a2');
  assert.deepEqual(moved.journals.a2.undo.map((entry) => entry.projectId), ['a2']);
  assert.deepEqual(moved.order, ['b', 'a2']);
  assert.equal(renameJournal(f, 'zzz', 'q'), f);
  assert.equal(renameJournal(f, 'a', 'a'), f);
  assert.deepEqual(undoAvailability(moved, 'a2'), { canUndo: true, canRedo: false });
}

// ── 2. Store: crear, duplicar y volver a la propuesta ─────────────────────────────────────────────────────────────────────
const store = useSimulationStore;
const s = () => store.getState();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = () => wait(UNDO_COALESCE_WINDOW_MS + 150);
const original = base('journal-a');
const coverageOf = (id: string) => s().projects.find((p) => p.id === id)!.rates.targetCoveragePct;
const nameOf = (id: string) => s().projects.find((p) => p.id === id)!.client.name;
const noop = () => {};
async function openWithHistory() {
  store.setState({ workspaceScope: 'local', projects: [structuredClone(original)], activeProjectId: '', activeView: 'simulator', sessionGeneration: 0,
    undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false, triggerAutoSync: noop,
    syncSettings: { ...s().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
  s().setActiveProject(original.id, 'simulator');
  assert.equal(s().canUndo, false);
  s().updateRates({ targetCoveragePct: 80 });
  assert.equal(s().canUndo, true, 'el primer cambio tras abrir ya se puede deshacer');
  await settle();
  s().updateRates({ targetCoveragePct: 70 });
  await settle();
  assert.equal(s().undoHistory.journals[original.id].undo.length, 2);
}

{ // Crear: la nueva empieza con su base y Ctrl+Z no escribe en ella.
  await openWithHistory();
  s().createNewProject({ name: 'Nueva del diario' });
  const created = s().getActiveProject();
  assert.equal(s().canUndo, false, 'Ctrl+Z deshabilitado en la propuesta recién creada');
  assert.equal(s().canRedo, false);
  const before = structuredClone(created);
  const projectsBefore = s().projects;
  s().undo();
  assert.equal(s().projects, projectsBefore, 'deshacer no escribe ninguna propuesta');
  assert.deepEqual(s().getActiveProject(), before);
  // El primer cambio en la nueva sí se deshace, y vuelve a SU base.
  s().updateClient({ name: 'Renombrada' });
  assert.equal(s().canUndo, true);
  s().undo();
  assert.equal(nameOf(created.id), 'Nueva del diario');
  assert.equal(coverageOf(created.id), before.rates.targetCoveragePct);
  // Volver a A: su historial sigue ahí (decisión de F2a1) y deshacer solo toca A.
  s().setActiveProject(original.id, 'simulator');
  assert.equal(s().canUndo, true, 'A conserva su historial al volver a ella');
  s().undo();
  assert.equal(coverageOf(original.id), 80);
  assert.equal(nameOf(created.id), 'Nueva del diario', 'la nueva no se toca');
}

{ // Duplicar: la copia activa empieza limpia; con activate:false el diario activo sigue siendo el del original.
  await openWithHistory();
  const copyId = s().duplicateProject(original.id)!;
  assert.equal(s().canUndo, false);
  s().undo();
  assert.equal(nameOf(copyId), `${BENCHMARK_PROJECT.client.name} (Copia)`);
  assert.equal(coverageOf(copyId), 70);
  await openWithHistory();
  const silent = s().duplicateProject(original.id, { activate: false })!;
  assert.equal(s().activeProjectId, original.id);
  assert.equal(s().canUndo, true);
  s().undo();
  assert.equal(coverageOf(original.id), 80, 'sin activar la copia, Ctrl+Z sigue en el original');
  assert.equal(coverageOf(silent), 70);
}

{ // Cambiar la activa por fuera de setActiveProject (p. ej. un setState directo) tampoco cruza.
  await openWithHistory();
  const other = base('journal-other');
  store.setState({ projects: [...s().projects, structuredClone(other)], activeProjectId: other.id });
  assert.equal(s().canUndo, true, 'sin activar, el indicador aún es el de A');
  s().activateUndoJournal(s().getActiveProject()); // lo que hace «Actualizar» en la vista del PDF tras su setState
  assert.equal(s().canUndo, false, 'activar el diario de la nueva activa corrige los indicadores');
  store.setState({ activeProjectId: original.id });
  s().activateUndoJournal(s().getActiveProject());
  assert.equal(s().canUndo, true, 'A conserva su historial');
  store.setState({ activeProjectId: other.id });
  s().undo();
  assert.equal(coverageOf(other.id), BENCHMARK_PROJECT.rates.targetCoveragePct, 'la otra no recibe el contenido de A');
  assert.equal(coverageOf(original.id), 70, 'y A no se toca');
  assert.equal(s().canUndo, false, 'los indicadores pasan a la propuesta activa');
}

{ // Una sección que valía `undefined` (sin personalización) vuelve a `undefined` al deshacer.
  await openWithHistory();
  assert.equal(s().getActiveProject().customization, undefined);
  s().updateClient({ contactPerson: 'Ing. Espejo' }); // el espejo del contacto crea la personalización
  assert.equal(s().getActiveProject().customization?.contactName, 'Ing. Espejo');
  s().undo();
  assert.equal(s().getActiveProject().customization, undefined, 'deshacer restaura también las secciones que no existían');
  assert.equal(s().getActiveProject().client.contactPerson, BENCHMARK_PROJECT.client.contactPerson);
}

{ // Papelera: mover a la papelera olvida su diario; restaurar la vuelve a sembrar.
  await openWithHistory();
  s().moveToTrash(original.id);
  assert.equal(s().undoHistory.journals[original.id], undefined);
  s().restoreProject(original.id);
  assert.equal(s().activeProjectId, original.id);
  assert.equal(s().canUndo, false, 'restaurar no recupera pasos anteriores a la papelera');
}

{ // Importar sobrescribiendo la propuesta abierta descarta su diario: Ctrl+Z no revierte la importación.
  await openWithHistory();
  const target = s().getActiveProject();
  const incoming = withCoverage(withName(structuredClone(target), 'Importado'), 99);
  store.setState({ pendingImportConflict: { incomingProject: incoming, conflictingProject: target, reason: 'mismo id' } });
  s().resolveImportConflict('overwrite');
  assert.equal(s().activeProjectId, original.id);
  assert.equal(s().canUndo, false, 'sobrescribir descarta el diario');
  s().undo();
  assert.equal(nameOf(original.id), 'Importado');
  assert.equal(coverageOf(original.id), 99, 'la importación no se revierte');
}

{ // Un cambio remoto en otra sección de la propuesta abierta sobrevive al Ctrl+Z del usuario.
  await openWithHistory();
  s().updateClient({ name: 'Manual' });
  store.setState({ projects: s().projects.map((p) => (p.id === original.id ? withCoverage(p, 33) : p)) });
  s().undo();
  assert.equal(nameOf(original.id), BENCHMARK_PROJECT.client.name, 'el paso del usuario se deshace');
  assert.equal(coverageOf(original.id), 33, 'el cambio remoto no se pierde');
  s().redo();
  assert.equal(nameOf(original.id), 'Manual');
  assert.equal(coverageOf(original.id), 33);
}

{ // El servidor bifurca la propuesta abierta (fork con id nuevo): Ctrl+Z sigue funcionando en ella.
  const serverUrl = 'https://undo-fork.invalid';
  const user = { id: 'undo-fork-user', name: 'Sintético', email: 'test@example.invalid', role: 'EDITOR' as const, organizationId: 'undo-fork-org' };
  const originals = { pull: SyncService.pullProjects, push: SyncService.pushProjects };
  SyncService.pullProjects = async () => ({ success: true, projects: [], deletedIds: [], serverTimestamp: '2026-11-27T00:00:00Z' });
  SyncService.pushProjects = async (_url, _token, items) => ({ success: true, results: items.map((item) => {
    const forked = { ...structuredClone(item), id: 'journal-forked', version: 1, baseVersion: 1, syncStatus: 'synced' as const };
    return { id: forked.id, originalId: item.id, status: 'forked' as const, version: 1, project: forked };
  }) });
  try {
    s().setSyncSettings({ serverUrl, authToken: 'synthetic-token', currentUser: user, autoSyncEnabled: false });
    store.setState({ projects: [structuredClone(original)].map((p) => ({ ...p, organizationId: user.organizationId, syncServerUrl: serverUrl, baseVersion: 1, version: 1, syncStatus: 'pending' })),
      isSyncing: false, projectDeletionQueue: [], syncFoldersWithServer: async () => ({ success: true, message: '' }), syncEquipmentWithServer: async () => ({ success: true, message: '' }),
      syncOrganizationCompanyProfile: async () => undefined, syncPriceObservations: async () => undefined } as never);
    // Cambiar de sesión vacía los diarios: se vuelve a abrir la propuesta y se edita.
    s().setActiveProject(original.id, 'simulator');
    s().updateRates({ targetCoveragePct: 80 });
    await settle();
    s().updateRates({ targetCoveragePct: 70 });
    assert.equal(s().canUndo, true);
    await s().syncProjectsWithServer(true);
    assert.equal(s().activeProjectId, 'journal-forked');
    assert.equal(s().undoHistory.journals[original.id], undefined, 'el diario no queda con el id viejo');
    assert.equal(s().canUndo, true, 'la propuesta bifurcada conserva su Ctrl+Z');
    s().undo();
    assert.equal(coverageOf('journal-forked'), 80);
  } finally {
    SyncService.pullProjects = originals.pull; SyncService.pushProjects = originals.push;
  }
}

console.log('PASS: project undo journal: per-proposal LIFO, explicit coalescing, never crosses proposals, lifecycle.');
