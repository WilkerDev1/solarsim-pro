import { SimulationSlice, SyncAuthSlice } from '../types';
import { SyncService } from '../../services/syncService';

export const createSyncAuthSlice: SimulationSlice<SyncAuthSlice> = (set, get) => ({
  syncSettings: {
    serverUrl: 'http://10.0.0.103',
    autoSyncEnabled: true,
    lastSyncTimestamp: null,
    authToken: null,
    currentUser: null,
  },
  isSyncing: false,
  syncFeedbackMessage: null,

  setSyncSettings: (settingsPartial) =>
    set((state) => ({ syncSettings: { ...state.syncSettings, ...settingsPartial } })),

  loginUser: async (email, password) => {
    const { serverUrl } = get().syncSettings;
    const res = await SyncService.login(serverUrl, email, password);
    if (res.success && res.token && res.user) {
      set((state) => ({
        syncSettings: {
          ...state.syncSettings,
          authToken: res.token!,
          currentUser: res.user!,
        },
      }));
      get().syncProjectsWithServer();
      return { success: true };
    }
    return { success: false, error: res.error || 'Error al iniciar sesión' };
  },

  registerUser: async (name, email, password, organizationName) => {
    const { serverUrl } = get().syncSettings;
    const res = await SyncService.register(serverUrl, { name, email, password, organizationName });
    if (res.success && res.token && res.user) {
      set((state) => ({
        syncSettings: {
          ...state.syncSettings,
          authToken: res.token!,
          currentUser: res.user!,
        },
      }));
      get().syncProjectsWithServer();
      return { success: true };
    }
    return { success: false, error: res.error || 'Error al registrar usuario' };
  },

  logoutUser: () => {
    set((state) => ({
      syncSettings: {
        ...state.syncSettings,
        authToken: null,
        currentUser: null,
      },
    }));
  },

  syncProjectsWithServer: async () => {
    const { serverUrl, authToken, lastSyncTimestamp } = get().syncSettings;
    if (!authToken) {
      return { success: false, message: 'Inicia sesión para sincronizar proyectos con la nube' };
    }

    set({ isSyncing: true, syncFeedbackMessage: 'Sincronizando con el servidor...' });

    try {
      // 1. Pull server changes
      const pullRes = await SyncService.pullProjects(serverUrl, authToken, lastSyncTimestamp);
      let currentProjects = [...get().projects];

      if (pullRes.success && pullRes.projects && pullRes.projects.length > 0) {
        const serverProjectsMap = new Map(pullRes.projects.map((p) => [p.id, p]));
        currentProjects = currentProjects.map((local) => {
          if (serverProjectsMap.has(local.id)) {
            const serverVersion = serverProjectsMap.get(local.id)!;
            serverProjectsMap.delete(local.id);
            return { ...serverVersion, syncStatus: 'synced' as const };
          }
          return local;
        });
        for (const newServerProj of serverProjectsMap.values()) {
          currentProjects.unshift({ ...newServerProj, syncStatus: 'synced' as const });
        }
      }

      // 2. Push local pending / modified projects
      const pendingProjects = currentProjects.filter((p) => p.syncStatus !== 'synced');
      if (pendingProjects.length > 0) {
        const pushRes = await SyncService.pushProjects(serverUrl, authToken, pendingProjects);
        if (pushRes.success) {
          currentProjects = currentProjects.map((p) => ({
            ...p,
            syncStatus: 'synced' as const,
          }));
        }
      }

      const newTimestamp = pullRes.serverTimestamp || new Date().toISOString();
      set((state) => ({
        projects: currentProjects,
        isSyncing: false,
        syncFeedbackMessage: '¡Proyectos sincronizados con éxito!',
        syncSettings: {
          ...state.syncSettings,
          lastSyncTimestamp: newTimestamp,
        },
      }));

      setTimeout(() => set({ syncFeedbackMessage: null }), 4000);
      return { success: true, message: 'Sincronización completada exitosamente' };
    } catch (err: any) {
      set({ isSyncing: false, syncFeedbackMessage: null });
      return { success: false, message: err.message || 'Error durante la sincronización' };
    }
  },
});
