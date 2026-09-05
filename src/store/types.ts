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
  ExtractedInvoiceData,
  SyncSettings,
  UserProfile,
  UserRole,
  ProjectFolder,
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

export interface ProjectSlice {
  projects: ProjectSimulation[];
  activeProjectId: string;
  activeView: 'dashboard' | 'simulator' | 'pdf-preview';
  searchQuery: string;
  statusFilter: string;
  defaultSimulationSettings: DefaultSimulationSettings;

  isTrashActive: boolean;
  setIsTrashActive: (active: boolean) => void;

  setActiveView: (view: 'dashboard' | 'simulator' | 'pdf-preview') => void;
  setActiveProject: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string) => void;
  updateDefaultSimulationSettings: (settings: Partial<DefaultSimulationSettings>) => void;

  createNewProject: (payload?: string | NewProjectPayload) => void;
  duplicateProject: (id: string) => void;
  moveToTrash: (id: string) => void;
  deleteProject: (id: string) => void; // Compatibilidad: delega en moveToTrash
  restoreProject: (id: string) => void;
  hardDeleteProject: (id: string) => void;
  emptyTrash: () => void;
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
  applySupplierPriceToProject: (
    equipmentType: 'panel' | 'inverter' | 'battery',
    supplierPrice: import('../types/equipment').EquipmentSupplierPrice,
    equipmentItem?: import('../types/equipment').SolarEquipmentItem
  ) => void;

  getActiveProject: () => ProjectSimulation;
  getFinancialSummary: () => FinancialSummaryResult;
}

export interface EquipmentSlice {
  equipmentCatalog: SolarEquipmentItem[];
  deletedEquipmentIds?: string[];

  addEquipmentItem: (item: SolarEquipmentItem) => void;
  addEquipmentBatch: (items: SolarEquipmentItem[]) => void;
  updateEquipmentItem: (id: string, updates: Partial<SolarEquipmentItem>) => void;
  removeEquipmentItem: (id: string) => void;
  resetEquipmentCatalogToDefaults: () => void;
  syncEquipmentWithServer: () => Promise<{ success: boolean; message: string }>;

  // 🏷️ Gestión de Precios por Proveedor
  addOrUpdateSupplierPrice: (equipmentId: string, supplierPrice: Omit<import('../types/equipment').EquipmentSupplierPrice, 'id' | 'updatedAt'> & { id?: string }) => void;
  removeSupplierPrice: (equipmentId: string, supplierPriceId: string) => void;
  batchUpdateSupplierPrices: (updates: { equipmentId: string; supplierPrice: import('../types/equipment').EquipmentSupplierPrice }[]) => void;
  setPreferredSupplier: (equipmentId: string, supplierPriceId?: string) => void;
  renameSupplier: (oldName: string, newName: string) => void;
  deleteSupplier: (supplierName: string) => void;
}

export interface SyncAuthSlice {
  syncSettings: SyncSettings;
  isSyncing: boolean;
  syncFeedbackMessage: string | null;

  setSyncSettings: (settings: Partial<SyncSettings>) => void;
  loginUser: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  registerUser: (name: string, email: string, password: string, organizationName?: string) => Promise<{ success: boolean; error?: string }>;
  logoutUser: () => void;
  syncProjectsWithServer: (silent?: boolean) => Promise<{ success: boolean; message: string }>;
  triggerAutoSync: (immediate?: boolean) => void;
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

  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  applyExtractedInvoice: (data: ExtractedInvoiceData, createNewProject?: boolean) => void;
}

export interface UISlice {
  isNewProjectModalOpen: boolean;
  isUpdateModalOpen: boolean;
  isAIInvoiceModalOpen: boolean;
  isAIDatasheetModalOpen: boolean;
  isAIPriceCatalogModalOpen: boolean;
  isAISettingsModalOpen: boolean;
  isShareModalOpen: boolean;
  isSettingsModalOpen: boolean;
  settingsActiveTab: 'sync' | 'account' | 'share' | 'ai' | 'equipment';
  updateInfo: UpdateInfo;
  saveFeedbackMessage: string | null;

  supplierPriceModalEquipment: SolarEquipmentItem | null;

  sidebarTheme: 'dark' | 'light';
  sidebarWidth: number;

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
  openSettingsModal: (tab?: 'sync' | 'account' | 'share' | 'ai' | 'equipment') => void;
  closeSettingsModal: () => void;
  setSettingsActiveTab: (tab: 'sync' | 'account' | 'share' | 'ai' | 'equipment') => void;
  setUpdateInfo: (info: UpdateInfo) => void;

  toggleSidebarTheme: () => void;
  setSidebarTheme: (theme: 'dark' | 'light') => void;
  setSidebarWidth: (width: number) => void;
}

export interface FolderSlice {
  folders: ProjectFolder[];
  activeFolderId: string | null;
  activeTeamMemberFilter: string | null;

  setActiveFolderId: (folderId: string | null) => void;
  setActiveTeamMemberFilter: (member: string | null) => void;
  createFolder: (name: string, color?: string, description?: string, hideFromGeneral?: boolean) => ProjectFolder | null;
  updateFolder: (id: string, updates: Partial<ProjectFolder>) => void;
  deleteFolder: (id: string) => void;
  moveProjectToFolder: (projectId: string, targetFolderId: string | null) => void;
}

export type SimulationStore = ProjectSlice &
  EquipmentSlice &
  SyncAuthSlice &
  ImportExportSlice &
  AISlice &
  UISlice &
  FolderSlice;

export type SimulationState = SimulationStore;
export type SimulationSlice<T> = StateCreator<SimulationStore, [], [], T>;
