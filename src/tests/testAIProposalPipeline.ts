import {batteryBank,readEquipment} from '../../shared/equipment';
import assert from 'node:assert/strict';
import { normalizeProposalDraft, buildProposalRequest, robustParseJson, draftForPrompt, PROPOSAL_JSON_SCHEMA, PROPOSAL_SYSTEM_INSTRUCTION } from '../../shared/aiProposal';
import { calculateMonthlyBill, resolveEnergyValuationMethod, tariffPricePresentation } from '../../shared/tariffBilling';
import { averageBlockEnergyRateDOP } from '../../shared/tariffRules';
import { blockValuationNote, draftEnergyRateDisplayDOP } from '../components/simulator/params/sections/rates/tariffPresentation';
import { DEFAULT_RD_TARIFF_MATRIX, referenceBillingTariff } from '../data/rdTariffs';
import { prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { requestGeminiJson, GeminiRequestError, geminiResponseText, type GeminiTransport } from '../../shared/geminiTransport';
import { useSimulationStore } from '../store/useSimulationStore';
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
// BTS2 es escalonada: el 13.09 del modelo no coincide con ningún bloque de EDESUR BTS2 y la propuesta se valora con la fila
// oficial (900 kWh ≥ 701: todo al cuarto bloque, 13.43), con aviso por confirmar.
assert.equal(normalized.energyRateSource,'reference');assert.equal(normalized.energyCostPerKWhDOP,13.43);
assert(normalized.validationIssues?.some(i=>i.code==='invoice_block_rates_mismatch'&&i.severity==='warning'));
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
const zeroRate=normalizeProposalDraft({...raw,tariffCode:'BTD',energyCostPerKWhDOP:0},catalog,context);assert.equal(zeroRate.energyCostPerKWhUSD,0);assert(!zeroRate.validationIssues?.some(i=>i.code==='missing_energy_rate'));
const unknownTariff=normalizeProposalDraft({...raw,tariffCode:'BTS999'},catalog,context);assert.equal(unknownTariff.requiresReview,true);
assert.throws(()=>robustParseJson('{"clientName":"truncado'),/incompleta/);
assert.throws(()=>geminiResponseText({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}),/parciales/);
assert.equal(geminiResponseText({candidates:[{finishReason:'STOP',content:{parts:[{text:'thinking',thought:true},{text:'{'},{text:'}'}]}}]}),'{}');
const request=buildProposalRequest({projectRequirementsText:'Cliente prueba',equipmentCatalog:catalog,apiKey:'must-not-appear',files:[{fileBase64:'YQ==',mimeType:'image/png',fileName:'factura.png'}],context});
assert(!JSON.stringify(request).includes('must-not-appear'));
assert.equal(request.contents[0].parts.length,5,'catálogo, proyecto, adjunto (rótulo y datos) y la ronda');
const currentDraftContext={...context,currentDraft:normalized};
const longConversation=['A'.repeat(12000),'Nueva instrucción: '+ 'B'.repeat(11920)+' ULTIMA_CORRECCION_NO_BATERIAS'].join('\n\nCorrección del usuario:\n').slice(-24000);
const longRequest=buildProposalRequest({projectRequirementsText:longConversation,equipmentCatalog:catalog,context:currentDraftContext});
const sentConversation=JSON.parse(longRequest.contents[0].parts.at(-1)!.text!);
assert(sentConversation.requirements.endsWith('ULTIMA_CORRECCION_NO_BATERIAS'),'text budget prioritizes the latest user correction, never the oldest history');
assert.equal(sentConversation.requirements.length,16000);
assert.deepEqual(sentConversation.currentDraft,JSON.parse(JSON.stringify(draftForPrompt(normalized))),'budget only truncates textual history, preserving every schema key of the current draft');
assert.equal(sentConversation.currentDraft.panels.length,normalized.panels!.length);

assert.throws(()=>buildProposalRequest({projectRequirementsText:'Texto',files:[{fileBase64:'YQ==',mimeType:'application/x-msdownload',fileName:'bad.exe'}]}),/Formato/);
let calls=0;
const errors:GeminiTransport=async()=>{calls++;throw new GeminiRequestError('Cuota',429);};
await assert.rejects(requestGeminiJson({apiKey:'test',body:{}},errors),/Cuota/);assert.equal(calls,1,'429 never triggers multiple billed calls');
calls=0;await assert.rejects(requestGeminiJson({apiKey:'test',body:{}},async()=>{calls++;throw new GeminiRequestError('Key',401);}),/Key/);assert.equal(calls,1);
calls=0;const fallback=await requestGeminiJson({apiKey:'test',model:'custom-model',body:{}},async(url,_body,headers)=>{calls++;assert(!url.includes('test'));assert.equal(headers['x-goog-api-key'],'test');if(calls===1)throw new GeminiRequestError('Temporal',503);return {ok:true};});assert.equal(calls,2);assert(fallback.modelWarning);
useSimulationStore.setState({equipmentCatalog:catalog,syncSettings:{...useSimulationStore.getState().syncSettings,authToken:null,currentUser:null,autoSyncEnabled:false}});
const before=useSimulationStore.getState().projects;
useSimulationStore.getState().applyExtractedInvoice(normalized,true);
const project=useSimulationStore.getState().getActiveProject();
assert.equal(useSimulationStore.getState().projects.length,before.length+1);
assert.equal(calculateTotalDCCapacityKWp(project.specs),10.2);assert.equal(calculateTotalBatteryCapacityKWh(project.specs),32);
assert.equal(project.specs.saleMarginMultiplier,1);assert.equal(project.specs.panels?.[0].unitPriceUSD,100);
assert.equal(project.specs.panels?.[1].unitPriceUSD,undefined,'missing supplier price stays unknown on the committed multi-model group');
assert.equal(project.specs.inverters?.[0].unitPriceUSD,undefined);
assert.equal(project.specs.batteries?.[0].unitPriceUSD,undefined);
assert.equal(calculateCostMatrixSummary(project.specs,10.2).items[1].unitPriceUSD,0,'unpriced second panel must not inherit first panel cost');
assert.deepEqual(project.specs.inverters?.map(i=>i.id),['inv-a','inv-b']);
const usefulBatteryKWh=16*0.9*0.95+16*0.8*0.9;
assert(Math.abs(batteryBank(readEquipment(project.specs)).usableKWh-usefulBatteryKWh)<1e-9,'BESS bank (per-group DoD/efficiency weighted by the engine) preserves each group useful energy');
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

// Fase 5: medición neta en el escáner de facturas. Campos opcionales: ausentes si la factura no los trae, nunca inventados.
{
  const METERING_KEYS=['energyWithdrawnKWh','energyInjectedKWh','accumulatedCreditKWh','hasDistributedGeneration','netMeteringRegime','gridUseChargeDOPPerKWh'] as const;
  // Caso real: factura EDESUR BTS1 de 373 kWh = cargo fijo 128.59 + 200×6.05 + 100×8.59 + 73×12.89, sin líneas de inyección.
  const bts1=referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX,'EDESUR','BTS1')!;
  assert.equal(calculateMonthlyBill({tariff:bts1,withdrawnKWh:373}).totalDOP.toFixed(2),'3138.56','la factura de referencia cuadra con la facturación por bloques');
  assert.equal((128.59+200*6.05+100*8.59+73*12.89).toFixed(2),'3138.56');
  const plainInvoice={clientName:'Cliente EDESUR',distributor:'EDESUR',tariffCode:'BTS1',monthlyConsumptionKWh:[373,null,null,null,null,null,null,null,null,null,null,null],consumptionSource:'estimated',
    fixedChargeDOP:128.59,energyTiers:[{kwh:200,rateDOP:6.05},{kwh:100,rateDOP:8.59},{kwh:73,rateDOP:12.89}],currentBilledKWh:373,totalBilledAmountDOP:3138.56,
    panels:[],inverters:[],batteries:[],confidenceScore:90};
  const metered=(draft:object)=>METERING_KEYS.filter(key=>key in draft);
  const plain=normalizeProposalDraft(plainInvoice,catalog,context);
  assert.deepEqual(metered(plain),[],'una factura sin líneas de medición neta no rellena ningún campo');
  assert.equal(plain.fixedChargeDOP,128.59);assert.equal(plain.currentBilledKWh,373);
  assert.equal(plain.validationIssues?.some(issue=>issue.code==='existing_distributed_generation'),false);
  // Nulos, ceros y falsos que el modelo rellena por costumbre tampoco cuentan como datos de la factura.
  const filled=normalizeProposalDraft({...plainInvoice,energyWithdrawnKWh:null,energyInjectedKWh:0,accumulatedCreditKWh:0,hasDistributedGeneration:false,netMeteringRegime:null,gridUseChargeDOPPerKWh:null},catalog,context);
  assert.deepEqual(metered(filled),[],'null, 0 y false por defecto quedan ausentes');
  assert.deepEqual(metered(normalizeProposalDraft(plain,catalog,context)),[],'la normalización es idempotente sobre un borrador sin medición neta');
  // Sobre una propuesta guardada sin el campo, esa factura no cambia el régimen; una propuesta nueva sigue naciendo en SIE-007.
  const savedBase=structuredClone(useSimulationStore.getState().getActiveProject());
  delete savedBase.rates.netMeteringRegime;delete savedBase.rates.gridUseChargeDOPPerKWh;
  const kept=prepareProposalDraftProject(savedBase,filled,DEFAULT_RD_TARIFF_MATRIX,{isNew:false});
  assert.equal(kept.rates.netMeteringRegime,undefined,'factura normal: el régimen guardado (anterior) no cambia');
  assert.equal(kept.rates.gridUseChargeDOPPerKWh,undefined,'factura normal: no se siembra cargo por uso de la red en una propuesta anterior');
  const created=prepareProposalDraftProject(savedBase,filled,DEFAULT_RD_TARIFF_MATRIX,{isNew:true});
  assert.equal(created.rates.netMeteringRegime,'sie007_2026','una propuesta nueva sigue naciendo en SIE-007, no por la factura');

  // Con líneas de medición neta: se conservan los valores válidos y avisan de la generación distribuida existente.
  const withMetering=normalizeProposalDraft({...plainInvoice,energyWithdrawnKWh:450,energyInjectedKWh:120,accumulatedCreditKWh:30,hasDistributedGeneration:true,gridUseChargeDOPPerKWh:3.78,netMeteringRegime:'sie007_2026'},catalog,context);
  assert.deepEqual([withMetering.energyWithdrawnKWh,withMetering.energyInjectedKWh,withMetering.accumulatedCreditKWh,withMetering.hasDistributedGeneration,withMetering.gridUseChargeDOPPerKWh,withMetering.netMeteringRegime],[450,120,30,true,3.78,'sie007_2026']);
  const dgIssue=withMetering.validationIssues?.find(issue=>issue.code==='existing_distributed_generation');
  assert.equal(dgIssue?.severity,'warning');const errorCodes=(draft:{validationIssues?:{code:string;severity:string}[]})=>draft.validationIssues?.filter(i=>i.severity==='error').map(i=>i.code);
  assert.deepEqual(errorCodes(withMetering),errorCodes(plain),'los datos de medición neta no añaden errores que bloqueen el borrador');
  assert.deepEqual(normalizeProposalDraft(withMetering,catalog,context).energyInjectedKWh,120,'idempotente con medición neta');
  assert.equal(normalizeProposalDraft(withMetering,catalog,context).validationIssues?.filter(issue=>issue.code==='existing_distributed_generation').length,1,'el aviso no se duplica al renormalizar');
  const drafted=prepareProposalDraftProject(savedBase,withMetering,DEFAULT_RD_TARIFF_MATRIX,{isNew:false});
  assert.equal(drafted.rates.netMeteringRegime,'sie007_2026','el régimen solo cambia si la factura o el usuario lo indican explícitamente');
  // Una inyección o un crédito positivos implican generación distribuida aunque el modelo no lo marque.
  const implied=normalizeProposalDraft({...plainInvoice,energyInjectedKWh:80},catalog,context);
  assert.equal(implied.hasDistributedGeneration,true);assert.equal(implied.energyInjectedKWh,80);
  assert.equal(normalizeProposalDraft({...plainInvoice,accumulatedCreditKWh:15},catalog,context).hasDistributedGeneration,true);
  // Valores inválidos: se descartan con aviso, nunca se corrigen ni se rellenan.
  const invalid=normalizeProposalDraft({...plainInvoice,energyWithdrawnKWh:-5,energyInjectedKWh:'120',accumulatedCreditKWh:Number.NaN,hasDistributedGeneration:'sí',gridUseChargeDOPPerKWh:250,netMeteringRegime:'otro'},catalog,context);
  assert.deepEqual(metered(invalid),[]);
  assert(invalid.validationIssues?.some(issue=>issue.code==='invalid_metering_value'&&issue.severity==='warning'));
  assert(invalid.validationIssues?.some(issue=>issue.code==='invalid_grid_use_charge'));assert(invalid.validationIssues?.some(issue=>issue.code==='invalid_net_metering_regime'));
  assert.deepEqual(errorCodes(invalid),errorCodes(plain),'los valores inválidos solo avisan');

  // Esquema e instrucción: campos opcionales (nullable, fuera de `required`) y regla de no inventar.
  const properties=PROPOSAL_JSON_SCHEMA.properties as Record<string,{nullable?:boolean;type?:string}>;
  for(const key of ['energyWithdrawnKWh','energyInjectedKWh','accumulatedCreditKWh','hasDistributedGeneration'])assert.equal(properties[key]?.nullable,true,`${key} es opcional`);
  assert.equal(properties.hasDistributedGeneration.type,'BOOLEAN');
  for(const key of [...METERING_KEYS])assert(!(PROPOSAL_JSON_SCHEMA.required as readonly string[]).includes(key),`${key} no es obligatorio`);
  for(const key of ['energyWithdrawnKWh','energyInjectedKWh','accumulatedCreditKWh','hasDistributedGeneration','netMeteringRegime','gridUseChargeDOPPerKWh'])assert(PROPOSAL_SYSTEM_INSTRUCTION.includes(key),`la instrucción explica ${key}`);
  assert.match(PROPOSAL_SYSTEM_INSTRUCTION,/nunca los inventes|no los inventes/i);
  // El borrador vigente que viaja al modelo en la ronda siguiente conserva lo extraído.
  const echoed=draftForPrompt(withMetering) as Record<string,unknown>;
  assert.equal(echoed.energyInjectedKWh,120);assert.equal(echoed.hasDistributedGeneration,true);
  assert.deepEqual(METERING_KEYS.filter(key=>key in (draftForPrompt(plain)??{})),[],'sin medición neta, nada viaja de vuelta');
}

