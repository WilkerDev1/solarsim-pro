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
 * Calculates monthly solar production and energy balance.
 */
export function calculateMonthlySolarProduction(
  provinceName: string,
  specs: SystemSpecs,
  monthlyConsumptionKWh: number[],
  energyCostPerKWh: number,
  gridExportFeePct: number
): MonthlyEnergyResult[] {
  const dcCapacityKWp = calculateDCCapacityKWp(specs.panelPowerW, specs.panelCount);
  const province = getProvinceHSP(provinceName);

  // Losses factor: total efficiency percentage (e.g. 14% losses -> 0.86 efficiency factor)
  const systemLossesPct = specs.isDetailed ? specs.systemLosses : 14.0;
  const derateFactor = 1 - (systemLossesPct / 100);

  const results: MonthlyEnergyResult[] = [];

  for (let i = 0; i < 12; i++) {
    const hsp = province.monthlyHSP[i];
    const days = DAYS_IN_MONTH[i];
    const consumption = monthlyConsumptionKWh[i] || 3000;

    // Monthly solar production calculation: kWp * HSP * days * derateFactor
    const production = Math.round(dcCapacityKWp * hsp * days * derateFactor);

    // Instant self-consumption vs grid export model
    // Commercial daytime load fraction (~75% daytime usage for medical/office, ~60% general)
    const daytimeSelfConsumptionRatio = specs.hasBattery ? 0.90 : 0.75;
    
    let solarSelfConsumed = Math.min(consumption, Math.round(production * daytimeSelfConsumptionRatio));
    let gridExported = Math.max(0, production - solarSelfConsumed);

    if (solarSelfConsumed + gridExported > production) {
      gridExported = Math.max(0, production - solarSelfConsumed);
    }

    // Grid export net metering with SIE-007-2026-REG 25% fee on exported energy
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
      hsp,
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
