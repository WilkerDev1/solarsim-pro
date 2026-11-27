import { SimulationSlice, UISlice } from '../types';

export const createUISlice: SimulationSlice<UISlice> = (set, get) => ({
  activeQuotationId: null,
  openQuotation: (id) => set({ activeQuotationId: id, activeView: 'quotation-editor', quotationEditorEntry: null, quotationReturn: null }),
  closeQuotation: () => set({ activeQuotationId: null, activeView: 'quotations-hub', quotationEditorEntry: null }),
  quotationEditorEntry: null,
  consumeQuotationEditorEntry: () => { if (get().quotationEditorEntry) set({ quotationEditorEntry: null }); },
  quotationReturn: null,
  openProposalFromQuotation: (target) => {
    if (!get().projects.some((p) => p.id === target.projectId)) return;
    set({ quotationReturn: { ...target } });
    get().setActiveProject(target.projectId, 'project-hub');
  },
  returnToQuotation: () => {
    const target = get().quotationReturn;
    if (!target) return;
    if (!get().quotations.some((q) => q.id === target.quotationId)) return set({ quotationReturn: null });
    set({ activeQuotationId: target.quotationId, activeView: 'quotation-editor', quotationEditorEntry: { tab: target.tab, viewer: target.viewer }, quotationReturn: null });
  },
  dismissQuotationReturn: () => set({ quotationReturn: null }),
  quotationLibrarySection: 'templates',
  openQuotationLibrary: (section) => set((s) => ({ activeView: 'quotation-library', quotationLibrarySection: section ?? s.quotationLibrarySection, quotationEditorEntry: null })),
  closeQuotationLibrary: () => set((s) => ({
    activeView: s.activeQuotationId && s.quotations.some((q) => q.id === s.activeQuotationId) ? 'quotation-editor' : 'quotations-hub',
  })),
  appAssistantEnabled: false,
  setAppAssistantEnabled: (enabled) => set({ appAssistantEnabled: enabled === true }),
  isNewProjectModalOpen: false,
  isUpdateModalOpen: false,
  isAIInvoiceModalOpen: false,
  isAIDatasheetModalOpen: false,
  isAIPriceCatalogModalOpen: false,
  isShareModalOpen: false,
  isSettingsModalOpen: false,
  settingsActiveTab: 'sync',
  updateInfo: { state: 'idle' },
  saveFeedbackMessage: null,

  supplierPriceModalEquipment: null,

  sidebarTheme: 'dark',
  sidebarWidth: 380,
  dashboardViewMode: 'cards',
  setDashboardViewMode: (mode) => set({ dashboardViewMode: mode }),

  openNewProjectModal: () => set({ isNewProjectModalOpen: true }),
  closeNewProjectModal: () => set({ isNewProjectModalOpen: false }),
  openUpdateModal: () => set({ isUpdateModalOpen: true }),
  closeUpdateModal: () => set({ isUpdateModalOpen: false }),
  openAIInvoiceModal: () => set({ isAIInvoiceModalOpen: true }),
  closeAIInvoiceModal: () => set({ isAIInvoiceModalOpen: false }),
  openAIDatasheetModal: () => set({ isAIDatasheetModalOpen: true }),
  closeAIDatasheetModal: () => set({ isAIDatasheetModalOpen: false }),
  openAIPriceCatalogModal: () => set({ isAIPriceCatalogModalOpen: true }),
  closeAIPriceCatalogModal: () => set({ isAIPriceCatalogModalOpen: false }),
  openSupplierPriceModal: (item) => set({ supplierPriceModalEquipment: item }),
  closeSupplierPriceModal: () => set({ supplierPriceModalEquipment: null }),
  openAISettingsModal: () => set({ isSettingsModalOpen: true, settingsActiveTab: 'ai' }),
  closeAISettingsModal: () => set({ isSettingsModalOpen: false }),
  openShareModal: () => set({ isShareModalOpen: true }),
  closeShareModal: () => set({ isShareModalOpen: false }),
  openSettingsModal: (tab = 'sync') => set({ isSettingsModalOpen: true, settingsActiveTab: tab }),
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),
  setSettingsActiveTab: (tab) => set({ settingsActiveTab: tab }),
  setUpdateInfo: (info) => set({ updateInfo: info }),

  toggleSidebarTheme: () =>
    set((state) => ({ sidebarTheme: state.sidebarTheme === 'dark' ? 'light' : 'dark' })),
  setSidebarTheme: (theme) => set({ sidebarTheme: theme }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(280, Math.min(650, width)) }),
});
