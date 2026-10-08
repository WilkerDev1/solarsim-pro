import assert from 'node:assert/strict';
import { fetchWithSessionRetry, markTokenInvalid, clearInvalidToken, registerTokenRenewedListener, registerSessionInvalidatedListener } from '../services/syncService';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { featureScope } from '../../shared/applicationFeatures';
import type { ProjectSimulation, ProjectFolder } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import type { ProjectSnapshot, ProjectConflictInfo } from '../types/versionHistory';

async function runAuthInvalidationTests() {
  console.log('=====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE AUTH INVALIDATION & SESSION ISOLATION SUITE');
  console.log('=====================================================');

  const serverUrl = 'https://auth-test.solarsim.invalid';
  const orgAId = 'org-electsun';
  const orgBId = 'org-competitor';
  const scopeA = featureScope(serverUrl, orgAId);
  const scopeB = featureScope(serverUrl, orgBId);

  const tokenA = 'token-org-a-initial';
  const userA = {
    id: 'usr-wilker',
    name: 'Wilker',
    email: 'wilker@electsun.invalid',
    role: 'ADMIN' as const,
    organizationId: orgAId,
    organizationName: 'Electsun SRL',
  };

  const userB = {
    id: 'usr-external',
    name: 'Consultor Externo',
    email: 'consultor@competitor.invalid',
    role: 'EDITOR' as const,
    organizationId: orgBId,
    organizationName: 'Competitor Solar',
  };

  // --- ESTADO SINTÉTICO COMPLETO PARA ORG A ---
  const projectAConfirmed: ProjectSimulation = {
    ...structuredClone(BENCHMARK_PROJECT),
    id: 'proj-a-confirmed',
    organizationId: orgAId,
    syncServerUrl: serverUrl,
    syncStatus: 'synced',
    client: { ...BENCHMARK_PROJECT.client, name: 'Proyecto Confirmado Org A', projectId: 'PA-01' },
    folderId: 'folder-licitaciones',
  };

  const projectAPending: ProjectSimulation = {
    ...structuredClone(BENCHMARK_PROJECT),
    id: 'proj-a-pending',
    organizationId: orgAId,
    syncServerUrl: serverUrl,
    syncStatus: 'pending',
    client: { ...BENCHMARK_PROJECT.client, name: 'Borrador Abierto Org A', projectId: 'PA-02' },
  };

  const folderA: ProjectFolder = {
    id: 'folder-licitaciones',
    name: 'Licitaciones 2026',
    color: '#3b82f6',
    createdAt: '2026-03-01T00:00:00.000Z',
  };

  const snapshotA: ProjectSnapshot = {
    id: 'snap-1',
    projectId: 'proj-a-confirmed',
    versionNumber: 1,
    label: 'Versión Inicial',
    type: 'manual',
    authorName: 'Ing. Wilker',
    createdAt: '2026-03-01T12:00:00.000Z',
    systemCapacityKWp: 12.0,
    netInvestmentUSD: 10000,
    panelCount: 20,
    data: projectAConfirmed,
  };

  const conflictA: ProjectConflictInfo = {
    scope: scopeA,
    projectId: 'proj-a-confirmed',
    localVersion: 1,
    serverVersion: 2,
    localProject: projectAConfirmed,
    serverProject: { ...projectAConfirmed, client: { ...projectAConfirmed.client, name: 'Servidor Org A' } },
    reason: 'modified_concurrently',
    lastModifiedByName: 'Admin Remoto',
    lastModifiedAt: '2026-03-02T00:00:00.000Z',
    diffs: [],
  };

  const projectDeletionCmd = {
    id: 'del-proj-old',
    scope: scopeA,
    queuedAt: '2026-03-02T00:00:00.000Z',
    project: { id: 'del-proj-old', client: { name: 'Por Borrar' } },
  };

  const customEquipmentA: SolarEquipmentItem = {
    id: 'eq-custom-panel-a',
    type: 'panel',
    brand: 'Electsun Custom',
    modelSeries: 'ESC-700W',
    displayName: 'Electsun Custom ESC-700W Bifacial',
    powerW: 700,
    organizationId: orgAId,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    supplierPrices: [
      { id: 'sp-1', supplierName: 'Distribuidor Solar', priceUSD: 110, updatedAt: '2026-03-01' },
    ],
  };

  const equipmentDeletionCmd = {
    id: 'eq-del-old',
    scope: scopeA,
    queuedAt: '2026-03-02T00:00:00.000Z',
  };

  const equipmentConflictA = {
    scope: scopeA,
    id: 'eq-conflict-1',
    localItem: customEquipmentA,
    serverItem: { ...customEquipmentA, powerW: 710 },
    reason: 'version_conflict' as const,
  };

  // --- ESTADO SINTÉTICO PARA ORG B (OTRO TENANT EN organizationWorkspaces) ---
  const projectB: ProjectSimulation = {
    ...structuredClone(BENCHMARK_PROJECT),
    id: 'proj-b-private',
    organizationId: orgBId,
    syncServerUrl: serverUrl,
    syncStatus: 'synced',
    client: { ...BENCHMARK_PROJECT.client, name: 'Proyecto Privado Org B', projectId: 'PB-01' },
  };

  const originalFetch = globalThis.fetch;

  try {
    console.log('--- TEST 1: Preservación Completa del Estado Sintético Durable tras 401 Definitivo ---');
    useSimulationStore.setState({
      sessionGeneration: 10,
      workspaceScope: scopeA,
      syncSettings: {
        serverUrl,
        authToken: tokenA,
        currentUser: userA,
        autoSyncEnabled: true,
        lastSyncTimestamp: '2026-03-01T00:00:00.000Z',
      },
      projects: [projectAConfirmed, projectAPending],
      activeProjectId: projectAPending.id,
      folders: [folderA],
      snapshotsByProject: { 'proj-a-confirmed': [snapshotA] },
      projectConflicts: { [`${scopeA}|proj-a-confirmed`]: conflictA },
      projectDeletionQueue: [projectDeletionCmd as any],
      equipmentCatalog: [customEquipmentA],
      equipmentChanges: { 'eq-custom-panel-a': { id: 'eq-custom-panel-a', scope: scopeA, updatedAt: '2026-03-01' } as any },
      equipmentDeletionQueue: [equipmentDeletionCmd as any],
      equipmentConflicts: { 'eq-conflict-1': equipmentConflictA as any },
      deletedEquipmentIds: ['eq-deleted-1'],
      organizationWorkspaces: {
        [scopeB]: {
          projects: [projectB],
          activeProjectId: projectB.id,
          folders: [],
          equipmentCatalog: [],
          deletedEquipmentIds: [],
          equipmentChanges: {},
          equipmentDeletionQueue: [],
          equipmentConflicts: {},
          snapshotsByProject: {},
          projectDeletionQueue: [],
          projectConflicts: {},
          tariffMatrix: {} as any,
          defaultSimulationSettings: {} as any,
          defaultDocumentCustomization: {} as any,
          documentTemplatesByCompany: {},
          companies: [],
          activeCompanyId: '',
          localUserProfile: {} as any,
        },
      },
      isSyncing: false,
      syncFeedbackMessage: null,
    });

    const genBefore = useSimulationStore.getState().sessionGeneration;
    const projectsBefore = JSON.stringify(useSimulationStore.getState().projects);
    const foldersBefore = JSON.stringify(useSimulationStore.getState().folders);
    const snapshotsBefore = JSON.stringify(useSimulationStore.getState().snapshotsByProject);
    const conflictsBefore = JSON.stringify(useSimulationStore.getState().projectConflicts);
    const eqCatalogBefore = JSON.stringify(useSimulationStore.getState().equipmentCatalog);
    const workspacesBefore = JSON.stringify(useSimulationStore.getState().organizationWorkspaces);

    // Simular que el servidor responde 401 definitivo (secreto rotado en API)
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify({ error: 'Token inválido o firma rechazada' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/sync/pull')) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    // Disparar sincronización: debe detectar 401, intentar refresh, recibir 401 y disparar invalidación
    const syncRes = await useSimulationStore.getState().syncProjectsWithServer(true);
    assert.equal(syncRes.success, false);

    const stateAfter = useSimulationStore.getState();

    // 1. Token invalidado y generación incrementada
    assert.equal(stateAfter.syncSettings.authToken, null, 'authToken debe quedar en null');
    assert.ok(stateAfter.sessionGeneration > genBefore, 'sessionGeneration DEBE incrementarse');
    assert.equal(stateAfter.isSyncing, false, 'isSyncing debe ser false');
    assert.ok(stateAfter.syncFeedbackMessage?.includes('expiró'), 'Feedback debe advertir expiración');

    // 2. Identidad recordada preservada (no borrada para permitir reconexión)
    assert.equal(stateAfter.syncSettings.currentUser?.id, userA.id, 'currentUser recordado debe preservarse');
    assert.equal(stateAfter.syncSettings.currentUser?.organizationId, orgAId);

    // 3. Workspace scope NO cambia destructivamente a local
    assert.equal(stateAfter.workspaceScope, scopeA, 'workspaceScope debe preservarse en el tenant actual');

    // 4. Preservación del 100% de los datos durables
    assert.equal(JSON.stringify(stateAfter.projects), projectsBefore, 'Proyectos locales deben ser 100% idénticos');
    assert.equal(JSON.stringify(stateAfter.folders), foldersBefore, 'Carpetas deben ser 100% idénticas');
    assert.equal(JSON.stringify(stateAfter.snapshotsByProject), snapshotsBefore, 'Snapshots deben ser 100% idénticos');
    assert.equal(JSON.stringify(stateAfter.projectConflicts), conflictsBefore, 'Conflictos de proyectos deben ser 100% idénticos');
    assert.equal(JSON.stringify(stateAfter.equipmentCatalog), eqCatalogBefore, 'Catálogo con ofertas de distribuidores debe ser idéntico');
    assert.equal(JSON.stringify(stateAfter.organizationWorkspaces), workspacesBefore, 'Workspaces archivados de otras orgs deben ser idénticos');
    assert.equal(stateAfter.activeProjectId, projectAPending.id, 'El borrador actualmente activo debe seguir seleccionado');

    // 5. Verificación de serialización y rehidratación (simulando guardado y reinicio)
    const serialized = JSON.stringify({
      workspaceScope: stateAfter.workspaceScope,
      projects: stateAfter.projects,
      folders: stateAfter.folders,
      equipmentCatalog: stateAfter.equipmentCatalog,
      organizationWorkspaces: stateAfter.organizationWorkspaces,
    });
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.projects.length, 2);
    assert.equal(parsed.folders.length, 1);
    assert.equal(parsed.organizationWorkspaces[scopeB].projects[0].id, 'proj-b-private');

    console.log('✅ PASS: Estado sintético completo preservado al 100% tras invalidación.');

    console.log('--- TEST 2: Concurrencia de Sesiones y Protección contra Respuestas Tardías ---');
    // Escenario: El usuario estaba en Sesión A (tokenStaleA), pero cambia a Sesión B (tokenB).
    // Una respuesta 401 tardía que venía en camino con tokenStaleA NO debe invalidar Sesión B.
    const tokenStaleA = 'token-stale-A-in-flight';
    const tokenB = 'token-org-b-fresh';
    useSimulationStore.setState({
      syncSettings: {
        serverUrl,
        authToken: tokenB,
        currentUser: userB,
        autoSyncEnabled: true,
        lastSyncTimestamp: null,
      },
    });

    // Simulamos respuesta tardía de un fetch de Sesión A
    let staleRefreshTriggered = false;
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        staleRefreshTriggered = true;
        return new Response(JSON.stringify({ error: 'Stale token rejected' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: '401 on old token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    };

    // Ejecutar fetchWithSessionRetry con tokenStaleA (la sesión rezagada)
    const staleResponse = await fetchWithSessionRetry(`${serverUrl}/api/sync/pull`, {
      headers: { Authorization: `Bearer ${tokenStaleA}` },
    });
    assert.equal(staleResponse.status, 401);
    assert.equal(staleRefreshTriggered, true);

    // Comprobar que Sesión B sigue viva y su tokenB NO fue tocado
    assert.equal(useSimulationStore.getState().syncSettings.authToken, tokenB, '401 de sesión A NO debe invalidar sesión B');
    assert.equal(useSimulationStore.getState().syncSettings.currentUser?.id, userB.id);

    console.log('✅ PASS: Respuestas 401 tardías de sesiones anteriores no afectan la sesión actual.');

    console.log('--- TEST 3: Deduplicación de Solicitudes Concurrentes de Renovación de Token ---');
    // Múltiples solicitudes simultáneas con 401 deben compartir una única llamada a /api/auth/refresh
    let refreshCalls = 0;
    const concurrentToken = 'token-concurrency-test';
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 50));
        return new Response(JSON.stringify({ success: true, token: 'renewed-token-shared-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === `Bearer ${concurrentToken}`) {
        return new Response(JSON.stringify({ error: 'Token expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      // Peticiones con token renovado retornan 200
      return new Response(JSON.stringify({ success: true, data: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    // Disparar 4 solicitudes concurrentes que necesitan refresh
    const [p1, p2, p3, p4] = await Promise.all([
      fetchWithSessionRetry(`${serverUrl}/api/sync/pull`, { headers: { Authorization: `Bearer ${concurrentToken}` } }),
      fetchWithSessionRetry(`${serverUrl}/api/equipment`, { headers: { Authorization: `Bearer ${concurrentToken}` } }),
      fetchWithSessionRetry(`${serverUrl}/api/users`, { headers: { Authorization: `Bearer ${concurrentToken}` } }),
      fetchWithSessionRetry(`${serverUrl}/api/organization/features`, { headers: { Authorization: `Bearer ${concurrentToken}` } }),
    ]);

    assert.equal(refreshCalls, 1, 'Debe haber exactamente 1 llamada a refresh compartida entre todas las solicitudes');
    assert.equal(p1.status, 200);
    assert.equal(p2.status, 200);
    assert.equal(p3.status, 200);
    assert.equal(p4.status, 200);

    console.log('✅ PASS: Múltiples solicitudes concurrentes comparten una única llamada de renovación.');

    console.log('--- TEST 4: Fallos Transitorios de Red / HTTP 5xx NO Invalidan la Sesión Permanentemente ---');
    const resilientToken = 'resilient-token-5xx';
    useSimulationStore.setState({
      syncSettings: {
        serverUrl,
        authToken: resilientToken,
        currentUser: userA,
        autoSyncEnabled: true,
        lastSyncTimestamp: null,
      },
    });

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/sync/pull')) {
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const server500Res = await useSimulationStore.getState().syncProjectsWithServer(true);
    assert.equal(server500Res.success, false);
    assert.equal(
      useSimulationStore.getState().syncSettings.authToken,
      resilientToken,
      'HTTP 500 no debe remover authToken',
    );

    // Fallo de red (TypeError)
    globalThis.fetch = async () => {
      throw new TypeError('Network connection reset');
    };
    const networkFailRes = await useSimulationStore.getState().syncProjectsWithServer(true);
    assert.equal(networkFailRes.success, false);
    assert.equal(
      useSimulationStore.getState().syncSettings.authToken,
      resilientToken,
      'TypeError de red no debe remover authToken',
    );

    console.log('✅ PASS: Errores transitorios 5xx y desconexión preservan la sesión.');

    console.log('--- TEST 5: Re-Login Recupera Ámbito Correcto y Respeta Aislamiento entre Organizaciones ---');
    // El usuario se loguea en Org A
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/auth/login')) {
        return new Response(
          JSON.stringify({
            success: true,
            token: 'new-valid-token-org-a',
            user: userA,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/organization/features')) {
        return new Response(JSON.stringify({ settings: { selfConsumptionProjection: false }, version: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/sync/pull')) {
        return new Response(JSON.stringify({ success: true, projects: [], serverTimestamp: '2026-03-02T12:00:00Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/equipment')) {
        return new Response(JSON.stringify({ success: true, items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const reLoginRes = await useSimulationStore.getState().loginUser('wilker@electsun.invalid', 'valid-password');
    assert.equal(reLoginRes.success, true);
    assert.equal(useSimulationStore.getState().syncSettings.authToken, 'new-valid-token-org-a');
    assert.equal(useSimulationStore.getState().workspaceScope, scopeA);
    assert.equal(useSimulationStore.getState().projects.some((p) => p.id === 'proj-a-confirmed'), true);

    // Ahora simular login como Consultor de Org B:
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/auth/login')) {
        return new Response(
          JSON.stringify({
            success: true,
            token: 'new-valid-token-org-b',
            user: userB,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/organization/features')) {
        return new Response(JSON.stringify({ settings: { selfConsumptionProjection: false }, version: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/sync/pull')) {
        return new Response(JSON.stringify({ success: true, projects: [], serverTimestamp: '2026-03-02T12:00:00Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/equipment')) {
        return new Response(JSON.stringify({ success: true, items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const loginOrgBRes = await useSimulationStore.getState().loginUser('consultor@competitor.invalid', 'valid-password');
    assert.equal(loginOrgBRes.success, true);
    assert.equal(useSimulationStore.getState().syncSettings.authToken, 'new-valid-token-org-b');
    assert.equal(useSimulationStore.getState().workspaceScope, scopeB, 'El workspace debe haber cambiado a Org B');

    // Comprobar que en Org B NO se muestran los proyectos ni datos privados de Org A
    const activeProjectsOrgB = useSimulationStore.getState().projects;
    assert.equal(
      activeProjectsOrgB.some((p) => p.id === 'proj-a-confirmed'),
      false,
      'Proyectos de Org A no deben ser visibles en el workspace de Org B',
    );
    assert.equal(
      activeProjectsOrgB.some((p) => p.id === 'proj-b-private'),
      true,
      'Proyectos de Org B deben estar presentes en su propio workspace',
    );

    console.log('✅ PASS: Login en otra organización aísla estrictamente los datos entre empresas.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('=====================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE CONSERVACIÓN, INVALIDACIÓN Y CONCURRENCIA PASARON (100%)');
  console.log('=====================================================');
}

runAuthInvalidationTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('❌ FALLO EN PRUEBA DE CONSERVACIÓN:', err);
  process.exit(1);
});
