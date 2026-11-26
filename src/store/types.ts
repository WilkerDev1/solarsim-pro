import { StateCreator } from 'zustand';
import {
  ProjectSimulation,
  ClientInfo,
  SystemSpecs,
  UtilityRates,
  FinancialParams,
  FinancialSummaryResult,
  UpdateInfo,
  DocumentCustomization,
  DocumentLayoutSettings,
  ExtractedInvoiceData,
  SyncSettings,
  UserProfile,
  UserRole,
  ProjectFolder,
  CompanyProfile,
  LocalUserProfile,
  ProjectSnapshot,
  DiffFieldChange,
  ProjectConflictInfo,
  TeamNotification,
} from '../types';
import { SolarEquipmentItem } from '../types/equipment';

export interface NewProjectPayload {
  name: string;
  company?: string;
  province?: string;
  distributor?: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  tariffCode?: string;
  address?: string;
}

export interface DefaultSimulationSettings {
  // 1. Proyecto y Cliente
  defaultProvince: string;
  defaultDistributor: 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';
  defaultTariffCode: string;
  defaultQuoteValidityDays: number;

  // 2. Tarifas y Distribuidora
  defaultTargetCoveragePct: number;
  defaultZeroExport: boolean;
  defaultApplySieRetention: boolean;
  defaultEstimatedEnergyRateDOP: number;
  defaultEstimatedExportRateDOP: number;

  // 3. Equipamiento y Sistema
  defaultPanelPowerW: number;
  defaultPanelModel: string;
  defaultInverterPowerKW: number;
  defaultInverterModel?: string;
  defaultSystemLosses: number;
  defaultAnnualDegradation: number;
  defaultAutoCalculatePanels: boolean;
  defaultHasBattery: boolean;
  defaultBatteryCapacityKWh: number;
  defaultBatteryDOD: number;

  // 4. Costos y Margen de Venta
  defaultPricingMode: 'direct' | 'matrix';
  /** Set when the user picks the pricing mode in Ajustes; otherwise a stored "direct" migrates to "matrix". */
  pricingModeChosenByUser?: boolean;
  defaultDirectPriceUSDPerWp: number;
  defaultTargetMarginPct: number;
  defaultExcessEnergyDestiny: 'net_metering' | 'direct_sale';

  // 5. Finanzas e Incentivos (Ley 57-07)
  currency: 'USD' | 'DOP';
  taxRatePct: number;
  discountRatePct: number;
  applyITBISExemption: boolean;
  applyLey5707: boolean;
  ley5707AmortizationYears: number;
  lifespanYears: number;
  annualEnergyTariffEscalationPct: number;
}

/**
 * Vistas principales de la aplicación. `clients-hub` lo implementa el directorio de clientes; `quotations-hub` y
 * `quotation-editor`, el módulo de cotizaciones. `activeView` se persiste y `activeQuotationId` no: al hidratar,
 * `quotation-editor` pasa a `quotations-hub`.
 */
export type AppView = 'dashboard' | 'simulator' | 'pdf-preview' | 'project-hub' | 'companies-hub' | 'clients-hub' | 'quotations-hub' | 'quotation-editor';
/** Pestañas del modal de Ajustes. `agents` agrupa permisos, actividad y conexión MCP. */
export type SettingsTab = 'sync' | 'account' | 'share' | 'ai' | 'equipment' | 'cloudflare' | 'features' | 'agents';

export interface ProjectSlice {
  projects: ProjectSimulation[];
  activeProjectId: string;
  activeView: AppView;
  searchQuery: string;
  statusFilter: string;
  defaultSimulationSettings: DefaultSimulationSettings;
  defaultDocumentCustomization: DocumentCustomization;
  documentTemplatesByCompany: Record<string, DocumentCustomization>;

  isTrashActive: boolean;
  setIsTrashActive: (active: boolean) => void;

