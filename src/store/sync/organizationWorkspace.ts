import { REFERENCE_EQUIPMENT_IDS } from "../../../shared/referenceEquipment";
import type { SimulationStore } from "../types";
import type { SyncSettings } from "../../types";
import { featureScope } from "../../../shared/applicationFeatures";
import { DEFAULT_EQUIPMENT_CATALOG } from "../../data/defaultEquipmentCatalog";
import { DEFAULT_RD_TARIFF_MATRIX } from "../../data/rdTariffs";
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from "../../constants/defaultDocumentCustomization";
import {
  DEFAULT_LOCAL_COMPANY,
  DEFAULT_LOCAL_USER,
} from "../../types/companyProfile";
import { DEFAULT_SIMULATION_SETTINGS } from "../defaultSimulationSettings";

const keys = [
  "projects",
  "activeProjectId",
  "folders",
  "equipmentCatalog",
  "deletedEquipmentIds",
  "equipmentChanges",
  "equipmentDeletionQueue",
  "equipmentConflicts",
  "snapshotsByProject",
  "projectDeletionQueue",
  "projectConflicts",
  "tariffMatrix",
  "defaultSimulationSettings",
  "defaultDocumentCustomization",
  "companies",
  "activeCompanyId",
  "localUserProfile",
] as const;
export type OrganizationWorkspace = Pick<
  SimulationStore,
  (typeof keys)[number]
>;
export const workspaceScope = (session: SyncSettings): string =>
  session.currentUser && session.authToken
    ? featureScope(session.serverUrl, session.currentUser.organizationId)
    : "local";
