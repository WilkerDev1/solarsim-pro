import { SimulationSlice, SyncAuthSlice } from '../types';
import { ProjectSimulation } from '../../types';
import { SyncService } from '../../services/syncService';

let autoSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export const createSyncAuthSlice: SimulationSlice<SyncAuthSlice> = (set, get) => ({
  syncSettings: {
    serverUrl: 'https://solarsim.electsun.net',
    autoSyncEnabled: true,
    lastSyncTimestamp: null,
    authToken: null,
    currentUser: null,
  },
  isSyncing: false,
  syncFeedbackMessage: null,

  setSyncSettings: (settingsPartial) => {
    set((state) => ({ syncSettings: { ...state.syncSettings, ...settingsPartial } }));
    if (settingsPartial.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
  },

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
      get().syncProjectsWithServer(false);
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
      get().syncProjectsWithServer(false);
      return { success: true };
    }
    return { success: false, error: res.error || 'Error al registrar usuario' };
  },

  logoutUser: () => {
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
    const { serverUrl, authToken, lastSyncTimestamp } = get().syncSettings;
    if (!authToken) {
      return { success: false, message: 'Inicia sesión para sincronizar proyectos con la nube' };
    }

    if (!silent) {
      set({ isSyncing: true, syncFeedbackMessage: 'Sincronizando con el servidor...' });
    } else {
      set({ isSyncing: true });
    }

    try {
      // 1. Pull: Descargar propuestas autoritativas de toda la organización (Servidor como Fuente de Verdad)
      const pullRes = await SyncService.pullProjects(serverUrl, authToken);
      let currentProjects = [...get().projects];

      if (pullRes.success && pullRes.projects) {
        const serverProjectsMap = new Map(pullRes.projects.map((p) => [p.id, p]));

        // Actualizar o preservar propuestas locales
        currentProjects = currentProjects
          .map((local) => {
            if (serverProjectsMap.has(local.id)) {
              const serverVersion = serverProjectsMap.get(local.id)!;
              serverProjectsMap.delete(local.id);

              // Si el proyecto local tiene cambios pendientes (ej. pendiente de borrar), se conserva
              if (local.syncStatus === 'pending') {
                return local;
              }
              // De lo contrario, adopta la versión autoritativa del servidor preservando la carpeta local
              return {
                ...serverVersion,
                folderId: local.folderId !== undefined ? local.folderId : serverVersion.folderId,
                syncStatus: 'synced' as const,
              };
            }

            // Si el proyecto estaba 'synced' localmente pero el servidor ya NO lo tiene
            // (por ejemplo por pertenecer a otra organización, sesión o sincronización parcial),
            // NUNCA eliminarlo automáticamente del dispositivo local: se preserva intacto
            // cambiándolo a 'local_only' para blindar el trabajo del usuario contra pérdidas.
            if (local.syncStatus === 'synced' && !local.isDeleted) {
              return { ...local, syncStatus: 'local_only' as const };
            }

            return local;
          });

        // Incorporar propuestas nuevas creadas por otros compañeros de la empresa
        for (const newServerProj of serverProjectsMap.values()) {
          // Si el ID ya existiera de forma duplicada por algún motivo, forzar ID único
          if (!currentProjects.some((p) => p.id === newServerProj.id)) {
            currentProjects.unshift({ ...newServerProj, syncStatus: 'synced' as const });
          }
        }
      }

      // 2. Push: Subir cambios locales pendientes hacia el servidor
      const pendingProjects = currentProjects.filter((p) => p.syncStatus !== 'synced');
      const pushedSnapshots = new Map(pendingProjects.map((p) => [p.id, p.updatedAt]));

      if (pendingProjects.length > 0) {
        const pushRes = await SyncService.pushProjects(serverUrl, authToken, pendingProjects);
        if (pushRes.success) {
          const resultsMap = new Map((pushRes.results || []).map((r) => [r.originalId || r.id, r]));

          currentProjects = currentProjects.map((p) => {
            if (resultsMap.has(p.id)) {
              const resInfo = resultsMap.get(p.id)!;
              return {
                ...p,
                id: resInfo.id || p.id,
                version: resInfo.version || p.version || 1,
                syncStatus: 'synced' as const,
              };
            }
            return p;
          });
        }
      }

      // Filtrar proyectos en papelera con más de 30 días de antigüedad (retención cumplida)
      const CUTOFF_30_DAYS = 30 * 24 * 60 * 60 * 1000;
      const isExpiredTrash = (p: ProjectSimulation) => {
        if (!p.isDeleted) return false;
        const t = p.deletedAt ? new Date(p.deletedAt).getTime() : (p.updatedAt ? new Date(p.updatedAt).getTime() : 0);
        return Date.now() - t > CUTOFF_30_DAYS;
      };
      currentProjects = currentProjects.filter((p) => !isExpiredTrash(p));

      // 3. Sincronizar catálogo de equipos bidireccionalmente con la nube
      try {
        await get().syncEquipmentWithServer();
      } catch (eqErr) {
        console.warn('Auto-sync equipment warning:', eqErr);
      }

      const newTimestamp = pullRes.serverTimestamp || new Date().toISOString();
      let hasPendingRemaining = false;

      set((state) => {
        // Combinar de manera segura con el estado fresco de Zustand:
        // - Si un proyecto fue editado localmente mientras el push estaba en vuelo (freshLocal.updatedAt !== pushedUpdatedAt),
        //   se preserva la versión fresca local con status 'pending' para que se suba en el próximo ciclo.
        // - Si no hubo ediciones concurrentes, se aplica la versión confirmada con syncStatus: 'synced'.
        const syncedMap = new Map(currentProjects.map((p) => [p.id, p]));
        const mergedProjects: ProjectSimulation[] = [];

        for (const syncedP of currentProjects) {
          const freshLocal = state.projects.find((p) => p.id === syncedP.id);
          if (freshLocal) {
            const pushedUpdatedAt = pushedSnapshots.get(syncedP.id);
            const wasModifiedConcurrently =
              pushedUpdatedAt !== undefined &&
              freshLocal.updatedAt !== undefined &&
              freshLocal.updatedAt !== pushedUpdatedAt;

            if (wasModifiedConcurrently) {
              // Edición local concurrente en vuelo (ej. adjuntos de PDF mientras sincronizaba):
              // Conservar versión local fresca con 'pending'
              hasPendingRemaining = true;
              mergedProjects.push(freshLocal);
            } else {
              // El push confirmó esta versión con éxito: marcar 'synced'
              mergedProjects.push({
                ...freshLocal,
                id: syncedP.id,
                version: syncedP.version || freshLocal.version || 1,
                syncStatus: syncedP.syncStatus,
              });
            }
          } else {
            mergedProjects.push(syncedP);
          }
        }

        // Preservar proyectos recién creados localmente durante el sync (que no estaban en currentProjects)
        for (const localP of state.projects) {
          if (isExpiredTrash(localP)) {
            continue;
          }
          if (!syncedMap.has(localP.id)) {
            mergedProjects.push(localP);
            if (localP.syncStatus !== 'synced') {
              hasPendingRemaining = true;
            }
          }
        }

        return {
          projects: mergedProjects,
          isSyncing: false,
          syncFeedbackMessage: silent ? null : '¡Proyectos sincronizados con éxito! ✨',
          syncSettings: {
            ...state.syncSettings,
            lastSyncTimestamp: newTimestamp,
          },
        };
      });

      // Si quedaron cambios pendientes generados durante el sync, programar push inmediato
      if (hasPendingRemaining) {
        get().triggerAutoSync(false);
      }

      if (!silent) {
        setTimeout(() => set({ syncFeedbackMessage: null }), 3000);
      }

      return { success: true, message: 'Sincronización completada exitosamente' };
    } catch (err: any) {
      set({ isSyncing: false, syncFeedbackMessage: null });
      return { success: false, message: err.message || 'Error durante la sincronización' };
    }
  },
});
