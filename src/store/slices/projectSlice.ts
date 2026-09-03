import { SimulationSlice, ProjectSlice } from '../types';
import { ProjectSimulation } from '../../types';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { INITIAL_PROJECTS, generateNextProjectSequence, generateDuplicateProjectIdentifiers } from '../initialData';
import { calculateFinancialSummary, calculateCostMatrixSummary } from '../../engine/financeEngine';
import { calculateRecommendedPanelCount } from '../../engine/solarEngine';
import { SyncService } from '../../services/syncService';

export const createProjectSlice: SimulationSlice<ProjectSlice> = (set, get) => ({
  projects: INITIAL_PROJECTS,
  activeProjectId: '',
  activeView: 'simulator',
  searchQuery: '',
  statusFilter: 'All',
  defaultSimulationSettings: {
    // 1. Proyecto y Cliente
    defaultProvince: 'Santo Domingo / Distrito Nacional',
    defaultDistributor: 'EDEESTE',
    defaultTariffCode: 'BTS2',
    defaultQuoteValidityDays: 7,

    // 2. Tarifas y Distribuidora
    defaultTargetCoveragePct: 95,
    defaultZeroExport: false,
    defaultApplySieRetention: true,
    defaultEstimatedEnergyRateDOP: 10.35,
    defaultEstimatedExportRateDOP: 5.50,

    // 3. Equipamiento y Sistema
    defaultPanelPowerW: 620,
    defaultPanelModel: 'Canadian Solar TOPBiHiKu6 CS6W-620TB-AG (620W)',
    defaultInverterPowerKW: 8.0,
    defaultSystemLosses: 25.0,
    defaultAnnualDegradation: 0.40,
    defaultAutoCalculatePanels: false,
    defaultHasBattery: false,
    defaultBatteryCapacityKWh: 16.08,
    defaultBatteryDOD: 90,

    // 4. Costos y Margen de Venta
    defaultPricingMode: 'direct',
    defaultDirectPriceUSDPerWp: 1.05,
    defaultTargetMarginPct: 28,
    defaultExcessEnergyDestiny: 'net_metering',

    // 5. Finanzas e Incentivos (Ley 57-07)
    currency: 'USD',
    taxRatePct: 18,
    discountRatePct: 12,
    applyITBISExemption: true,
    applyLey5707: true,
    ley5707AmortizationYears: 3,
    lifespanYears: 25,
    annualEnergyTariffEscalationPct: 3.5,
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
        quoteValidityDays: defs?.defaultQuoteValidityDays || 7,
      },
      specs: {
        ...BENCHMARK_PROJECT.specs,
        panelPowerW: defs?.defaultPanelPowerW || 620,
        panelBrandModel: defs?.defaultPanelModel || BENCHMARK_PROJECT.specs.panelBrandModel,
        inverterPowerKW: defs?.defaultInverterPowerKW || 8.0,
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
        ...BENCHMARK_PROJECT.financials,
        pricePerWattUSD: defs?.defaultDirectPriceUSDPerWp || 1.05,
        discountRatePct: defs?.discountRatePct || 12,
        applyITBISExemption: defs?.applyITBISExemption !== undefined ? defs.applyITBISExemption : true,
        applyLey5707: defs?.applyLey5707 !== undefined ? defs.applyLey5707 : true,
        projectLifespanYears: defs?.lifespanYears || 25,
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
      syncStatus: currentUser ? 'pending' : 'local_only',
      client: {
        ...original.client,
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
    const target = get().projects.find((p) => p.id === id);
    if (!target) return;

    const serverUrl = get().syncSettings?.serverUrl;
    const authToken = get().syncSettings?.authToken;
    const hasSyncAuth = !!(authToken && get().syncSettings?.autoSyncEnabled);

    let nextProjects: ProjectSimulation[];
    if (hasSyncAuth) {
      nextProjects = get().projects.map((p) =>
        p.id === id
          ? { ...p, isDeleted: true, syncStatus: 'pending' as const, updatedAt: new Date().toISOString() }
          : p
      );
      if (serverUrl && authToken) {
        SyncService.deleteProject(serverUrl, authToken, id).catch(() => {});
      }
    } else {
      nextProjects = get().projects.filter((p) => p.id !== id);
    }

    const activeRemaining = nextProjects.filter((p) => !p.isDeleted);
    const nextActiveId = activeRemaining.length > 0 ? activeRemaining[0].id : '';

    set((state) => ({
      projects: nextProjects,
      activeProjectId: state.activeProjectId === id ? nextActiveId : state.activeProjectId,
      saveFeedbackMessage: 'Proyecto eliminado.',
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 2500);

    if (hasSyncAuth) {
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

  applySupplierPriceToProject: (equipmentType, supplierPrice) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === state.activeProjectId) {
          const updatedSpecs = { ...p.specs };
          const selectedSupplierInfo = { ...(updatedSpecs.selectedSupplierInfo || {}) };

          if (equipmentType === 'panel') {
            updatedSpecs.panelUnitPriceUSD = supplierPrice.priceUSD;
            selectedSupplierInfo.panel = {
              supplierName: supplierPrice.supplierName,
              priceUSD: supplierPrice.priceUSD,
              updatedAt: supplierPrice.updatedAt,
              supplierPriceId: supplierPrice.id,
            };
          } else if (equipmentType === 'inverter') {
            updatedSpecs.inverterUnitPriceUSD = supplierPrice.priceUSD;
            selectedSupplierInfo.inverter = {
              supplierName: supplierPrice.supplierName,
              priceUSD: supplierPrice.priceUSD,
              updatedAt: supplierPrice.updatedAt,
              supplierPriceId: supplierPrice.id,
            };
          } else if (equipmentType === 'battery') {
            updatedSpecs.batteryUnitPriceUSD = supplierPrice.priceUSD;
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
            syncStatus: 'pending' as const,
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
      p.client?.customMonthlyHSP
    );
  },
});
