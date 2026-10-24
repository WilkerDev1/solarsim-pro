import { createProjectId } from '../../utils/projectId';
import { isReaderRole } from '../../../shared/permissions';
import { prepareProposalDraftProject, createAIProposalBase } from '../../utils/proposalDraftProject';
import { normalizeIncomingSpecs, normalizeProjectEquipment } from '../../domain/projectEdit';
import { companyDocumentCustomization } from '../../utils/companyDocumentTemplate';
import { projectMutationMetadata } from '../sync/projectMutation';
import { SimulationSlice, AISlice, SimulationStore } from '../types';
import type { ProjectSimulation, ExtractedInvoiceData } from '../../types';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { generateNextProjectSequence } from '../initialData';
import { calculateRecommendedPanelCount, getMonthlySolarProductionFactors } from '../../engine/solarEngine';
import { normalizeProposalDraft } from '../../../shared/aiProposal';
import { resolveAssumption, resolveAssumptions } from '../../../shared/assumptions';
import { DEFAULT_GEMINI_MODEL } from '../../../shared/geminiTransport';
import { buildAITariffContext } from '../../utils/aiTariffContext';
import { RD_PROVINCES, getProvinceHSP } from '../../data/rdProvinces';

const normalizeProvinceName = (raw?: string): string => {
  if (!raw) return 'Santo Domingo / Distrito Nacional';
  const normalize=(value:string)=>value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const query=normalize(raw);
  return RD_PROVINCES.find(p=>normalize(p.name)===query || normalize(p.name).includes(query))?.name
    || (query.includes('punta cana') || query.includes('higuey') ? 'La Altagracia (Punta Cana / Higüey)' : getProvinceHSP(raw).name);
};

