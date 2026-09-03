import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SimulationStore, SimulationState, NewProjectPayload } from './types';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { createProjectSlice } from './slices/projectSlice';
import { createEquipmentSlice } from './slices/equipmentSlice';
import { createSyncAuthSlice } from './slices/syncAuthSlice';
import { createImportExportSlice } from './slices/importExportSlice';
import { createAISlice } from './slices/aiSlice';
import { createUISlice } from './slices/uiSlice';
import { createFolderSlice } from './slices/folderSlice';

// Re-export helper types and generators for backward compatibility
export type { SimulationStore, SimulationState, NewProjectPayload };
export {
  INITIAL_PROJECTS,
  generateNextProjectSequence,
  generateDuplicateProjectIdentifiers,
  findDuplicateProjectInfo,
} from './initialData';

export const useSimulationStore = create<SimulationStore>()(
  persist(
    (...a) => ({
      ...createProjectSlice(...a),
      ...createEquipmentSlice(...a),
      ...createSyncAuthSlice(...a),
      ...createImportExportSlice(...a),
      ...createAISlice(...a),
      ...createUISlice(...a),
      ...createFolderSlice(...a),
    }),
    {
      name: 'solarsim-pro-storage',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage;
        }
        const memStore: Record<string, string> = {};
        return {
          getItem: (key: string) => memStore[key] ?? null,
          setItem: (key: string, value: string) => {
            memStore[key] = value;
          },
          removeItem: (key: string) => {
            delete memStore[key];
          },
        };
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.projects && Array.isArray(state.projects)) {
          // Remove legacy hardcoded mock projects and already synced deleted projects
          const mockProjectIds = new Set(['benchmark-centro-medico', 'proj-logistics-hub', 'proj-residential-42']);
          state.projects = state.projects.filter((p) => !mockProjectIds.has(p.id) && !(p.isDeleted && p.syncStatus === 'synced'));

          // Clean legacy projects that had '(Copia)' embedded in client.name
          let hasChanges = false;
          const cleaned = state.projects.map((p) => {
            let updated = p;
            if (p.client?.name && /\((?:Copia|Copia Importada|COPIA)\)/i.test(p.client.name)) {
              hasChanges = true;
              const clean = p.client.name.replace(/\s*\((?:Copia|Copia Importada|COPIA)\)\s*/gi, '').trim();
              const baseProjId = (p.client.projectId || 'SP-2026-001').replace(/-(?:V|C)\d+$/i, '');
              const newProjId = p.client.projectId && (p.client.projectId.includes('-V') || p.client.projectId.includes('-C'))
                ? p.client.projectId
                : `${baseProjId}-V2`;
              updated = {
                ...updated,
                client: {
                  ...updated.client,
                  name: clean,
                  projectId: newProjId,
                },
              };
            }
            if (updated.specs?.installationServicesDesc && updated.specs.installationServicesDesc.includes('Notas del Sistema:')) {
              hasChanges = true;
              const cleanDesc = updated.specs.installationServicesDesc.split('Notas del Sistema:')[0].trim().replace(/\.\s*$/, '') + '.';
              updated = {
                ...updated,
                specs: {
                  ...updated.specs,
                  installationServicesDesc: cleanDesc,
                },
              };
            }
            return updated;
          });
          if (hasChanges) {
            state.projects = cleaned;
          }
          const activeProjects = state.projects.filter((p) => !p.isDeleted);
          if (activeProjects.length > 0 && (!state.activeProjectId || !activeProjects.some((p) => p.id === state.activeProjectId))) {
            state.activeProjectId = activeProjects[0].id;
          }
        }
        if (state) {
          if (!state.equipmentCatalog || !Array.isArray(state.equipmentCatalog) || state.equipmentCatalog.length === 0) {
            state.equipmentCatalog = DEFAULT_EQUIPMENT_CATALOG;
          } else {
            const legacyDefaultIdsToRemove = new Set([
              'eq-mod-ja-550', 'eq-mod-ja-545', 'eq-mod-ja-570', 'eq-mod-jinko-575', 'eq-mod-trina-580', 'eq-mod-longi-585',
              'eq-inv-solis-5k', 'eq-inv-solis-6k', 'eq-inv-solis-10k-3p', 'eq-inv-deye-8k-us', 'eq-inv-deye-12k-3p',
              'eq-inv-growatt-6k', 'eq-inv-growatt-10k', 'eq-inv-sungrow-50k', 'eq-inv-huawei-10k',
              'eq-bat-hinaess-14k', 'eq-bat-hinaess-5k', 'eq-bat-dyness-10k', 'eq-bat-felicity-10k', 'eq-bat-felicity-5k',
              'eq-bat-pylontech-5k', 'eq-bat-pylontech-3.5k', 'eq-bat-deye-5k', 'eq-bat-deye-6k', 'eq-bat-byd-4k', 'eq-bat-huawei-5k',
            ]);
            state.equipmentCatalog = state.equipmentCatalog.filter((e) => !legacyDefaultIdsToRemove.has(e.id));
            DEFAULT_EQUIPMENT_CATALOG.forEach((def) => {
              if (!state.equipmentCatalog.some((e) => e.id === def.id || e.displayName === def.displayName)) {
                state.equipmentCatalog.push(def);
              }
            });
          }
          // Clean legacy mock test folders
          if (state.folders && Array.isArray(state.folders)) {
            const mockFolderIds = new Set(['folder-commercial', 'folder-electsun', 'folder-solarta']);
            state.folders = state.folders.filter((f) => !mockFolderIds.has(f.id));
          }

          // Auto-migrate legacy serverUrl to official Cloudflare domain
          if (state.syncSettings && (state.syncSettings.serverUrl === 'http://10.0.0.103' || state.syncSettings.serverUrl === 'https://api.electsun.com' || !state.syncSettings.serverUrl)) {
            state.syncSettings.serverUrl = 'https://solarsim.electsun.net';
          }
        }
      },
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        activeView: state.activeView,
        searchQuery: state.searchQuery,
        sidebarTheme: state.sidebarTheme,
        sidebarWidth: state.sidebarWidth,
        geminiApiKey: state.geminiApiKey,
        geminiModel: state.geminiModel,
        syncSettings: state.syncSettings,
        equipmentCatalog: state.equipmentCatalog,
        folders: state.folders,
      }),
    }
  )
);
