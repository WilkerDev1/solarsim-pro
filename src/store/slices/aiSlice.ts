import { companyDocumentCustomization } from '../../utils/companyDocumentTemplate';
import { projectMutationMetadata } from '../sync/projectMutation';
import { SimulationSlice, AISlice } from '../types';
import type { ProjectSimulation, SystemSpecs } from '../../types';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { generateNextProjectSequence } from '../initialData';
import { calculateRecommendedPanelCount } from '../../engine/solarEngine';
import { normalizeProposalDraft } from '../../../shared/aiProposal';
import { DEFAULT_GEMINI_MODEL } from '../../../shared/geminiTransport';
import { buildAITariffContext, resolveAITariffSelection } from '../../utils/aiTariffContext';
import { getReferenceEnergyRateUSD } from '../../data/rdTariffs';
import { RD_PROVINCES, getProvinceHSP } from '../../data/rdProvinces';

const normalizeProvinceName = (raw?: string): string => {
  if (!raw) return 'Santo Domingo / Distrito Nacional';
  const normalize=(value:string)=>value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const query=normalize(raw);
  return RD_PROVINCES.find(p=>normalize(p.name)===query || normalize(p.name).includes(query))?.name
    || (query.includes('punta cana') || query.includes('higuey') ? 'La Altagracia (Punta Cana / Higüey)' : getProvinceHSP(raw).name);
};

