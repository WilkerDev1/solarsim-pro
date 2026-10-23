import type { DefaultSimulationSettings } from '../store/types';
import type { ProjectSimulation, SystemSpecs } from '../types';
import type { ExtractedInvoiceData } from '../types/aiInvoice';
import type { GlobalTariffMatrix } from '../types/tariffs';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { resolveAITariffSelection } from './aiTariffContext';
import { getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { DEFAULT_SYSTEM_LOSSES_PCT, DEFAULT_BATTERY_DOD_PCT, DEFAULT_BATTERY_EFFICIENCY_PCT } from '../../shared/projectDefaults';
import { enforceAutomatedPricing } from '../../shared/automatedProposalPolicy';
/** Pure adapter shared by preview and application. No store mutation, metadata or network. */
export function prepareProposalDraftProject(base:ProjectSimulation,data:ExtractedInvoiceData,tariffMatrix:GlobalTariffMatrix,options:{isNew?:boolean;defaultBatteryDOD?:number}={}):ProjectSimulation {
  const province=data.province || base.client.province;
  const losses=base.specs.systemLosses ?? DEFAULT_SYSTEM_LOSSES_PCT;
  const createNewProject=Boolean(options.isNew);
  const defaults={defaultBatteryDOD:options.defaultBatteryDOD};
  const isGrounded=Array.isArray(data.panels)||Array.isArray(data.inverters)||Array.isArray(data.batteries);
    const panelW=data.selectedPanelWatts ?? base.specs.panelPowerW;
    const coverage=data.targetCoveragePct ?? base.rates.targetCoveragePct ?? 95;
    const count=data.recommendedPanelCount || calculateRecommendedPanelCount(province,data.monthlyConsumptionKWh,panelW,coverage,losses,base.client.customMonthlyHSP).recommendedPanelCount;
    const dcKWp=(data.panels || []).reduce((sum,g)=>sum+g.powerW*g.count/1000,0);
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
      ...(data.targetMarginPct!==undefined?{saleMarginMultiplier:1+data.targetMarginPct/100}:{}),
      ...(data.commercial?.installationTotalUSD!==undefined&&dcKWp>0?{installationUnitPriceUSD:data.commercial.installationTotalUSD/dcKWp}:data.commercial?.installationUnitPriceUSD!==undefined?{installationUnitPriceUSD:data.commercial.installationUnitPriceUSD}:{}),
      ...(data.commercial?.directPriceSurplusTarget?{directPriceSurplusTarget:data.commercial.directPriceSurplusTarget}:{}),
      ...(data.commercial?.pricePerWattUSD!==undefined?{pricePerWattUSD:data.commercial.pricePerWattUSD}:{}),
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
        // El motor pondera DOD y eficiencia por grupo: cada grupo lleva los suyos (o el default) y los escalares
        // son el espejo del primer grupo, no un promedio del banco (se promediaría dos veces).
        const defaultDod=createNewProject?(defaults.defaultBatteryDOD ?? DEFAULT_BATTERY_DOD_PCT):(base.specs.batteryDOD ?? DEFAULT_BATTERY_DOD_PCT);
        const defaultEfficiency=base.specs.batteryEfficiencyPct ?? DEFAULT_BATTERY_EFFICIENCY_PCT;
        specs.batteries=data.batteries.map(group=>({...group,dodPct:group.dodPct ?? defaultDod,efficiencyPct:group.efficiencyPct ?? defaultEfficiency}));
        specs.batteryDOD=specs.batteries[0].dodPct ?? defaultDod;
        specs.batteryEfficiencyPct=specs.batteries[0].efficiencyPct;
      }
    }
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

      base.specs={...base.specs,pricePerWattUSD:defaults.defaultDirectPriceUSDPerWp,systemLosses:defaults.defaultSystemLosses ?? DEFAULT_SYSTEM_LOSSES_PCT,annualDegradation:defaults.defaultAnnualDegradation ?? 0.4,isDetailed:false,pricingMode:'cost_matrix',saleMarginMultiplier:1+(defaults.defaultTargetMarginPct ?? 28)/100,panels:undefined,inverters:undefined,batteries:undefined,installationUnitPriceUSD:0};
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
