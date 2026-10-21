import { canEditCommercial } from '../../features/proposals/commercial';
import { isProposalLink } from '../../../shared/proposalLinks';
import { normalizeEquipmentEdit, normalizeSpecsChange } from '../../utils/equipmentGroups';
import { commercialCopy, commercialState, isProposalCommercial } from '../../../shared/proposalCommercial';
import { companyDocumentCustomization, reusableDocumentTemplate } from '../../utils/companyDocumentTemplate';
import { DEFAULT_SIMULATION_SETTINGS } from '../defaultSimulationSettings';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../../features/application/featurePolicy';
import { SimulationSlice, ProjectSlice, SimulationStore } from '../types';
import { ClientInfo, FinancialParams, ProjectSimulation, SystemSpecs } from '../../types';
import { normalizeEnabledBatteries } from '../../utils/batteryState';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { INITIAL_PROJECTS, generateNextProjectSequence, generateDuplicateProjectIdentifiers } from '../initialData';
import { calculateFinancialSummary, calculateCostMatrixSummary } from '../../engine/financeEngine';
import { calculateRecommendedPanelCount } from '../../engine/solarEngine';
import { projectMutationMetadata } from '../sync/projectMutation';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../constants/defaultDocumentCustomization';

/** Specs with the panel count the engine recommends for this consumption, province and coverage target. */
function withRecommendedPanels(specs: SystemSpecs, client: ClientInfo, monthlyConsumption: number[], targetCoveragePct: number): SystemSpecs {
  const rec = calculateRecommendedPanelCount(
    client.province,
    monthlyConsumption,
    specs.panelPowerW || 620,
    targetCoveragePct,
    specs.systemLosses !== undefined ? specs.systemLosses : 25.0,
    client.customMonthlyHSP
  );
  // Goes through the group normalizer so a single panel group receives the recommendation too.
  return normalizeEquipmentEdit(specs, { panelCount: rec.recommendedPanelCount });
}

/** Keeps equipment groups and their legacy mirror consistent whatever path changed the specs. */
function withNormalizedEquipment(previous: ProjectSimulation, next: ProjectSimulation): ProjectSimulation {
  return next.specs === previous.specs ? next : { ...next, specs: normalizeSpecsChange(previous.specs, next.specs) };
}

/** Manual override fields only survive on the audited reference case; edits elsewhere recompute them. */
function withoutStaleFinancialOverrides(project: ProjectSimulation, financials: FinancialParams): FinancialParams {
  const next = { ...financials };
  if (project.id !== 'benchmark-centro-medico') {
    delete next.customITBISSavedUSD;
    delete next.customLey5707CreditUSD;
    delete next.customCostUSD;
  }
  return next;
}

