import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { BENCHMARK_LEGACY_SPECS, BENCHMARK_PROJECT } from '../engine/referenceCase';
import { LEGACY_MIRROR_FIELDS, applyLegacyEquipmentPatch, readEquipment } from '../../shared/equipment';
import type { LegacyProjectSpecs, ProjectSimulation } from '../types';

/**
 * Release 2.7.1 (AGENTS.md: el espejo heredado nunca se escribe): una instantánea anterior a 2.7.1 (historial local
 * o del servidor) puede traer el espejo. Ninguna ruta posterior lo conserva ni lo devuelve a la API: ni una edición
 * que solo toca un parámetro de sistema, ni lo que baja del servidor, ni lo que sube.
 */
const mirror = (specs: object) => [...LEGACY_MIRROR_FIELDS, 'selectedSupplierInfo'].filter((key) => key in specs);
const serverUrl = 'https://legacy-mirror.invalid';
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'ADMIN' as const, organizationId: 'qa-org' };
const withMirror = (id: string, extra: Partial<LegacyProjectSpecs> = {}): ProjectSimulation => {
  const project = structuredClone(BENCHMARK_PROJECT);
  project.id = id;
  project.status = 'Draft';
  project.organizationId = user.organizationId;
  project.syncServerUrl = serverUrl;
  project.version = 1;
  project.baseVersion = 1;
  project.syncStatus = 'synced';
  // Lo que escribía 2.7.0: grupos Y espejo del primero (o solo el espejo, como 2.6.x).
  project.specs = { ...project.specs, ...BENCHMARK_LEGACY_SPECS, ...extra };
  return project;
};
const original = store.getState();
const originalFetch = globalThis.fetch;
const active = () => store.getState().projects.find((p) => p.id === store.getState().activeProjectId)!;
const json = (value: unknown, status = 200) => Response.json(value, { status });
const offline = () => ({ ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false });

try {
  // 1. applyLegacyEquipmentPatch: un parche sin campos de equipo también normaliza lo que ya traía la propuesta.
  {
    const current = withMirror('patch').specs;
    assert.ok(mirror(current).length > 0, 'la prueba parte de specs con espejo');
    const next = applyLegacyEquipmentPatch(current, { annualDegradation: 0.4 });
    assert.deepEqual(mirror(next), [], 'editar un parámetro de sistema no conserva el espejo');
    assert.equal(next.annualDegradation, 0.4);
    assert.equal(readEquipment(next).panels[0].count, readEquipment(current).panels[0].count, 'migrar no cambia los equipos');
  }

  // 2. Restaurar una versión con espejo y editar un parámetro de sistema (el escenario del hallazgo).
  {
    const project = withMirror('restore-then-edit');
    store.setState({ projects: [project], activeProjectId: project.id, syncSettings: offline() });
    store.getState().createSnapshot(project.id, 'Anterior a 2.7.1');
    const snapshot = store.getState().snapshotsByProject[project.id][0];
    assert.ok(mirror(snapshot.data.specs).length > 0, 'la versión guardada trae espejo');
    assert.equal(store.getState().restoreSnapshot(project.id, snapshot.id), true);
    store.getState().updateSpecs({ annualDegradation: 0.4 });
    assert.deepEqual(mirror(active().specs), [], 'restaurar y editar un parámetro no deja espejo');
  }

  // 3. Un proyecto que ya está en el almacén con espejo (p. ej. bajado antes de migrar) se limpia con la primera edición.
  {
    const project = withMirror('in-store');
    store.setState({ projects: [project], activeProjectId: project.id, syncSettings: offline() });
    store.getState().updateSpecs({ systemLosses: 12 });
    assert.deepEqual(mirror(active().specs), []);
    assert.equal(active().specs.systemLosses, 12);
  }

  // 4. Sincronización: lo que baja del servidor (p. ej. tras restaurar una versión anterior a 2.7.1 en el historial del servidor)
  // y lo que sube nunca llevan espejo.
  {
    let remote = withMirror('server-restored');
    const pushed: ProjectSimulation[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      assert.ok(url.startsWith(serverUrl), 'Only synthetic transport');
      if (url.endsWith('/api/folders')) return json({ success: true, folders: [], deletedIds: [] });
      if (url.includes('/api/clients')) return json({ success: true, clients: [], deletedIds: [] });
      if (url.endsWith('/api/sync/pull')) return json({ success: true, projects: [remote], deletedIds: [] });
      if (url.endsWith('/api/sync/push')) {
        const submitted = JSON.parse(String(init?.body)).projects[0] as ProjectSimulation;
        pushed.push(submitted);
        remote = { ...submitted, version: remote.version! + 1, baseVersion: remote.version! + 1, syncStatus: 'synced' };
        return json({ success: true, results: [{ id: remote.id, status: 'updated', version: remote.version, project: remote }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    store.setState({ projects: [], folders: [], folderChanges: {}, folderDeletionQueue: [], projectConflicts: {}, activeProjectId: '',
      syncEquipmentWithServer: async () => ({ success: true, message: 'Synthetic' }), syncOrganizationCompanyProfile: async () => ({ success: true }) });
    store.getState().setSyncSettings({ serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });

    assert.equal((await store.getState().syncProjectsWithServer()).success, true);
    const downloaded = store.getState().projects.find((p) => p.id === 'server-restored')!;
    assert.deepEqual(mirror(downloaded.specs), [], 'lo que baja del servidor entra al almacén sin espejo');
    assert.equal(readEquipment(downloaded.specs).panels[0].count, 38, 'migrar no cambia los equipos');

    // El usuario edita un parámetro de sistema y sube: el cuerpo de la petición no lleva espejo.
    store.setState({ activeProjectId: 'server-restored' });
    store.getState().updateSpecs({ annualDegradation: 0.4 });
    assert.equal((await store.getState().syncProjectsWithServer()).success, true);
    assert.equal(pushed.length, 1, 'la edición se subió');
    assert.deepEqual(mirror(pushed[0].specs), [], 'el cuerpo de la subida no lleva espejo');
    assert.equal(pushed[0].specs.annualDegradation, 0.4);

    // Capa final: aunque el almacén tuviera espejo, la serialización de la subida lo migra antes de enviarlo.
    const dirty = { ...withMirror('dirty-store'), syncStatus: 'pending' as const };
    store.setState({ projects: [...store.getState().projects, dirty] });
    remote = { ...withMirror('other-remote'), syncStatus: 'synced' }; // el servidor aún no conoce el proyecto pendiente
    assert.equal((await store.getState().syncProjectsWithServer()).success, true);
    const body = pushed.find((p) => p.id === 'dirty-store')!;
    assert.ok(body, 'el proyecto pendiente se subió');
    assert.deepEqual(mirror(body.specs), [], 'la subida nunca envía el espejo');
    assert.equal(readEquipment(body.specs).panels[0].count, 38);
  }
  console.log('Legacy mirror boundaries (restore, edit, pull, push) passed.');
} finally {
  globalThis.fetch = originalFetch;
  store.setState(original, true);
}
