import { projectDifferences } from '../sync/projectDifferences';
import { SimulationSlice, SyncAuthSlice } from '../types';
import { featureScope } from '../../../shared/applicationFeatures';
import { ownsProject, reconcilePulledProjects, acknowledgeProjectPush } from '../sync/projectReconciliation';
import { SyncService, registerTokenRenewedListener } from '../../services/syncService';
import { acknowledgeQueuedProjectDeletions, createProjectDeletion, ProjectDeletionCommand } from '../sync/projectDeletion';
import type { ProjectSimulation } from '../../types';

let autoSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;


export const createSyncAuthSlice: SimulationSlice<SyncAuthSlice> = (set, get) => {
  let sessionEpoch = 0;
  const captureSession = () => {
    const captured = get().syncSettings;
    const epoch = sessionEpoch;
    return { ...captured, isCurrent: () => {
      const current = get().syncSettings;
      return epoch === sessionEpoch && current.serverUrl === captured.serverUrl && current.currentUser?.id === captured.currentUser?.id && current.currentUser?.organizationId === captured.currentUser?.organizationId && !!current.authToken;
    } };
  };
  registerTokenRenewedListener((newToken, origin) => {
    const session = get().syncSettings;
    if (origin && origin.serverUrl === session.serverUrl.trim().replace(/\/+$/, '') && origin.token === session.authToken) set({ syncSettings: { ...session, authToken: newToken } });
  });

  return {
  sessionGeneration: 0,
  syncSettings: {
    serverUrl: 'https://solarsim.electsun.net',
    autoSyncEnabled: true,
    lastSyncTimestamp: null,
    authToken: null,
    currentUser: null,
  },
  projectDeletionQueue: [],
  queueProjectDeletion: (project) => {
    const { serverUrl, currentUser } = get().syncSettings;
    if (!currentUser || !ownsProject(project, serverUrl, currentUser.organizationId)) return;
    const scope = featureScope(serverUrl, currentUser.organizationId);
    set((state) => ({ projectDeletionQueue: [...state.projectDeletionQueue.filter((item) => item.scope !== scope || item.id !== project.id), createProjectDeletion(project, scope)] }));
  },
  isSyncing: false,
  syncFeedbackMessage: null,

  setSyncSettings: (settingsPartial) => {
    if (settingsPartial.serverUrl || settingsPartial.currentUser !== undefined || settingsPartial.authToken === null) sessionEpoch++;
    set((state) => ({ syncSettings: { ...state.syncSettings, ...settingsPartial }, sessionGeneration: sessionEpoch, isSyncing: false }));
    if (settingsPartial.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
  },

  loginUser: async (email, password) => {
    const { serverUrl } = get().syncSettings;
    const epoch = ++sessionEpoch;
    set({ sessionGeneration: epoch, isSyncing: false });
    const res = await SyncService.login(serverUrl, email, password);
    if (epoch !== sessionEpoch || serverUrl !== get().syncSettings.serverUrl) return { success: false, error: 'La sesión cambió mientras se iniciaba el acceso.' };
    if (res.success && res.token && res.user) {
      set((state) => ({
        syncSettings: {
          ...state.syncSettings,
          authToken: res.token!,
          currentUser: res.user!,
          lastSyncTimestamp: null,
        },
      }));
      void get().loadOrganizationFeaturePolicy();
      get().syncProjectsWithServer(false);
      return { success: true };
    }
    return { success: false, error: res.error || 'Error al iniciar sesión' };
  },

  registerUser: async (name, email, password, organizationName) => {
    const { serverUrl } = get().syncSettings;
    const epoch = ++sessionEpoch;
    set({ sessionGeneration: epoch, isSyncing: false });
    const res = await SyncService.register(serverUrl, { name, email, password, organizationName });
    if (epoch !== sessionEpoch || serverUrl !== get().syncSettings.serverUrl) return { success: false, error: 'La sesión cambió mientras se iniciaba el acceso.' };
    if (res.success && res.token && res.user) {
      set((state) => ({
        syncSettings: {
          ...state.syncSettings,
          authToken: res.token!,
          currentUser: res.user!,
          lastSyncTimestamp: null,
        },
      }));
      void get().loadOrganizationFeaturePolicy();
      get().syncProjectsWithServer(false);
      return { success: true };
    }
    return { success: false, error: res.error || 'Error al registrar usuario' };
  },

  logoutUser: () => {
    sessionEpoch++;
    set({ sessionGeneration: sessionEpoch, isSyncing: false, featurePolicyRequest: null, activeConflict: null });
    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = null;
    }
    set((state) => ({
      syncSettings: {
        ...state.syncSettings,
        authToken: null,
        currentUser: null,
      },
    }));
  },

  triggerAutoSync: (immediate = false) => {
    const { autoSyncEnabled, authToken } = get().syncSettings;
    if (!autoSyncEnabled || !authToken) return;

    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = null;
    }

    if (immediate) {
      get().syncProjectsWithServer(true);
    } else {
      autoSyncDebounceTimer = setTimeout(() => {
        get().syncProjectsWithServer(true);
      }, 1500);
    }
  },

  syncProjectsWithServer: async (silent = false) => {
    if (get().isSyncing) return { success: false, message: 'Ya hay una sincronización en curso.' };
    const session = captureSession();
    const { serverUrl, currentUser } = session;
    if (!session.authToken || !currentUser) return { success: false, message: 'Inicia sesión para sincronizar proyectos.' };
    const scope = featureScope(serverUrl, currentUser.organizationId);
    const canWrite = currentUser.role === 'ADMIN' || currentUser.role === 'EDITOR';
    const ensureCurrent = () => { if (!session.isCurrent()) throw new Error('La sesión cambió durante la sincronización.'); };
    const token = () => get().syncSettings.authToken!;
    set({ isSyncing: true, syncFeedbackMessage: silent ? null : 'Sincronizando…' });
    let conflicts = 0;
    let deletionErrors = 0;
    const releaseDeletion = (command: ProjectDeletionCommand) => set((state) => ({ projectDeletionQueue: state.projectDeletionQueue.filter((item) => item.scope !== command.scope || item.id !== command.id) }));
    const recoverDeletion = (command: ProjectDeletionCommand, server?: ProjectSimulation) => {
      conflicts++;
      const local = command.project;
      set((state) => ({
        projectDeletionQueue: state.projectDeletionQueue.filter((item) => item.scope !== command.scope || item.id !== command.id),
        projects: local ? [...state.projects.filter((project) => project.id !== command.id), { ...local, syncStatus: 'conflict' as const }] : state.projects,
        activeConflict: local && server ? {
          projectId: command.id, localVersion: command.baseVersion, serverVersion: server.version ?? 1,
          localProject: local, serverProject: server, lastModifiedByName: server.lastModifiedBy || 'Otro miembro',
          lastModifiedAt: server.updatedAt, diffs: projectDifferences(server, local),
        } : state.activeConflict,
      }));
    };
    try {
      const pull = await SyncService.pullProjects(serverUrl, token());
      ensureCurrent();
      if (!pull.success || !pull.projects) throw new Error(pull.error || 'No se pudieron descargar los proyectos.');
      set((state) => ({ projects: reconcilePulledProjects(state.projects, pull.projects!, pull.deletedIds || [], new Set(state.projectDeletionQueue.filter((item) => item.scope === scope).map((item) => item.id)), serverUrl, currentUser.organizationId) }));
      // Confirm trash through CAS before physical deletion, including documents created offline.
      // A failed command remains durable without preventing unrelated documents from syncing.
      if (canWrite) for (const captured of get().projectDeletionQueue.filter((item) => item.scope === scope)) {
        let command = captured;
        if ((pull.deletedIds || []).includes(command.id)) { releaseDeletion(command); continue; }
        const server = pull.projects.find((project) => project.id === command.id);
        if (!command.project) {
          if (!server) { deletionErrors++; continue; }
          command = { ...command, project: { ...server, isDeleted: true, baseVersion: command.baseVersion, syncStatus: 'pending' }, stage: server.isDeleted ? 'delete' : 'trash' };
          set((state) => ({ projectDeletionQueue: state.projectDeletionQueue.map((item) => item === captured ? command : item) }));
        }
        if (server && server.version !== command.baseVersion) { recoverDeletion(command, server); continue; }
        if (command.stage !== 'delete') {
          const sentDeletion = { ...command.project!, baseVersion: command.baseVersion, isDeleted: true, syncStatus: 'pending' as const };
          const pushed = await SyncService.pushProjects(serverUrl, token(), [sentDeletion]);
          ensureCurrent();
          const outcome = pushed.results?.find((result) => (result.originalId || result.id) === command.id);
          if (!pushed.success || !outcome) { deletionErrors++; continue; }
          if (outcome.status === 'conflict') {
            if (outcome.reason === 'deleted') releaseDeletion(command);
            else recoverDeletion(command, outcome.serverProject);
            continue;
          }
          set((state) => ({ projectDeletionQueue: acknowledgeQueuedProjectDeletions(state.projectDeletionQueue, [outcome], scope, [sentDeletion]) }));
          const acknowledged = get().projectDeletionQueue.find((item) => item.scope === scope && item.id === outcome.id);
          if (!acknowledged) continue;
          command = acknowledged;
        }
        const success = await SyncService.deleteProject(serverUrl, token(), command.id, true, command.baseVersion);
        ensureCurrent();
        if (success) { releaseDeletion(command); continue; }
        // DELETE may race a teammate or lose its response; re-read before deciding.
        const latest = await SyncService.pullProjects(serverUrl, token());
        ensureCurrent();
        if (latest.success && latest.deletedIds?.includes(command.id)) { releaseDeletion(command); continue; }
        const changed = latest.projects?.find((project) => project.id === command.id);
        if (changed && (changed.version !== command.baseVersion || !changed.isDeleted)) recoverDeletion(command, changed);
        else deletionErrors++;
      }
      const sent = canWrite ? get().projects.filter((project) => project.syncStatus === 'pending' && ownsProject(project, serverUrl, currentUser.organizationId)) : [];
      if (sent.length) {
        const push = await SyncService.pushProjects(serverUrl, token(), sent);
        ensureCurrent();
        if (!push.success || !push.results) throw new Error(push.error || 'No se pudo confirmar el envío de proyectos.');
        set((state) => {
          const reconciled = acknowledgeProjectPush(state.projects, sent, push.results!, serverUrl, currentUser.organizationId);
          conflicts += reconciled.conflicts.length;
          const first = reconciled.conflicts.find((conflict) => conflict.result.serverProject);
          const activeConflict = first ? {
            projectId: first.local.id, localVersion: first.local.version ?? 1, serverVersion: first.result.serverVersion,
            localProject: first.local, serverProject: first.result.serverProject!,
            lastModifiedByName: first.result.lastModifiedByName || 'Otro miembro', lastModifiedAt: first.result.lastModifiedAt || '', diffs: projectDifferences(first.result.serverProject!, first.local),
          } : state.activeConflict;
          const snapshotsByProject = { ...state.snapshotsByProject };
          for (const [oldId, newId] of Object.entries(reconciled.idChanges)) {
            if (oldId !== newId && snapshotsByProject[oldId]) {
              snapshotsByProject[newId] = snapshotsByProject[oldId].map((snapshot) => ({ ...snapshot, projectId: newId, data: { ...snapshot.data, id: newId } }));
              delete snapshotsByProject[oldId];
            }
          }
          return { projects: reconciled.projects, projectDeletionQueue: acknowledgeQueuedProjectDeletions(state.projectDeletionQueue, push.results!, scope, sent), activeProjectId: reconciled.idChanges[state.activeProjectId] || state.activeProjectId, activeConflict, snapshotsByProject };
        });
        if (push.results.length !== sent.length) throw new Error('El servidor no confirmó todos los documentos enviados.');
      }
      const equipment = await get().syncEquipmentWithServer();
      ensureCurrent();
      if (!equipment.success) throw new Error(`Proyectos procesados; catálogo pendiente: ${equipment.message}`);
      const message = deletionErrors ? `${deletionErrors} eliminación(es) pendientes de confirmar; otros proyectos procesados.` : conflicts ? `${conflicts} proyecto(s) requieren resolver conflictos.` : 'Sincronización completada.';
      set((state) => ({ isSyncing: false, syncFeedbackMessage: silent ? null : message, syncSettings: { ...state.syncSettings, lastSyncTimestamp: deletionErrors ? state.syncSettings.lastSyncTimestamp : pull.serverTimestamp || state.syncSettings.lastSyncTimestamp } }));
      if (get().projects.some((project) => project.syncStatus === 'pending' && ownsProject(project, serverUrl, currentUser.organizationId)) || (!deletionErrors && get().projectDeletionQueue.some((command) => command.scope === scope))) get().triggerAutoSync();
      return { success: conflicts === 0 && deletionErrors === 0, message };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo sincronizar.';
      if (session.isCurrent()) set({ isSyncing: false, syncFeedbackMessage: message });
      return { success: false, message };
    }
  },

  validateSession: async () => {
    const session = captureSession();
    const { serverUrl, authToken } = session;
    if (!authToken) {
      return { valid: false, error: 'No hay token de sesión configurado' };
    }

    // 1. Intentar validar con /api/auth/me (aprovecha auto-renovación silenciosa)
    const freshUser = await SyncService.getMe(serverUrl, authToken);
    if (!session.isCurrent()) return { valid: false, error: 'La sesión cambió durante la verificación.' };
    if (freshUser) {
      set((state) => ({
        syncSettings: {
          ...state.syncSettings,
          currentUser: freshUser,
        },
      }));
      return { valid: true, user: freshUser };
    }

    // 2. Si getMe falló (ej. expiración o formato), intentar refresh explícito
    const refreshRes = await SyncService.refreshToken(serverUrl, authToken);
    if (!session.isCurrent()) return { valid: false, error: 'La sesión cambió durante la renovación.' };
    if (refreshRes.success && refreshRes.token && refreshRes.user) {
      set((state) => ({
        syncSettings: {
          ...state.syncSettings,
          authToken: refreshRes.token!,
          currentUser: refreshRes.user!,
        },
      }));
      return { valid: true, user: refreshRes.user };
    }

    return { valid: false, error: refreshRes.error || 'La sesión ha expirado en el servidor' };
  },
};
};