/** Pure: validates the draft against today's inventory and builds the proposal without touching the store. */
export function buildProjectFromDraft(state:SimulationStore,input:ExtractedInvoiceData,createNewProject=false):{project:ProjectSimulation;previous?:ProjectSimulation}|{error:string} {
    const current=state.projects.find(p=>p.id===state.activeProjectId);
    if(isReaderRole(state.syncSettings.currentUser?.role)) return {error:'Tu rol permite consultar propuestas, no crearlas ni modificarlas.'};
    if(!createNewProject && (!current || current.isDeleted || current.deletedAt || (current.organizationId && current.organizationId!==state.syncSettings.currentUser?.organizationId))) return {error:'No se puede actualizar esta propuesta.'};
    const isGrounded=Array.isArray(input.panels) || Array.isArray(input.inverters) || Array.isArray(input.batteries);
    const province=normalizeProvinceName(input.province || input.municipality || (!createNewProject?current?.client.province:state.defaultSimulationSettings.defaultProvince));
    const defaults=state.defaultSimulationSettings;
    const base:ProjectSimulation=createNewProject?createAIProposalBase(BENCHMARK_PROJECT,defaults,province):current!;
    const losses=resolveAssumptions(base).systemLossesPct;
    // Revalidate against today's inventory before committing any change. Legacy callers retain their API.
    const data=isGrounded?normalizeProposalDraft(input,state.equipmentCatalog,{province,systemLosses:losses,
      annualSpecificYieldKWhPerKWp:calculateRecommendedPanelCount(province,Array(12).fill(0),620,95,losses,base.client.customMonthlyHSP).annualSpecificYieldKWhPerKWp,
      monthlySpecificYieldKWhPerKWp:getMonthlySolarProductionFactors(province,losses,base.client.customMonthlyHSP),
      tariffReference:buildAITariffContext(state.tariffMatrix)}):input;
    if(isGrounded && data.requiresReview) return {error:data.validationIssues?.find(i=>i.severity==='error')?.message || 'Revisa los datos pendientes antes de aplicar.'};
    if(data.monthlyConsumptionKWh.length!==12 || data.monthlyConsumptionKWh.some(n=>!Number.isFinite(n) || n<0)) return {error:'Completa los doce consumos mensuales antes de aplicar.'};
    const now=new Date().toISOString();
    const prepared=prepareProposalDraftProject(base,data,state.tariffMatrix,{isNew:createNewProject,defaultBatteryDOD:defaults.defaultBatteryDOD,catalog:state.equipmentCatalog});
    const {specs,rates}=prepared;
    const seq=createNewProject?generateNextProjectSequence(state.projects):undefined;
    const user=state.syncSettings.currentUser;
    const project:ProjectSimulation={...base,
      ...(createNewProject?{id:createProjectId(),createdAt:now,status:'Draft',
        authorId:user?.id || 'local-user',authorName:user?.name || 'Ing. Solar',authorEmail:user?.email || '',version:1,baseVersion:0,
        organizationId:user?.organizationId,syncServerUrl:user?state.syncSettings.serverUrl.trim().replace(/\/+$/,''):undefined,syncStatus:user?'pending':'local_only',companyProfileId:state.activeCompanyId}
        :projectMutationMetadata(base,state.syncSettings)),
      updatedAt:now,lastModifiedAt:now,lastModifiedBy:user?.name || base.lastModifiedBy || 'Ing. Solar',
      client:{...base.client,name:data.clientName || base.client.name,company:data.companyName ?? base.client.company,address:data.address ?? base.client.address,
        location:data.address || base.client.location,province,distributor:data.distributor,tariffCode:rates.tariffCode,
        contactPhone:data.phone ?? base.client.contactPhone,contactEmail:data.email ?? base.client.contactEmail,
        nic:data.nic ?? base.client.nic,nis:data.nis ?? base.client.nis,rnc:data.rnc ?? base.client.rnc,
        contractNumber:data.contractNumber ?? base.client.contractNumber,circuit:data.circuit ?? base.client.circuit,
        meterNumber:data.meterNumber ?? base.client.meterNumber,voltagePhase:data.voltagePhase ?? base.client.voltagePhase,
        ...(seq?{projectId:seq.projectId,quoteNumber:seq.quoteNumber,quoteValidityDays:resolveAssumption('quoteValidityDays',defaults.defaultQuoteValidityDays)}:{}),},
      financials:prepared.financials,
      specs,rates,monthlyConsumption:[...data.monthlyConsumptionKWh],
      aiSource:{...base.aiSource,consumptionSource:data.consumptionSource,energyRateSource:data.energyRateSource,
        extractedFromFileName:data.extractedFromFileName,modelUsed:data.modelUsed,requestedModel:data.requestedModel,
        notes:data.specialTechnicalNotes!==undefined || data.aiNotes!==undefined ? ([data.specialTechnicalNotes,data.aiNotes].filter(Boolean).join('\n') || undefined) : base.aiSource?.notes},
      ...(createNewProject?{customization:{...companyDocumentCustomization(state.getActiveCompany(),state.defaultDocumentCustomization,state.documentTemplatesByCompany),contactName:data.clientName,clientPhone:data.phone,clientEmail:data.email}}:{}),
    };
    // ADR 0004 (d): el borrador entra con la misma normalización que una edición (existente) o que una importación (nueva); sin autodimensionar.
    return {project:createNewProject?{...project,specs:normalizeIncomingSpecs(project.specs)}:normalizeProjectEquipment(current!,project),previous:createNewProject?undefined:current};
}

export const createAISlice: SimulationSlice<AISlice> = (set, get) => ({
  geminiApiKey: '', geminiModel: DEFAULT_GEMINI_MODEL,
  setGeminiApiKey: key=>set({geminiApiKey:key}),
  setGeminiModel: model=>set({geminiModel:model || DEFAULT_GEMINI_MODEL}),
  applyExtractedInvoice: (input,createNewProject=false)=>{
    const state=get();
    const built=buildProjectFromDraft(state,input,createNewProject);
    if('error' in built) {set({saveFeedbackMessage:built.error});return;}
    const {project,previous}=built;
    if(previous) state.recordUndoState(previous);
    set({projects:createNewProject?[project,...state.projects]:state.projects.map(p=>p.id===project.id?project:p),activeProjectId:project.id,
      activeView:'simulator',isAIInvoiceModalOpen:false,saveFeedbackMessage:`Propuesta ${project.client.projectId} ${createNewProject?'creada':'actualizada'}.`});
    if(get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) get().triggerAutoSync(true);
    setTimeout(()=>set({saveFeedbackMessage:null}),4000);
  },
});
