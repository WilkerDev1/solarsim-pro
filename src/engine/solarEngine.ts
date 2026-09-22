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
 * Calculates monthly solar production and energy balance dynamically using location-specific solar radiation.
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

    // Physics-based self-consumption & battery storage model (BESS)
    const totalBatteryKWh = calculateTotalBatteryCapacityKWh(specs);
    const hasBatteryStorage = !!(specs.hasBattery && totalBatteryKWh > 0);

    const baseDaytimeRatio = specs.daytimeSelfConsumptionRatio !== undefined
      ? specs.daytimeSelfConsumptionRatio / 100
      : (hasBatteryStorage ? 0.70 : 0.75);

    const daytimeSelfConsumptionRatio = Math.min(0.98, Math.max(0.20, baseDaytimeRatio));

    // Direct daytime solar self-consumption (instantaneous in-situ without hitting the grid)
    const directSolarConsumed = Math.min(consumption, Math.round(production * daytimeSelfConsumptionRatio * 10) / 10);

    // Battery storage dynamics (BESS)
    let batteryContributionKWh = 0;
    if (hasBatteryStorage) {
      const batteryDodPct = specs.batteryDOD !== undefined ? specs.batteryDOD : 90;
      const batteryEffPct = specs.batteryEfficiencyPct !== undefined ? specs.batteryEfficiencyPct : 95;
      const dailyUsableBatteryKWh = totalBatteryKWh * (batteryDodPct / 100) * (batteryEffPct / 100);
      const monthlyMaxBatteryStorageKWh = days * dailyUsableBatteryKWh;

      // Daytime surplus generation available to charge the battery
      const daytimeSurplusKWh = Math.max(0, production - directSolarConsumed);
      // Nighttime / off-peak consumption that can be displaced by the battery
      const nighttimeConsumptionKWh = Math.max(0, consumption - directSolarConsumed);

      // Battery displacement is limited by: surplus solar, battery throughput capacity, and nighttime demand
      batteryContributionKWh = Math.round(Math.min(daytimeSurplusKWh, monthlyMaxBatteryStorageKWh, nighttimeConsumptionKWh) * 10) / 10;
    }

    const solarSelfConsumed = Math.min(consumption, Math.min(production, Math.round((directSolarConsumed + batteryContributionKWh) * 10) / 10));

    let gridExported = 0;
    if (isZeroExport) {
      // In Zero-Export mode (with anti-feed limiter), energy is only used on-site; no grid injection occurs
      gridExported = 0;
    } else {
      gridExported = Math.max(0, Math.round((production - solarSelfConsumed) * 10) / 10);
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