export const createAISlice: SimulationSlice<AISlice> = (set, get) => ({
  geminiApiKey: '', geminiModel: DEFAULT_GEMINI_MODEL,
  setGeminiApiKey: key=>set({geminiApiKey:key}),
  setGeminiModel: model=>set({geminiModel:model || DEFAULT_GEMINI_MODEL}),
  applyExtractedInvoice: (input,createNewProject=false)=>{
    const state=get();
    const current=state.projects.find(p=>p.id===state.activeProjectId);
    if(['VIEWER','LECTOR'].includes(state.syncSettings.currentUser?.role || '')) {set({saveFeedbackMessage:'Tu rol permite consultar propuestas, no crearlas ni modificarlas.'});return;}
    if(!createNewProject && (!current || current.isDeleted || current.deletedAt || (current.organizationId && current.organizationId!==state.syncSettings.currentUser?.organizationId))) {set({saveFeedbackMessage:'No se puede actualizar esta propuesta.'});return;}
    const isGrounded=Array.isArray(input.panels) || Array.isArray(input.inverters) || Array.isArray(input.batteries);
    const province=normalizeProvinceName(input.province || input.municipality || (!createNewProject?current?.client.province:state.defaultSimulationSettings.defaultProvince));
    const base:ProjectSimulation=createNewProject?structuredClone(BENCHMARK_PROJECT):current!;
    const defaults=state.defaultSimulationSettings;
    if(createNewProject) {
      base.specs={...base.specs,pricePerWattUSD:defaults.defaultDirectPriceUSDPerWp,systemLosses:defaults.defaultSystemLosses ?? 25,annualDegradation:defaults.defaultAnnualDegradation ?? 0.4,pricingMode:defaults.defaultPricingMode==='direct'?'direct_watt':'cost_matrix',saleMarginMultiplier:1+(defaults.defaultTargetMarginPct ?? 28)/100,panels:undefined,inverters:undefined,batteries:undefined};
      base.rates={...base.rates,targetCoveragePct:defaults.defaultTargetCoveragePct ?? 95,isZeroExport:defaults.defaultZeroExport,currency:defaults.currency || 'USD',annualEnergyInflationPct:defaults.annualEnergyTariffEscalationPct ?? 3.5};
      base.financials={...base.financials,applyLey5707:defaults.applyLey5707,applyITBISExemption:defaults.applyITBISExemption,discountRatePct:defaults.discountRatePct,projectLifespanYears:defaults.lifespanYears,pricePerWattUSD:defaults.defaultDirectPriceUSDPerWp,customItems:[]};
      base.client={...base.client,company:'',address:'',contactPhone:'',contactEmail:'',contactPerson:'',location:province,customMonthlyHSP:undefined,coordinates:undefined};
    }
    const losses=base.specs.systemLosses ?? 25;
    // Revalidate against today's inventory before committing any change. Legacy callers retain their API.
    const data=isGrounded?normalizeProposalDraft(input,state.equipmentCatalog,{province,systemLosses:losses,
      annualSpecificYieldKWhPerKWp:calculateRecommendedPanelCount(province,Array(12).fill(0),620,95,losses,base.client.customMonthlyHSP).annualSpecificYieldKWhPerKWp,
      tariffReference:buildAITariffContext(state.tariffMatrix)}):input;
    if(isGrounded && data.requiresReview) {set({saveFeedbackMessage:data.validationIssues?.find(i=>i.severity==='error')?.message || 'Revisa los datos pendientes antes de aplicar.'});return;}
    if(data.monthlyConsumptionKWh.length!==12 || data.monthlyConsumptionKWh.some(n=>!Number.isFinite(n) || n<0)) {set({saveFeedbackMessage:'Completa los doce consumos mensuales antes de aplicar.'});return;}
    const now=new Date().toISOString();
    const panelW=data.selectedPanelWatts ?? base.specs.panelPowerW;
    const coverage=data.targetCoveragePct ?? base.rates.targetCoveragePct ?? 95;
    const count=data.recommendedPanelCount || calculateRecommendedPanelCount(province,data.monthlyConsumptionKWh,panelW,coverage,losses,base.client.customMonthlyHSP).recommendedPanelCount;
    const specs:SystemSpecs={...base.specs,panelPowerW:panelW,panelCount:count,autoCalculatePanels:false,dopExchangeRate:data.dopExchangeRate || base.rates.usdExchangeRate || 60,
      ...(data.selectedPanelModel?{panelBrandModel:data.selectedPanelModel}:{}),
      ...(data.selectedPanelUnitPriceUSD!==undefined?{panelUnitPriceUSD:data.selectedPanelUnitPriceUSD}:{}),
      ...(data.selectedInverterModel?{inverterBrandModel:data.selectedInverterModel}:{}),
      ...(data.selectedInverterPowerKW!==undefined?{inverterPowerKW:data.selectedInverterPowerKW}:{}),
      ...(data.selectedInverterCount!==undefined?{inverterCount:data.selectedInverterCount}:{}),
      ...(data.selectedInverterUnitPriceUSD!==undefined?{inverterUnitPriceUSD:data.selectedInverterUnitPriceUSD}:{}),
      ...(data.selectedBatteryModel?{batteryBrandModel:data.selectedBatteryModel}:{}),
      ...(data.selectedBatteryCapacityKWh!==undefined?{batteryCapacityKWh:data.selectedBatteryCapacityKWh}:{}),
      ...(data.selectedBatteryCount!==undefined?{batteryCount:data.selectedBatteryCount}:{}),
      ...(data.selectedBatteryUnitPriceUSD!==undefined?{batteryUnitPriceUSD:data.selectedBatteryUnitPriceUSD}:{}),
      ...(data.hasBattery!==undefined?{hasBattery:data.hasBattery}:{}),
      ...(data.targetMarginPct!==undefined?{saleMarginMultiplier:1+data.targetMarginPct/100,pricingMode:'cost_matrix' as const}:{}),
      ...(data.autoSupplierPricing!==undefined?{autoSupplierPricing:data.autoSupplierPricing}:{}),
      ...(data.selectedSupplierInfo?{selectedSupplierInfo:data.selectedSupplierInfo}:{}),
      ...(isGrounded?{panels:data.panels,inverters:data.inverters,batteries:data.batteries}:{
        ...(data.selectedPanelModel?{panels:undefined}:{}),...(data.selectedInverterModel?{inverters:undefined}:{}),...(data.selectedBatteryModel || data.hasBattery===false?{batteries:undefined}:{}),
      }),
      ...(base.specs.installationServicesDesc?.includes('Notas del Sistema:')?{installationServicesDesc:base.specs.installationServicesDesc.split('Notas del Sistema:')[0].trim()}:{}),
    };
    if(isGrounded) {
      // Missing purchase prices must stay visibly missing, never inherit the benchmark's sale cost.
      specs.panels=data.panels?.map(group=>({...group}));
      specs.inverters=data.inverters?.map(group=>({...group}));
      specs.batteries=data.batteries?.map(group=>({...group}));
      specs.panelUnitPriceUSD=data.panels?.[0]?.unitPriceUSD ?? 0;
      specs.inverterUnitPriceUSD=data.inverters?.[0]?.unitPriceUSD ?? 0;
      specs.batteryUnitPriceUSD=data.batteries?.[0]?.unitPriceUSD ?? 0;
      specs.hasBattery=Boolean(data.batteries?.length);
      if (data.batteries?.length) {
        // Adapter only: preserve E_util=sum(C_i*DoD_i*eta_i) with the engines' existing scalar contract.
        const totalCapacity=data.batteries.reduce((sum,b)=>sum+b.capacityKWh*b.count,0);
        const defaultDod=createNewProject?(defaults.defaultBatteryDOD ?? 90):(base.specs.batteryDOD ?? 90);
        const defaultEfficiency=base.specs.batteryEfficiencyPct ?? 90;
        const afterDod=data.batteries.reduce((sum,b)=>sum+b.capacityKWh*b.count*(b.dodPct ?? defaultDod)/100,0);
        const usable=data.batteries.reduce((sum,b)=>sum+b.capacityKWh*b.count*(b.dodPct ?? defaultDod)/100*(b.efficiencyPct ?? defaultEfficiency)/100,0);
        specs.batteryDOD=totalCapacity>0?afterDod/totalCapacity*100:defaultDod;
        specs.batteryEfficiencyPct=afterDod>0?usable/afterDod*100:defaultEfficiency;
      }
    }
    const fx=data.dopExchangeRate || base.rates.usdExchangeRate || 60;
    const tariff=resolveAITariffSelection(state.tariffMatrix,data.distributor,data.tariffCode);
    const reference=tariff?getReferenceEnergyRateUSD(state.tariffMatrix,data.distributor,tariff.code,data.averageMonthlyKWh,fx):undefined;
    const energy=data.energyCostPerKWhDOP!==undefined?data.energyCostPerKWhDOP/fx:data.energyCostPerKWhUSD ?? reference;
    const rates={...base.rates,usdExchangeRate:fx,targetCoveragePct:coverage,distributor:data.distributor,tariffCode:tariff?.code || data.tariffCode,
      ...(energy!==undefined?{energyCostPerKWh:energy}:createNewProject?{energyCostPerKWh:0}:{}),
      ...(tariff?{gridExportFeePct:tariff.netMeteringRetentionPct}:{}),
    };
    const seq=createNewProject?generateNextProjectSequence(state.projects):undefined;
    const user=state.syncSettings.currentUser;
    if(!createNewProject) state.recordUndoState(current!);
    const project:ProjectSimulation={...base,
      ...(createNewProject?{id:`proj-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,createdAt:now,status:'Draft',
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
        ...(seq?{projectId:seq.projectId,quoteNumber:seq.quoteNumber,quoteValidityDays:7}:{}),},
      specs,rates,monthlyConsumption:[...data.monthlyConsumptionKWh],
      aiSource:{...base.aiSource,consumptionSource:data.consumptionSource,energyRateSource:data.energyRateSource,
        extractedFromFileName:data.extractedFromFileName,modelUsed:data.modelUsed,requestedModel:data.requestedModel,
        notes:data.specialTechnicalNotes!==undefined || data.aiNotes!==undefined ? ([data.specialTechnicalNotes,data.aiNotes].filter(Boolean).join('\n') || undefined) : base.aiSource?.notes},
      ...(createNewProject?{customization:{...companyDocumentCustomization(state.getActiveCompany(),state.defaultDocumentCustomization,state.documentTemplatesByCompany),contactName:data.clientName,clientPhone:data.phone,clientEmail:data.email}}:{}),
    };
    set({projects:createNewProject?[project,...state.projects]:state.projects.map(p=>p.id===project.id?project:p),activeProjectId:project.id,
      activeView:'simulator',isAIInvoiceModalOpen:false,saveFeedbackMessage:`Propuesta ${project.client.projectId} ${createNewProject?'creada':'actualizada'}.`});
    if(get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) get().triggerAutoSync(true);
    setTimeout(()=>set({saveFeedbackMessage:null}),4000);
  },
});
