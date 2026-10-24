import { createProjectId } from '../../utils/projectId';
import { canEditCommercial } from '../../features/proposals/commercial';
import { isProposalLink } from '../../../shared/proposalLinks';
import { withoutInheritedPanelDegradation } from '../../utils/equipmentGroups';
import { applyProjectEdit, normalizeProjectEquipment, type ProjectEdit } from '../../domain/projectEdit';
import { editEquipment, readEquipment } from '../../../shared/equipment';
import { commercialCopy, commercialState, isProposalCommercial } from '../../../shared/proposalCommercial';
import { companyDocumentCustomization, reusableDocumentTemplate } from '../../utils/companyDocumentTemplate';
import { DEFAULT_SIMULATION_SETTINGS } from '../defaultSimulationSettings';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../../features/application/featurePolicy';
import { SimulationSlice, ProjectSlice, SimulationStore } from '../types';
import { ProjectSimulation, SystemSpecs } from '../../types';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { INITIAL_PROJECTS, generateNextProjectSequence, generateDuplicateProjectIdentifiers } from '../initialData';
import { calculateFinancialSummary, calculateCostMatrixSummary } from '../../engine/financeEngine';
import { projectMutationMetadata } from '../sync/projectMutation';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../constants/defaultDocumentCustomization';
import { canEditDocument } from '../../components/pdf/editor/documentEditorState';
import { normalizeDocumentLayout } from '../../../shared/documentLayout';
import { applyDocumentTextPatch, companyTemplateTextPatch, documentTextsPatch } from '../../../shared/documentTexts';
import { DEFAULT_BATTERY_CAPACITY_KWH, DEFAULT_BATTERY_DOD_PCT } from '../../../shared/projectDefaults';
import { assumptionFields, type AssumptionFields } from '../../../shared/assumptions';
import { documentTextContextFor } from '../../utils/documentTextContext';

