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
import { emptyQuotationLibrary } from "../../types/quotationLibrary";

const keys = [
  "projects",
  "activeProjectId",
  "folders",
  "folderChanges",
  "folderDeletionQueue",
  "clients",
  "clientChanges",
  "clientDeletionQueue",
  "quotations",
  "quotationChanges",
  "quotationDeletionQueue",
  "quotationSyncCursor",
  "quotationNumberCounters",
  "quotationLibrary",
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
  "documentTemplatesByCompany",
  "companies",
  "activeCompanyId",
  "localUserProfile",
  "agentActivity",
  "projectSyncCursor",
  "genericPrices",
  "pricePending",
  "proposalPriceLive",
] as const;
// Keys added after 2.6 are optional: archives written by older versions lack them and fall back to emptyWorkspace().
type OptionalWorkspaceKey =
  | "agentActivity"
  | "projectSyncCursor"
  | "genericPrices"
  | "pricePending"
  | "proposalPriceLive"
  | "quotations"
  | "quotationChanges"
  | "quotationDeletionQueue"
  | "quotationSyncCursor"
  | "quotationNumberCounters"
  | "quotationLibrary";
export type OrganizationWorkspace = Pick<
  SimulationStore,
  Exclude<(typeof keys)[number], OptionalWorkspaceKey>
> &
  Partial<Pick<SimulationStore, OptionalWorkspaceKey>>;
// Cached identity keeps the offline workspace selected even when its token expires.
// Only explicit logout (no currentUser) returns to the personal local workspace.
export const workspaceScope = (session: SyncSettings): string =>
  session.currentUser
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
    folderChanges: {},
    folderDeletionQueue: [],
    clients: [],
    clientChanges: {},
    clientDeletionQueue: [],
    // Quotations, their queues, pull cursor and local numbering belong to the workspace (docs/QUOTATIONS.md).
    quotations: [],
    quotationChanges: {},
    quotationDeletionQueue: [],
    quotationSyncCursor: null,
    quotationNumberCounters: {},
    // Templates, signatures and stamps follow the workspace too (docs/QUOTATIONS.md#plantillas-firmas-y-sellos).
    quotationLibrary: emptyQuotationLibrary(),
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
    documentTemplatesByCompany: {},
    companies: [DEFAULT_LOCAL_COMPANY],
    activeCompanyId: DEFAULT_LOCAL_COMPANY.id,
    localUserProfile: DEFAULT_LOCAL_USER,
    agentActivity: [],
    // The pull cursor describes this workspace's project cache: a new or reset cache always starts with a full pull.
    projectSyncCursor: null,
    genericPrices: {},
    pricePending: { observations: [], voids: [] },
    proposalPriceLive: {},
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
/** Private folders of another member: kept out of the store, so only the active scope's archive remembers them. */
const hiddenPrivateFolders = (
  folders: OrganizationWorkspace["folders"],
  session: SyncSettings,
) =>
  folders.filter(
    (f) =>
      f.visibility === "private" &&
      !!f.createdById &&
      f.createdById !== session.currentUser?.id,
  );
/**
 * Drops a persisted archive of the active scope (written by 2.8.2 and earlier on every launch) unless it holds
 * another member's private folders. Mutates the state being hydrated.
 */
export function dropActiveWorkspaceArchive(state: SimulationStore): void {
  const archive = state.workspaceScope
    ? state.organizationWorkspaces?.[state.workspaceScope]
    : undefined;
  if (
    !archive ||
    hiddenPrivateFolders(archive.folders || [], state.syncSettings).length
  )
    return;
  const { [state.workspaceScope]: _active, ...others } =
    state.organizationWorkspaces;
  state.organizationWorkspaces = others;
}
export function changeWorkspace(
  state: SimulationStore,
  nextSession: SyncSettings,
): Partial<SimulationStore> {
  // Initialization is performed on a shallow state copy, preserving Zustand immutability.
  const initialized = { ...state };
  initializeWorkspaces(initialized);
  const nextScope = workspaceScope(nextSession);
  const previousArchive =
    initialized.organizationWorkspaces[initialized.workspaceScope];
  const captured = captureWorkspace(initialized);
  captured.folders = [
    ...(previousArchive?.folders || []).filter(
      (f) =>
        f.visibility === "private" &&
        f.createdById !== state.syncSettings.currentUser?.id &&
        !captured.folders.some((v) => v.id === f.id),
    ),
    ...captured.folders,
  ];
  const accessible = (workspace: OrganizationWorkspace) => ({
    ...workspace,
    folderChanges: workspace.folderChanges || {},
    folderDeletionQueue: workspace.folderDeletionQueue || [],
    clients: workspace.clients || [],
    clientChanges: workspace.clientChanges || {},
    clientDeletionQueue: workspace.clientDeletionQueue || [],
    quotations: workspace.quotations || [],
    quotationChanges: workspace.quotationChanges || {},
    quotationDeletionQueue: workspace.quotationDeletionQueue || [],
    quotationSyncCursor: workspace.quotationSyncCursor ?? null,
    quotationNumberCounters: workspace.quotationNumberCounters || {},
    quotationLibrary: workspace.quotationLibrary || emptyQuotationLibrary(),
    folders: workspace.folders.filter(
      (f) =>
        f.visibility !== "private" ||
        !f.createdById ||
        f.createdById === nextSession.currentUser?.id,
    ),
  });
  if (nextScope === initialized.workspaceScope) {
    // The active workspace lives in the store: archiving it too duplicated half of the persisted data on every
    // launch (validateSession). It is archived only to keep another member's private folders hidden.
    const { [nextScope]: _active, ...others } = initialized.organizationWorkspaces;
    const hidden = hiddenPrivateFolders(captured.folders, nextSession);
    return {
      ...accessible(captured),
      activeFolderId: accessible(captured).folders.some(
        (f) => f.id === state.activeFolderId,
      )
        ? state.activeFolderId
        : null,
      activeTeamMemberFilter: null,
      folderSyncFeedback: null,
      clientSyncFeedback: null,
      quotationSyncFeedback: null,
      quotationLibrarySyncFeedback: null,
      quotationAssetIssues: {},
      workspaceScope: initialized.workspaceScope,
      organizationWorkspaces: hidden.length
        ? { ...others, [nextScope]: captured }
        : others,
    };
  }
  const archives = {
    ...initialized.organizationWorkspaces,
    [initialized.workspaceScope]: captured,
  };
  // The restored workspace becomes the store: its archive stays only for another member's private folders.
  const { [nextScope]: restored, ...remaining } = archives;
  return {
    ...emptyWorkspace(),
    ...accessible(restored || emptyWorkspace()),
    documentTemplatesByCompany: restored?.documentTemplatesByCompany || {},
    workspaceScope: nextScope,
    organizationWorkspaces:
      restored &&
      hiddenPrivateFolders(restored.folders || [], nextSession).length
        ? archives
        : remaining,
    activeFolderId: null,
    activeClientId: null,
    clientSyncFeedback: null,
    quotationSyncFeedback: null,
    quotationLibrarySyncFeedback: null,
    quotationAssetIssues: {},
    activeConflict: null,
    pendingImportConflict: null,
    pendingAgentActions: [],
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
    organizationTariffOutdated: null,
    featurePolicyRequest: null,
    isShareModalOpen: false,
    isAIInvoiceModalOpen: false,
    isAIDatasheetModalOpen: false,
    isAIPriceCatalogModalOpen: false,
    isNewProjectModalOpen: false,
    supplierPriceModalEquipment: null,
  };
}