  setActiveView: (view: AppView) => void;
  setActiveProject: (id: string, targetView?: 'simulator' | 'project-hub') => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string) => void;
  updateDefaultSimulationSettings: (settings: Partial<DefaultSimulationSettings>) => void;
  updateDefaultDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
  saveCurrentProjectAsDefaultDocumentTemplate: () => void;
  resetDefaultDocumentCustomization: () => void;

  createNewProject: (payload?: string | NewProjectPayload) => void;
  /** Edits any proposal by id (agents); refuses trashed proposals. Returns false when nothing changed. */
  /** `restore: true` writes the sections verbatim (undo of a snapshot): no equipment normalization against the current groups. */
  updateProjectById: (id: string, edit: (project: ProjectSimulation) => Partial<ProjectSimulation>, options?: { restore?: boolean }) => boolean;
  /** Returns the new proposal id. `activate: false` keeps the user on the current proposal (agents). */
  duplicateProject: (id: string, options?: { activate?: boolean }) => string | undefined;
  moveToTrash: (id: string) => void;
  deleteProject: (id: string) => void; // Compatibilidad: delega en moveToTrash
  restoreProject: (id: string) => void;
  hardDeleteProject: (id: string) => void;
  emptyTrash: () => void;
  addProposalCommercialReport: (id: string, report: import('../../shared/proposalCommercial').ProposalReportInput, updateCurrent: boolean) => { success: boolean; error?: string };
  linkProposals: (id: string, parentId: string | null) => { success: boolean; error?: string };
  setProposalGroupColor: (id: string, color: string) => { success: boolean; error?: string };
  setProposalCommercialState: (id: string, patch: import('../../shared/proposalCommercial').ProposalCommercialPatch) => { success: boolean; error?: string };
  setProjectStatus: (id: string, status: 'Draft' | 'Final' | 'Archived') => void;
  saveActiveProject: () => void;

  updateClient: (client: Partial<ClientInfo>) => void;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
  updateRates: (rates: Partial<UtilityRates>) => void;
  updateFinancials: (financials: Partial<FinancialParams>) => void;
  updateMonthlyConsumption: (index: number, value: number) => void;
  updateAllMonthlyConsumption: (value: number) => void;
  setMonthlyConsumption: (monthlyConsumption: number[], lockAutoPanels?: boolean) => void;
  updateDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
  /** Diseño persistente del documento (secciones visibles, tema, cabecera/pie). Registra deshacer. */
  setDocumentLayout: (patch: Partial<DocumentLayoutSettings>) => void;
  /** Textos del documento por clave estable (`null` restablece). Registra deshacer. */
  setDocumentTexts: (values: Record<string, string | null>) => void;
  /** Guarda textos en la plantilla de la empresa emisora (con placeholders; nunca datos del cliente). */
  saveDocumentTextsToCompanyTemplate: (keys: readonly string[] | 'all') => { saved: string[]; skipped: string[] };
  applySupplierPriceToProject: (
    equipmentType: 'panel' | 'inverter' | 'battery',
    supplierPrice: import('../types/equipment').EquipmentSupplierPrice,
    equipmentItem?: import('../types/equipment').SolarEquipmentItem
  ) => void;

  getActiveProject: () => ProjectSimulation;
  getFinancialSummary: () => FinancialSummaryResult;
}

export interface EquipmentSlice {
  equipmentChanges: Record<string, { scope: string; baseVersion: number; revision: string }>;
  equipmentDeletionQueue: Array<{ scope: string; id: string; baseVersion: number; item?: SolarEquipmentItem }>;
  equipmentSyncFeedback: string | null;
  equipmentConflicts: Record<string, { serverItem?: SolarEquipmentItem; serverVersion?: number; reason: string }>;
  resolveEquipmentConflict: (id: string, resolution: 'accept_server' | 'keep_local' | 'fork') => void;
  equipmentCatalog: SolarEquipmentItem[];
  deletedEquipmentIds?: string[];

  /**
   * Las acciones que guardan ofertas devuelven los ids de los registros de precio que crearon (ADR 0006, Regla 1):
   * solo ofertas nuevas o con precio distinto que de verdad quedaron guardadas; `[]` sin sesión o sin permiso.
   */
  addEquipmentItem: (item: SolarEquipmentItem) => string[];
  addEquipmentBatch: (items: SolarEquipmentItem[]) => string[];
  /** `recordPrices: false` restaura sin registrar (deshacer de un agente). */
  updateEquipmentItem: (id: string, updates: Partial<SolarEquipmentItem>, options?: { recordPrices?: boolean }) => string[];
  removeEquipmentItem: (id: string) => void;
  resetEquipmentCatalogToDefaults: () => void;
  syncEquipmentWithServer: () => Promise<{ success: boolean; message: string }>;

