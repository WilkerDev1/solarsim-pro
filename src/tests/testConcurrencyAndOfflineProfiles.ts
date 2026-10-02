import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { ProjectSimulation, CompanyProfile, ProjectSnapshot } from '../types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`  ✅ ${msg}`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 SUITE: MODO OFFLINE, CONCURRENCIA Y CONTROL DE VERSIONES');
  console.log('======================================================\n');

  const store = useSimulationStore.getState();

  // -----------------------------------------------------------------
  // 1. MODO OFFLINE & IDENTIDAD LIMPIA
  // -----------------------------------------------------------------
  console.log('1. Verificando Modo Offline & Identidad Local Limpia...');
  assert(store.syncSettings.currentUser === null, 'currentUser inicia como null (Modo Offline auténtico)');
  assert(store.localUserProfile !== undefined, 'localUserProfile está disponible');
  assert(typeof store.localUserProfile.name === 'string', 'Nombre de perfil local es string');
  assert(!store.localUserProfile.name.includes('James W.'), 'No existe el placeholder ficticio "James W."');

  // Actualizar perfil local
  store.updateLocalUserProfile({
    name: 'Ing. Carlos Mendoza',
    email: 'carlos@mendoza-solar.do',
    roleTitle: 'Consultor Senior Fotovoltaico',
  });
  const updatedUser = useSimulationStore.getState().localUserProfile;
  assert(updatedUser.name === 'Ing. Carlos Mendoza', 'Perfil local actualizado a "Ing. Carlos Mendoza"');
  assert(updatedUser.roleTitle === 'Consultor Senior Fotovoltaico', 'Cargo de consultor actualizado');

  // -----------------------------------------------------------------
  // 2. GESTIÓN MULTI-EMPRESA & MEMBRETES (CompanyProfileSlice)
  // -----------------------------------------------------------------
  console.log('\n2. Verificando Gestión Multi-Empresa & Membretes...');
  const initialCompanies = useSimulationStore.getState().companies;
  assert(Array.isArray(initialCompanies) && initialCompanies.length > 0, 'Al menos existe una empresa predeterminada');

  const newCompanyId = `comp-test-${Date.now()}`;
  store.addCompany({
    id: newCompanyId,
    name: 'Sol Caribe Dominicana SRL',
    commercialName: 'SolCaribe Solar',
    rncOrId: '1-32-98765-4',
    phone: '+1 (809) 555-7890',
    email: 'contacto@solcaribe.do',
    address: 'Av. Winston Churchill #105, Santo Domingo, RD',
    primaryColor: '#059669',
    accentColor: '#3b82f6',
    defaultPaymentTerms: '50% anticipo, 50% contra entrega',
    defaultWarrantyNotes: '25 años módulos, 10 años inversores',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  let companiesAfterAdd = useSimulationStore.getState().companies;
  assert(companiesAfterAdd.some((c) => c.id === newCompanyId), 'Empresa "Sol Caribe Dominicana SRL" agregada exitosamente');

  // Seleccionar como activa
  store.setActiveCompany(newCompanyId);
  assert(useSimulationStore.getState().activeCompanyId === newCompanyId, 'Empresa activa cambiada a Sol Caribe');

  // Actualizar empresa
  store.updateCompany(newCompanyId, { commercialName: 'SolCaribe Energy' });
  const updatedComp = useSimulationStore.getState().companies.find((c) => c.id === newCompanyId);
  assert(updatedComp?.commercialName === 'SolCaribe Energy', 'Nombre comercial de empresa actualizado a SolCaribe Energy');

  // Eliminar empresa
  store.deleteCompany(newCompanyId);
  assert(!useSimulationStore.getState().companies.some((c) => c.id === newCompanyId), 'Empresa eliminada exitosamente');

  // -----------------------------------------------------------------
  // 3. PILA DE DESHACER Y REHACER (Undo / Redo)
  // -----------------------------------------------------------------
  console.log('\n3. Verificando Pila de Deshacer y Rehacer (Live Undo/Redo)...');
  const testProject: ProjectSimulation = {
    ...JSON.parse(JSON.stringify(BENCHMARK_PROJECT)),
    id: 'test-undo-redo-proj',
    client: { ...BENCHMARK_PROJECT.client, projectId: 'TEST-001', name: 'Proyecto Test Undo' },
    specs: { ...BENCHMARK_PROJECT.specs, panelCount: 38 },
  };

  useSimulationStore.setState((s) => ({
    projects: [testProject, ...s.projects],
    activeProjectId: testProject.id,
  }));

  // Inicializar estado base
  store.recordUndoState(testProject);
  let vState = useSimulationStore.getState();
  assert(vState.undoStack.length === 1, 'undoStack inicializado con estado base');
  assert(!vState.canUndo, 'canUndo es falso con un solo estado base');

  // Modificar paneles de 38 a 50
  const modified1 = {
    ...testProject,
    specs: { ...testProject.specs, panelCount: 50 },
  };
  useSimulationStore.setState((s) => ({
    projects: s.projects.map((p) => (p.id === testProject.id ? modified1 : p)),
    undoStack: [...s.undoStack, modified1],
    canUndo: true,
  }));

  assert(useSimulationStore.getState().canUndo, 'canUndo es verdadero tras mutación');

  // Ejecutar Undo
  store.undo();
  let afterUndo = useSimulationStore.getState();
  let currentActive = afterUndo.projects.find((p) => p.id === testProject.id);
  assert(currentActive?.specs.panelCount === 38, 'Undo restauró los paneles a 38');
  assert(afterUndo.canRedo, 'canRedo es verdadero tras Undo');

  // Ejecutar Redo
  store.redo();
  let afterRedo = useSimulationStore.getState();
  currentActive = afterRedo.projects.find((p) => p.id === testProject.id);
  assert(currentActive?.specs.panelCount === 50, 'Redo restauró los paneles a 50');
  assert(!afterRedo.canRedo, 'canRedo es falso tras agotar redoStack');

  // -----------------------------------------------------------------
  // 4. CONTROL DE VERSIONES GIT & HITOS (Snapshots)
  // -----------------------------------------------------------------
  console.log('\n4. Verificando Snapshots Estilo Git & Reversión...');
  // Crear Snapshot v1
  store.createSnapshot(testProject.id, 'Hito Inicial Base', 'Primera propuesta técnica', 'manual');
  let snaps = store.getProjectSnapshots(testProject.id);
  assert(snaps.length === 1, 'Snapshot v1 creado exitosamente');
  assert(snaps[0].versionNumber === 1, 'Versión del snapshot es 1');
  assert(snaps[0].label === 'Hito Inicial Base', 'Etiqueta de versión correcta');

  // Modificar proyecto a 64 paneles
  const modified2: ProjectSimulation = {
    ...testProject,
    specs: { ...testProject.specs, panelCount: 64 },
  };
  useSimulationStore.setState((s) => ({
    projects: s.projects.map((p) => (p.id === testProject.id ? modified2 : p)),
  }));

  // Crear Snapshot v2
  store.createSnapshot(testProject.id, 'Ampliación 64 Paneles', 'Revisión solicitada por cliente', 'manual');
  snaps = store.getProjectSnapshots(testProject.id);
  assert(snaps.length === 2, 'Snapshot v2 creado');
  assert(snaps[0].versionNumber === 2, 'Versión del snapshot más reciente es 2');
  assert(snaps[1].versionNumber === 1, 'Versión del snapshot anterior es 1');

  // Comparar diferencias (Diff) entre Snapshot 1 (antiguo) y Snapshot 2 (nuevo)
  const diffs = store.compareSnapshots(snaps[1], snaps[0]);
  assert(diffs.length > 0, 'compareSnapshots detectó diferencias de versión');
  const panelDiff = diffs.find((d) => d.field === 'Cantidad de Paneles');
  assert(panelDiff !== undefined, 'Diff detectó cambio en Cantidad de Paneles');
  assert(panelDiff?.oldValue === 50 && panelDiff?.newValue === 64, 'Diff compara fielmente 50 vs 64 módulos');

  // Revertir a Snapshot v1 (índice 1)
  const restoreSuccess = store.restoreSnapshot(testProject.id, snaps[1].id);
  assert(restoreSuccess, 'restoreSnapshot ejecutado con éxito');
  const restoredProj = useSimulationStore.getState().projects.find((p) => p.id === testProject.id);
  assert(restoredProj?.specs.panelCount === 50, 'Proyecto restaurado a 50 paneles de la versión v1');

  // -----------------------------------------------------------------
  // 5. CONFLICTO DE CONCURRENCIA & RESOLUCIÓN
  // -----------------------------------------------------------------
  console.log('\n5. Verificando Resolución de Conflictos (3-Way: Fork, Keep, Accept)...');
  const localVersionProj: ProjectSimulation = {
    ...testProject,
    version: 2,
    baseVersion: 1,
    specs: { ...testProject.specs, panelCount: 45 },
  };

  const remoteServerProj: ProjectSimulation = {
    ...testProject,
    version: 3, // El servidor ya avanzó a v3 por otro usuario
    specs: { ...testProject.specs, panelCount: 60 },
  };

  store.setActiveConflict({
    projectId: testProject.id,
    localVersion: 1,
    serverVersion: 3,
    localProject: localVersionProj,
    serverProject: remoteServerProj,
    lastModifiedByName: 'Ing. Alejandro Santos',
    lastModifiedAt: new Date().toISOString(),
    diffs: [
      {
        field: 'Cantidad de Paneles',
        section: 'Equipos',
        oldValue: 45,
        newValue: 60,
        formattedOld: '45 módulos',
        formattedNew: '60 módulos',
      },
    ],
  });

  assert(useSimulationStore.getState().activeConflict !== null, 'activeConflict registrado en el store');

  // Resolución por Fork (Bifurcación recomendada)
  store.resolveConflict('fork');
  const afterFork = useSimulationStore.getState();
  assert(afterFork.activeConflict === null, 'activeConflict cerrado tras resolución');
  const forked = afterFork.projects.find((p) => p.id.includes('fork'));
  assert(forked !== undefined, 'Propuesta bifurcada creada independientemente sin sobreescribir');
  assert(Boolean(forked?.client.name.includes('Bifurcación Copia')), 'Nombre de bifurcación contiene "(Bifurcación Copia)"');

  // -----------------------------------------------------------------
  // 6. NOTIFICACIONES DE EQUIPO
  // -----------------------------------------------------------------
  console.log('\n6. Verificando Muro de Notificaciones de Equipo...');
  store.addNotification({
    projectId: testProject.id,
    projectCode: 'SP-2026-TEST',
    clientName: 'Cliente Test Notificación',
    authorName: 'Ing. Carlos Mendoza',
    action: 'CREATE',
    title: 'Nueva propuesta técnica',
    message: 'Ing. Carlos Mendoza creó la propuesta técnica para Cliente Test',
  });

  const notifs = useSimulationStore.getState().notifications;
  assert(notifs.length > 0, 'Notificación agregada al feed del equipo');
  assert(useSimulationStore.getState().unreadNotificationsCount > 0, 'unreadNotificationsCount se incrementó');

  store.markAllAsRead();
  assert(useSimulationStore.getState().unreadNotificationsCount === 0, 'markAllAsRead limpió el contador de no leídas');

  // Limpiar proyecto de prueba
  useSimulationStore.setState((s) => ({
    projects: s.projects.filter((p) => p.id !== testProject.id && !p.id.includes('fork')),
  }));

  console.log('\n======================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE LA SUITE PASARON EXITOSAMENTE');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
