import assert from 'node:assert/strict';
import { normalizeProposalDraft, buildProposalRequest, robustParseJson } from '../../shared/aiProposal';
import { requestGeminiJson, GeminiRequestError, geminiResponseText, type GeminiTransport } from '../../shared/geminiTransport';
import { processExtractedInvoice } from '../../electron/ai/invoiceExtractor';
import { parseProposalWithAI } from '../services/geminiInvoiceService';
import { useSimulationStore } from '../store/useSimulationStore';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { httpsPostJson } from '../../electron/ai/httpClient';
import { calculateFinancialSummary, calculateCostMatrixSummary } from '../engine/financeEngine';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { calculateTotalDCCapacityKWp, calculateTotalBatteryCapacityKWh } from '../utils/equipmentSpecsUtils';
import { buildAITariffContext } from '../utils/aiTariffContext';
import type { SolarEquipmentItem } from '../types/equipment';

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
const normalized=normalizeProposalDraft(raw,catalog,context);
assert.equal(normalized.requiresReview,false);
assert.equal(normalized.panels?.length,2);
assert.equal(normalized.panels?.[0].count,12);
assert.equal(normalized.panels?.[0].unitPriceUSD,100,'out of stock offer cannot price proposal');
assert.equal(normalized.panels?.[1].unitPriceUSD,undefined,'missing price cannot inherit invented/model price');
assert.equal(normalized.recommendedCapacityKWp,10.2);
assert.equal(normalized.targetMarginPct,0);
assert.equal(normalized.inverters?.length,2);assert.equal(normalized.batteries?.length,2);
assert.equal(normalized.energyCostPerKWhDOP,13.09);
const groundedAgain=normalizeProposalDraft(normalized,catalog,context);
assert.deepEqual(groundedAgain.panels,normalized.panels);
const removed=normalizeProposalDraft({...normalized,panels:[]},catalog,context);
assert.equal(removed.panels?.length,0);assert.equal(removed.requiresReview,true,'empty groups never resurrect scalar fallback');
const wrongType=normalizeProposalDraft({...raw,panels:[{equipmentId:'inv-a',quantity:2}]},catalog,context);
assert.equal(wrongType.requiresReview,true);
assert.equal(wrongType.panels?.[0].powerW,0);
assert.equal(normalizeProposalDraft(wrongType,catalog,context).requiresReview,true,'bad ID must stay unresolved across normalization');
const mismatched=normalizeProposalDraft({...raw,inverters:[{equipmentId:'inv-a',quantity:1,requestedPowerKW:16}]},catalog,context);assert.equal(mismatched.requiresReview,true);assert.equal(normalizeProposalDraft(mismatched,catalog,context).requiresReview,true);
const wrongModel=normalizeProposalDraft({...raw,panels:[{equipmentId:'panel-a',quantity:10,requestedModel:'Panel B 600W',requestedPowerW:600}]},catalog,context);
assert.equal(wrongModel.requiresReview,true,'matching watts cannot silently substitute a requested model');
assert.equal(wrongModel.panels?.[0].requestedModel,'Panel B 600W');
assert.equal(normalizeProposalDraft(wrongModel,catalog,context).requiresReview,true,'model constraint survives repeated grounding');
const confirmedModel=normalizeProposalDraft({...wrongModel,panels:wrongModel.panels?.map(p=>({...p,requestedModel:undefined}))},catalog,context);
assert.equal(confirmedModel.requiresReview,false,'explicit model confirmation can release the request constraint');
const invalidDuplicate=normalizeProposalDraft({...raw,panels:[{equipmentId:'panel-a',quantity:10},{equipmentId:'panel-a',quantity:1,requestedModel:'Panel B 600W',requestedPowerW:600}]},catalog,context);
assert.equal(normalizeProposalDraft(invalidDuplicate,catalog,context).requiresReview,true,'a valid duplicate cannot erase another row model constraint');
const fractionDuplicate=normalizeProposalDraft({...raw,panels:[{equipmentId:'panel-a',quantity:10},{equipmentId:'panel-a',quantity:1.5}]},catalog,context);
assert.equal(normalizeProposalDraft(fractionDuplicate,catalog,context).requiresReview,true,'a valid duplicate cannot erase another row invalid quantity');
const absent=normalizeProposalDraft({...raw,inverters:[{equipmentId:'not-real',quantity:1,requestedModel:'16kW inexistente'}]},catalog,context);
assert.equal(absent.inverters?.[0].id,'not-real','never select first real inverter');
const invalidQuantity=normalizeProposalDraft({...raw,panels:[{equipmentId:'panel-a',quantity:2.4}]},catalog,context);
assert.equal(invalidQuantity.requiresReview,true);
const automatic=normalizeProposalDraft({...raw,panels:[{equipmentId:'panel-a',quantity:0}]},catalog,context);
assert.equal(automatic.panels?.[0].count,12,'solar sizing uses provided app yield, not hardcoded 1450');
const partial=normalizeProposalDraft({...raw,monthlyConsumptionKWh:[100,0,...Array(10).fill(null)]},catalog,context);
assert.equal(partial.monthlyConsumptionKWh.length,0);assert.deepEqual(partial.observedMonthlyConsumptionKWh?.slice(0,3),[100,0,null]);assert.equal(partial.requiresReview,true);
const missing=normalizeProposalDraft({...raw,monthlyConsumptionKWh:[],averageMonthlyKWh:undefined},catalog,context);
assert.equal(missing.monthlyConsumptionKWh.length,0,'no fabricated 1200kWh');
const estimated=normalizeProposalDraft({...raw,monthlyConsumptionKWh:[],averageMonthlyKWh:800},catalog,context);
assert.equal(estimated.consumptionSource,'estimated');assert.equal(normalizeProposalDraft(estimated,catalog,context).consumptionSource,'estimated');
const zeroRate=normalizeProposalDraft({...raw,energyCostPerKWhDOP:0},catalog,context);assert.equal(zeroRate.energyCostPerKWhUSD,0);assert(!zeroRate.validationIssues?.some(i=>i.code==='missing_energy_rate'));
const unknownTariff=normalizeProposalDraft({...raw,tariffCode:'BTS999'},catalog,context);assert.equal(unknownTariff.requiresReview,true);
assert.throws(()=>robustParseJson('{"clientName":"truncado'),/incompleta/);
assert.throws(()=>geminiResponseText({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}),/parciales/);
assert.equal(geminiResponseText({candidates:[{finishReason:'STOP',content:{parts:[{text:'thinking',thought:true},{text:'{'},{text:'}'}]}}]}),'{}');
const request=buildProposalRequest({projectRequirementsText:'Cliente prueba',equipmentCatalog:catalog,apiKey:'must-not-appear',files:[{fileBase64:'YQ==',mimeType:'image/png',fileName:'factura.png'}],context});
assert(!JSON.stringify(request).includes('must-not-appear'));
assert.equal(request.contents[0].parts.length,3);
const currentDraftContext={...context,currentDraft:normalized};
const longConversation=['A'.repeat(12000),'Nueva instrucción: '+ 'B'.repeat(11920)+' ULTIMA_CORRECCION_NO_BATERIAS'].join('\n\nCorrección del usuario:\n').slice(-24000);
const longRequest=buildProposalRequest({projectRequirementsText:longConversation,equipmentCatalog:catalog,context:currentDraftContext});
const sentConversation=JSON.parse(longRequest.contents[0].parts[0].text);
assert(sentConversation.requirements.endsWith('ULTIMA_CORRECCION_NO_BATERIAS'),'text budget prioritizes the latest user correction, never the oldest history');
assert.equal(sentConversation.requirements.length,16000);
assert.deepEqual(sentConversation.context.currentDraft,JSON.parse(JSON.stringify(normalized)),'budget only truncates textual history, preserving the full current draft');