  // 🏷️ Gestión de Precios por Proveedor
  /** `priceSource: 'agent'` registra el cambio con la fuente del agente (`update_supplier_price`). */
  addOrUpdateSupplierPrice: (equipmentId: string, supplierPrice: Omit<import('../types/equipment').EquipmentSupplierPrice, 'id' | 'updatedAt'> & { id?: string }, options?: { priceSource?: 'agent' }) => string[];
  removeSupplierPrice: (equipmentId: string, supplierPriceId: string) => void;
  batchUpdateSupplierPrices: (updates: { equipmentId: string; supplierPrice: import('../types/equipment').EquipmentSupplierPrice }[]) => string[];
  setPreferredSupplier: (equipmentId: string, supplierPriceId?: string) => void;
  renameSupplier: (oldName: string, newName: string) => void;
  deleteSupplier: (supplierName: string) => void;
}

export interface SyncAuthSlice {
  workspaceScope: string;
  organizationWorkspaces: Record<string, import('./sync/organizationWorkspace').OrganizationWorkspace>;
  switchOrganization: (organizationId: string) => Promise<{ success: boolean; error?: string }>;
  sessionGeneration: number;
  projectDeletionQueue: Array<{
    scope: string;
    id: string;
    baseVersion: number;
    /** Durable recovery copy; optional only for queues saved by older versions. */
    project?: ProjectSimulation;
    stage?: 'trash' | 'delete';
  }>;
  queueProjectDeletion: (project: ProjectSimulation) => void;
  /**
   * `serverTimestamp` de la última descarga de proyectos aplicada a este espacio de trabajo. Viaja con la caché de
   * proyectos de su alcance (URL del servidor + organización); sin él, o con otro alcance, la descarga es completa.
   */
  projectSyncCursor: { scope: string; serverTimestamp: string } | null;
  syncSettings: SyncSettings;
  isSyncing: boolean;
  syncFeedbackMessage: string | null;

  setSyncSettings: (settings: Partial<SyncSettings>) => void;
  loginUser: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  registerUser: (name: string, email: string, password: string, organizationName?: string) => Promise<{ success: boolean; error?: string }>;
  logoutUser: () => void;
  /** `fullPull` descarga toda la organización aunque haya cursor (resincronización manual). */
  syncProjectsWithServer: (silent?: boolean, options?: { fullPull?: boolean }) => Promise<{ success: boolean; message: string }>;
  triggerAutoSync: (immediate?: boolean) => void;
  validateSession: () => Promise<{ valid: boolean; user?: UserProfile | null; error?: string }>;
}

export interface ImportExportSlice {
  pendingImportConflict: {
    incomingProject: ProjectSimulation;
    conflictingProject: ProjectSimulation;
    reason: string;
  } | null;

  exportProjectAsJSON: (id?: string) => void;
  exportAllProjectsAsJSON: () => void;
  importProjectsFromJSON: (jsonData: any) => { success: boolean; message: string; count: number };
  resolveImportConflict: (strategy: 'next_sequence' | 'overwrite' | 'copy_version') => void;
  cancelImportConflict: () => void;
}

export interface AISlice {
  geminiApiKey: string;
  geminiModel: string;
  /** false: the install follows DEFAULT_GEMINI_MODEL, including future default changes. */
  geminiModelChosenByUser: boolean;

  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  applyExtractedInvoice: (data: ExtractedInvoiceData, createNewProject?: boolean) => void;
}

export interface UISlice {
  /** Cotización abierta en el editor; no se persiste (al reabrir la app el editor vuelve al catálogo). */
  activeQuotationId: string | null;
  /** Abre una cotización en el editor. */
  openQuotation: (id: string) => void;
  /** Cierra el editor y vuelve al catálogo de cotizaciones. */
  closeQuotation: () => void;
  appAssistantEnabled: boolean;
  setAppAssistantEnabled: (enabled: boolean) => void;
  isNewProjectModalOpen: boolean;
  isUpdateModalOpen: boolean;
  isAIInvoiceModalOpen: boolean;
  isAIDatasheetModalOpen: boolean;
  isAIPriceCatalogModalOpen: boolean;
  isShareModalOpen: boolean;
  isSettingsModalOpen: boolean;
  settingsActiveTab: SettingsTab;
  updateInfo: UpdateInfo;
  saveFeedbackMessage: string | null;

  supplierPriceModalEquipment: SolarEquipmentItem | null;

  sidebarTheme: 'dark' | 'light';
  sidebarWidth: number;
  dashboardViewMode: 'cards' | 'list';
  setDashboardViewMode: (mode: 'cards' | 'list') => void;