/** Specs of a new proposal: the reference case with the user's defaults written straight into the single group of each kind. */
function newProjectSpecs(defs: SimulationStore['defaultSimulationSettings'] | undefined, assumptions: AssumptionFields): SystemSpecs {
  const directWattPrice = assumptions.specs.pricePerWattUSD;
  let specs: SystemSpecs = {
    ...BENCHMARK_PROJECT.specs,
    // El $/W del caso de referencia (1.134971) no es un default: todo proyecto nuevo parte del ajuste.
    pricePerWattUSD: directWattPrice,
    pricePerKWpUSD: Math.round(directWattPrice * 1000 * 100) / 100,
    isDetailed: false, // Simple (Catálogo IA): equipos del catálogo con precios de proveedor
    pricingMode: defs?.defaultPricingMode === 'direct' ? 'direct_watt' : 'cost_matrix',
    systemLosses: assumptions.specs.systemLosses,
    annualDegradation: assumptions.specs.annualDegradation,
    dopExchangeRate: assumptions.specs.dopExchangeRate,
    saleMarginMultiplier: assumptions.specs.saleMarginMultiplier,
    installationUnitPriceUSD: assumptions.specs.installationUnitPriceUSD,
    autoCalculatePanels: defs?.defaultAutoCalculatePanels || false,
    hasBattery: defs?.defaultHasBattery || false,
  };
  specs = withoutInheritedPanelDegradation(specs); // el 0.5 % de la referencia no puede ganarle a lo configurado
  const referencePanelModel = readEquipment(BENCHMARK_PROJECT.specs).panels[0].brandModel;
  specs = editEquipment(specs, 'panel', { type: 'update', index: 0, patch: { powerW: defs?.defaultPanelPowerW || 620, brandModel: defs?.defaultPanelModel || referencePanelModel } });
  specs = editEquipment(specs, 'inverter', { type: 'update', index: 0, patch: { brandModel: defs?.defaultInverterModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)', powerKW: defs?.defaultInverterPowerKW || 8.0, count: 1 } });
  return editEquipment(specs, 'battery', { type: 'update', index: 0, patch: { capacityKWh: defs?.defaultBatteryCapacityKWh || DEFAULT_BATTERY_CAPACITY_KWH, dodPct: defs?.defaultBatteryDOD || DEFAULT_BATTERY_DOD_PCT } });
}

export const createProjectSlice: SimulationSlice<ProjectSlice> = (set, get) => {
  /** Proposals in the trash are read-only until restored, whatever UI or tool calls the store. */
  const isActiveProjectTrashed = () => {
    const state = get();
    return !!state.projects.find((p) => p.id === (state.activeProjectId || state.getActiveProject()?.id))?.isDeleted;
  };

  /** Same rule as the editor UI: writers only, never trashed or conflicted proposals. */
  const canEditActiveDocument = () => {
    const state = get();
    const active = state.projects.find((p) => p.id === (state.activeProjectId || state.getActiveProject()?.id));
    return !!active && canEditDocument({ project: active, user: state.syncSettings.currentUser });
  };

  /** Applies an edit to the active project, stamps mutation metadata, then auto-syncs and records undo. */
  const updateActiveProject = (edit: (project: ProjectSimulation, state: SimulationStore) => Partial<ProjectSimulation>) => {
    if (isActiveProjectTrashed()) return;
    set((state) => ({
      projects: state.projects.map((p) => p.id === state.activeProjectId
        ? { ...p, ...edit(p, state), ...projectMutationMetadata(p, get().syncSettings), updatedAt: new Date().toISOString() }
        : p),
    }));
    get().triggerAutoSync(false);
    const active = get().getActiveProject();
    if (active) get().recordUndoState(active);
  };

  /** ADR 0004: las reglas de la edición viven en `applyProjectEdit`; aquí solo se persiste, sincroniza y deshace. */
  const editActiveProject = (edit: ProjectEdit) =>
    updateActiveProject((p, state) => applyProjectEdit(p, edit, { equipmentCatalog: state.equipmentCatalog }));

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

  updateProjectById: (id, edit, options) => {
    const target = get().projects.find((p) => p.id === id);
    if (!target || target.isDeleted || target.deletedAt) return false;
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...projectMutationMetadata(p, get().syncSettings), updatedAt: new Date().toISOString(), ...edit(p) };
        // A restored snapshot is already a consistent project: merging it with the groups being undone would keep new data.
        return options?.restore ? next : normalizeProjectEquipment(p, next);
      }),
    }));
    get().triggerAutoSync(false);
    if (id === get().activeProjectId) get().recordUndoState(get().getActiveProject());
    return true;
  },

  createNewProject: (payload) => {
    const defs = get().defaultSimulationSettings;
    // ADR 0003 (d): ajustes del usuario primero, luego las constantes compartidas; la misma fábrica que importar y la IA.
    const assumptions = assumptionFields(undefined, defs);
    const id = createProjectId();
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
        quoteValidityDays: assumptions.client.quoteValidityDays,
      },
      specs: newProjectSpecs(defs, assumptions),
      rates: {
        ...BENCHMARK_PROJECT.rates,
        targetCoveragePct: assumptions.rates.targetCoveragePct,
        isZeroExport: defs?.defaultZeroExport || false,
        gridExportFeePct: assumptions.rates.gridExportFeePct,
        usdExchangeRate: assumptions.rates.usdExchangeRate,
        distributor,
        tariffCode,
        currency: defs?.currency || 'USD',
        annualEnergyInflationPct: assumptions.rates.annualEnergyInflationPct,
      },
      financials: {
        applyLey5707: defs?.applyLey5707 !== undefined ? defs.applyLey5707 : true,
        applyITBISExemption: defs?.applyITBISExemption !== undefined ? defs.applyITBISExemption : true,
        pricePerWattUSD: assumptions.financials.pricePerWattUSD,
        discountRatePct: assumptions.financials.discountRatePct,
        projectLifespanYears: assumptions.financials.projectLifespanYears,
        co2FactorKgPerKWh: assumptions.financials.co2FactorKgPerKWh,
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

  duplicateProject: (id, options) => {
    const original = get().projects.find((p) => p.id === id);
    if (!original) return undefined;

    const dupIdentifiers = generateDuplicateProjectIdentifiers(original, get().projects);
    const newId = createProjectId();
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
      ...(options?.activate === false ? {} : { activeProjectId: newId }),
      saveFeedbackMessage: `¡Proyecto duplicado como versión ${dupIdentifiers.versionSuffix}! ✨`,
    }));

    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }
    return newId;
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

  updateClient: (patch) => editActiveProject({ kind: 'client', patch }),

  updateSpecs: (patch) => editActiveProject({ kind: 'specs', patch }),

  updateRates: (patch) => editActiveProject({ kind: 'rates', patch }),

  updateFinancials: (patch) => editActiveProject({ kind: 'financials', patch }),

  updateMonthlyConsumption: (index, value) => updateActiveProject((p, state) => {
    const monthlyConsumption = [...p.monthlyConsumption];
    monthlyConsumption[index] = value;
    return applyProjectEdit(p, { kind: 'consumption', monthlyConsumption }, { equipmentCatalog: state.equipmentCatalog });
  }),

  updateAllMonthlyConsumption: (value) => editActiveProject({ kind: 'consumption', monthlyConsumption: Array(12).fill(value) }),

  setMonthlyConsumption: (monthlyConsumption, lockAutoPanels = false) =>
    editActiveProject({ kind: 'consumption', monthlyConsumption, lockAutoPanels }),

  updateDocumentCustomization: (customizationPartial) => updateActiveProject((p) => {
    // Contacto, teléfono y correo del documento son espejo de los datos del cliente.
    const client = { ...p.client };
    if (customizationPartial.clientPhone !== undefined) client.contactPhone = customizationPartial.clientPhone;
    if (customizationPartial.contactName !== undefined) client.contactPerson = customizationPartial.contactName;
    if (customizationPartial.clientEmail !== undefined) client.contactEmail = customizationPartial.clientEmail;
    return { client, customization: { ...(p.customization || {}), ...customizationPartial } };
  }),

  setDocumentLayout: (patch) => !canEditActiveDocument() ? undefined : updateActiveProject((p) => ({
    customization: { ...(p.customization || {}), layout: normalizeDocumentLayout({ ...(p.customization?.layout || {}), ...patch }) },
  })),

  setDocumentTexts: (values) => !canEditActiveDocument() ? undefined : updateActiveProject((p, state) => {
    const ctx = documentTextContextFor(state, p, energyCalculationMode(effectiveFeatureSettings(state)));
    const patch = documentTextsPatch(values, p, ctx);
    const next = applyDocumentTextPatch({ customization: p.customization || {}, client: p.client }, patch);
    return { customization: next.customization, client: next.client };
  }),

  saveDocumentTextsToCompanyTemplate: (keys) => {
    const state = get();
    const active = state.getActiveProject();
    const companyId = active?.companyProfileId || (state.companies.length === 1 ? state.companies[0].id : undefined);
    const company = state.companies.find((item) => item.id === companyId);
    if (!active || !company) {
      set({ saveFeedbackMessage: 'Selecciona la empresa emisora de esta propuesta antes de guardar su plantilla.' });
      return { saved: [], skipped: keys === 'all' ? [] : [...keys] };
    }
    const template = state.documentTemplatesByCompany[company.id] || reusableDocumentTemplate(companyDocumentCustomization(company, state.defaultDocumentCustomization, state.documentTemplatesByCompany));
    const ctx = documentTextContextFor(state, active, energyCalculationMode(effectiveFeatureSettings(state)));
    const { patch, saved, skipped } = companyTemplateTextPatch(keys, active, ctx, template);
    if (!saved.length) return { saved, skipped };
    set((current) => ({
      defaultDocumentCustomization: { ...(current.defaultDocumentCustomization || DEFAULT_DOCUMENT_CUSTOMIZATION), ...patch },
      documentTemplatesByCompany: { ...current.documentTemplatesByCompany, [company.id]: { ...template, ...patch } },
      saveFeedbackMessage: saved.length === 1 ? 'Texto guardado en la plantilla de la empresa 📑' : `${saved.length} textos guardados en la plantilla de la empresa 📑`,
    }));
    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);
    return { saved, skipped };
  },

  applySupplierPriceToProject: (equipmentType, supplierPrice, equipmentItem) => {
    if (isActiveProjectTrashed()) return;
    // Decisión (b) del ADR 0004: el precio es una edición más (normaliza, autodimensiona, sincroniza y se puede deshacer).
    editActiveProject({ kind: 'supplierPrice', equipmentType, supplierPrice, equipmentItem });
    set({ saveFeedbackMessage: `¡Precio aplicado: ${supplierPrice.supplierName} ($${supplierPrice.priceUSD} USD)! 🏷️` });
    setTimeout(() => set({ saveFeedbackMessage: null }), 3000);
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
