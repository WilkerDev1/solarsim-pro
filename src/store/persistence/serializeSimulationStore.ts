import type { SimulationStore } from '../types';

/** Only durable domain data belongs in storage, never pending requests or feedback. */
export function serializeSimulationStore(state: SimulationStore) {
  return {
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    activeView: state.activeView,
    sidebarTheme: state.sidebarTheme,
    sidebarWidth: state.sidebarWidth,
    dashboardViewMode: state.dashboardViewMode,
    localFeatureSettings: state.localFeatureSettings,
    organizationFeaturePolicies: state.organizationFeaturePolicies,
    geminiApiKey: state.geminiApiKey,
    geminiModel: state.geminiModel,
    syncSettings: state.syncSettings,
    equipmentCatalog: state.equipmentCatalog,
    deletedEquipmentIds: state.deletedEquipmentIds,
    equipmentChanges: state.equipmentChanges,
    equipmentDeletionQueue: state.equipmentDeletionQueue,
    equipmentConflicts: state.equipmentConflicts,
    folders: state.folders,
    tariffMatrix: state.tariffMatrix,
    defaultSimulationSettings: state.defaultSimulationSettings,
    defaultDocumentCustomization: state.defaultDocumentCustomization,
    companies: state.companies,
    activeCompanyId: state.activeCompanyId,
    localUserProfile: state.localUserProfile,
    snapshotsByProject: state.snapshotsByProject,
    projectDeletionQueue: state.projectDeletionQueue,
    projectConflicts: state.projectConflicts,
  };
}
