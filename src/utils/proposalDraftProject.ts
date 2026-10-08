import type { DefaultSimulationSettings } from '../store/types';
import type { ProjectSimulation, SystemSpecs } from '../types';
import type { ExtractedInvoiceData } from '../types/aiInvoice';
import type { GlobalTariffMatrix } from '../types/tariffs';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { resolveAITariffSelection } from './aiTariffContext';
import { getReferenceEnergyRateUSD } from '../data/rdTariffs';
/** Pure adapter shared by preview and application. No store mutation, metadata or network. */
export function prepareProposalDraftProject(base:ProjectSimulation,data:ExtractedInvoiceData,tariffMatrix:GlobalTariffMatrix,options:{isNew?:boolean;defaultBatteryDOD?:number}={}):ProjectSimulation {
  const province=data.province || base.client.province;
  const losses=base.specs.systemLosses ?? 25;
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
      ...(data.pricingMode?{pricingMode:data.pricingMode}:{}),
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
    const tariff=resolveAITariffSelection(tariffMatrix,data.distributor,data.tariffCode);
    const reference=tariff?getReferenceEnergyRateUSD(tariffMatrix,data.distributor,tariff.code,data.averageMonthlyKWh,fx):undefined;
    const energy=data.energyCostPerKWhDOP!==undefined?data.energyCostPerKWhDOP/fx:data.energyCostPerKWhUSD ?? reference;
    const rates={...base.rates,usdExchangeRate:fx,targetCoveragePct:coverage,distributor:data.distributor,tariffCode:tariff?.code || data.tariffCode,
      ...(energy!==undefined?{energyCostPerKWh:energy}:createNewProject?{energyCostPerKWh:0}:{}),
      ...(tariff?{gridExportFeePct:tariff.netMeteringRetentionPct}:{}),
    };
  return {...base,specs,rates,client:{...base.client,province},monthlyConsumption:[...data.monthlyConsumptionKWh],financials:{...base.financials,...(data.commercial?.pricePerWattUSD!==undefined?{pricePerWattUSD:data.commercial.pricePerWattUSD}:{}),...(data.commercial?.customItems!==undefined?{customItems:structuredClone(data.commercial.customItems)}:{}),...(data.commercial?.customDiscounts!==undefined?{customDiscounts:structuredClone(data.commercial.customDiscounts)}:{})}};
}

export function createAIProposalBase(template:ProjectSimulation,defaults:DefaultSimulationSettings,province:string):ProjectSimulation {
 const base=structuredClone(template);

      base.specs={...base.specs,pricePerWattUSD:defaults.defaultDirectPriceUSDPerWp,systemLosses:defaults.defaultSystemLosses ?? 25,annualDegradation:defaults.defaultAnnualDegradation ?? 0.4,pricingMode:defaults.defaultPricingMode==='direct'?'direct_watt':'cost_matrix',saleMarginMultiplier:1+(defaults.defaultTargetMarginPct ?? 28)/100,panels:undefined,inverters:undefined,batteries:undefined,installationUnitPriceUSD:0};
      base.rates={...base.rates,targetCoveragePct:defaults.defaultTargetCoveragePct ?? 95,isZeroExport:defaults.defaultZeroExport,currency:defaults.currency || 'USD',annualEnergyInflationPct:defaults.annualEnergyTariffEscalationPct ?? 3.5};
      base.financials={...base.financials,applyLey5707:defaults.applyLey5707,applyITBISExemption:defaults.applyITBISExemption,discountRatePct:defaults.discountRatePct,projectLifespanYears:defaults.lifespanYears,pricePerWattUSD:defaults.defaultDirectPriceUSDPerWp,customItems:[],customDiscounts:[],customCostUSD:undefined,customLey5707CreditUSD:undefined,customITBISSavedUSD:undefined};
      base.client={...base.client,company:'',address:'',contactPhone:'',contactEmail:'',contactPerson:'',location:province,customMonthlyHSP:undefined,coordinates:undefined};
 return base;
}
