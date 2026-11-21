import { createAgentSlice } from './slices/agentSlice';
import { hydrateSimulationStore } from './persistence/hydrateSimulationStore';
import { serializeSimulationStore } from './persistence/serializeSimulationStore';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDeferredJSONStorage } from './persistence/deferredStorage';
import { createPersistedDocumentAssets } from './persistence/persistedDocumentAssets';
import { SimulationStore, SimulationState, NewProjectPayload } from './types';
import { createProjectSlice } from './slices/projectSlice';
import { createEquipmentSlice } from './slices/equipmentSlice';
import { createSyncAuthSlice } from './slices/syncAuthSlice';
import { createImportExportSlice } from './slices/importExportSlice';
import { createAISlice } from './slices/aiSlice';
import { createUISlice } from './slices/uiSlice';
import { createFolderSlice } from './slices/folderSlice';
import { createClientSlice } from './slices/clientSlice';
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

const memoryStorage = (() => {
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
})();
// Document images are persisted once in a side key and expanded on hydrate (persistence/persistedDocumentAssets.ts).
const documentAssets = createPersistedDocumentAssets();
// window.localStorage in the renderer; the test environment provides an in-memory globalThis.localStorage.
const persistStorage = createDeferredJSONStorage<ReturnType<typeof serializeSimulationStore>>(
  () => globalThis.localStorage ?? memoryStorage,
  400,
  documentAssets
);
// Images whose hash arrived after being written inline (including data saved before this format) are collapsed.
documentAssets.setOnLearned(() => {
  const { name, version, partialize } = useSimulationStore.persist.getOptions();
  if (name && partialize) persistStorage.rewrite(name, { state: partialize(useSimulationStore.getState()), version: version ?? 0 });
});
/** Resolves once pending image hashes are known (tests and diagnostics). */
export const settleSimulationStoreAssets = () => documentAssets.settled();

/** Writes the pending persisted state now; the window flushes it on its own before closing. */
export const flushSimulationStorePersistence = () => persistStorage.flush();
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSimulationStorePersistence);
  window.addEventListener('beforeunload', flushSimulationStorePersistence);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSimulationStorePersistence();
  });
}

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
      ...createClientSlice(...a),
      ...createTariffSlice(...a),
      ...createCompanyProfileSlice(...a),
      ...createVersionHistorySlice(...a),
      ...createNotificationSlice(...a),
      ...createFeatureSettingsSlice(...a),
      ...createAgentSlice(...a),
    }),

    {
      name: typeof window !== 'undefined' && window.location?.pathname.startsWith('/scripts/qa/fixtures/') ? 'solarsim-qa-fixture-storage' : 'solarsim-pro-storage',
      storage: persistStorage,
      onRehydrateStorage: () => hydrateSimulationStore,

      partialize: serializeSimulationStore,
    }
  )
);
