import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import type { ProjectFolder } from '../types';

// A folder receipt (recovered from identical content, or from a successful PUT) is installed with the
// change it clears: a later PUT that throws in the same pass cannot leave a stale version behind.
const serverUrl = 'https://folder-receipts.invalid';
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'ADMIN' as const, organizationId: 'qa-org' };
const original = store.getState();
const originalFetch = globalThis.fetch;
const remote = new Map<string, ProjectFolder>();
let failFor: string | null = null;
const json = (value: unknown, status = 200) => Response.json(value, { status });

try {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.ok(url.startsWith(serverUrl), 'Only synthetic transport');
    if (url.endsWith('/api/folders')) return json({ success: true, folders: [...remote.values()], deletedIds: [] });
    const id = decodeURIComponent(url.split('/api/folders/')[1].split('?')[0]);
    assert.equal(init?.method, 'PUT');
    if (id === failFor) throw new Error('Conexión interrumpida');
    const body = JSON.parse(String(init?.body));
    const current = remote.get(id);
    if (body.baseVersion !== (current?.version ?? 0)) return json({ error: 'conflicto', folder: current ?? null }, 409);
    const version = (current?.version ?? 0) + 1;
    const saved: ProjectFolder = { ...body, version, baseVersion: version, updatedAt: '2026-10-02T00:00:00.000Z' };
    remote.set(id, saved);
    return json({ success: true, folder: saved });
  };
  store.getState().setSyncSettings({ serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });

  for (const lostReceipt of [true, false]) {
    remote.clear();
    store.setState({ folders: [], folderChanges: {}, folderDeletionQueue: [] });
    const first = store.getState().createFolder(lostReceipt ? 'Recibo perdido' : 'PUT exitoso')!;
    const second = store.getState().createFolder('Falla después')!;
    assert.ok(first && second);
    if (lostReceipt) remote.set(first.id, { ...first, version: 1, baseVersion: 1, updatedAt: '2026-10-02T00:00:00.000Z' });
    failFor = second.id;
    assert.equal((await store.getState().syncFoldersWithServer()).success, false);
    failFor = null;
    const installed = store.getState().folders.find((f) => f.id === first.id)!;
    assert.equal(installed.version, 1, 'The acknowledged folder carries the server version');
    assert.equal(installed.baseVersion, 1);
    assert.equal(installed.updatedAt, '2026-10-02T00:00:00.000Z');
    assert.equal(store.getState().folderChanges[first.id], undefined);
    store.getState().updateFolder(first.id, { description: 'Editada' });
    assert.equal(store.getState().folderChanges[first.id].baseVersion, 1);
    assert.equal((await store.getState().syncFoldersWithServer()).success, true, 'No CAS conflict against its own write');
    assert.equal(remote.get(first.id)!.version, 2);
    assert.equal(remote.get(first.id)!.description, 'Editada');
  }
  console.log('✓ Folder receipts are installed atomically; a later failing PUT cannot orphan them');
} finally {
  globalThis.fetch = originalFetch;
  store.setState(original, true);
}
