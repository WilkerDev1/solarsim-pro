import { companyDocumentCustomization, reusableDocumentTemplate } from '../../utils/companyDocumentTemplate';
import { DEFAULT_SIMULATION_SETTINGS } from '../defaultSimulationSettings';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../../features/application/featurePolicy';
import { SimulationSlice, ProjectSlice } from '../types';
import { ProjectSimulation } from '../../types';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { INITIAL_PROJECTS, generateNextProjectSequence, generateDuplicateProjectIdentifiers } from '../initialData';
import { calculateFinancialSummary, calculateCostMatrixSummary } from '../../engine/financeEngine';
import { calculateRecommendedPanelCount } from '../../engine/solarEngine';
import { projectMutationMetadata } from '../sync/projectMutation';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../constants/defaultDocumentCustomization';

export const createProjectSlice: SimulationSlice<ProjectSlice> = (set, get) => ({
  projects: INITIAL_PROJECTS,
  activeProjectId: '',
  activeView: 'simulator',
  searchQuery: '',
  statusFilter: 'All',
  defaultSimulationSettings: DEFAULT_SIMULATION_SETTINGS,
  defaultDocumentCustomization: DEFAULT_DOCUMENT_CUSTOMIZATION,
  documentTemplatesByCompany: {},

  isTrashActive: false,
  setIsTrashActive: (active) => set({ isTrashActive: active }),

  setActiveView: (view) => set({ activeView: view }),
  setActiveProject: (id, targetView = 'project-hub') => {
    set({ activeProjectId: id, activeView: targetView });
    const p = get().projects.find((proj) => proj.id === id);
    if (p) {
      get().recordUndoState(p);
    }
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  updateDefaultSimulationSettings: (settingsPartial) =>
    set((state) => ({
      defaultSimulationSettings: {
        ...state.defaultSimulationSettings,
        ...settingsPartial,
      },
    })),

  updateDefaultDocumentCustomization: (customizationPartial) => {
    const project = get().projects.find(project => project.id === get().activeProjectId);
    const companyId = project ? project.companyProfileId || (get().companies.length === 1 ? get().companies[0].id : undefined) : get().activeCompanyId;
    if (!companyId || !get().companies.some(company => company.id === companyId)) {
      set({ saveFeedbackMessage: 'Selecciona la empresa emisora de esta propuesta antes de guardar su plantilla.' });
      return;
    }
    set((state) => ({
      defaultDocumentCustomization: {
        ...(state.defaultDocumentCustomization || DEFAULT_DOCUMENT_CUSTOMIZATION),
        ...customizationPartial,
      },
      documentTemplatesByCompany: {
        ...state.documentTemplatesByCompany,
        [companyId]: {
          ...companyDocumentCustomization(state.companies.find(company => company.id === companyId)!, state.defaultDocumentCustomization, state.documentTemplatesByCompany),
          ...reusableDocumentTemplate(customizationPartial),
        },
      },
      saveFeedbackMessage: '¡Plantilla de propuesta actualizada para futuros proyectos! 📑',
    }));
    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);
  },

  saveCurrentProjectAsDefaultDocumentTemplate: () => {
    const active = get().getActiveProject();
    if (!active) return;
    const companyId = active.companyProfileId || (get().companies.length === 1 ? get().companies[0].id : undefined);
    if (!companyId || !get().companies.some(company => company.id === companyId)) {
      set({ saveFeedbackMessage: 'Selecciona la empresa emisora de esta propuesta antes de guardar su plantilla.' });
      return;
    }
    const currentCust = reusableDocumentTemplate(active.customization || {});
    set((state) => ({
      defaultDocumentCustomization: {
        ...(state.defaultDocumentCustomization || DEFAULT_DOCUMENT_CUSTOMIZATION),
        ...currentCust,
      },
      documentTemplatesByCompany: {
        ...state.documentTemplatesByCompany,
        [companyId]: structuredClone(currentCust),
      },
      saveFeedbackMessage: '¡Configuración actual guardada como plantilla permanente para futuras propuestas! 🌟',
    }));
    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);
  },

  resetDefaultDocumentCustomization: () => {
    const project = get().projects.find(project => project.id === get().activeProjectId);
    const companyId = project ? project.companyProfileId || (get().companies.length === 1 ? get().companies[0].id : undefined) : get().activeCompanyId;
    if (!companyId || !get().companies.some(company => company.id === companyId)) {
      set({ saveFeedbackMessage: 'Selecciona la empresa emisora de esta propuesta antes de restablecer su plantilla.' });
      return;
    }
    set({
      defaultDocumentCustomization: DEFAULT_DOCUMENT_CUSTOMIZATION,
      documentTemplatesByCompany: Object.fromEntries(Object.entries(get().documentTemplatesByCompany).filter(([id]) => id !== companyId)),
      saveFeedbackMessage: 'Plantilla de propuesta restablecida a los valores de fábrica originales 🔄',
    });
    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);
  },

  createNewProject: (payload) => {
    const defs = get().defaultSimulationSettings;
    const id = `proj-${Date.now()}`;
    const name = typeof payload === 'string' ? payload : (payload?.name || 'Nuevo Proyecto Solar');
    const company = typeof payload === 'object' && payload?.company ? payload.company : 'Cliente Comercial';
    const province = typeof payload === 'object' && payload?.province ? payload.province : (defs?.defaultProvince || 'Santo Domingo / Distrito Nacional');
    const distributor = typeof payload === 'object' && payload?.distributor ? payload.distributor : (defs?.defaultDistributor || 'EDEESTE');
    const tariffCode = typeof payload === 'object' && payload?.tariffCode ? payload.tariffCode : (defs?.defaultTariffCode || 'BTS2');
    const address = typeof payload === 'object' && payload?.address ? payload.address : `${province}, República Dominicana`;
    const seq = generateNextProjectSequence(get().projects);
    const currentUser = get().syncSettings?.currentUser;

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
      baseVersion: 0,
      organizationId: currentUser?.organizationId,
      syncServerUrl: currentUser ? get().syncSettings.serverUrl.trim().replace(/\/+$/, '') : undefined,
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
        contactEmail: '',
        contactPhone: '',
        contactPerson: company || '',
        projectId: seq.projectId,
        quoteNumber: seq.quoteNumber,
        quoteValidityDays: defs?.defaultQuoteValidityDays || 7,
      },
      specs: {
        ...BENCHMARK_PROJECT.specs,
        pricingMode: defs?.defaultPricingMode === 'direct' ? 'direct_watt' : 'cost_matrix',
        panelPowerW: defs?.defaultPanelPowerW || 620,
        panelBrandModel: defs?.defaultPanelModel || BENCHMARK_PROJECT.specs.panelBrandModel,
        inverterBrandModel: defs?.defaultInverterModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)',
        inverterPowerKW: defs?.defaultInverterPowerKW || 8.0,
        inverterCount: 1,
        systemLosses: defs?.defaultSystemLosses !== undefined ? defs.defaultSystemLosses : 25.0,
        annualDegradation: defs?.defaultAnnualDegradation || 0.40,
        autoCalculatePanels: defs?.defaultAutoCalculatePanels || false,
        hasBattery: defs?.defaultHasBattery || false,
        batteryCapacityKWh: defs?.defaultBatteryCapacityKWh || 16.08,
        batteryDOD: defs?.defaultBatteryDOD || 90,
      },
      rates: {
        ...BENCHMARK_PROJECT.rates,
        targetCoveragePct: defs?.defaultTargetCoveragePct || 95,
        isZeroExport: defs?.defaultZeroExport || false,
        gridExportFeePct: defs?.defaultApplySieRetention ? 25.0 : 0.0,
        distributor,
        tariffCode,
        currency: defs?.currency || 'USD',
        annualEnergyInflationPct: defs?.annualEnergyTariffEscalationPct || 3.5,
      },
      financials: {
        applyLey5707: defs?.applyLey5707 !== undefined ? defs.applyLey5707 : true,
        applyITBISExemption: defs?.applyITBISExemption !== undefined ? defs.applyITBISExemption : true,
        pricePerWattUSD: defs?.defaultDirectPriceUSDPerWp || 1.05,
        discountRatePct: defs?.discountRatePct || 12,
        projectLifespanYears: defs?.lifespanYears || 25,
        co2FactorKgPerKWh: BENCHMARK_PROJECT.financials?.co2FactorKgPerKWh || 0.481,
        customItems: [],
      },
      companyProfileId: get().activeCompanyId,
      customization: {
        ...companyDocumentCustomization(get().getActiveCompany(), get().defaultDocumentCustomization, get().documentTemplatesByCompany),
        contactName: company || name,
        clientPhone: '',
        clientEmail: '',
      },
    };

    set((state) => ({
      projects: [newProj, ...state.projects],
      activeProjectId: id,
      activeView: 'simulator',
      isNewProjectModalOpen: false,
      saveFeedbackMessage: '¡Nueva propuesta creada con éxito! ✨',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 2500);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
  },

  duplicateProject: (id) => {
    const original = get().projects.find((p) => p.id === id);
    if (!original) return;

    const dupIdentifiers = generateDuplicateProjectIdentifiers(original, get().projects);
    const newId = `proj-${Date.now()}`;
    const currentUser = get().syncSettings?.currentUser;
    const clonedFinancials = { ...original.financials };
    delete clonedFinancials.customITBISSavedUSD;
    delete clonedFinancials.customLey5707CreditUSD;
    delete clonedFinancials.customCostUSD;

    const cloned: ProjectSimulation = {
      ...original,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Draft',
      authorId: currentUser?.id || original.authorId,
      authorName: currentUser?.name || original.authorName || 'Ing. Solar',
      authorEmail: currentUser?.email || original.authorEmail,
      lastModifiedBy: currentUser?.name || 'Ing. Solar',
      lastModifiedAt: new Date().toISOString(),
      version: 1,
      baseVersion: 0,
      organizationId: currentUser?.organizationId,
      syncServerUrl: currentUser ? get().syncSettings.serverUrl.trim().replace(/\/+$/, '') : undefined,
      syncStatus: currentUser ? 'pending' : 'local_only',
      client: {
        ...original.client,
        name: `${dupIdentifiers.cleanName} (Copia)`,
        projectId: dupIdentifiers.projectId,
        quoteNumber: dupIdentifiers.quoteNumber,
      },
      financials: clonedFinancials,
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

  moveToTrash: (id) => {
    const target = get().projects.find((p) => p.id === id);
    if (!target) return;

    const currentUser = get().syncSettings?.currentUser;
    const nowIso = new Date().toISOString();
    const serverUrl = get().syncSettings?.serverUrl;
    const authToken = get().syncSettings?.authToken;
    const hasSyncAuth = !!(authToken && get().syncSettings?.autoSyncEnabled);

    const nextProjects = get().projects.map((p) =>
      p.id === id
        ? {
            ...p,
            isDeleted: true,
            deletedAt: nowIso,
            deletedBy: currentUser?.name || 'Ing. Solar',
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: nowIso,
          }
        : p
    );

    const activeRemaining = nextProjects.filter((p) => !p.isDeleted);
    const nextActiveId = activeRemaining.length > 0 ? activeRemaining[0].id : '';

    set((state) => ({
      projects: nextProjects,
      activeProjectId: state.activeProjectId === id ? nextActiveId : state.activeProjectId,
      saveFeedbackMessage: 'Proyecto movido a la papelera. 🗑️',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 2500);

    if (hasSyncAuth) {
      get().triggerAutoSync(true);
    }
  },

  deleteProject: (id) => {
    get().moveToTrash(id);
  },

  restoreProject: (id) => {
    const target = get().projects.find((p) => p.id === id);
    if (!target) return;

    const currentUser = get().syncSettings?.currentUser;
    const nowIso = new Date().toISOString();
    const serverUrl = get().syncSettings?.serverUrl;
    const authToken = get().syncSettings?.authToken;
    const hasSyncAuth = !!(authToken && get().syncSettings?.autoSyncEnabled);

    const nextProjects = get().projects.map((p) =>
      p.id === id
        ? {
            ...p,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: nowIso,
          }
        : p
    );

    set({
      projects: nextProjects,
      activeProjectId: id,
      saveFeedbackMessage: `Proyecto "${target.client?.name || 'Solar'}" restaurado exitosamente. ✨`,
    });

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (hasSyncAuth) {
      get().triggerAutoSync(true);
    }
  },

  hardDeleteProject: (id) => {
    const target = get().projects.find((p) => p.id === id);
    if (!target) return;

    const serverUrl = get().syncSettings?.serverUrl;
    const authToken = get().syncSettings?.authToken;
    const hasSyncAuth = !!(authToken && get().syncSettings?.autoSyncEnabled);

    get().queueProjectDeletion(target);
    const nextProjects = get().projects.filter((p) => p.id !== id);
    const activeRemaining = nextProjects.filter((p) => !p.isDeleted);
    const nextActiveId = activeRemaining.length > 0 ? activeRemaining[0].id : '';

    set((state) => ({
      projects: nextProjects,
      activeProjectId: state.activeProjectId === id ? nextActiveId : state.activeProjectId,
      saveFeedbackMessage: 'Proyecto eliminado definitivamente.',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 2500);

    if (hasSyncAuth && serverUrl && authToken) {

      get().triggerAutoSync(true);
    }
  },

  emptyTrash: () => {
    const serverUrl = get().syncSettings?.serverUrl;
    const authToken = get().syncSettings?.authToken;
    const hasSyncAuth = !!(authToken && get().syncSettings?.autoSyncEnabled);

    const trashedCount = get().projects.filter((p) => p.isDeleted).length;
    if (trashedCount === 0) return;

    get().projects.filter((p) => p.isDeleted).forEach((project) => get().queueProjectDeletion(project));
    const nextProjects = get().projects.filter((p) => !p.isDeleted);
    const nextActiveId = nextProjects.length > 0 ? nextProjects[0].id : '';

    set((state) => ({
      projects: nextProjects,
      activeProjectId: state.projects.find((p) => p.id === state.activeProjectId)?.isDeleted
        ? nextActiveId
        : state.activeProjectId,
      saveFeedbackMessage: `Se vació la papelera (${trashedCount} propuesta(s) eliminada(s)).`,
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (hasSyncAuth && serverUrl && authToken) {

      get().triggerAutoSync(true);
    }
  },

  setProjectStatus: (id, status) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, status, ...projectMutationMetadata(p, get().syncSettings), updatedAt: new Date().toISOString() } : p
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
        p.id === state.activeProjectId ? { ...p, ...projectMutationMetadata(p, get().syncSettings), updatedAt: new Date().toISOString() } : p
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
          const updatedCustomization = { ...(p.customization || {}) };

          if (clientPartial.contactPhone !== undefined) {
            updatedCustomization.clientPhone = clientPartial.contactPhone;
          }
          if (clientPartial.contactPerson !== undefined) {
            updatedCustomization.contactName = clientPartial.contactPerson;
          }

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
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: new Date().toISOString(),
            client: updatedClient,
            specs: updatedSpecs,
            customization: updatedCustomization,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
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

      // 🏷️ Validar coherencia de selectedSupplierInfo si cambió el modelo de equipo
      if (
        (specsPartial.panelBrandModel && specsPartial.panelBrandModel !== activeProj.specs.panelBrandModel) ||
        (specsPartial.inverterBrandModel && specsPartial.inverterBrandModel !== activeProj.specs.inverterBrandModel) ||
        (specsPartial.batteryBrandModel && specsPartial.batteryBrandModel !== activeProj.specs.batteryBrandModel)
      ) {
        const currentSupplierInfo = { ...(mergedSpecs.selectedSupplierInfo || {}) };
        let infoChanged = false;

        if (specsPartial.inverterBrandModel && !specsPartial.selectedSupplierInfo) {
          const inv = state.equipmentCatalog.find(
            (e) => e.type === 'inverter' && e.displayName === specsPartial.inverterBrandModel
          );
          const hasMatchingSupplier = (inv?.supplierPrices || []).some(
            (sp) =>
              sp.id === currentSupplierInfo.inverter?.supplierPriceId ||
              sp.supplierName.toLowerCase().trim() === currentSupplierInfo.inverter?.supplierName?.toLowerCase().trim()
          );
          if (!hasMatchingSupplier) {
            delete currentSupplierInfo.inverter;
            infoChanged = true;
          }
        }

        if (specsPartial.panelBrandModel && !specsPartial.selectedSupplierInfo) {
          const pnl = state.equipmentCatalog.find(
            (e) => e.type === 'panel' && e.displayName === specsPartial.panelBrandModel
          );
          const hasMatchingSupplier = (pnl?.supplierPrices || []).some(
            (sp) =>
              sp.id === currentSupplierInfo.panel?.supplierPriceId ||
              sp.supplierName.toLowerCase().trim() === currentSupplierInfo.panel?.supplierName?.toLowerCase().trim()
          );
          if (!hasMatchingSupplier) {
            delete currentSupplierInfo.panel;
            infoChanged = true;
          }
        }

        if (specsPartial.batteryBrandModel && !specsPartial.selectedSupplierInfo) {
          const bat = state.equipmentCatalog.find(
            (e) => e.type === 'battery' && e.displayName === specsPartial.batteryBrandModel
          );
          const hasMatchingSupplier = (bat?.supplierPrices || []).some(
            (sp) =>
              sp.id === currentSupplierInfo.battery?.supplierPriceId ||
              sp.supplierName.toLowerCase().trim() === currentSupplierInfo.battery?.supplierName?.toLowerCase().trim()
          );
          if (!hasMatchingSupplier) {
            delete currentSupplierInfo.battery;
            infoChanged = true;
          }
        }

        if (infoChanged) {
          mergedSpecs.selectedSupplierInfo = currentSupplierInfo;
        }
      }

      return {
        projects: state.projects.map((p) => {
          if (p.id === state.activeProjectId) {
            const nextFinancials = { ...p.financials };
            if (p.id !== 'benchmark-centro-medico') {
              delete nextFinancials.customITBISSavedUSD;
              delete nextFinancials.customLey5707CreditUSD;
              delete nextFinancials.customCostUSD;
            }
            return {
              ...p,
              ...projectMutationMetadata(p, get().syncSettings),
              updatedAt: new Date().toISOString(),
              specs: mergedSpecs,
              financials: nextFinancials,
            };
          }
          return p;
        }),
      };
    });

    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
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
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: new Date().toISOString(),
            rates: updatedRates,
            specs: updatedSpecs,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
  },

  updateFinancials: (finPartial) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === state.activeProjectId) {
          const nextFinancials = { ...p.financials, ...finPartial };
          if (p.id !== 'benchmark-centro-medico') {
            delete nextFinancials.customITBISSavedUSD;
            delete nextFinancials.customLey5707CreditUSD;
            delete nextFinancials.customCostUSD;
          }
          return {
            ...p,
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: new Date().toISOString(),
            financials: nextFinancials,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
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
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: new Date().toISOString(),
            monthlyConsumption: newConsumption,
            specs: updatedSpecs,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
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
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: new Date().toISOString(),
            monthlyConsumption: newConsumption,
            specs: updatedSpecs,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
  },

  setMonthlyConsumption: (monthlyConsumption, lockAutoPanels = false) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === state.activeProjectId) {
          const newConsumption = monthlyConsumption.map((v) => Math.max(0, v));
          const updatedSpecs = { ...p.specs };

          if (lockAutoPanels) {
            updatedSpecs.autoCalculatePanels = false;
          } else if (updatedSpecs.autoCalculatePanels) {
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
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: new Date().toISOString(),
            monthlyConsumption: newConsumption,
            specs: updatedSpecs,
          };
        }
        return p;
      }),
    }));

    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
  },

  updateDocumentCustomization: (customizationPartial) => {
    set((state) => {
      const targetId = state.activeProjectId || state.getActiveProject()?.id;
      return {
        projects: state.projects.map((p) => {
          if (p.id === targetId) {
            const updatedClient = { ...p.client };
            if (customizationPartial.clientPhone !== undefined) {
              updatedClient.contactPhone = customizationPartial.clientPhone;
            }
            if (customizationPartial.contactName !== undefined) {
              updatedClient.contactPerson = customizationPartial.contactName;
            }
            return {
              ...p,
              ...projectMutationMetadata(p, get().syncSettings),
              updatedAt: new Date().toISOString(),
              client: updatedClient,
              customization: { ...(p.customization || {}), ...customizationPartial },
            };
          }
          return p;
        }),
      };
    });

    get().triggerAutoSync(false);
  },

  applySupplierPriceToProject: (equipmentType, supplierPrice, equipmentItem) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === state.activeProjectId) {
          const updatedSpecs = { ...p.specs };
          const selectedSupplierInfo = { ...(updatedSpecs.selectedSupplierInfo || {}) };

          // Si no se pasó equipmentItem explícito, buscarlo en equipmentCatalog por supplierPrice.id
          const targetItem = equipmentItem || state.equipmentCatalog.find(
            (e) => e.type === equipmentType && e.supplierPrices?.some((sp) => sp.id === supplierPrice.id)
          );

          if (equipmentType === 'panel') {
            updatedSpecs.panelUnitPriceUSD = supplierPrice.priceUSD;
            if (targetItem) {
              updatedSpecs.panelBrandModel = targetItem.displayName;
              if (targetItem.powerW) updatedSpecs.panelPowerW = targetItem.powerW;
              if (targetItem.efficiencyPct) updatedSpecs.panelEfficiency = targetItem.efficiencyPct;
            }
            selectedSupplierInfo.panel = {
              supplierName: supplierPrice.supplierName,
              priceUSD: supplierPrice.priceUSD,
              updatedAt: supplierPrice.updatedAt,
              supplierPriceId: supplierPrice.id,
            };
          } else if (equipmentType === 'inverter') {
            updatedSpecs.inverterUnitPriceUSD = supplierPrice.priceUSD;
            if (targetItem) {
              updatedSpecs.inverterBrandModel = targetItem.displayName;
              if (targetItem.powerKW) updatedSpecs.inverterPowerKW = targetItem.powerKW;
            }
            selectedSupplierInfo.inverter = {
              supplierName: supplierPrice.supplierName,
              priceUSD: supplierPrice.priceUSD,
              updatedAt: supplierPrice.updatedAt,
              supplierPriceId: supplierPrice.id,
            };
          } else if (equipmentType === 'battery') {
            updatedSpecs.batteryUnitPriceUSD = supplierPrice.priceUSD;
            updatedSpecs.hasBattery = true;
            if (targetItem) {
              updatedSpecs.batteryBrandModel = targetItem.displayName;
              if (targetItem.capacityKWh) updatedSpecs.batteryCapacityKWh = targetItem.capacityKWh;
              if (targetItem.dodPct) updatedSpecs.batteryDOD = targetItem.dodPct;
              if (targetItem.batteryEfficiencyPct) updatedSpecs.batteryEfficiencyPct = targetItem.batteryEfficiencyPct;
            }
            selectedSupplierInfo.battery = {
              supplierName: supplierPrice.supplierName,
              priceUSD: supplierPrice.priceUSD,
              updatedAt: supplierPrice.updatedAt,
              supplierPriceId: supplierPrice.id,
            };
          }

          updatedSpecs.selectedSupplierInfo = selectedSupplierInfo;

          return {
            ...p,
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: new Date().toISOString(),
            specs: updatedSpecs,
          };
        }
        return p;
      }),
      saveFeedbackMessage: `¡Precio aplicado: ${supplierPrice.supplierName} ($${supplierPrice.priceUSD} USD)! 🏷️`,
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);
    get().triggerAutoSync(false);
  },

  getActiveProject: () => {
    const state = get();
    const activeProjects = state.projects.filter((p) => !p.isDeleted);
    const found = activeProjects.find((p) => p.id === state.activeProjectId);
    if (found && found.client && found.specs && found.rates) return found;
    return activeProjects[0] || state.projects[0] || BENCHMARK_PROJECT;
  },

  getFinancialSummary: () => {
    const p = get().getActiveProject();
    return calculateFinancialSummary(
      p.client?.province || 'Santo Domingo / Distrito Nacional',
      p.specs || BENCHMARK_PROJECT.specs,
      p.rates || BENCHMARK_PROJECT.rates,
      p.financials || BENCHMARK_PROJECT.financials,
      p.monthlyConsumption || BENCHMARK_PROJECT.monthlyConsumption,
      p.client?.customMonthlyHSP,
      energyCalculationMode(effectiveFeatureSettings(get()))
    );
  },
});
