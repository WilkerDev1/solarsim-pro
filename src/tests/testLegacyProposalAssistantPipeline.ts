// LEGADO: se elimina en F6 junto con el modal ai-invoice (reviewIssues), applyExtractedInvoice (aiSlice), geminiInvoiceService.parseProposalWithAI, electron/ai/httpClient y aiProposalNormalization.
// Lo que de testAIProposalPipeline solo prueba código del asistente de propuestas: clasificación de avisos, IPC de Electron, cancelación HTTPS, paridad web/IPC y el efecto de applyExtractedInvoice en el store.
// Parte de una suite mixta partida en F0 (red de seguridad del asistente único): la lógica que sobrevive sigue en la suite de origen.
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { issueTarget, issueTier } from '../components/common/ai-invoice/reviewIssues';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { processExtractedInvoice } from '../utils/aiProposalNormalization';
import { parseProposalWithAI } from '../services/geminiInvoiceService';
import { httpsPostJson } from '../../electron/ai/httpClient';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { useSimulationStore } from '../store/useSimulationStore';
import type { SolarEquipmentItem } from '../types/equipment';

// Mismo catálogo, contexto y borrador de partida que testAIProposalPipeline.
const catalog:SolarEquipmentItem[]=[
  {id:'panel-a',type:'panel',brand:'A',modelSeries:'A600',displayName:'Panel A 600W',powerW:600,createdAt:'',updatedAt:'',supplierPrices:[{id:'sold-out',supplierName:'Sin stock',priceUSD:1,stockStatus:'out_of_stock',updatedAt:''},{id:'real',supplierName:'Disponible',priceUSD:100,stockStatus:'in_stock',updatedAt:''}]},
  {id:'panel-b',type:'panel',brand:'B',modelSeries:'B500',displayName:'Panel B 500W',powerW:500,createdAt:'',updatedAt:''},
  {id:'inv-a',type:'inverter',brand:'A',modelSeries:'A8',displayName:'Inversor A 8kW',powerKW:8,maxPvPowerKW:12,createdAt:'',updatedAt:''},
  {id:'inv-b',type:'inverter',brand:'B',modelSeries:'B5',displayName:'Inversor B 5kW',powerKW:5,createdAt:'',updatedAt:''},
  {id:'bat-a',type:'battery',brand:'A',modelSeries:'A16',displayName:'Batería A 16kWh',capacityKWh:16,dodPct:90,batteryEfficiencyPct:95,createdAt:'',updatedAt:''},
  {id:'bat-b',type:'battery',brand:'B',modelSeries:'B8',displayName:'Batería B 8kWh',capacityKWh:8,dodPct:80,batteryEfficiencyPct:90,createdAt:'',updatedAt:''},
];
const context={province:'Santiago',annualSpecificYieldKWhPerKWp:1500,tariffReference:buildAITariffContext(useSimulationStore.getState().tariffMatrix)};
const raw={clientName:'Cliente de regresión',province:'Santiago',distributor:'EDESUR',tariffCode:'BTS2',monthlyConsumptionKWh:Array(12).fill(900),energyCostPerKWhDOP:13.09,confidenceScore:95,
  panels:[{equipmentId:'panel-a',quantity:10},{equipmentId:'panel-b',quantity:6},{equipmentId:'panel-a',quantity:2}],
  inverters:[{equipmentId:'inv-a',quantity:1},{equipmentId:'inv-b',quantity:1}],batteries:[{equipmentId:'bat-a',quantity:1},{equipmentId:'bat-b',quantity:2}],hasBattery:true,targetMarginPct:0};

// Clasificación de avisos de la revisión (reviewIssues, que desaparece con el modal): el escenario de tarifas escalonadas de la suite de origen.
{
  const matrixContext={...context,tariffReference:buildAITariffContext(DEFAULT_RD_TARIFF_MATRIX)};
  const history=[152,107,49,0,0,128,373,582,0,0,0,305];
  const invoice={clientName:'Cliente EDESUR BTS1',province:'Santiago',distributor:'EDESUR',tariffCode:'BTS-1',monthlyConsumptionKWh:history,consumptionSource:'observed',
    energyCostPerKWhDOP:12.89,fixedChargeDOP:128.59,energyTiers:[{kwh:200,rateDOP:6.05},{kwh:100,rateDOP:8.59},{kwh:73,rateDOP:12.89}],currentBilledKWh:373,totalBilledAmountDOP:3138.56,
    panels:[{equipmentId:'panel-a',quantity:4}],inverters:[{equipmentId:'inv-b',quantity:1}],batteries:[],hasBattery:false,confidenceScore:90};
  const stepped=normalizeProposalDraft(invoice,catalog,matrixContext);
  const notice=stepped.validationIssues?.find(i=>i.code==='invoice_block_rates_reference');
  assert(notice,'aviso de que la factura muestra precios por bloque');
  assert.equal(issueTier(notice!),'info','aviso informativo: no pide confirmación');
  assert.equal(issueTarget(notice!)?.tab,'client','el aviso informativo se ve en «Cliente y tarifa», junto a la tarifa de energía');
  const mismatch=normalizeProposalDraft({...invoice,energyCostPerKWhDOP:14.5,energyTiers:undefined},catalog,matrixContext);
  const mismatchIssue=mismatch.validationIssues?.find(i=>i.code==='invoice_block_rates_mismatch');
  assert.equal(mismatchIssue?.severity,'warning');assert.equal(issueTier(mismatchIssue!),'confirm');
}

