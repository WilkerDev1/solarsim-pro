import { isWriterRole } from '../../../shared/permissions';
import { clientContent, validateClientInput, type ClientInput } from '../../../shared/clients';
import type { SimulationSlice } from '../types';
import type { ClientChange, ClientDeletionCommand, ClientMutationResult, ClientRecord } from '../../types/client';
import { ClientSyncService } from '../../services/clientSyncService';
import { ownsProject } from '../sync/projectReconciliation';
import { contentEqual } from '../sync/projectDifferences';

export interface ClientSlice {
  clients: ClientRecord[];
  clientChanges: Record<string, ClientChange>;
  clientDeletionQueue: ClientDeletionCommand[];
  clientSyncFeedback: string | null;
  /** Client opened in the clients hub (UI state, not persisted). */
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
  createClientRecord: (input: Partial<ClientInput> & { name: string }) => ClientMutationResult;
  updateClientRecord: (id: string, updates: Partial<ClientInput>) => ClientMutationResult;
  deleteClientRecord: (id: string) => boolean;
  /** Links or unlinks (null) a proposal; the client data printed in the proposal is never changed. */
  linkProposalToClient: (projectId: string, clientId: string | null) => { ok: true } | { ok: false; error: string };
  resolveClientConflict: (id: string, resolution: 'accept_server' | 'keep_local') => void;
  syncClientsWithServer: () => Promise<{ success: boolean; message: string }>;
}

const SESSION_CHANGED = { success: false, message: 'La sesión cambió.' };