export function captureWorkspace(
  state: SimulationStore,
): OrganizationWorkspace {
  return Object.fromEntries(
    keys.map((key) => [key, state[key]]),
  ) as OrganizationWorkspace;
}
export function emptyWorkspace(): OrganizationWorkspace {
  return structuredClone({
    projects: [],
    activeProjectId: "",
    folders: [],
    equipmentCatalog: DEFAULT_EQUIPMENT_CATALOG,
    deletedEquipmentIds: [],
    equipmentChanges: {},
    equipmentDeletionQueue: [],
    equipmentConflicts: {},
    snapshotsByProject: {},
    projectDeletionQueue: [],
    projectConflicts: {},
    tariffMatrix: DEFAULT_RD_TARIFF_MATRIX,
    defaultSimulationSettings: DEFAULT_SIMULATION_SETTINGS,
    defaultDocumentCustomization: DEFAULT_DOCUMENT_CUSTOMIZATION,
    companies: [DEFAULT_LOCAL_COMPANY],
    activeCompanyId: DEFAULT_LOCAL_COMPANY.id,
    localUserProfile: DEFAULT_LOCAL_USER,
  });
}
/** One-time partition of legacy mixed project caches. No document is reassigned. */
export function initializeWorkspaces(state: SimulationStore): void {
  if (state.workspaceScope) return;
  const scope = workspaceScope(state.syncSettings);
  const current = captureWorkspace(state);
  const archives = { ...state.organizationWorkspaces };
  const projectScope = (project: OrganizationWorkspace["projects"][number]) =>
    project.organizationId
      ? featureScope(
          project.syncServerUrl || state.syncSettings.serverUrl,
          project.organizationId,
        )
      : "local";
  const projectScopes = new Map(
    current.projects.map((project) => [project.id, projectScope(project)]),
  );
  const targets = new Map<string, OrganizationWorkspace>([
    [
      scope,
      {
        ...current,
        projects: [],
        snapshotsByProject: {},
        projectDeletionQueue: [],
        projectConflicts: {},
        folders: [],
        equipmentCatalog: [],
        equipmentChanges: {},
        equipmentDeletionQueue: [],
        equipmentConflicts: {},
        deletedEquipmentIds: [],
      },
    ],
  ]);
  const target = (key: string) => {
    if (!targets.has(key))
      targets.set(
        key,
        archives[key] ? structuredClone(archives[key]) : emptyWorkspace(),
      );
    return targets.get(key)!;
  };
  for (const project of current.projects) {
    const workspace = target(projectScope(project));
    workspace.projects = [
      ...workspace.projects.filter((p) => p.id !== project.id),
      project,
    ];
  }
  for (const [id, snapshots] of Object.entries(current.snapshotsByProject)) {
    const key =
      projectScopes.get(id) ||
      (snapshots[0]?.data ? projectScope(snapshots[0].data) : scope);
    const workspace = target(key);
    workspace.snapshotsByProject = {
      ...workspace.snapshotsByProject,
      [id]: snapshots,
    };
  }
  for (const command of current.projectDeletionQueue) {
    const workspace = target(
      command.scope ||
        (command.project ? projectScope(command.project) : scope),
    );
    workspace.projectDeletionQueue = [
      ...workspace.projectDeletionQueue.filter((c) => c.id !== command.id),
      command,
    ];
  }
  for (const [id, conflict] of Object.entries(current.projectConflicts)) {
    const workspace = target(
      conflict.scope || projectScope(conflict.localProject),
    );
    workspace.projectConflicts = {
      ...workspace.projectConflicts,
      [id]: conflict,
    };
  }
  for (const folder of current.folders) {
    const usedIn = new Set(
      [
        ...current.projects,
        ...Object.values(current.snapshotsByProject)
          .flat()
          .map((snapshot) => snapshot.data),
        ...current.projectDeletionQueue.flatMap((command) =>
          command.project ? [command.project] : [],
        ),
      ]
        .filter((project) => project.folderId === folder.id)
        .map(projectScope),
    );
    if (!usedIn.size) usedIn.add(scope); // Unassigned legacy folders have no inferable tenant.
    for (const key of usedIn) {
      const workspace = target(key);
      workspace.folders = [
        ...workspace.folders.filter((f) => f.id !== folder.id),
        folder,
      ];
    }
  }
  const equipmentScopes = new Map<string, string>();
  for (const [id, conflict] of Object.entries(current.equipmentConflicts))
    if (conflict.serverItem?.organizationId)
      equipmentScopes.set(
        id,
        featureScope(
          conflict.serverItem.syncServerUrl || state.syncSettings.serverUrl,
          conflict.serverItem.organizationId,
        ),
      );
  for (const item of current.equipmentCatalog)
    equipmentScopes.set(
      item.id,
      item.organizationId &&
        !(
          item.organizationId === "org-electsun-default" &&
          (REFERENCE_EQUIPMENT_IDS as readonly string[]).includes(item.id)
        )
        ? featureScope(
            item.syncServerUrl || state.syncSettings.serverUrl,
            item.organizationId,
          )
        : scope,
    );
  for (const [id, change] of Object.entries(current.equipmentChanges))
    equipmentScopes.set(id, change.scope);
  for (const command of current.equipmentDeletionQueue)
    equipmentScopes.set(command.id, command.scope);
  for (const item of current.equipmentCatalog) {
    const destination = equipmentScopes.get(item.id) || scope;
    const workspace = target(destination);
    const owner = item.organizationId
      ? featureScope(
          item.syncServerUrl || state.syncSettings.serverUrl,
          item.organizationId,
        )
      : destination;
    const isForeignReference =
      item.organizationId === "org-electsun-default" && destination !== owner;
    if (
      isForeignReference &&
      (REFERENCE_EQUIPMENT_IDS as readonly string[]).includes(item.id) &&
      item.supplierPrices?.length
    ) {
      const owningWorkspace = target(owner);
      owningWorkspace.equipmentCatalog = [
        ...owningWorkspace.equipmentCatalog.filter((e) => e.id !== item.id),
        item,
      ];
    }
    workspace.equipmentCatalog = [
      ...workspace.equipmentCatalog.filter((e) => e.id !== item.id),
      isForeignReference &&
      (REFERENCE_EQUIPMENT_IDS as readonly string[]).includes(item.id)
        ? { ...item, supplierPrices: [], preferredSupplierId: undefined }
        : item,
    ];
  }
  for (const [id, change] of Object.entries(current.equipmentChanges)) {
    const workspace = target(change.scope);
    workspace.equipmentChanges = {
      ...workspace.equipmentChanges,
      [id]: change,
    };
  }
  for (const command of current.equipmentDeletionQueue) {
    const workspace = target(command.scope);
    workspace.equipmentDeletionQueue = [
      ...workspace.equipmentDeletionQueue.filter((c) => c.id !== command.id),
      command,
    ];
  }
  for (const [id, conflict] of Object.entries(current.equipmentConflicts)) {
    const workspace = target(equipmentScopes.get(id) || scope);
    workspace.equipmentConflicts = {
      ...workspace.equipmentConflicts,
      [id]: conflict,
    };
  }
  for (const id of current.deletedEquipmentIds || []) {
    const workspace = target(equipmentScopes.get(id) || scope);
    if (!workspace.deletedEquipmentIds?.includes(id))
      workspace.deletedEquipmentIds = [
        ...(workspace.deletedEquipmentIds || []),
        id,
      ];
  }
  for (const [key, workspace] of targets)
    if (key !== scope) archives[key] = workspace;
  Object.assign(current, targets.get(scope));
  if (!current.projects.some((p) => p.id === current.activeProjectId))
    current.activeProjectId = current.projects[0]?.id || "";
  Object.assign(state, current, {
    workspaceScope: scope,
    organizationWorkspaces: archives,
  });
}
export function changeWorkspace(
  state: SimulationStore,
  nextSession: SyncSettings,
): Partial<SimulationStore> {
  // Initialization is performed on a shallow state copy, preserving Zustand immutability.
  const initialized = { ...state };
  initializeWorkspaces(initialized);
  const nextScope = workspaceScope(nextSession);
  if (nextScope === initialized.workspaceScope)
    return {
      ...captureWorkspace(initialized),
      workspaceScope: initialized.workspaceScope,
      organizationWorkspaces: initialized.organizationWorkspaces,
    };
  const archives = {
    ...initialized.organizationWorkspaces,
    [initialized.workspaceScope]: captureWorkspace(initialized),
  };
  return {
    ...(archives[nextScope] || emptyWorkspace()),
    workspaceScope: nextScope,
    organizationWorkspaces: archives,
    activeFolderId: null,
    activeConflict: null,
    pendingImportConflict: null,
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
    notifications: [],
    unreadNotificationsCount: 0,
    searchQuery: "",
    statusFilter: "All",
    isTrashActive: false,
    tariffSyncStatus: "idle",
    tariffSyncError: null,
    featurePolicyRequest: null,
    isShareModalOpen: false,
    isAIInvoiceModalOpen: false,
    isAIDatasheetModalOpen: false,
    isAIPriceCatalogModalOpen: false,
    isNewProjectModalOpen: false,
    supplierPriceModalEquipment: null,
  };
}
