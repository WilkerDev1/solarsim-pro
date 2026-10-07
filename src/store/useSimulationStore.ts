import { hydrateSimulationStore } from './persistence/hydrateSimulationStore';
import { serializeSimulationStore } from './persistence/serializeSimulationStore';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SimulationStore, SimulationState, NewProjectPayload } from './types';
import { createProjectSlice } from './slices/projectSlice';
import { createEquipmentSlice } from './slices/equipmentSlice';
import { createSyncAuthSlice } from './slices/syncAuthSlice';
import { createImportExportSlice } from './slices/importExportSlice';
import { createAISlice } from './slices/aiSlice';
import { createUISlice } from './slices/uiSlice';
import { createFolderSlice } from './slices/folderSlice';
import { createTariffSlice } from './slices/tariffSlice';
import { createCompanyProfileSlice } from './slices/companyProfileSlice';
import { createVersionHistorySlice } from './slices/versionHistorySlice';
import { createFeatureSettingsSlice } from './slices/featureSettingsSlice';
import { createNotificationSlice } from './slices/notificationSlice';

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
      ...createTariffSlice(...a),
      ...createCompanyProfileSlice(...a),
      ...createVersionHistorySlice(...a),
      ...createNotificationSlice(...a),
      ...createFeatureSettingsSlice(...a),
    }),

    {
      name: typeof window !== 'undefined' && window.location?.pathname.startsWith('/scripts/qa/fixtures/') ? 'solarsim-qa-fixture-storage' : 'solarsim-pro-storage',
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
      onRehydrateStorage: () => hydrateSimulationStore,

      partialize: serializeSimulationStore,
    }
  )
);