  openNewProjectModal: () => void;
  closeNewProjectModal: () => void;
  openUpdateModal: () => void;
  closeUpdateModal: () => void;
  openAIInvoiceModal: () => void;
  closeAIInvoiceModal: () => void;
  openAIDatasheetModal: () => void;
  closeAIDatasheetModal: () => void;
  openAIPriceCatalogModal: () => void;
  closeAIPriceCatalogModal: () => void;
  openSupplierPriceModal: (item: SolarEquipmentItem) => void;
  closeSupplierPriceModal: () => void;
  openAISettingsModal: () => void;
  closeAISettingsModal: () => void;
  openShareModal: () => void;
  closeShareModal: () => void;
  openSettingsModal: (tab?: SettingsTab) => void;
  closeSettingsModal: () => void;
  setSettingsActiveTab: (tab: SettingsTab) => void;
  setUpdateInfo: (info: UpdateInfo) => void;

  toggleSidebarTheme: () => void;
  setSidebarTheme: (theme: 'dark' | 'light') => void;
  setSidebarWidth: (width: number) => void;
}

export interface FolderSlice {
  folders: ProjectFolder[];
  folderChanges: Record<string, { revision: string; ownerId?: string; baseVersion: number; serverFolder?: ProjectFolder }>;
  folderDeletionQueue: { id: string; ownerId?: string; baseVersion: number }[];
  folderSyncFeedback: string | null;
  resolveFolderConflict: (id: string, resolution: 'accept_server' | 'keep_local') => void;
  syncFoldersWithServer: () => Promise<{ success: boolean; message: string }>;
  activeFolderId: string | null;
  activeTeamMemberFilter: string | null;

  setActiveFolderId: (folderId: string | null) => void;
  setActiveTeamMemberFilter: (member: string | null) => void;
  createFolder: (name: string, color?: string, description?: string, hideFromGeneral?: boolean, visibility?: 'public' | 'private') => ProjectFolder | null;
  updateFolder: (id: string, updates: Partial<ProjectFolder>) => void;
  deleteFolder: (id: string) => void;
  moveProjectToFolder: (projectId: string, targetFolderId: string | null) => void;
}

export interface CompanyProfileSlice {
  companies: CompanyProfile[];
  activeCompanyId: string;
  localUserProfile: LocalUserProfile;

  addCompany: (companyData: Omit<CompanyProfile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string; updatedAt?: string }) => string;
  updateCompany: (id: string, partial: Partial<CompanyProfile>) => void;
  deleteCompany: (id: string) => void;
  setActiveCompany: (id: string) => void;
  updateLocalUserProfile: (partial: Partial<LocalUserProfile>) => void;
  getActiveCompany: () => CompanyProfile;
  syncOrganizationCompanyProfile: () => Promise<{ success: boolean; error?: string }>;
  saveOrganizationCompanyProfile: (profile: Partial<CompanyProfile>, baseVersion: number) => Promise<{ success: boolean; error?: string }>;

}

export interface VersionHistorySlice {
  undoStack: ProjectSimulation[];
  redoStack: ProjectSimulation[];
  canUndo: boolean;
  canRedo: boolean;
  snapshotsByProject: Record<string, ProjectSnapshot[]>;
  activeConflict: ProjectConflictInfo | null;
  projectConflicts: Record<string, ProjectConflictInfo>;
  openProjectConflict: (projectId: string) => Promise<{ success: boolean; error?: string }>;

  recordUndoState: (project: ProjectSimulation) => void;
  undo: () => void;
  redo: () => void;
  createSnapshot: (projectId: string, label: string, notes?: string, type?: 'auto' | 'manual') => ProjectSnapshot;
  restoreSnapshot: (projectId: string, snapshotId: string) => boolean;
  getProjectSnapshots: (projectId: string) => ProjectSnapshot[];
  deleteSnapshot: (projectId: string, snapshotId: string) => void;
  compareSnapshots: (oldSnap: ProjectSnapshot, newSnap: ProjectSnapshot) => DiffFieldChange[];
  setActiveConflict: (conflict: ProjectConflictInfo | null) => void;
  resolveConflict: (resolution: 'keep_local' | 'accept_server' | 'fork') => void;
}

export interface NotificationSlice {
  notifications: TeamNotification[];
  unreadNotificationsCount: number;

