import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { SyncService } from '../services/syncService';
import { CompanyService } from '../services/companyService';
import { ClientSyncService } from '../services/clientSyncService';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { flushSimulationStorePersistence, useSimulationStore } from '../store/useSimulationStore';
import { featureScope } from '../../shared/applicationFeatures';

// El latido de sincronización corre cada 15 s y cada escritura persistida serializa todo el espacio en el hilo
// principal. Un ciclo sin cambios no debe persistir nada; uno que solo avanza el cursor, una sola vez, aunque el
// perfil de empresa y el catálogo tarden más que la ventana de 400 ms de la persistencia diferida.
const user = { id: 'qa-editor', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'qa-org' };
const serverUrl = 'https://idle-persist.example.invalid';
const scope = featureScope(serverUrl, user.organizationId);
const synced = { ...structuredClone(BENCHMARK_PROJECT), id: 'qa-document', organizationId: user.organizationId, syncServerUrl: serverUrl, version: 4, baseVersion: 4, syncStatus: 'synced' as const };
const serverCopy = structuredClone({ ...synced, syncStatus: undefined, baseVersion: undefined, syncServerUrl: undefined });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const original = { fetch: globalThis.fetch, pullProjects: SyncService.pullProjects, pushProjects: SyncService.pushProjects, pullEquipment: SyncService.pullEquipment, profile: CompanyService.profile, listClients: ClientSyncService.list };
const stringify = JSON.stringify;
let persisted = 0;
JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
  const value = args[0] as { state?: unknown; version?: unknown } | null;
  if (value && typeof value === 'object' && 'state' in value && 'version' in value) persisted++;
  return stringify(...args);
}) as typeof JSON.stringify;

async function run() {
  const equipment = { ...structuredClone(DEFAULT_EQUIPMENT_CATALOG[0]), organizationId: user.organizationId, syncServerUrl: serverUrl, version: 2, baseVersion: 2 };
  const folder = { id: 'qa-folder', name: 'QA', organizationId: user.organizationId, version: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  globalThis.fetch = async url => {
    if (String(url).startsWith(`${serverUrl}/api/folders`)) return Response.json({ success: true, folders: [structuredClone(folder)], deletedIds: [] });
    throw new Error(`Unexpected request ${url}`);
  };
  ClientSyncService.list = async () => ({ clients: [], deletedIds: [] });
  let clock = Date.parse('2026-11-20T00:00:00.000Z');
  let pullReturns: 'changes' | 'nothing' | 'fail' = 'changes';
  const pulls: (string | null | undefined)[] = [];
  SyncService.pullProjects = async (_url, _token, since) => {
    pulls.push(since);
    if (pullReturns === 'fail') return { success: false, error: 'Sin conexión' };
    clock += 15_000;
    // Como la API: serverTimestamp es la hora del servidor y avanza en cada descarga.
    return { success: true, projects: pullReturns === 'changes' ? [structuredClone(serverCopy)] : [], deletedIds: [], serverTimestamp: new Date(clock).toISOString(), count: 0 };
  };
  SyncService.pushProjects = async () => { throw new Error('Nothing is pending'); };
  SyncService.pullEquipment = async () => { await sleep(450); return { success: true, items: [structuredClone({ ...equipment, syncServerUrl: undefined, baseVersion: undefined })], deletedIds: [] }; };
  CompanyService.profile = async () => { await sleep(450); return { success: true, organizationId: user.organizationId, version: 7, profile: { name: 'Shared QA' } }; };
  useSimulationStore.setState({
    syncSettings: { serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null },
    workspaceScope: scope, organizationWorkspaces: {}, projectSyncCursor: null,
    projects: [synced], equipmentCatalog: [equipment], equipmentChanges: {}, equipmentDeletionQueue: [], equipmentConflicts: {}, deletedEquipmentIds: [],
    folders: [], folderChanges: {}, folderDeletionQueue: [], clients: [], clientChanges: {}, clientDeletionQueue: [], projectDeletionQueue: [], projectConflicts: {}, isSyncing: false,
  });
  const sync = () => useSimulationStore.getState().syncProjectsWithServer(true);

  // Primer ciclo: descarga completa, fija cursor y catálogo/perfil de la organización.
  assert.equal((await sync()).success, true);
  await sleep(450);
  flushSimulationStorePersistence();
  const primed = useSimulationStore.getState();
  assert.equal(primed.projectSyncCursor?.scope, scope);

  // Ciclo inactivo: el servidor no tiene cambios. Cero serializaciones; ajustes y cursor conservan su identidad.
  pullReturns = 'nothing';
  persisted = 0;
  assert.equal((await sync()).success, true);
  await sleep(450);
  flushSimulationStorePersistence();
  assert.equal(persisted, 0, 'Un ciclo sin cambios no persiste nada');
  assert.equal(useSimulationStore.getState().syncSettings, primed.syncSettings, 'syncSettings conserva su identidad');
  assert.equal(useSimulationStore.getState().projectSyncCursor, primed.projectSyncCursor, 'El cursor conserva su identidad');
  assert.equal(pulls.at(-1), primed.projectSyncCursor!.serverTimestamp, 'La descarga fue incremental desde el cursor');

  // El servidor reenvía un documento (p. ej. eco de un envío propio): el cursor avanza con una sola escritura.
  pullReturns = 'changes';
  persisted = 0;
  assert.equal((await sync()).success, true);
  await sleep(450);
  flushSimulationStorePersistence();
  assert.ok(persisted <= 1, `Un ciclo que solo avanza el cursor persiste una vez como mucho (fueron ${persisted})`);
  const advanced = useSimulationStore.getState().projectSyncCursor;
  assert.equal(advanced?.serverTimestamp, new Date(clock).toISOString(), 'El cursor avanza al serverTimestamp de la descarga');
  assert.equal(useSimulationStore.getState().syncSettings.lastSyncTimestamp, advanced?.serverTimestamp);
  assert.equal(useSimulationStore.getState().projects, primed.projects, 'Un documento idéntico conserva el arreglo');

  // Una descarga fallida no mueve el cursor ni reescribe los ajustes.
  pullReturns = 'fail';
  const beforeFailure = useSimulationStore.getState();
  await sync();
  assert.equal(useSimulationStore.getState().projectSyncCursor, beforeFailure.projectSyncCursor);
  assert.equal(useSimulationStore.getState().syncSettings, beforeFailure.syncSettings);

  // Si la sincronización falla después de aplicar la descarga (p. ej. el catálogo), el cursor igual avanza con la
  // caché que describe: un fallo persistente no puede hacer crecer cada descarga incremental.
  pullReturns = 'changes';
  SyncService.pullEquipment = async () => ({ success: false, error: 'Catálogo caído' } as any);
  const failed = await sync();
  assert.equal(failed.success, false);
  assert.equal(useSimulationStore.getState().projectSyncCursor?.serverTimestamp, new Date(clock).toISOString(), 'El cursor acompaña a la caché aplicada');
  assert.equal(useSimulationStore.getState().isSyncing, false);
}

run()
  .then(() => console.log('Un latido de sincronización sin cambios no persiste; el cursor avanza en una sola escritura.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    JSON.stringify = stringify;
    globalThis.fetch = original.fetch;
    SyncService.pullProjects = original.pullProjects;
    SyncService.pushProjects = original.pushProjects;
    SyncService.pullEquipment = original.pullEquipment;
    CompanyService.profile = original.profile;
    ClientSyncService.list = original.listClients;
  });
