import { SimulationSlice, UISlice } from '../types';

export const createUISlice: SimulationSlice<UISlice> = (set) => ({
  isNewProjectModalOpen: false,
  isUpdateModalOpen: false,
  isAIInvoiceModalOpen: false,
  isAIDatasheetModalOpen: false,
  isAISettingsModalOpen: false,
  isShareModalOpen: false,
  isSettingsModalOpen: false,
  settingsActiveTab: 'sync',
  updateInfo: { state: 'idle' },
  saveFeedbackMessage: null,

  sidebarTheme: 'dark',
  sidebarWidth: 380,

  openNewProjectModal: () => set({ isNewProjectModalOpen: true }),
  closeNewProjectModal: () => set({ isNewProjectModalOpen: false }),
  openUpdateModal: () => set({ isUpdateModalOpen: true }),
  closeUpdateModal: () => set({ isUpdateModalOpen: false }),
  openAIInvoiceModal: () => set({ isAIInvoiceModalOpen: true }),
  closeAIInvoiceModal: () => set({ isAIInvoiceModalOpen: false }),
  openAIDatasheetModal: () => set({ isAIDatasheetModalOpen: true }),
  closeAIDatasheetModal: () => set({ isAIDatasheetModalOpen: false }),
  openAISettingsModal: () => set({ isAISettingsModalOpen: true }),
  closeAISettingsModal: () => set({ isAISettingsModalOpen: false }),
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
