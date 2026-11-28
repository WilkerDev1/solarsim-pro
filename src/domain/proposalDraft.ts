/**
 * Del borrador de IA a la propuesta (pura: valida contra el inventario de hoy y arma el proyecto sin tocar el almacén).
 *
 * Lo usa `create_proposal` (agentes externos por el MCP local y herramienta compartida): el borrador entra por el
 * normalizador determinista (`shared/aiProposal`), se completa con la fábrica única (ADR 0009) y pasa por las mismas
 * reglas que una edición (ADR 0004). El asistente de la app crea con `createNewProposal` y sus propios manejadores.
 */
import { createProjectId } from '../utils/projectId';
import { isReaderRole } from '../../shared/permissions';
import { prepareProposalDraftProject, createAIProposalBase, sizeDraftPanelsWithBasis } from '../utils/proposalDraftProject';
import { annualSpecificYieldKWhPerKWp, resolveSizingBasis } from './sizing';
import { newProposalIdentity } from './newProposal';
import { normalizeIncomingSpecs, normalizeProjectEquipment } from './projectEdit';
import { companyDocumentCustomization } from '../utils/companyDocumentTemplate';
import { withDraftDocumentTexts } from '../utils/draftDocumentTexts';
import { projectMutationMetadata } from '../store/sync/projectMutation';
import type { SimulationStore } from '../store/types';
import type { ProjectSimulation, ExtractedInvoiceData } from '../types';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { generateNextProjectSequence } from '../store/initialData';
import { getMonthlySolarProductionFactors } from '../engine/solarEngine';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { resolveAssumption, resolveAssumptions } from '../../shared/assumptions';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { RD_PROVINCES, getProvinceHSP } from '../data/rdProvinces';
import { effectiveGenericPrice, effectiveGenericPriceMap, priceFeatureActive } from '../store/slices/equipmentPriceSlice';

const normalizeProvinceName = (raw?: string): string => {
  if (!raw) return 'Santo Domingo / Distrito Nacional';
  const normalize=(value:string)=>value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const query=normalize(raw);
  return RD_PROVINCES.find(p=>normalize(p.name)===query || normalize(p.name).includes(query))?.name
    || (query.includes('punta cana') || query.includes('higuey') ? 'La Altagracia (Punta Cana / Higüey)' : getProvinceHSP(raw).name);
};

/**
 * Opciones con que la fábrica única arma la base de un borrador nuevo desde el estado: catálogo, matriz de tarifas y precio
 * genérico (si la función de precios está activa). Una sola fuente para la vista previa y para aplicar (ADR 0009).
 */
export function aiProposalFactoryOptions(state:Pick<SimulationStore,'tariffMatrix'|'equipmentCatalog'|'syncSettings'|'genericPrices'|'pricePending'>) {
  return {tariffMatrix:state.tariffMatrix,catalog:state.equipmentCatalog,
    genericPriceFor:(id:string)=>(priceFeatureActive(state)?effectiveGenericPrice(state,id):null)};
}

/** Pure: validates the draft against today's inventory and builds the proposal without touching the store. */
export function buildProjectFromDraft(state:SimulationStore,input:ExtractedInvoiceData,createNewProject=false):{project:ProjectSimulation;previous?:ProjectSimulation}|{error:string} {
    const current=state.projects.find(p=>p.id===state.activeProjectId);
    if(isReaderRole(state.syncSettings.currentUser?.role)) return {error:'Tu rol permite consultar propuestas, no crearlas ni modificarlas.'};
    if(!createNewProject && (!current || current.isDeleted || current.deletedAt || (current.organizationId && current.organizationId!==state.syncSettings.currentUser?.organizationId))) return {error:'No se puede actualizar esta propuesta.'};
    const isGrounded=Array.isArray(input.panels) || Array.isArray(input.inverters) || Array.isArray(input.batteries);
    const province=normalizeProvinceName(input.province || input.municipality || (!createNewProject?current?.client.province:state.defaultSimulationSettings.defaultProvince));
    const defaults=state.defaultSimulationSettings;
    // F2b (ADR 0009): una propuesta nueva parte de la fábrica única (elige y cotiza equipos con el catálogo vigente).
    const base:ProjectSimulation=createNewProject?createAIProposalBase(BENCHMARK_PROJECT,defaults,province,aiProposalFactoryOptions(state)):current!;
    const losses=resolveAssumptions(base).systemLossesPct;
    // Revalidate against today's inventory before committing any change. Legacy callers retain their API.
    // Un borrador que pide dimensionar los paneles nace con la base de dimensionado de la propuesta (ADR 0009).
    const data=isGrounded?sizeDraftPanelsWithBasis(input as unknown as Record<string,unknown>,normalizeProposalDraft(input,state.equipmentCatalog,{province,systemLosses:losses,
      annualSpecificYieldKWhPerKWp:annualSpecificYieldKWhPerKWp(province,losses,base.client.customMonthlyHSP),
      monthlySpecificYieldKWhPerKWp:getMonthlySolarProductionFactors(province,losses,base.client.customMonthlyHSP),
      tariffReference:buildAITariffContext(state.tariffMatrix),genericPrices:effectiveGenericPriceMap(state)}),
      {province,lossesPct:losses,customMonthlyHSP:base.client.customMonthlyHSP,basis:resolveSizingBasis(base.specs)}):input;
    if(isGrounded && data.requiresReview) return {error:data.validationIssues?.find(i=>i.severity==='error')?.message || 'Revisa los datos pendientes antes de aplicar.'};
    if(data.monthlyConsumptionKWh.length!==12 || data.monthlyConsumptionKWh.some(n=>!Number.isFinite(n) || n<0)) return {error:'Completa los doce consumos mensuales antes de aplicar.'};
    const now=new Date().toISOString();
    const prepared=prepareProposalDraftProject(base,data,state.tariffMatrix,{isNew:createNewProject,defaultBatteryDOD:defaults.defaultBatteryDOD,catalog:state.equipmentCatalog});
    const {specs,rates}=prepared;
    const seq=createNewProject?generateNextProjectSequence(state.projects):undefined;
    const user=state.syncSettings.currentUser;
    const project:ProjectSimulation={...base,
      // Identidad de la propuesta nueva: la de la fábrica única (ADR 0009); el consumo es el del borrador, así que la marca de
      // consumo estimado de fábrica no aplica (create_proposal la pone si no hubo consumo).
      ...(createNewProject?{...newProposalIdentity({id:createProjectId(),now,sequence:seq!,user,serverUrl:user?state.syncSettings.serverUrl.trim().replace(/\/+$/,''):undefined}),
        companyProfileId:state.activeCompanyId,consumptionEstimate:undefined}
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
    const normalized=createNewProject?{...project,specs:normalizeIncomingSpecs(project.specs)}:normalizeProjectEquipment(current!,project);
    // Textos del documento del borrador (garantías, vigencia…): mismos escritores del registro que el editor.
    return {project:withDraftDocumentTexts(state,normalized,isGrounded?data.documentTexts:undefined),previous:createNewProject?undefined:current};
}