assert.throws(()=>buildProposalRequest({projectRequirementsText:'Texto',files:[{fileBase64:'YQ==',mimeType:'application/x-msdownload',fileName:'bad.exe'}]}),/Formato/);
let calls=0;
const errors:GeminiTransport=async()=>{calls++;throw new GeminiRequestError('Cuota',429);};
await assert.rejects(requestGeminiJson({apiKey:'test',body:{}},errors),/Cuota/);assert.equal(calls,1,'429 never triggers multiple billed calls');
calls=0;await assert.rejects(requestGeminiJson({apiKey:'test',body:{}},async()=>{calls++;throw new GeminiRequestError('Key',401);}),/Key/);assert.equal(calls,1);
calls=0;const fallback=await requestGeminiJson({apiKey:'test',model:'custom-model',body:{}},async(url,_body,headers)=>{calls++;assert(!url.includes('test'));assert.equal(headers['x-goog-api-key'],'test');if(calls===1)throw new GeminiRequestError('Temporal',503);return {ok:true};});assert.equal(calls,2);assert(fallback.modelWarning);
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
useSimulationStore.setState({equipmentCatalog:catalog,syncSettings:{...useSimulationStore.getState().syncSettings,authToken:null,currentUser:null,autoSyncEnabled:false}});
const before=useSimulationStore.getState().projects;
useSimulationStore.getState().applyExtractedInvoice(normalized,true);
const project=useSimulationStore.getState().getActiveProject();
assert.equal(useSimulationStore.getState().projects.length,before.length+1);
assert.equal(calculateTotalDCCapacityKWp(project.specs),10.2);assert.equal(calculateTotalBatteryCapacityKWh(project.specs),32);
assert.equal(project.specs.saleMarginMultiplier,1);assert.equal(project.specs.panelUnitPriceUSD,100);assert.equal(project.specs.inverterUnitPriceUSD,0);
assert.equal(project.specs.panels?.[1].unitPriceUSD,undefined,'missing supplier price stays unknown on the committed multi-model group');
assert.equal(project.specs.inverters?.[0].unitPriceUSD,undefined);
assert.equal(project.specs.batteries?.[0].unitPriceUSD,undefined);
assert.equal(calculateCostMatrixSummary(project.specs,10.2).items[1].unitPriceUSD,0,'unpriced second panel must not inherit first panel cost');
assert.deepEqual(project.specs.inverters?.map(i=>i.id),['inv-a','inv-b']);
const usefulBatteryKWh=16*0.9*0.95+16*0.8*0.9;
assert(Math.abs(32*(project.specs.batteryDOD!/100)*(project.specs.batteryEfficiencyPct!/100)-usefulBatteryKWh)<1e-9,'BESS scalar adapter preserves each group useful energy');
const batterySummary=calculateFinancialSummary(project.client.province,project.specs,project.rates,project.financials,project.monthlyConsumption);
assert.equal(batterySummary.batteryUsableKWh,Math.round(usefulBatteryKWh*10)/10,'actual financial engine reads adapted BESS values');
useSimulationStore.setState({defaultSimulationSettings:{...useSimulationStore.getState().defaultSimulationSettings,defaultProvince:'Santiago',defaultPricingMode:'direct',defaultDirectPriceUSDPerWp:2.5}});
const withReferences=normalizeProposalDraft({...raw,province:undefined,targetMarginPct:undefined,nic:'NIC-123',nis:'NIS-456',contractNumber:'CON-789',meterNumber:'MED-001',specialTechnicalNotes:'No perforar cubierta',aiNotes:'Inspeccionar tablero',modelUsed:'synthetic-model',extractedFromFileName:'synthetic-invoice.pdf'},catalog,context);
assert.equal(withReferences.province,'Santiago','review shows the effective province supplied by application defaults');
useSimulationStore.getState().applyExtractedInvoice(withReferences,true);
const fromDefaults=useSimulationStore.getState().getActiveProject();
assert.equal(fromDefaults.client.province,'Santiago');
assert.equal(fromDefaults.specs.pricePerWattUSD,2.5);assert.equal(fromDefaults.financials.pricePerWattUSD,2.5);
assert.equal(fromDefaults.client.nic,'NIC-123');assert.equal(fromDefaults.client.nis,'NIS-456');assert.equal(fromDefaults.client.contractNumber,'CON-789');assert.equal(fromDefaults.client.meterNumber,'MED-001');
assert(fromDefaults.aiSource?.notes?.includes('No perforar cubierta'));assert(fromDefaults.aiSource?.notes?.includes('Inspeccionar tablero'));
assert(!fromDefaults.specs.installationServicesDesc?.includes('Notas del Sistema:'),'technical notes stay in source metadata, not installation commercial copy');
assert.equal(fromDefaults.aiSource?.extractedFromFileName,'synthetic-invoice.pdf');assert.equal(fromDefaults.aiSource?.modelUsed,'synthetic-model');
const clearedNotes=normalizeProposalDraft({...withReferences,specialTechnicalNotes:'',aiNotes:undefined},catalog,context);
assert.equal(clearedNotes.specialTechnicalNotes,'','manual empty note intent survives normalization');
useSimulationStore.getState().applyExtractedInvoice(clearedNotes,false);
assert.equal(useSimulationStore.getState().getActiveProject().aiSource?.notes,undefined,'clearing reviewed notes removes previous proposal notes instead of restoring them');

const noContextProvince={...withReferences,province:undefined};
useSimulationStore.getState().applyExtractedInvoice(noContextProvince,true);
assert.equal(useSimulationStore.getState().getActiveProject().client.province,'Santiago','store commit also respects defaults when legacy draft omits province');
const preserved=useSimulationStore.getState().projects;
useSimulationStore.getState().applyExtractedInvoice(wrongType,true);assert.strictEqual(useSimulationStore.getState().projects,preserved,'invalid inference cannot commit a new project');
useSimulationStore.setState({syncSettings:{...useSimulationStore.getState().syncSettings,authToken:null,currentUser:{id:'viewer',role:'VIEWER',organizationId:'fixture'} as any}});
useSimulationStore.getState().applyExtractedInvoice(normalized,true);assert.strictEqual(useSimulationStore.getState().projects,preserved,'invalidated viewer role still cannot mutate organization');
console.log('AI proposal pipeline: exact multi-model grounding, real sizing, no invented consumption, transport budget and store commit guards passed.');
