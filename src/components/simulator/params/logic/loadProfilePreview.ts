import { getProvinceHSP } from '../../../../data/rdProvinces';
import { getRecommendedLoadProfile } from '../../../../engine/solarEngine';
import type { ProjectSimulation } from '../../../../types';
import { resolveSystemLossesPct, resolveBatteryBankDodPct, resolveBatteryBankEfficiencyPct } from './dockDefaults';
import { batteryBankSpecs, calculateTotalBatteryCapacityKWh, calculateTotalDCCapacityKWp } from '../../../../utils/equipmentSpecsUtils';

export type LoadProfilePreset = 'residential' | 'commercial' | 'industrial' | 'custom';

/** Preset for a daytime load ratio: the three canonical profiles (35/75/90) or `custom`. */
export function detectLoadProfilePreset(daytimeRatio: number): LoadProfilePreset {
  return daytimeRatio === 35 ? 'residential' : daytimeRatio === 75 ? 'commercial' : daytimeRatio === 90 ? 'industrial' : 'custom';
}

export interface LoadProfilePreview {
  hasBattery: boolean;
  currentDaytimeRatio: number;
  currentPreset: string;
  avgDailyCons: number;
  avgDailyProd: number;
  solarDirectDaily: number;
  bessChargeDaily: number;
  bessDischargeDaily: number;
  gridImportDaily: number;
  gridExportDaily: number;
  totalSelfDaily: number;
  solarDirectPct: number;
  bessDischargePct: number;
  gridImportPct: number;
  totalSelfPct: number;
  genDirectPct: number;
  genBessPct: number;
  genExportPct: number;
}

/** Average daily energy split (solar direct / battery / grid) the Tarifas section previews. */
export function computeLoadProfilePreview(
  project: ProjectSimulation,
  currentTariffCode: string,
  avgMonthlyConsumption: number
): LoadProfilePreview {
  const totalBatteryKWh = calculateTotalBatteryCapacityKWh(project.specs);
  const hasBattery = !!(project.specs.hasBattery && totalBatteryKWh > 0);
  const bank = batteryBankSpecs(project.specs);
  const batteryDodPct = resolveBatteryBankDodPct(bank);
  const batteryEffPct = resolveBatteryBankEfficiencyPct(bank);
  const dailyUsableBatteryKWh = hasBattery ? totalBatteryKWh * (batteryDodPct / 100) * (batteryEffPct / 100) : 0;

  const recommendedProfile = getRecommendedLoadProfile(currentTariffCode, avgMonthlyConsumption);
  const currentDaytimeRatio = project.specs.daytimeLoadRatio ?? project.specs.daytimeSelfConsumptionRatio ?? recommendedProfile.daytimeRatio;
  const currentPreset = project.specs.loadProfilePreset || detectLoadProfilePreset(currentDaytimeRatio);

  const avgDailyCons = avgMonthlyConsumption / 30;
  const estimatedDayLoad = avgDailyCons * (currentDaytimeRatio / 100);
  const estimatedNightLoad = Math.max(0, avgDailyCons - estimatedDayLoad);

  // Producción solar diaria promedio estimada
  const dcCapacityKWp = calculateTotalDCCapacityKWp(project.specs);
  const provinceData = getProvinceHSP(project.client?.province || 'Santo Domingo');
  const customHspList = project.client?.customMonthlyHSP;
  const provinceHsp = customHspList && customHspList.length > 0
    ? customHspList.reduce((a: number, b: number) => a + b, 0) / customHspList.length
    : provinceData.avgHSP;
  const systemLossesPct = resolveSystemLossesPct(project.specs);
  const avgDailyProd = dcCapacityKWp * provinceHsp * (1 - systemLossesPct / 100);

  // Flujos físicos de energía diaria
  const solarDirectDaily = Math.min(avgDailyProd, estimatedDayLoad);
  const solarSurplusDaily = Math.max(0, avgDailyProd - solarDirectDaily);

  const dailyBessCycle = hasBattery
    ? Math.min(solarSurplusDaily, Math.min(dailyUsableBatteryKWh, estimatedNightLoad))
    : 0;
  const bessChargeDaily = dailyBessCycle;
  const bessDischargeDaily = dailyBessCycle;

  const totalSelfDaily = solarDirectDaily + bessDischargeDaily;
  const gridImportDaily = Math.max(0, avgDailyCons - totalSelfDaily);
  const gridExportDaily = Math.max(0, solarSurplusDaily - bessChargeDaily);

  // Porcentajes del consumo del cliente
  const solarDirectPct = avgDailyCons > 0 ? (solarDirectDaily / avgDailyCons) * 100 : 0;
  const bessDischargePct = avgDailyCons > 0 ? (bessDischargeDaily / avgDailyCons) * 100 : 0;
  const totalSelfPct = avgDailyCons > 0 ? (totalSelfDaily / avgDailyCons) * 100 : 0;
  const gridImportPct = avgDailyCons > 0 ? (gridImportDaily / avgDailyCons) * 100 : 0;

  // Porcentajes de la generación solar
  const genDirectPct = avgDailyProd > 0 ? Math.round((solarDirectDaily / avgDailyProd) * 100) : 0;
  const genBessPct = avgDailyProd > 0 && hasBattery ? Math.round((bessChargeDaily / avgDailyProd) * 100) : 0;
  const genExportPct = avgDailyProd > 0 ? Math.max(0, 100 - genDirectPct - genBessPct) : 0;

  return {
    hasBattery, currentDaytimeRatio, currentPreset, avgDailyCons, avgDailyProd,
    solarDirectDaily, bessChargeDaily, bessDischargeDaily, gridImportDaily, gridExportDaily, totalSelfDaily,
    solarDirectPct, bessDischargePct, gridImportPct, totalSelfPct,
    genDirectPct, genBessPct, genExportPct,
  };
}
