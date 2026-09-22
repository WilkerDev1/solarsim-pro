import { SystemSpecs, MonthlyEnergyResult } from '../types';
import { getProvinceHSP } from '../data/rdProvinces';
import { calculateTotalDCCapacityKWp, calculateTotalBatteryCapacityKWh } from '../utils/equipmentSpecsUtils';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Calculates DC system capacity in kWp.
 */
export function calculateDCCapacityKWp(panelPowerW: number, panelCount: number): number {
  return (panelPowerW * panelCount) / 1000;
}

/**
 * Calculates the exact recommended panel count and DC capacity required
 * to achieve the target coverage percentage based on annual consumption,
 * location solar irradiation (HSP), panel wattage, and system losses.
 */
export function calculateRecommendedPanelCount(
  provinceName: string,
  monthlyConsumptionKWh: number[],
  panelPowerW: number,
  targetCoveragePct: number = 95,
  systemLossesPct: number = 25.0,
  customMonthlyHSP?: number[]
): {
  recommendedPanelCount: number;
  recommendedCapacityKWp: number;
  annualSpecificYieldKWhPerKWp: number;
  targetAnnualKWh: number;
} {
  const province = getProvinceHSP(provinceName);
  const derateFactor = 1 - (systemLossesPct / 100);

  let annualSpecificYield = 0;
  for (let i = 0; i < 12; i++) {
    const hsp = (customMonthlyHSP && customMonthlyHSP.length === 12 && customMonthlyHSP[i] > 0)
      ? customMonthlyHSP[i]
      : province.monthlyHSP[i];
    const days = DAYS_IN_MONTH[i];
    annualSpecificYield += 1.0 * hsp * days * derateFactor;
  }

  if (annualSpecificYield <= 0) {
    annualSpecificYield = 1368.75; // Fallback ~5.0 HSP * 365 * 0.75
  }

  const totalAnnualConsumption = monthlyConsumptionKWh.reduce((sum, v) => sum + (Number(v) || 0), 0);
  const safeCoverage = Math.max(1, targetCoveragePct) / 100;
  const targetAnnualKWh = totalAnnualConsumption * safeCoverage;

  const requiredCapacityKWp = targetAnnualKWh / annualSpecificYield;
  const safePanelWatts = panelPowerW > 0 ? panelPowerW : 620;
  const recommendedPanelCount = Math.max(1, Math.ceil((requiredCapacityKWp * 1000) / safePanelWatts));
  const recommendedCapacityKWp = Math.round(((recommendedPanelCount * safePanelWatts) / 1000) * 100) / 100;

  return {
    recommendedPanelCount,
    recommendedCapacityKWp,
    annualSpecificYieldKWhPerKWp: Math.round(annualSpecificYield * 10) / 10,
    targetAnnualKWh: Math.round(targetAnnualKWh * 10) / 10,
  };
}

/**
 * Deduce o sugiere el perfil de carga y el ratio diurno óptimo
 * según la tarifa eléctrica (BTS1/BTS2 residencial vs BTD comercial vs MTD industrial)
 * o según el consumo promedio mensual del cliente.
 */
export function getRecommendedLoadProfile(
  tariffCode?: string,
  monthlyAvgConsumption?: number
): { preset: 'residential' | 'commercial' | 'industrial'; daytimeRatio: number } {
  const code = (tariffCode || '').toUpperCase().trim();

  // 1. Detección por código de tarifa dominicana (EDESUR, EDEESTE, EDENORTE, CEPM)
  if (code.startsWith('BTS') || code.includes('RBT') || code.includes('RESID')) {
    // Tarifas residenciales: BTS1, BTS2, RBT-1 (CEPM)
    return { preset: 'residential', daytimeRatio: 35 };
  }
  if (code.startsWith('BTD') || code.includes('CBT') || code.includes('VMT1') || code.includes('COMER')) {
    // Tarifas comerciales de baja tensión: BTD, CBT-1, CBT-2, VMT1
    return { preset: 'commercial', daytimeRatio: 75 };
  }
  if (
    code.startsWith('MTD') ||
    code.startsWith('MTH') ||
    code.startsWith('ATD') ||
    code.includes('CMT') ||
    code.includes('VMT2') ||
    code.includes('VMT3') ||
    code.includes('INDUS')
  ) {
    // Tarifas de media/alta tensión industrial: MTD1, MTD2, MTH, CMT-1, etc.
    return { preset: 'industrial', daytimeRatio: 90 };
  }

  // 2. Detección heurística por volumen de consumo promedio mensual si no hay tarifa clara
  if (monthlyAvgConsumption !== undefined && monthlyAvgConsumption > 0) {
    if (monthlyAvgConsumption <= 1500) {
      return { preset: 'residential', daytimeRatio: 35 };
    }
    if (monthlyAvgConsumption <= 15000) {
      return { preset: 'commercial', daytimeRatio: 75 };
    }
    return { preset: 'industrial', daytimeRatio: 90 };
  }

  // Predeterminado de seguridad: Residencial (35% diurno / 65% nocturno)
  return { preset: 'residential', daytimeRatio: 35 };
}