// Procesamiento por Electron (processExtractedInvoice), cancelación del transporte HTTPS de main y paridad web/IPC (geminiInvoiceService).
const overrideYield=processExtractedInvoice(JSON.stringify({...raw,panels:[{equipmentId:'panel-a',quantity:0}]}),{equipmentCatalog:catalog,context:{...context,province:'Santo Domingo / Distrito Nacional',annualSpecificYieldKWhPerKWp:1}});
assert.equal(overrideYield.panels?.[0].count,calculateRecommendedPanelCount('Santiago',Array(12).fill(900),600).recommendedPanelCount,'extracted province recalculates context yield');
const controller=new AbortController();const oldRequest=https.request;let nativeDestroyed=false;
(https as any).request=()=>{const req:any=new EventEmitter();req.write=()=>{};req.end=()=>{};req.destroy=(error:Error)=>{nativeDestroyed=true;queueMicrotask(()=>{req.emit('error',error);req.emit('close');});return req;};return req;};
try{const pending=httpsPostJson('https://generativelanguage.googleapis.com/test',{},60000,{},controller.signal);controller.abort(new Error('Cancelado'));await assert.rejects(pending,/Cancelado/);assert.equal(nativeDestroyed,true);}finally{https.request=oldRequest;}
const electronResult=processExtractedInvoice(JSON.stringify(raw),{equipmentCatalog:catalog,context,dopExchangeRate:60.5});
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(raw)}]}}]}),{status:200});
try {
  const webResult=await parseProposalWithAI({apiKey:'synthetic-test-key',projectRequirementsText:'Texto',equipmentCatalog:catalog,context,dopExchangeRate:60.5});
  assert.deepEqual(webResult.panels,electronResult.panels);assert.equal(webResult.energyCostPerKWhUSD,electronResult.energyCostPerKWhUSD,'web and IPC processing parity');
}finally{globalThis.fetch=oldFetch;}
// Efecto de applyExtractedInvoice en el store (movido de testAIProposalPipeline al partir la suite en F0: el proyecto resultante sigue allí,
// construido con buildProjectFromDraft). Número de proyectos, proyecto activo, actualización de la propuesta activa y rechazos sin escritura.
{
  const storeBefore=useSimulationStore.getState();
  const normalized=normalizeProposalDraft(raw,catalog,context);
  const wrongType=normalizeProposalDraft({...raw,panels:[{equipmentId:'inv-a',quantity:2}]},catalog,context);
  const offline={...storeBefore.syncSettings,authToken:null,currentUser:null,autoSyncEnabled:false};
  useSimulationStore.setState({equipmentCatalog:catalog,syncSettings:offline,defaultSimulationSettings:{...storeBefore.defaultSimulationSettings,defaultProvince:'Santiago',defaultPricingMode:'direct',defaultDirectPriceUSDPerWp:2.5}});
  const before=useSimulationStore.getState().projects;
  useSimulationStore.getState().applyExtractedInvoice(normalized,true);
  assert.equal(useSimulationStore.getState().projects.length,before.length+1,'una propuesta nueva suma un proyecto');
  assert.equal(useSimulationStore.getState().projects[0].id,useSimulationStore.getState().activeProjectId,'la propuesta nueva queda activa y primera');
  // Actualizar la propuesta activa (createNew=false): mismo proyecto, sin sumar, y borrar las notas revisadas las quita en vez de restaurarlas.
  const withNotes=normalizeProposalDraft({...raw,specialTechnicalNotes:'No perforar cubierta',aiNotes:'Inspeccionar tablero'},catalog,context);
  useSimulationStore.getState().applyExtractedInvoice(withNotes,true);
  const created=useSimulationStore.getState().getActiveProject();
  assert(created.aiSource?.notes?.includes('No perforar cubierta'));
  const count=useSimulationStore.getState().projects.length;
  useSimulationStore.getState().applyExtractedInvoice(normalizeProposalDraft({...withNotes,specialTechnicalNotes:'',aiNotes:undefined},catalog,context),false);
  assert.equal(useSimulationStore.getState().projects.length,count,'actualizar no suma proyectos');
  assert.equal(useSimulationStore.getState().activeProjectId,created.id);
  assert.equal(useSimulationStore.getState().getActiveProject().aiSource?.notes,undefined,'borrar las notas revisadas las quita de la propuesta');
  // Rechazos: no escriben (misma referencia del arreglo de proyectos).
  const preserved=useSimulationStore.getState().projects;
  useSimulationStore.getState().applyExtractedInvoice(wrongType,true);
  assert.strictEqual(useSimulationStore.getState().projects,preserved,'invalid inference cannot commit a new project');
  useSimulationStore.setState({syncSettings:{...offline,currentUser:{id:'viewer',role:'VIEWER',organizationId:'fixture'} as any}});
  useSimulationStore.getState().applyExtractedInvoice(normalized,true);
  assert.strictEqual(useSimulationStore.getState().projects,preserved,'invalidated viewer role still cannot mutate organization');
  useSimulationStore.setState(storeBefore);
}
console.log('PASS (legado): proposal assistant pipeline: Electron processing, HTTPS cancellation, web/IPC parity and review issue tiers and applyExtractedInvoice store effects.');