// Tarifas escalonadas: el precio de UNA línea de bloque de la factura no valora todo el consumo.
{
  const matrixContext={...context,tariffReference:buildAITariffContext(DEFAULT_RD_TARIFF_MATRIX)};
  const bts1=referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX,'EDESUR','BTS1')!;
  const history=[152,107,49,0,0,128,373,582,0,0,0,305];
  const average=history.reduce((sum,n)=>sum+n,0)/12;
  // Caso real (Gemini, factura EDESUR BTS1): líneas 200×6.05, 100×8.59, 73×12.89; el modelo devolvió el marginal 12.89.
  const invoice={clientName:'Cliente EDESUR BTS1',province:'Santiago',distributor:'EDESUR',tariffCode:'BTS-1',monthlyConsumptionKWh:history,consumptionSource:'observed',
    energyCostPerKWhDOP:12.89,fixedChargeDOP:128.59,energyTiers:[{kwh:200,rateDOP:6.05},{kwh:100,rateDOP:8.59},{kwh:73,rateDOP:12.89}],currentBilledKWh:373,totalBilledAmountDOP:3138.56,
    panels:[{equipmentId:'panel-a',quantity:4}],inverters:[{equipmentId:'inv-b',quantity:1}],batteries:[],hasBattery:false,confidenceScore:90};
  const codes=(draft:{validationIssues?:{code:string}[]})=>draft.validationIssues?.map(i=>i.code) ?? [];
  const stepped=normalizeProposalDraft(invoice,catalog,matrixContext);
  assert.equal(stepped.requiresReview,false,'el aviso no bloquea');
  assert.equal(stepped.energyRateSource,'reference','tarifa escalonada: se valora con la fila oficial, no con el precio de un bloque');
  assert(Math.abs(stepped.energyCostPerKWhDOP!-averageBlockEnergyRateDOP(bts1.energyBlocks,average,'BTS1')!)<1e-9,'el escalar es el promedio por bloques del consumo, no 12.89');
  assert(stepped.energyCostPerKWhDOP!<7,'~6 RD$/kWh para ~141 kWh/mes');
  assert.equal(stepped.marginalRateDOP,12.89,'el precio de la factura se conserva como dato observado');
  const notice=stepped.validationIssues?.find(i=>i.code==='invoice_block_rates_reference');
  assert(notice,'aviso de que la factura muestra precios por bloque');
  assert.match(notice!.message,/BTS1/);assert.match(notice!.message,/SIE-121-2026-TF/);
  assert(!codes(stepped).includes('reference_energy_rate'),'la factura confirma la fila: no se pide confirmar una tarifa aproximada');
  assert(!codes(stepped).includes('invoice_block_rates_mismatch'));
  // Renormalizar (revisión) es idempotente: misma procedencia, mismo precio y un solo aviso.
  const again=normalizeProposalDraft(stepped,catalog,matrixContext);
  assert.equal(again.energyRateSource,'reference');assert.equal(again.energyCostPerKWhDOP,stepped.energyCostPerKWhDOP);
  assert.deepEqual(codes(again).filter(c=>c.startsWith('invoice_block_rates')),['invoice_block_rates_reference']);
  // Eco en rondas siguientes: draftForPrompt manda el escalar calculado (origen 'reference') y el esquema no declara la
  // procedencia, así que el modelo lo devuelve sin ella. Con consumo que cruza bloques (250 kWh/mes → 6.558) no es un precio
  // de la factura: ni avisos de factura ni marginalRateDOP.
  const crossing={...invoice,monthlyConsumptionKWh:Array(12).fill(250),energyCostPerKWhDOP:undefined,energyTiers:undefined,fixedChargeDOP:undefined};
  const round1=normalizeProposalDraft(crossing,catalog,matrixContext);
  assert.equal(round1.energyRateSource,'reference');assert.equal(round1.energyCostPerKWhDOP!.toFixed(3),'6.558');
  const roundContext={...matrixContext,currentDraft:round1};
  const invoiceCodes=(draft:{validationIssues?:{code:string}[]})=>codes(draft).filter(c=>c.startsWith('invoice_block_rates'));
  const sameConsumption=normalizeProposalDraft({...crossing,energyCostPerKWhDOP:round1.energyCostPerKWhDOP},catalog,roundContext);
  assert.equal(sameConsumption.energyRateSource,'reference');assert.deepEqual(invoiceCodes(sameConsumption),[],'eco con el mismo consumo: sin avisos de factura');
  assert.equal(sameConsumption.marginalRateDOP,undefined,'el eco no se guarda como precio observado');
  const changedConsumption=normalizeProposalDraft({...crossing,monthlyConsumptionKWh:Array(12).fill(279),energyCostPerKWhDOP:round1.energyCostPerKWhDOP},catalog,roundContext);
  assert.equal(changedConsumption.energyRateSource,'reference');assert.equal(changedConsumption.energyCostPerKWhDOP!.toFixed(3),'6.769','referencia recalculada con el consumo nuevo');
  assert.deepEqual(invoiceCodes(changedConsumption),[],'eco tras cambiar el consumo: sin falso desajuste');
  assert.equal(changedConsumption.marginalRateDOP,undefined);
  // Sin borrador anterior (o con otra tarifa) el mismo número sí es un precio de la factura y se contrasta con los bloques.
  assert.deepEqual(invoiceCodes(normalizeProposalDraft({...crossing,energyCostPerKWhDOP:round1.energyCostPerKWhDOP},catalog,matrixContext)),['invoice_block_rates_mismatch']);
  assert.deepEqual(invoiceCodes(normalizeProposalDraft({...crossing,tariffCode:'BTS2',energyCostPerKWhDOP:round1.energyCostPerKWhDOP},catalog,roundContext)),['invoice_block_rates_mismatch']);
  // Propuesta aplicada: guarda la fila y se factura por bloques.
  const savedBase=structuredClone(useSimulationStore.getState().getActiveProject());
  const prepared=prepareProposalDraftProject(savedBase,stepped,DEFAULT_RD_TARIFF_MATRIX,{isNew:true});
  assert.equal(prepared.rates.energyRateSource,'reference');
  assert.deepEqual(prepared.rates.billingTariff,bts1,'la propuesta guarda la fila oficial');
  assert.equal(resolveEnergyValuationMethod(prepared.rates),'block_billing');
  // Revisión: bajo «Tarifa de energía» se explica la facturación por bloques con el precio medio resultante.
  // El campo muestra el precio por bloques del mes promedio redondeado a 2 decimales (el escalar guardado conserva precisión).
  const fieldDOP=draftEnergyRateDisplayDOP(stepped)!;
  assert.equal(fieldDOP,6.05);
  assert.equal(draftEnergyRateDisplayDOP({energyRateSource:'reference',energyCostPerKWhDOP:10.433712}),10.43,'referencia: 2 decimales (EDENORTE 10.4337… → 10.43)');
  assert.equal(draftEnergyRateDisplayDOP({energyRateSource:'manual',energyCostPerKWhDOP:11.1234}),11.1234,'un precio tecleado se muestra tal cual');
  assert.equal(draftEnergyRateDisplayDOP({energyRateSource:'reference'}),undefined);
  const note=blockValuationNote(prepared.rates,prepared.monthlyConsumption,fieldDOP)!;
  const expectedAverage=tariffPricePresentation(prepared.rates,prepared.monthlyConsumption).averageDOPPerKWh!;
  assert.equal(expectedAverage.toFixed(2),'7.95','energía anual por bloques mes a mes / kWh anuales (consumo concentrado)');
  assert.equal(note,'Se valora mes a mes con los bloques oficiales de BTS1 (SIE-121-2026-TF). Precio medio de la energía en el año: RD$7.95/kWh (sin cargo fijo). El campo de arriba (RD$6.05/kWh) es el precio por bloques del mes promedio y solo sirve de referencia.');
  assert.equal(blockValuationNote(prepared.rates,prepared.monthlyConsumption),'Se valora mes a mes con los bloques oficiales de BTS1 (SIE-121-2026-TF). Precio medio de la energía en el año: RD$7.95/kWh (sin cargo fijo).','sin precio en el campo, solo las dos primeras frases');
  assert.equal(blockValuationNote({...prepared.rates,energyRateSource:'invoice'},prepared.monthlyConsumption,fieldDOP),null,'precio único: sin nota de bloques');
  useSimulationStore.setState({tariffMatrix:DEFAULT_RD_TARIFF_MATRIX,syncSettings:{...useSimulationStore.getState().syncSettings,authToken:null,currentUser:null,autoSyncEnabled:false}});
  useSimulationStore.getState().applyExtractedInvoice(stepped,true);
  const applied=useSimulationStore.getState().getActiveProject();
  assert.equal(applied.client.name,'Cliente EDESUR BTS1');
  assert.equal(applied.rates.energyRateSource,'reference');assert.equal(resolveEnergyValuationMethod(applied.rates),'block_billing','la propuesta aplicada se valora por bloques');
  // Un precio tecleado en la revisión (manual) se respeta como precio único.
  const typed=normalizeProposalDraft({...stepped,energyRateSource:'manual',energyCostPerKWhDOP:11},catalog,matrixContext);
  assert.equal(typed.energyRateSource,'manual');assert.equal(typed.energyCostPerKWhDOP,11);

  // Precio de factura que no coincide con ningún bloque oficial (posible cambio de pliego): referencia y aviso por confirmar.
  const mismatch=normalizeProposalDraft({...invoice,energyCostPerKWhDOP:14.5,energyTiers:undefined},catalog,matrixContext);
  assert.equal(mismatch.energyRateSource,'reference');
  const mismatchIssue=mismatch.validationIssues?.find(i=>i.code==='invoice_block_rates_mismatch');
  assert.equal(mismatchIssue?.severity,'warning');
  assert.match(mismatchIssue!.message,/14[.,]5/);assert.match(mismatchIssue!.message,/período|periodo/);
  assert.equal(mismatch.requiresReview,false);

  // Tarifa de precio único (BTD): el precio de la factura sigue mandando.
  const btd=normalizeProposalDraft({...invoice,tariffCode:'BTD',energyCostPerKWhDOP:9.5,energyTiers:undefined},catalog,matrixContext);
  assert.equal(btd.energyRateSource,'invoice');assert.equal(btd.energyCostPerKWhDOP,9.5);
  assert(!codes(btd).some(c=>c.startsWith('invoice_block_rates')));
  // CEPM en US$ (RMT-1): sin cambios, precio de factura como invoice y referencia en US$ convertida sin precio.
  const cepm=normalizeProposalDraft({...invoice,distributor:'CEPM',tariffCode:'RMT-1',energyCostPerKWhDOP:17.2,energyTiers:undefined},catalog,matrixContext);
  assert.equal(cepm.energyRateSource,'invoice');assert.equal(cepm.energyCostPerKWhDOP,17.2);
  const cepmReference=normalizeProposalDraft({...invoice,distributor:'CEPM',tariffCode:'RMT-1',energyCostPerKWhDOP:undefined,energyTiers:undefined},catalog,matrixContext);
  assert.equal(cepmReference.energyRateSource,'reference');assert(Math.abs(cepmReference.energyCostPerKWhDOP!-0.2789*cepmReference.dopExchangeRate!)<1e-9);
  assert(!codes(cepm).some(c=>c.startsWith('invoice_block_rates'))&&!codes(cepmReference).some(c=>c.startsWith('invoice_block_rates')));

  // Prompt: en tarifas escalonadas el precio de un bloque no va en energyCostPerKWhDOP; el marginal va en marginalRateDOP.
  const properties=PROPOSAL_JSON_SCHEMA.properties as Record<string,{description?:string}>;
  assert.match(properties.energyCostPerKWhDOP.description!,/bloque/);
  assert.match(properties.marginalRateDOP.description!,/bloque/);
  assert.match(PROPOSAL_SYSTEM_INSTRUCTION,/marginalRateDOP/);
}
console.log('AI proposal pipeline: exact multi-model grounding, real sizing, no invented consumption, transport budget and store commit guards passed.');