export const createProjectSlice: SimulationSlice<ProjectSlice> = (set, get) => {
  /** Proposals in the trash are read-only until restored, whatever UI or tool calls the store. */
  const isActiveProjectTrashed = () => {
    const state = get();
    return !!state.projects.find((p) => p.id === (state.activeProjectId || state.getActiveProject()?.id))?.isDeleted;
  };

  /** Applies an edit to the active project, stamps mutation metadata, then auto-syncs and records undo. */
  const updateActiveProject = (edit: (project: ProjectSimulation, state: SimulationStore) => Partial<ProjectSimulation>) => {
    if (isActiveProjectTrashed()) return;
    set((state) => ({
      projects: state.projects.map((p) => p.id === state.activeProjectId
        ? withNormalizedEquipment(p, { ...p, ...projectMutationMetadata(p, get().syncSettings), updatedAt: new Date().toISOString(), ...edit(p, state) })
        : p),
    }));
    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
  };

  const updateActiveConsumption = (nextConsumption: (current: number[]) => number[], lockAutoPanels = false) =>
    updateActiveProject((p) => {
      const monthlyConsumption = nextConsumption(p.monthlyConsumption);
      let specs = { ...p.specs };
      if (lockAutoPanels) specs.autoCalculatePanels = false;
      else if (specs.autoCalculatePanels) specs = withRecommendedPanels(specs, p.client, monthlyConsumption, p.rates.targetCoveragePct ?? 95);
      return {
        monthlyConsumption,
        aiSource: p.aiSource?.consumptionSource === 'theoretical' ? { ...p.aiSource, consumptionSource: 'estimated' } : p.aiSource,
        specs,
      };
    });

  return {
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
      commercial: commercialCopy(original, currentUser || undefined),
      proposalLink: {parentId: original.id},
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

  linkProposals: (id, parentId) => {
    const state=get(), project=state.projects.find(p=>p.id===id);
    const writable=(p: typeof project)=>p && canEditCommercial(p,state.syncSettings);
    if(!writable(project))return {success:false,error:'La propuesta no permite cambios.'};
    if(parentId===null){set({projects:state.projects.map(p=>p.id===id?{...p,proposalLink:{parentId:null,color:p.proposalLink?.color},...projectMutationMetadata(p,state.syncSettings),updatedAt:new Date().toISOString()}:p)});state.triggerAutoSync();return {success:true};}
    const parent=state.projects.find(p=>p.id===parentId);if(!writable(parent))return {success:false,error:'La propuesta principal no está disponible para enlazar.'};
    const visited=new Set([id]);let cursor=parent;while(cursor){if(visited.has(cursor.id))return {success:false,error:'No se puede crear un enlace circular.'};visited.add(cursor.id);cursor=state.projects.find(p=>p.id===cursor?.proposalLink?.parentId);}
    set({projects:state.projects.map(p=>p.id===id?{...p,proposalLink:{parentId,color:undefined},...projectMutationMetadata(p,state.syncSettings),updatedAt:new Date().toISOString()}:p)});
    state.triggerAutoSync();return {success:true};
  },
  setProposalGroupColor: (id,color) => {
    const state=get();if(!isProposalLink({parentId:null,color}))return {success:false,error:'Color de grupo inválido.'};
    let project=state.projects.find(p=>p.id===id);const visited=new Set<string>();while(project?.proposalLink?.parentId && !visited.has(project.id)){visited.add(project.id);const parent=state.projects.find(p=>p.id===project?.proposalLink?.parentId);if(!parent)break;project=parent;}
    if(!project || !canEditCommercial(project,state.syncSettings))return {success:false,error:'El grupo no permite cambios.'};
    const root=project;set({projects:state.projects.map(p=>p.id===root.id?{...p,proposalLink:{parentId:p.proposalLink?.parentId||null,color},...projectMutationMetadata(p,state.syncSettings),updatedAt:new Date().toISOString()}:p)});state.triggerAutoSync();return {success:true};
  },
  addProposalCommercialReport: (id,report,updateCurrent) => {
    const state=get(), project=state.projects.find(p=>p.id===id), user=state.syncSettings.currentUser;
    if(!project || !canEditCommercial(project,state.syncSettings))return {success:false,error:'La propuesta no permite cambios.'};
    const current=commercialState(project), now=new Date().toISOString();
    const reports=[...(current.reports||[])];
    // Preserve the pre-history note once, with its original state and attribution.
    if(!reports.length && current.note.trim())reports.push({id:`legacy-${project.id}`,projectId:id,status:current.status,note:current.note,ownerId:current.ownerId,ownerName:current.ownerName,createdAt:current.updatedAt || project.updatedAt,createdById:current.updatedById,createdByName:current.updatedByName});
    reports.push({...report,note:report.note.trim(),id:crypto.randomUUID(),projectId:id,createdAt:now,createdById:user?.id,createdByName:user?.name||state.localUserProfile.name||'Consultor local'});
    const next={...current,...(updateCurrent?{status:report.status,ownerId:report.ownerId,ownerName:report.ownerName}:{}),note:report.note.trim(),reports,updatedAt:now,updatedById:user?.id,updatedByName:user?.name||state.localUserProfile.name||'Consultor local'};
    if(!isProposalCommercial(next))return {success:false,error:'Escribe una nota de hasta 4000 caracteres. Límite: 500 reportes por propuesta.'};
    state.createSnapshot(id,'Antes de agregar reporte comercial',undefined,'auto');
    set({projects:get().projects.map(p=>p.id===id?{...p,commercial:next,...projectMutationMetadata(p,state.syncSettings),updatedAt:now}:p)});state.triggerAutoSync();return {success:true};
  },
  setProposalCommercialState: (id, patch) => {
    const state = get(), project = state.projects.find(p => p.id === id), user = state.syncSettings.currentUser;
    if (!project || !canEditCommercial(project, state.syncSettings)) return { success: false, error: 'Esta propuesta no permite cambios. Revisa permisos, papelera o conflictos pendientes.' };
    const previous = commercialState(project);
    const next = { ...previous, ...patch, updatedAt: new Date().toISOString(), updatedById: user?.id, updatedByName: user?.name || state.localUserProfile.name || 'Consultor local' };
    if (!isProposalCommercial(next)) return {success:false,error:'Estado inválido o nota demasiado larga (máximo 4000 caracteres).'};
    if (previous.status === next.status && previous.note === next.note && previous.ownerId === next.ownerId && previous.ownerName === next.ownerName) return {success:true};
    state.createSnapshot(id, 'Antes de actualizar seguimiento comercial', undefined, 'auto');
    set({ projects: get().projects.map(p => p.id === id ? { ...p, commercial: next, ...projectMutationMetadata(p, state.syncSettings), updatedAt: next.updatedAt } : p) });
    state.triggerAutoSync();
    return {success:true};
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

  updateClient: (clientPartial) => updateActiveProject((p) => {
    const client = { ...p.client, ...clientPartial };
    const customization = { ...(p.customization || {}) };
    if (clientPartial.contactPhone !== undefined) customization.clientPhone = clientPartial.contactPhone;
    if (clientPartial.contactPerson !== undefined) customization.contactName = clientPartial.contactPerson;
    const specs = p.specs.autoCalculatePanels && clientPartial.province
      ? withRecommendedPanels(p.specs, client, p.monthlyConsumption, p.rates.targetCoveragePct ?? 95)
      : { ...p.specs };
    return { client, specs, customization };
  }),

  updateSpecs: (specsPartial) => updateActiveProject((p, state) => {
    let specs = normalizeEnabledBatteries(normalizeEquipmentEdit(p.specs, specsPartial));
    const shouldAutoCalc = specsPartial.autoCalculatePanels !== undefined
      ? specsPartial.autoCalculatePanels
      : (p.specs.autoCalculatePanels && specsPartial.panelCount === undefined);

    if (shouldAutoCalc) {
      specs = { ...withRecommendedPanels(specs, p.client, p.monthlyConsumption, p.rates.targetCoveragePct ?? 95), autoCalculatePanels: true };
    } else if (specsPartial.panelCount !== undefined && specsPartial.autoCalculatePanels === undefined) {
      specs.autoCalculatePanels = false;
    }

    // When any model changes, drop selected suppliers that do not quote the submitted models.
    const modelKeys = [['panel', 'panelBrandModel'], ['inverter', 'inverterBrandModel'], ['battery', 'batteryBrandModel']] as const;
    if (!specsPartial.selectedSupplierInfo && modelKeys.some(([, key]) => specsPartial[key] && specsPartial[key] !== p.specs[key])) {
      const supplierInfo = { ...(specs.selectedSupplierInfo || {}) };
      let changed = false;
      for (const [kind, modelKey] of modelKeys) {
        const model = specsPartial[modelKey];
        if (!model) continue;
        const current = supplierInfo[kind];
        const item = state.equipmentCatalog.find((e) => e.type === kind && e.displayName === model);
        const quoted = (item?.supplierPrices || []).some(
          (sp) => sp.id === current?.supplierPriceId || sp.supplierName.toLowerCase().trim() === current?.supplierName?.toLowerCase().trim()
        );
        if (!quoted) {
          delete supplierInfo[kind];
          changed = true;
        }
      }
      if (changed) specs.selectedSupplierInfo = supplierInfo;
    }

    return { specs, financials: withoutStaleFinancialOverrides(p, p.financials) };
  }),

  updateRates: (ratesPartial) => updateActiveProject((p) => ({
    rates: { ...p.rates, ...ratesPartial },
    specs: p.specs.autoCalculatePanels && ratesPartial.targetCoveragePct !== undefined
      ? withRecommendedPanels(p.specs, p.client, p.monthlyConsumption, ratesPartial.targetCoveragePct)
      : { ...p.specs },
  })),

  updateFinancials: (finPartial) => updateActiveProject((p) => ({
    financials: withoutStaleFinancialOverrides(p, { ...p.financials, ...finPartial }),
  })),

  updateMonthlyConsumption: (index, value) => updateActiveConsumption((current) => {
    const next = [...current];
    next[index] = Math.max(0, value);
    return next;
  }),

  updateAllMonthlyConsumption: (value) => updateActiveConsumption(() => Array(12).fill(Math.max(0, value))),

  setMonthlyConsumption: (monthlyConsumption, lockAutoPanels = false) =>
    updateActiveConsumption(() => monthlyConsumption.map((v) => Math.max(0, v)), lockAutoPanels),

  updateDocumentCustomization: (customizationPartial) => {
    if (isActiveProjectTrashed()) return;
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
    if (isActiveProjectTrashed()) return;
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

          // Group arrays drive the engines. Keep their primary row in sync with the sidebar.
          if (equipmentType === 'panel' && updatedSpecs.panels?.length) {
            updatedSpecs.panels = updatedSpecs.panels.map((item, index) => index ? item : {
              ...item, brandModel: updatedSpecs.panelBrandModel || item.brandModel,
              powerW: updatedSpecs.panelPowerW, unitPriceUSD: supplierPrice.priceUSD,
              selectedSupplierInfo: selectedSupplierInfo.panel,
            });
          }
          if (equipmentType === 'inverter' && updatedSpecs.inverters?.length) {
            updatedSpecs.inverters = updatedSpecs.inverters.map((item, index) => index ? item : {
              ...item, brandModel: updatedSpecs.inverterBrandModel || item.brandModel,
              powerKW: updatedSpecs.inverterPowerKW, unitPriceUSD: supplierPrice.priceUSD,
              selectedSupplierInfo: selectedSupplierInfo.inverter,
            });
          }
          if (equipmentType === 'battery' && updatedSpecs.batteries?.length) {
            updatedSpecs.batteries = updatedSpecs.batteries.map((item, index) => index ? item : {
              ...item, brandModel: updatedSpecs.batteryBrandModel || item.brandModel,
              capacityKWh: updatedSpecs.batteryCapacityKWh || item.capacityKWh,
              dodPct: updatedSpecs.batteryDOD, unitPriceUSD: supplierPrice.priceUSD,
              selectedSupplierInfo: selectedSupplierInfo.battery,
            });
          }
          updatedSpecs.selectedSupplierInfo = selectedSupplierInfo;
          const nextFinancials = withoutStaleFinancialOverrides(p, p.financials);

          return {
            ...p,
            ...projectMutationMetadata(p, get().syncSettings),
            updatedAt: new Date().toISOString(),
            specs: normalizeEnabledBatteries(updatedSpecs),
            financials: nextFinancials,
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
};
};