  addNotification: (notification: Omit<TeamNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

import { TariffSlice } from './slices/tariffSlice';
import { ClientSlice } from './slices/clientSlice';
import type { QuotationContent, QuotationStatus } from '../../shared/quotations';
import type {
  QuotationChange, QuotationDeletionCommand, QuotationMutationResult, QuotationRecord, QuotationSyncCursor,
} from '../types/quotation';

import type {
  LibraryKind, LibraryMutationResult, QuotationLibraryState, QuotationSignature, QuotationSignatureContent, QuotationTemplate, QuotationTemplateContent,
} from '../types/quotationLibrary';

export type QuotationActionResult = { ok: true } | { ok: false; error: string };

/** Cotizaciones (docs/QUOTATIONS.md): API pura, llamable fuera de React; las reglas viven en `shared/quotations`. */
export interface QuotationSlice {
  quotations: QuotationRecord[];
  quotationChanges: Record<string, QuotationChange>;
  quotationDeletionQueue: QuotationDeletionCommand[];
  /** Cursor `since` de la última descarga aplicada entera en este espacio de trabajo. */
  quotationSyncCursor: QuotationSyncCursor | null;
  /** Espacio local: última secuencia usada por año (`'2026' → 147`); nunca baja aunque se borre una cotización. */
  quotationNumberCounters: Record<string, number>;
  quotationSyncFeedback: string | null;
  createQuotationRecord: (overrides?: Partial<QuotationContent>) => QuotationMutationResult;
  /** Edita el contenido de un borrador; nunca cambia `status`. */
  updateQuotationRecord: (id: string, patch: Partial<QuotationContent>) => QuotationMutationResult;
  setQuotationStatus: (id: string, status: QuotationStatus) => QuotationMutationResult;
  duplicateQuotationRecord: (id: string) => QuotationMutationResult;
  deleteQuotationRecord: (id: string) => QuotationActionResult;
  /** Enlace opcional; los datos impresos `client` nunca cambian. */
  linkQuotationToClient: (id: string, clientId: string | null) => QuotationActionResult;
  moveQuotationToFolder: (id: string, folderId: string | null) => QuotationActionResult;
  resolveQuotationConflict: (id: string, resolution: 'accept_server' | 'keep_local') => void;
  syncQuotationsWithServer: () => Promise<{ success: boolean; message: string }>;
}

/**
 * Plantillas, firmas y sellos de cotización (docs/QUOTATIONS.md#plantillas-firmas-y-sellos): recursos del espacio de
 * trabajo; sin cuenta todo funciona en este equipo, con sesión se sincronizan con CAS como las cotizaciones.
 */
export interface QuotationLibrarySlice {
  quotationLibrary: QuotationLibraryState;
  quotationLibrarySyncFeedback: string | null;
  createQuotationTemplate: (content: Partial<QuotationTemplateContent>) => LibraryMutationResult<QuotationTemplate>;
  updateQuotationTemplate: (id: string, changes: Partial<QuotationTemplateContent>) => LibraryMutationResult<QuotationTemplate>;
  duplicateQuotationTemplate: (id: string) => LibraryMutationResult<QuotationTemplate>;
  /** Marca la predeterminada (desmarca las demás); `null` deja ninguna. */
  setDefaultQuotationTemplate: (id: string | null) => QuotationActionResult;
  deleteQuotationTemplate: (id: string) => QuotationActionResult;
  createQuotationSignature: (content: Partial<QuotationSignatureContent>) => LibraryMutationResult<QuotationSignature>;
  updateQuotationSignature: (id: string, changes: Partial<QuotationSignatureContent>) => LibraryMutationResult<QuotationSignature>;
  /** Una predeterminada por tipo: firma y sello. */
  setDefaultQuotationSignature: (id: string) => QuotationActionResult;
  deleteQuotationSignature: (id: string) => QuotationActionResult;
  resolveQuotationLibraryConflict: (kind: LibraryKind, id: string, resolution: 'accept_server' | 'keep_local') => void;
  syncQuotationLibraryWithServer: () => Promise<{ success: boolean; message: string }>;
}
import { FeatureSettingsSlice } from './slices/featureSettingsSlice';
import { AgentSlice } from './slices/agentSlice';
import { EquipmentPriceSlice } from './slices/equipmentPriceSlice';

export type SimulationStore = ProjectSlice &
  EquipmentSlice &
  SyncAuthSlice &
  ImportExportSlice &
  AISlice &
  UISlice &
  FolderSlice &
  ClientSlice &
  QuotationSlice &
  QuotationLibrarySlice &
  TariffSlice &
  CompanyProfileSlice &
  VersionHistorySlice &
  NotificationSlice &
  FeatureSettingsSlice &
  AgentSlice &
  EquipmentPriceSlice;

export type SimulationState = SimulationStore;
export type SimulationSlice<T> = StateCreator<SimulationStore, [], [], T>;
