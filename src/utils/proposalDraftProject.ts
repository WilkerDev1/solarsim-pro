import type { DefaultSimulationSettings } from '../store/types';
import type { ProjectSimulation, SystemSpecs } from '../types';
import type { ExtractedInvoiceData } from '../types/aiInvoice';
import type { GlobalTariffMatrix } from '../types/tariffs';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { resolveAITariffSelection } from './aiTariffContext';
import { getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { resolveSystemLossesPct, DEFAULT_SYSTEM_LOSSES_PCT, DEFAULT_BATTERY_DOD_PCT, DEFAULT_BATTERY_EFFICIENCY_PCT } from '../../shared/projectDefaults';
import { enforceAutomatedPricing } from '../../shared/automatedProposalPolicy';
import { editEquipment, readEquipment, type EquipmentKind } from '../../shared/equipment';
import { migrateLegacySpecs } from '../../shared/equipment';

/** Un solo grupo por tipo recibe la selección escalar del borrador (con varios modelos se conservan, como antes). */
function patchSingleGroup(specs:SystemSpecs,kind:EquipmentKind,patch:Record<string,unknown>):SystemSpecs {
  const clean=Object.fromEntries(Object.entries(patch).filter(([,value])=>value!==undefined));
  if(!Object.keys(clean).length) return specs;
  const groups=readEquipment({...specs,hasBattery:true})[kind==='panel'?'panels':kind==='inverter'?'inverters':'batteries'];
  return groups.length>1?specs:editEquipment(specs,kind,{type:'update',index:0,patch:clean} as never);
}
/** Primer grupo del tipo (sin ocultar la batería apagada), o `undefined` si no hay. */
function firstGroup<K extends 'panels'|'inverters'|'batteries'>(specs:SystemSpecs,key:K):SystemSpecs[K] {
  const first=readEquipment({...specs,hasBattery:true})[key][0];
  return (first?[first]:undefined) as SystemSpecs[K];
}
/** Pure adapter shared by preview and application. No store mutation, metadata or network. */
export function prepareProposalDraftProject(base:ProjectSimulation,data:ExtractedInvoiceData,tariffMatrix:GlobalTariffMatrix,options:{isNew?:boolean;defaultBatteryDOD?:number}={}):ProjectSimulation {
  const province=data.province || base.client.province;
  const losses=resolveSystemLossesPct(base.specs);
  const createNewProject=Boolean(options.isNew);
  const defaults={defaultBatteryDOD:options.defaultBatteryDOD};
  const isGrounded=Array.isArray(data.panels)||Array.isArray(data.inverters)||Array.isArray(data.batteries);
    const panelW=data.selectedPanelWatts ?? readEquipment(base.specs).panels[0]?.powerW ?? 0;
    const coverage=data.targetCoveragePct ?? base.rates.targetCoveragePct ?? 95;
    const count=data.recommendedPanelCount || calculateRecommendedPanelCount(province,data.monthlyConsumptionKWh,panelW,coverage,losses,base.client.customMonthlyHSP).recommendedPanelCount;
    const dcKWp=(data.panels || []).reduce((sum,g)=>sum+g.powerW*g.count/1000,0);
    let specs:SystemSpecs={...base.specs,autoCalculatePanels:false,dopExchangeRate:data.dopExchangeRate || base.rates.usdExchangeRate || 60,
      ...(data.hasBattery!==undefined?{hasBattery:data.hasBattery}:{}),
      ...(data.targetMarginPct!==undefined?{saleMarginMultiplier:1+data.targetMarginPct/100}:{}),
      ...(data.commercial?.installationTotalUSD!==undefined&&dcKWp>0?{installationUnitPriceUSD:data.commercial.installationTotalUSD/dcKWp}:data.commercial?.installationUnitPriceUSD!==undefined?{installationUnitPriceUSD:data.commercial.installationUnitPriceUSD}:{}),
      ...(data.commercial?.directPriceSurplusTarget?{directPriceSurplusTarget:data.commercial.directPriceSurplusTarget}:{}),
      ...(data.commercial?.pricePerWattUSD!==undefined?{pricePerWattUSD:data.commercial.pricePerWattUSD}:{}),
      ...(data.autoSupplierPricing!==undefined?{autoSupplierPricing:data.autoSupplierPricing}:{}),
      ...(data.selectedSupplierInfo?{selectedSupplierInfo:data.selectedSupplierInfo}:{}),
      ...(isGrounded?{panels:data.panels,inverters:data.inverters,batteries:data.batteries}:{
        // La selección única reemplaza al modelo principal: se conserva solo el primer grupo (con su cantidad, potencia y precio) como base del parche.
        ...(data.selectedPanelModel?{panels:firstGroup(base.specs,'panels')}:{}),...(data.selectedInverterModel?{inverters:firstGroup(base.specs,'inverters')}:{}),...(data.selectedBatteryModel || data.hasBattery===false?{batteries:firstGroup(base.specs,'batteries')}:{}),
      }),
      ...(base.specs.installationServicesDesc?.includes('Notas del Sistema:')?{installationServicesDesc:base.specs.installationServicesDesc.split('Notas del Sistema:')[0].trim()}:{}),
    };
    if(isGrounded) {
      // Missing purchase prices must stay visibly missing, never inherit the benchmark's sale cost.
      specs.panels=data.panels?.map(group=>({...group}));
      specs.inverters=data.inverters?.map(group=>({...group}));
      specs.batteries=data.batteries?.map(group=>({...group}));
      specs.hasBattery=Boolean(data.batteries?.length);
      if (data.batteries?.length) {
        // El motor pondera DOD y eficiencia por grupo: cada grupo lleva los suyos (o el default). Solo el grupo
        // principal hereda el valor del proyecto existente; los demás sin dato usan el default.
        const baseBattery=readEquipment({...base.specs,hasBattery:true}).batteries[0];
        const defaultDod=createNewProject?(defaults.defaultBatteryDOD ?? DEFAULT_BATTERY_DOD_PCT):(baseBattery?.dodPct ?? DEFAULT_BATTERY_DOD_PCT);
        const defaultEfficiency=baseBattery?.efficiencyPct ?? DEFAULT_BATTERY_EFFICIENCY_PCT;
        specs.batteries=data.batteries.map((group,index)=>({...group,dodPct:group.dodPct ?? (index===0||createNewProject?defaultDod:DEFAULT_BATTERY_DOD_PCT),efficiencyPct:group.efficiencyPct ?? (index===0?defaultEfficiency:DEFAULT_BATTERY_EFFICIENCY_PCT)}));
      }
    } else {
      // Selección única (sin grupos de catálogo): se aplica al grupo, nunca a campos sueltos.
      specs=patchSingleGroup(specs,'panel',{brandModel:data.selectedPanelModel||undefined,powerW:panelW,count,unitPriceUSD:data.selectedPanelUnitPriceUSD});
      specs=patchSingleGroup(specs,'inverter',{brandModel:data.selectedInverterModel||undefined,powerKW:data.selectedInverterPowerKW,count:data.selectedInverterCount,unitPriceUSD:data.selectedInverterUnitPriceUSD});
      specs=patchSingleGroup(specs,'battery',{brandModel:data.selectedBatteryModel||undefined,capacityKWh:data.selectedBatteryCapacityKWh,count:data.selectedBatteryCount,unitPriceUSD:data.selectedBatteryUnitPriceUSD});
    }
    // El proveedor elegido pertenece al grupo principal de cada tipo; el borrador nunca escribe el espejo heredado.
    for(const kind of ['panel','inverter','battery'] as const) {
      const supplier=data.selectedSupplierInfo?.[kind];
      if(supplier) specs=editEquipment(specs,kind,{type:'update',index:0,patch:{selectedSupplierInfo:supplier}} as never);
    }
    specs=migrateLegacySpecs(specs);
    const fx=data.dopExchangeRate || base.rates.usdExchangeRate || 60;
    const tariff=resolveAITariffSelection(tariffMatrix,data.distributor,data.tariffCode);
    const reference=tariff?getReferenceEnergyRateUSD(tariffMatrix,data.distributor,tariff.code,data.averageMonthlyKWh,fx):undefined;
    const energy=data.energyCostPerKWhDOP!==undefined?data.energyCostPerKWhDOP/fx:data.energyCostPerKWhUSD ?? reference;
    const rates={...base.rates,usdExchangeRate:fx,targetCoveragePct:coverage,distributor:data.distributor,tariffCode:tariff?.code || data.tariffCode,
      ...(energy!==undefined?{energyCostPerKWh:energy}:createNewProject?{energyCostPerKWh:0}:{}),
      ...(tariff?{gridExportFeePct:tariff.netMeteringRetentionPct}:{}),
    };
  return {...base,specs:enforceAutomatedPricing(specs),rates,client:{...base.client,province},monthlyConsumption:[...data.monthlyConsumptionKWh],financials:{...base.financials,...(data.commercial?.pricePerWattUSD!==undefined?{pricePerWattUSD:data.commercial.pricePerWattUSD}:{}),...(data.commercial?.customItems!==undefined?{customItems:structuredClone(data.commercial.customItems)}:{}),...(data.commercial?.customDiscounts!==undefined?{customDiscounts:structuredClone(data.commercial.customDiscounts)}:{})}};
}

export function createAIProposalBase(template:ProjectSimulation,defaults:DefaultSimulationSettings,province:string):ProjectSimulation {
 const base=structuredClone(template);

      base.specs={...base.specs,pricePerWattUSD:defaults.defaultDirectPriceUSDPerWp,systemLosses:defaults.defaultSystemLosses ?? DEFAULT_SYSTEM_LOSSES_PCT,annualDegradation:defaults.defaultAnnualDegradation ?? 0.4,isDetailed:false,pricingMode:'cost_matrix',saleMarginMultiplier:1+(defaults.defaultTargetMarginPct ?? 28)/100,installationUnitPriceUSD:0};
      // Grupos explícitos; el DOD por defecto vive en el grupo de batería.
      const withGroups=migrateLegacySpecs(base.specs);
      base.specs={...withGroups,batteries:withGroups.batteries?.map((group,index)=>index===0?{...group,dodPct:defaults.defaultBatteryDOD ?? DEFAULT_BATTERY_DOD_PCT}:group)};
      base.rates={...base.rates,targetCoveragePct:defaults.defaultTargetCoveragePct ?? 95,isZeroExport:defaults.defaultZeroExport,currency:defaults.currency || 'USD',annualEnergyInflationPct:defaults.annualEnergyTariffEscalationPct ?? 3.5};
      base.financials={...base.financials,applyLey5707:defaults.applyLey5707,applyITBISExemption:defaults.applyITBISExemption,discountRatePct:defaults.discountRatePct,projectLifespanYears:defaults.lifespanYears,pricePerWattUSD:defaults.defaultDirectPriceUSDPerWp,customItems:[],customDiscounts:[],customCostUSD:undefined,customLey5707CreditUSD:undefined,customITBISSavedUSD:undefined};
      base.client={...base.client,company:'',address:'',contactPhone:'',contactEmail:'',contactPerson:'',location:province,customMonthlyHSP:undefined,coordinates:undefined};
 return base;
}

/** Document totals are references for dialogue, never inputs that override engine results. */
export function proposalReconciliationIssues(data:ExtractedInvoiceData,summary:import('../types').FinancialSummaryResult){
 const matrix=summary.costMatrix;
 return ([['subtotalUSD','compra antes de ITBIS',matrix.precioNetoUSD],['taxUSD','ITBIS de costos',matrix.itbisUSD],['totalCostUSD','costo total',matrix.totalNetoUSD],['saleUSD','precio de lista',matrix.listPorcentajeVentaUSD]] as const).flatMap(([key,label,value])=>{
  const source=data.commercial?.sourceTotals?.[key];
  return typeof source==='number'&&Number.isFinite(source)&&typeof value==='number'&&Number.isFinite(value)&&Math.abs(source-value)>.05?[{code:`document_${key}_difference`,severity:'warning' as const,message:`Revisa ${label}: documento USD ${source.toFixed(2)}, cálculo USD ${value.toFixed(2)}. Es una referencia informativa; podemos aclarar la diferencia sin sustituir fórmulas.`}]:[];
 });
}
