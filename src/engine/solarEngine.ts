import { SystemSpecs, MonthlyEnergyResult } from '../types';
import { getProvinceHSP } from '../data/rdProvinces';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Calculates DC system capacity in kWp.
 */
export function calculateDCCapacityKWp(panelPowerW: number, panelCount: number): number {
  return (panelPowerW * panelCount) / 1000;
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
  customMonthlyHSP?: number[]
): MonthlyEnergyResult[] {
  const dcCapacityKWp = calculateDCCapacityKWp(specs.panelPowerW, specs.panelCount);
  const province = getProvinceHSP(provinceName);

  // Losses factor: total efficiency percentage (e.g. 14% losses -> 0.86 efficiency factor)
  const systemLossesPct = specs.isDetailed ? specs.systemLosses : 14.0;
  const derateFactor = 1 - (systemLossesPct / 100);

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

    // Instant self-consumption vs grid export model
    const daytimeSelfConsumptionRatio = specs.hasBattery ? 0.90 : 0.75;
    
    let solarSelfConsumed = Math.min(consumption, Math.round(production * daytimeSelfConsumptionRatio * 10) / 10);
    let gridExported = Math.max(0, Math.round((production - solarSelfConsumed) * 10) / 10);

    if (solarSelfConsumed + gridExported > production) {
      gridExported = Math.max(0, Math.round((production - solarSelfConsumed) * 10) / 10);
    }

    // Grid export net metering with SIE-007-2026-REG fee on exported energy
    const netExportCredit = gridExported * (1 - (gridExportFeePct / 100));

    // Energy savings = (Self consumed + net export credit) * energy cost
    const effectiveSavedKWh = solarSelfConsumed + netExportCredit;
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
      savingsUSD,
      netBillUSD,
      originalBillUSD,
    });
  }

  return results;
}
