import { SimulationSlice, ProjectSlice } from '../types';
import { ProjectSimulation } from '../../types';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { INITIAL_PROJECTS, generateNextProjectSequence, generateDuplicateProjectIdentifiers } from '../initialData';
import { calculateFinancialSummary, calculateCostMatrixSummary } from '../../engine/financeEngine';
import { calculateRecommendedPanelCount } from '../../engine/solarEngine';

export const createProjectSlice: SimulationSlice<ProjectSlice> = (set, get) => ({
  projects: INITIAL_PROJECTS,
  activeProjectId: '',
  activeView: 'simulator',
  searchQuery: '',
  statusFilter: 'All',
  defaultSimulationSettings: {
    currency: 'USD',
    taxRatePct: 18,
    discountRatePct: 12,
    applyITBISExemption: true,
    applyLey5707: true,
    targetCoveragePct: 95,
    panelPowerW: 620,
    systemLosses: 25.0,
    annualDegradation: 0.40,
    lifespanYears: 25,
  },

  setActiveView: (view) => set({ activeView: view }),
  setActiveProject: (id) => set({ activeProjectId: id, activeView: 'simulator' }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  updateDefaultSimulationSettings: (settingsPartial) =>
    set((state) => ({
      defaultSimulationSettings: {
        ...state.defaultSimulationSettings,
        ...settingsPartial,
      },
    })),

  createNewProject: (payload) => {
    const id = `proj-${Date.now()}`;
    const name = typeof payload === 'string' ? payload : (payload?.name || 'Nuevo Proyecto Solar');
    const company = typeof payload === 'object' && payload?.company ? payload.company : 'Cliente Comercial';
    const province = typeof payload === 'object' && payload?.province ? payload.province : 'Santo Domingo / Distrito Nacional';
    const distributor = typeof payload === 'object' && payload?.distributor ? payload.distributor : 'EDEESTE';
    const tariffCode = typeof payload === 'object' && payload?.tariffCode ? payload.tariffCode : 'BTS2';
    const address = typeof payload === 'object' && payload?.address ? payload.address : `${province}, República Dominicana`;
    const seq = generateNextProjectSequence(get().projects);
    const currentUser = get().syncSettings?.currentUser;
    const defs = get().defaultSimulationSettings || {
      currency: 'USD',
      taxRatePct: 18,
      discountRatePct: 12,
      applyITBISExemption: true,
      applyLey5707: true,
      targetCoveragePct: 95,
      panelPowerW: 620,
      systemLosses: 25.0,
      annualDegradation: 0.40,
      lifespanYears: 25,
    };

    const newProj: ProjectSimulation = {
      ...BENCHMARK_PROJECT,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Draft',
      authorId: currentUser?.id,
      authorName: currentUser?.name || 'Ing. Solar',
      authorEmail: currentUser?.email,
      lastModifiedBy: currentUser?.name || 'Ing. Solar',
      lastModifiedAt: new Date().toISOString(),
      version: 1,
      syncStatus: currentUser ? 'pending' : 'local_only',
      client: {
        ...BENCHMARK_PROJECT.client,
        name,
        company,
        province,
        location: province,
        address,
        distributor,
        tariffCode,
        projectId: seq.projectId,
        quoteNumber: seq.quoteNumber,
        quoteValidityDays: 7,
      },
      specs: {
        ...BENCHMARK_PROJECT.specs,
        panelPowerW: defs.panelPowerW,
        systemLosses: defs.systemLosses,
        autoCalculatePanels: false,
      },
      rates: {
        ...BENCHMARK_PROJECT.rates,
        targetCoveragePct: defs.targetCoveragePct,
        distributor,
        tariffCode,
      },
      financials: {
        ...BENCHMARK_PROJECT.financials,
        discountRatePct: defs.discountRatePct,
        applyITBISExemption: defs.applyITBISExemption,
        applyLey5707: defs.applyLey5707,
      },
    };

    set((state) => ({
      projects: [newProj, ...state.projects],
      activeProjectId: id,
      activeView: 'simulator',
      isNewProjectModalOpen: false,
      saveFeedbackMessage: `¡Proyecto "${name}" (${seq.projectId}) creado con éxito!`,
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 3500);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
  },

  duplicateProject: (id) => {
    const target = get().projects.find((p) => p.id === id);
    if (!target) return;

    const newId = `proj-${Date.now()}`;
    const dupIdentifiers = generateDuplicateProjectIdentifiers(target, get().projects);
    const currentUser = get().syncSettings?.currentUser;
    const cloned: ProjectSimulation = {
      ...target,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Draft',
      authorId: currentUser?.id || target.authorId,
      authorName: currentUser?.name || target.authorName || 'Ing. Solar',
      authorEmail: currentUser?.email || target.authorEmail,
      lastModifiedBy: currentUser?.name || 'Ing. Solar',
      lastModifiedAt: new Date().toISOString(),
      version: 1,
      syncStatus: currentUser ? 'pending' : 'local_only',
      client: {
        ...target.client,
        name: `${dupIdentifiers.cleanName} (Copia)`,
        projectId: dupIdentifiers.projectId,
        quoteNumber: dupIdentifiers.quoteNumber,
      },
    };

    set((state) => ({
      projects: [cloned, ...state.projects],
      activeProjectId: newId,
      saveFeedbackMessage: `¡Proyecto duplicado como versión ${dupIdentifiers.versionSuffix}! ✨`,
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
  },

  deleteProject: (id) => {
    const remaining = get().projects.filter((p) => p.id !== id);
    if (remaining.length === 0) return;

    set((state) => ({
      projects: remaining,
      activeProjectId: state.activeProjectId === id ? remaining[0].id : state.activeProjectId,
      saveFeedbackMessage: 'Proyecto eliminado.',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 2500);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
  },

  setProjectStatus: (id, status) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, status, syncStatus: 'pending' as const, updatedAt: new Date().toISOString() } : p
      ),
      saveFeedbackMessage: `Estado actualizado a "${status}"`,
    }));
    setTimeout(() => set({ saveFeedbackMessage: null }), 2000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
  },

  saveActiveProject: () => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === state.activeProjectId ? { ...p, syncStatus: 'pending' as const, updatedAt: new Date().toISOString() } : p
      ),
      saveFeedbackMessage: '¡Proyecto guardado con éxito! ✨',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 2500);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
  },

  updateClient: (clientPartial) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === state.activeProjectId) {
          const updatedClient = { ...p.client, ...clientPartial };
          const updatedSpecs = { ...p.specs };

          if (updatedSpecs.autoCalculatePanels && clientPartial.province) {
            const panelW = updatedSpecs.panelPowerW || 620;
            const targetCoverage = p.rates.targetCoveragePct ?? 95;
            const losses = updatedSpecs.systemLosses !== undefined ? updatedSpecs.systemLosses : 25.0;
            const rec = calculateRecommendedPanelCount(
              updatedClient.province,
              p.monthlyConsumption,
              panelW,
              targetCoverage,
              losses,
              updatedClient.customMonthlyHSP
            );
            updatedSpecs.panelCount = rec.recommendedPanelCount;
          }

          return {
            ...p,
            syncStatus: 'pending' as const,
            updatedAt: new Date().toISOString(),
            client: updatedClient,
            specs: updatedSpecs,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
  },

  updateSpecs: (specsPartial) => {
    set((state) => {
      const activeProj = state.projects.find((p) => p.id === state.activeProjectId);
      if (!activeProj) return state;

      const mergedSpecs = { ...activeProj.specs, ...specsPartial };
      const shouldAutoCalc = specsPartial.autoCalculatePanels !== undefined
        ? specsPartial.autoCalculatePanels
        : (activeProj.specs.autoCalculatePanels && specsPartial.panelCount === undefined);

      if (shouldAutoCalc) {
        const panelW = mergedSpecs.panelPowerW || 620;
        const targetCoverage = activeProj.rates.targetCoveragePct ?? 95;
        const losses = mergedSpecs.systemLosses !== undefined ? mergedSpecs.systemLosses : 25.0;
        const rec = calculateRecommendedPanelCount(
          activeProj.client.province,
          activeProj.monthlyConsumption,
          panelW,
          targetCoverage,
          losses,
          activeProj.client.customMonthlyHSP
        );
        mergedSpecs.panelCount = rec.recommendedPanelCount;
        mergedSpecs.autoCalculatePanels = true;
      } else if (specsPartial.panelCount !== undefined && specsPartial.autoCalculatePanels === undefined) {
        mergedSpecs.autoCalculatePanels = false;
      }

      return {
        projects: state.projects.map((p) =>
          p.id === state.activeProjectId
            ? { ...p, syncStatus: 'pending' as const, updatedAt: new Date().toISOString(), specs: mergedSpecs }
            : p
        ),
      };
    });

    get().triggerAutoSync(false);
  },

  updateRates: (ratesPartial) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === state.activeProjectId) {
          const updatedRates = { ...p.rates, ...ratesPartial };
          const updatedSpecs = { ...p.specs };

          if (updatedSpecs.autoCalculatePanels && ratesPartial.targetCoveragePct !== undefined) {
            const panelW = updatedSpecs.panelPowerW || 620;
            const losses = updatedSpecs.systemLosses !== undefined ? updatedSpecs.systemLosses : 25.0;
            const rec = calculateRecommendedPanelCount(
              p.client.province,
              p.monthlyConsumption,
              panelW,
              ratesPartial.targetCoveragePct,
              losses,
              p.client.customMonthlyHSP
            );
            updatedSpecs.panelCount = rec.recommendedPanelCount;
          }

          return {
            ...p,
            syncStatus: 'pending' as const,
            updatedAt: new Date().toISOString(),
            rates: updatedRates,
            specs: updatedSpecs,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
  },

  updateFinancials: (finPartial) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === state.activeProjectId
          ? {
              ...p,
              syncStatus: 'pending' as const,
              updatedAt: new Date().toISOString(),
              financials: { ...p.financials, ...finPartial },
            }
          : p
      ),
    }));

    get().triggerAutoSync(false);
  },

  updateMonthlyConsumption: (index, value) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === state.activeProjectId) {
          const newConsumption = [...p.monthlyConsumption];
          newConsumption[index] = Math.max(0, value);
          const updatedSpecs = { ...p.specs };

          if (updatedSpecs.autoCalculatePanels) {
            const panelW = updatedSpecs.panelPowerW || 620;
            const targetCoverage = p.rates.targetCoveragePct ?? 95;
            const losses = updatedSpecs.systemLosses !== undefined ? updatedSpecs.systemLosses : 25.0;
            const rec = calculateRecommendedPanelCount(
              p.client.province,
              newConsumption,
              panelW,
              targetCoverage,
              losses,
              p.client.customMonthlyHSP
            );
            updatedSpecs.panelCount = rec.recommendedPanelCount;
          }

          return {
            ...p,
            syncStatus: 'pending' as const,
            updatedAt: new Date().toISOString(),
            monthlyConsumption: newConsumption,
            specs: updatedSpecs,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
  },

  updateAllMonthlyConsumption: (value) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === state.activeProjectId) {
          const newConsumption = Array(12).fill(Math.max(0, value));
          const updatedSpecs = { ...p.specs };

          if (updatedSpecs.autoCalculatePanels) {
            const panelW = updatedSpecs.panelPowerW || 620;
            const targetCoverage = p.rates.targetCoveragePct ?? 95;
            const losses = updatedSpecs.systemLosses !== undefined ? updatedSpecs.systemLosses : 25.0;
            const rec = calculateRecommendedPanelCount(
              p.client.province,
              newConsumption,
              panelW,
              targetCoverage,
              losses,
              p.client.customMonthlyHSP
            );
            updatedSpecs.panelCount = rec.recommendedPanelCount;
          }

          return {
            ...p,
            syncStatus: 'pending' as const,
            updatedAt: new Date().toISOString(),
            monthlyConsumption: newConsumption,
            specs: updatedSpecs,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
  },

  updateDocumentCustomization: (customizationPartial) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === state.activeProjectId
          ? {
              ...p,
              syncStatus: 'pending' as const,
              updatedAt: new Date().toISOString(),
              customization: { ...(p.customization || {}), ...customizationPartial },
            }
          : p
      ),
    }));

    get().triggerAutoSync(false);
  },

  getActiveProject: () => {
    const state = get();
    const found = state.projects.find((p) => p.id === state.activeProjectId);
    if (found && found.client && found.specs && found.rates) return found;
    return state.projects[0] || BENCHMARK_PROJECT;
  },

  getFinancialSummary: () => {
    const p = get().getActiveProject();
    return calculateFinancialSummary(
      p.client?.province || 'Santo Domingo / Distrito Nacional',
      p.specs || BENCHMARK_PROJECT.specs,
      p.rates || BENCHMARK_PROJECT.rates,
      p.financials || BENCHMARK_PROJECT.financials,
      p.monthlyConsumption || BENCHMARK_PROJECT.monthlyConsumption,
      p.client?.customMonthlyHSP
    );
  },
});