/**
 * Calculates monthly solar production and energy balance dynamically using location-specific solar radiation,
 * equivalent daily load partition (daytime vs nighttime), and physical BESS battery dispatch.
 */
export function calculateMonthlySolarProduction(
  provinceName: string,
  specs: SystemSpecs,
  monthlyConsumptionKWh: number[],
  energyCostPerKWh: number,
  gridExportFeePct: number,
  customMonthlyHSP?: number[],
  tariffCode?: string,
  isZeroExport?: boolean
): MonthlyEnergyResult[] {
  const dcCapacityKWp = calculateTotalDCCapacityKWp(specs);
  const province = getProvinceHSP(provinceName);

  // Losses factor: total efficiency percentage (default: 25.0% losses -> 0.75 derate factor)
  const systemLossesPct = specs.systemLosses !== undefined ? specs.systemLosses : (specs.isDetailed ? 14.0 : 25.0);
  const derateFactor = 1 - (systemLossesPct / 100);

  // SIE-007-2026-REG / Net Metering Regulations:
  // - Grid export fee / retention (~25%) applies to all exported energy across all tariffs (BTS1, BTS2, BTD, MTD1, MTD2, etc.).
  // - Zero-Export systems (antivertido) do not inject to grid, resulting in 0 exported kWh and 0 export fees.
  const effectiveGridExportFeePct = !isZeroExport ? (gridExportFeePct ?? 25) : 0;

  // BESS battery specifications
  const totalBatteryKWh = calculateTotalBatteryCapacityKWh(specs);
  const hasBatteryStorage = !!(specs.hasBattery && totalBatteryKWh > 0);
  const batteryDodPct = specs.batteryDOD !== undefined ? specs.batteryDOD : 90;
  const batteryEffPct = specs.batteryEfficiencyPct !== undefined ? specs.batteryEfficiencyPct : 90;
  const dailyUsableBatteryKWh = hasBatteryStorage
    ? totalBatteryKWh * (batteryDodPct / 100) * (batteryEffPct / 100)
    : 0;

  // Calculate project-wide average monthly consumption to determine profile preset consistently
  const totalProjectCons = (monthlyConsumptionKWh && monthlyConsumptionKWh.length > 0)
    ? monthlyConsumptionKWh.reduce((sum, c) => sum + (c || 0), 0)
    : 36000;
  const avgMonthlyCons = monthlyConsumptionKWh && monthlyConsumptionKWh.length > 0
    ? totalProjectCons / monthlyConsumptionKWh.length
    : 3000;

  // Determine daytime load ratio (hours 8:00 AM - 5:00 PM) for the project
  let projectDaytimeRatio: number;
  if (specs.daytimeLoadRatio !== undefined) {
    projectDaytimeRatio = specs.daytimeLoadRatio / 100;
  } else if (specs.daytimeSelfConsumptionRatio !== undefined) {
    projectDaytimeRatio = specs.daytimeSelfConsumptionRatio / 100;
  } else {
    projectDaytimeRatio = getRecommendedLoadProfile(tariffCode, avgMonthlyCons).daytimeRatio / 100;
  }
  // Clamp between 15% and 95%
  const daytimeRatio = Math.min(0.95, Math.max(0.15, projectDaytimeRatio));

  const results: MonthlyEnergyResult[] = [];

  for (let i = 0; i < 12; i++) {
    // Dynamic solar radiation (HSP): Uses satellite GPS API custom vector if available, otherwise province database
    const hsp = (customMonthlyHSP && customMonthlyHSP.length === 12 && customMonthlyHSP[i] > 0)
      ? customMonthlyHSP[i]
      : province.monthlyHSP[i];

    const days = DAYS_IN_MONTH[i];
    const consumption = monthlyConsumptionKWh[i] || 3000;

    // Dynamic monthly solar production formula: kWp * HSP * days * derateFactor
    const production = Math.round(dcCapacityKWp * hsp * days * derateFactor * 10) / 10;

    // Daily averages for the month
    const dailyCons = consumption / days;
    const dailyProd = production / days;

    // 2. Load partition: Day load vs Night load
    const dayLoad = dailyCons * daytimeRatio;
    const nightLoad = Math.max(0, dailyCons - dayLoad);

    // 3. Direct solar self-consumption (instantaneous in-situ during day)
    const directSolarDaily = Math.min(dailyProd, dayLoad);
    const dailySolarSurplus = Math.max(0, dailyProd - directSolarDaily);

    // 4. Physical BESS battery storage cycle:
    // - Battery charges from diurnal solar surplus up to its usable throughput capacity
    // - Battery discharges at night limited by its charge and actual nighttime demand
    let bessChargeDaily = 0;
    let bessDischargeDaily = 0;

    if (hasBatteryStorage && dailyUsableBatteryKWh > 0) {
      bessChargeDaily = Math.min(dailySolarSurplus, dailyUsableBatteryKWh);
      bessDischargeDaily = Math.min(bessChargeDaily, nightLoad);
    }

    // 5. Total daily in-situ self-consumption: direct solar + battery night displacement
    const dailyTotalSelfConsumption = directSolarDaily + bessDischargeDaily;
    const solarSelfConsumed = Math.min(
      consumption,
      Math.min(production, Math.round(dailyTotalSelfConsumption * days * 10) / 10)
    );

    // Monthly battery contribution to self-consumption
    const batteryContributionKWh = Math.round(bessDischargeDaily * days * 10) / 10;

    // 6. Interaction with the grid
    let gridExported = 0;
    if (isZeroExport) {
      // In Zero-Export mode (with anti-feed limiter), excess generation is curtailed; no export
      gridExported = 0;
    } else {
      const dailyGridExport = Math.max(0, dailySolarSurplus - bessChargeDaily);
      gridExported = Math.round(dailyGridExport * days * 10) / 10;
      // Guard: self-consumed + exported cannot physically exceed solar production
      if (solarSelfConsumed + gridExported > production) {
        gridExported = Math.max(0, Math.round((production - solarSelfConsumed) * 10) / 10);
      }
    }

    // Grid export net metering with SIE-007-2026-REG fee on exported energy
    const netExportCreditKWh = Math.round(gridExported * (1 - (effectiveGridExportFeePct / 100)) * 10) / 10;
    const retainedExportKWh = Math.round((gridExported - netExportCreditKWh) * 10) / 10;

    // Energy savings = (Self consumed in-situ + net export credit recognized) * energy cost
    const effectiveSavedKWh = Math.round((solarSelfConsumed + netExportCreditKWh) * 10) / 10;
    const savingsUSD = Math.round(effectiveSavedKWh * energyCostPerKWh * 100) / 100;

    const originalBillUSD = Math.round(consumption * energyCostPerKWh * 100) / 100;
    const netBillUSD = Math.max(0, Math.round((originalBillUSD - savingsUSD) * 100) / 100);

    results.push({
      month: MONTH_NAMES[i],
      monthIndex: i,
      days,
      hsp: Math.round(hsp * 100) / 100,
      consumptionKWh: consumption,
      productionKWh: production,
      solarSelfConsumedKWh: solarSelfConsumed,
      gridExportedKWh: gridExported,
      netExportCreditKWh,
      retainedExportKWh,
      effectiveSavedKWh,
      batteryContributionKWh,
      savingsUSD,
      netBillUSD,
      originalBillUSD,
    });
  }

  return results;
}