export const createClientSlice: SimulationSlice<ClientSlice> = (set, get) => {
  let running: { generation: number; rerun: boolean; promise: Promise<{ success: boolean; message: string }> } | null = null;
  const writable = () => !get().syncSettings.currentUser || isWriterRole(get().syncSettings.currentUser!.role);
  const dirty = (id: string, baseVersion: number) => ({
    ...get().clientChanges,
    [id]: { revision: crypto.randomUUID(), ownerId: get().syncSettings.currentUser?.id, baseVersion },
  });
  const sync = () => {
    if (get().syncSettings.authToken && get().syncSettings.autoSyncEnabled) void get().syncClientsWithServer();
  };
  // Server deletions unlink proposals locally too; the push would otherwise be rejected as invalid_client.
  const unlinkDeleted = (deleted: Set<string>) =>
    set((s) => s.projects.some((p) => p.clientId && deleted.has(p.clientId))
      ? {
          projects: s.projects.map((p) => {
            if (!p.clientId || !deleted.has(p.clientId)) return p;
            // The server unlinked its copy and bumped its version once; a synced local copy must follow to keep its CAS base.
            const follow = p.syncStatus === 'synced' && Number.isSafeInteger(p.baseVersion);
            return { ...p, clientId: undefined, ...(follow ? { version: (p.version ?? p.baseVersion!) + 1, baseVersion: p.baseVersion! + 1 } : {}) };
          }),
        }
      : {});

  return {
    clients: [],
    clientChanges: {},
    clientDeletionQueue: [],
    clientSyncFeedback: null,
    activeClientId: null,
    setActiveClientId: (id) => set({ activeClientId: id }),
    createClientRecord: (input) => {
      if (!writable()) return { ok: false, error: 'Tu rol no permite crear clientes.' };
      const validation = validateClientInput(input);
      if (!validation.ok) return { ok: false, error: validation.error };
      const user = get().syncSettings.currentUser;
      const client: ClientRecord = {
        ...validation.value,
        id: `client-${crypto.randomUUID()}`,
        organizationId: user?.organizationId,
        createdById: user?.id,
        createdBy: user?.name || 'Local',
        createdAt: new Date().toISOString(),
        baseVersion: 0,
      };
      set((s) => ({ clients: [...s.clients, client], clientChanges: dirty(client.id, 0) }));
      sync();
      return { ok: true, client };
    },
    updateClientRecord: (id, updates) => {
      const state = get(), existing = state.clients.find((c) => c.id === id);
      if (!writable()) return { ok: false, error: 'Tu rol no permite editar clientes.' };
      if (!existing) return { ok: false, error: 'Cliente no encontrado.' };
      const validation = validateClientInput({ ...clientContent(existing), ...updates });
      if (!validation.ok) return { ok: false, error: validation.error };
      const client = { ...existing, ...validation.value };
      set({
        clients: state.clients.map((c) => (c.id === id ? client : c)),
        clientChanges: dirty(id, state.clientChanges[id]?.baseVersion ?? existing.baseVersion ?? existing.version ?? 0),
      });
      sync();
      return { ok: true, client };
    },
    deleteClientRecord: (id) => {
      const state = get(), client = state.clients.find((c) => c.id === id);
      if (!writable() || !client) return false;
      const changes = { ...state.clientChanges };
      delete changes[id];
      const now = new Date().toISOString();
      // A published client may still be rejected by CAS: its links go only when the server confirms (deletedIds).
      const unlinkNow = !state.syncSettings.currentUser || !(client.baseVersion ?? client.version);
      set({
        clients: state.clients.filter((c) => c.id !== id),
        clientChanges: changes,
        clientDeletionQueue: [
          ...state.clientDeletionQueue.filter((c) => c.id !== id),
          { id, ownerId: state.syncSettings.currentUser?.id, baseVersion: client.baseVersion ?? client.version ?? 0 },
        ],
        activeClientId: state.activeClientId === id ? null : state.activeClientId,
        // The server unlinks its copies in the same transaction; local copies follow without touching printed data.
        projects: unlinkNow
          ? state.projects.map((p) => (p.clientId === id && !p.isDeleted ? { ...p, clientId: undefined, syncStatus: 'pending', updatedAt: now } : p))
          : state.projects,
      });
      sync();
      return true;
    },
    linkProposalToClient: (projectId, clientId) => {
      const state = get(), project = state.projects.find((p) => p.id === projectId), user = state.syncSettings.currentUser;
      if (!writable()) return { ok: false, error: 'Tu rol no permite enlazar propuestas.' };
      if (!project) return { ok: false, error: 'Propuesta no encontrada.' };
      if (project.isDeleted) return { ok: false, error: 'Las propuestas en papelera son de solo lectura.' };
      if (project.syncStatus === 'conflict') return { ok: false, error: 'Resuelve primero el conflicto de la propuesta.' };
      if (user && project.organizationId && !ownsProject(project, state.syncSettings.serverUrl, user.organizationId))
        return { ok: false, error: 'La propuesta pertenece a otro espacio de trabajo.' };
      if (clientId && !state.clients.some((c) => c.id === clientId)) return { ok: false, error: 'Cliente no encontrado.' };
      if ((project.clientId ?? null) === clientId) return { ok: true };
      set({
        projects: state.projects.map((p) =>
          p.id === projectId
            ? { ...p, clientId: clientId || undefined, syncStatus: 'pending', updatedAt: new Date().toISOString() }
            : p,
        ),
      });
      state.triggerAutoSync(false);
      return { ok: true };
    },
    resolveClientConflict: (id, resolution) => {
      const state = get(), change = state.clientChanges[id];
      if (!change?.serverClient || (change.ownerId && change.ownerId !== state.syncSettings.currentUser?.id)) return;
      // Discarding local work is always allowed to its owner; keeping it requires write access.
      if (resolution === 'keep_local' && !writable()) return;
      const changes = { ...state.clientChanges };
      if (resolution === 'accept_server') {
        delete changes[id];
        set({
          clients: [...state.clients.filter((c) => c.id !== id), change.serverClient],
          clientChanges: changes,
          clientSyncFeedback: null,
        });
      } else {
        changes[id] = {
          revision: crypto.randomUUID(),
          ownerId: change.ownerId,
          baseVersion: change.serverClient.baseVersion ?? change.serverClient.version ?? 0,
        };
        set({ clientChanges: changes, clientSyncFeedback: null });
        sync();
      }
    },
    syncClientsWithServer: () => {
      const initial = get(), generation = initial.sessionGeneration, user = initial.syncSettings.currentUser;
      if (running?.generation === generation) {
        running.rerun = true;
        return running.promise;
      }
      if (!user || !initial.syncSettings.authToken)
        return Promise.resolve({ success: false, message: 'Inicia sesión para sincronizar clientes.' });
      const current = () =>
        get().sessionGeneration === generation &&
        get().syncSettings.currentUser?.id === user.id &&
        get().syncSettings.serverUrl === initial.syncSettings.serverUrl;
      const transport = ClientSyncService.transport(initial.syncSettings.serverUrl, () => get().syncSettings.authToken || '');
      const promise = (async () => {
        try {
          const listed = await ClientSyncService.list(transport);
          if (!current()) return SESSION_CHANGED;
          const remote = new Map(listed.clients.map((c) => [c.id, c]));
          const deleted = new Set(listed.deletedIds);
          let failures = 0;
          const conflict = (id: string, serverClient: ClientRecord, baseVersion?: number) =>
            set((s) => ({
              clientChanges: {
                ...s.clientChanges,
                [id]: { ...(s.clientChanges[id] ?? { revision: crypto.randomUUID(), ownerId: user.id, baseVersion: baseVersion ?? 0 }), serverClient },
              },
            }));
          for (const command of [...get().clientDeletionQueue]) {
            if (!current()) return SESSION_CHANGED;
            if (command.ownerId && command.ownerId !== user.id) continue;
            const release = () => set((s) => ({ clientDeletionQueue: s.clientDeletionQueue.filter((c) => c.id !== command.id) }));
            if (deleted.has(command.id) || (!remote.has(command.id) && command.baseVersion === 0)) {
              release();
              continue;
            }
            const result = await ClientSyncService.remove(transport, command.id, command.baseVersion);
            if (!current()) return SESSION_CHANGED;
            if (result.ok || result.status === 404) {
              remote.delete(command.id);
              deleted.add(command.id);
              release();
              continue;
            }
            failures++;
            if (result.status === 409 && result.client) {
              // A stale deletion is never applied blindly: the server record returns for review.
              const serverClient = result.client;
              set((s) => ({
                clients: [...s.clients.filter((c) => c.id !== command.id), serverClient],
                clientDeletionQueue: s.clientDeletionQueue.filter((c) => c.id !== command.id),
              }));
              conflict(command.id, serverClient, command.baseVersion);
            }
          }
          for (const [id, change] of Object.entries(get().clientChanges)) {
            if (!current()) return SESSION_CHANGED;
            if (change.ownerId && change.ownerId !== user.id) continue;
            const local = get().clients.find((c) => c.id === id);
            if (!local || deleted.has(id)) continue;
            if (change.serverClient) {
              failures++;
              continue;
            }
            const serverClient = remote.get(id);
            if (serverClient && contentEqual(clientContent(serverClient), clientContent(local))) {
              // Recover a lost PUT receipt only from identical authoritative content.
              set((s) => {
                const changes = { ...s.clientChanges };
                if (changes[id]?.revision === change.revision) delete changes[id];
                return { clientChanges: changes };
              });
              continue;
            }
            if (serverClient && change.baseVersion === 0) {
              failures++;
              conflict(id, serverClient);
              continue;
            }
            const saved = await ClientSyncService.put(transport, local, change.baseVersion);
            if (!current()) return SESSION_CHANGED;
            if (!saved.ok) {
              failures++;
              if (saved.status === 409 && saved.client) conflict(id, saved.client);
              continue;
            }
            remote.set(id, saved.client);
            set((s) => {
              const changes = { ...s.clientChanges };
              const acknowledged = changes[id]?.revision === change.revision;
              if (acknowledged) delete changes[id];
              else if (changes[id]) changes[id] = { ...changes[id], baseVersion: saved.client.version ?? changes[id].baseVersion };
              return {
                // Store the receipt with the change it clears, so a later failure in this pass cannot orphan it.
                clients: s.clients.map((c) =>
                  c.id !== id ? c : acknowledged ? saved.client : { ...c, version: saved.client.version, baseVersion: saved.client.version },
                ),
                clientChanges: changes,
                clientDeletionQueue: s.clientDeletionQueue.map((c) => (c.id === id ? { ...c, baseVersion: saved.client.version ?? c.baseVersion } : c)),
              };
            });
          }
          if (!current()) return SESSION_CHANGED;
          set((s) => {
            const changes = Object.fromEntries(Object.entries(s.clientChanges).filter(([id]) => !deleted.has(id)));
            const pending = s.clients.filter((c) => changes[c.id]);
            const hidden = new Set(s.clientDeletionQueue.map((c) => c.id));
            const clients = [
              ...pending,
              ...[...remote.values()].filter((c) => !changes[c.id] && !hidden.has(c.id)),
            ];
            return {
              clients,
              clientChanges: changes,
              activeClientId: clients.some((c) => c.id === s.activeClientId) ? s.activeClientId : null,
              clientSyncFeedback:
                failures || Object.values(changes).some((c) => c.serverClient)
                  ? `${failures} cliente(s) pendientes: hay cambios o permisos distintos. Sincroniza y revisa.`
                  : null,
            };
          });
          unlinkDeleted(deleted);
          return { success: failures === 0, message: failures ? get().clientSyncFeedback! : 'Clientes sincronizados.' };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudieron sincronizar los clientes.';
          if (current()) set({ clientSyncFeedback: message });
          return { success: false, message };
        }
      })().finally(() => {
        if (running?.promise !== promise) return;
        const rerun = running.rerun;
        running = null;
        // Repeat only when local edits arrived during a successful pass; errors require review.
        if (rerun && current() && !get().clientSyncFeedback)
          queueMicrotask(() => {
            if (current()) void get().syncClientsWithServer();
          });
      });
      running = { generation, promise, rerun: false };
      return promise;
    },
  };
};
