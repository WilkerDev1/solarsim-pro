import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import { DEFAULT_SYSTEM_LOSSES_PCT, DEFAULT_TARGET_COVERAGE_PCT, resolveAssumption, resolveSystemLosses } from '../../shared/assumptions';
import { SystemSpecs, MonthlyEnergyResult } from '../types';
import { getProvinceHSP } from '../data/rdProvinces';
import { calculateTotalDCCapacityKWp } from '../utils/equipmentSpecsUtils';
import { batteryBank, readEquipment } from '../../shared/equipment';
import { exportsToGrid, isGridConnectionMode, type GridConnectionMode } from '../../shared/gridConnection';
import { calculateBillingYear, calculateMonthlyBill, type BillingTariff } from '../../shared/tariffBilling';

/**
 * Cargo por uso de la red del régimen SIE-007-2026 (`shared/netMetering.ts`): con él, la medición neta acredita el 100 %
 * de lo inyectado y se descuenta `kWh inyectados × usdPerKWh` del ahorro. Sin él, el régimen anterior (retención %).
 */
export interface GridUseChargeInput {
  /** Cargo aplicado en USD por kWh inyectado (0 en tarifas con potencia o con inyección cero). */
  usdPerKWh: number;
}

/**
 * Facturación por bloques del régimen SIE-007-2026 (`shared/tariffBilling.ts`): el ahorro de cada mes es la factura sin
 * sistema menos la factura con sistema (bloques, cargo fijo, neteo con arrastre del crédito y cargo por uso de la red),
 * y el crédito que sobra al cierre del año se liquida en diciembre. Solo cambia la valoración en dinero: la energía
 * (autoconsumo, inyección) sale del mismo modelo.
 */
export interface BlockBillingInput {
  tariff: BillingTariff;
  /** RD$ por US$ con que se convierten las facturas. */
  dopPerUSD: number;
  /** Cargo por uso de la red que se cobra (RD$/kWh inyectado); 0 si no aplica. */
  gridUseChargeDOPPerKWh: number;
  /** Precio de liquidación del crédito anual sobrante (RD$/kWh). */
  settlementDOPPerKWh: number;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Unrounded monthly generation per kWp, shared with theoretical draft consumption. */
export function getMonthlySolarProductionFactors(provinceName:string,systemLosses=DEFAULT_SYSTEM_LOSSES_PCT,customMonthlyHSP?:number[]):number[]{
  const province=getProvinceHSP(provinceName);
  return DAYS_IN_MONTH.map((days,i)=>{const hsp=customMonthlyHSP?.length===12&&customMonthlyHSP[i]>0?customMonthlyHSP[i]:province.monthlyHSP[i];return hsp*days*(1-systemLosses/100);});
}

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
  targetCoveragePct: number = DEFAULT_TARGET_COVERAGE_PCT,
  systemLossesPct: number = DEFAULT_SYSTEM_LOSSES_PCT,
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
  // Cobertura 0 o fuera de rango = sin dato: se dimensiona con el valor resuelto (ADR 0003), no con 1 %.
  const safeCoverage = Math.max(1, resolveAssumption('targetCoveragePct', targetCoveragePct)) / 100;
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
  /** Tipo de conexión (`resolveGridConnection`); un booleano es el `isZeroExport` heredado (true = inyección cero). */
  gridConnection?: GridConnectionMode | boolean,
  calculationMode: EnergyCalculationMode = 'legacy',
  gridUseCharge?: GridUseChargeInput,
  blockBilling?: BlockBillingInput
): MonthlyEnergyResult[] {
  // Misma lectura que resolveGridConnection: un valor desconocido no es inyección cero; `true` es el isZeroExport heredado.
  const connection: GridConnectionMode = isGridConnectionMode(gridConnection) ? gridConnection : gridConnection === true ? 'zero_export' : 'grid_export';
  // Inyección cero y sistema aislado no exportan: el excedente se recorta y no hay retención.
  const isZeroExport = !exportsToGrid(connection);
  const isOffGrid = connection === 'off_grid';
  const dcCapacityKWp = calculateTotalDCCapacityKWp(specs);
  const province = getProvinceHSP(provinceName);

  // Losses factor: total efficiency percentage (default from shared/projectDefaults -> derate factor)
  const systemLossesPct = resolveSystemLosses(specs);
  const derateFactor = 1 - (systemLossesPct / 100);

  const generationFactors=getMonthlySolarProductionFactors(provinceName,systemLossesPct,customMonthlyHSP);

  // Régimen anterior (`legacy_retention`): retención % (~25 %) de toda la energía exportada, en cualquier tarifa.
  // Régimen SIE-007-2026 (`gridUseCharge`): sin retención; cargo por kWh inyectado (ver abajo).
  // Inyección cero (antivertido): no se exporta, sin retención ni cargo.
  const usdPerInjectedKWh = gridUseCharge && Number.isFinite(gridUseCharge.usdPerKWh) && gridUseCharge.usdPerKWh > 0 && !isZeroExport ? gridUseCharge.usdPerKWh : 0;
  const effectiveGridExportFeePct = !isZeroExport && !gridUseCharge ? resolveAssumption('gridExportFeePct', gridExportFeePct) : 0;

  // BESS battery specifications
  const bank = batteryBank(readEquipment(specs));
  const hasBatteryStorage = bank.hasStorage;
  const dailyUsableBatteryKWh = bank.usableKWh;

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
    const consumption = monthlyConsumptionKWh[i] ?? 3000;

    // Dynamic monthly solar production formula: kWp * HSP * days * derateFactor
    const production = Math.round(dcCapacityKWp * generationFactors[i] * 10) / 10;

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
    // In steady daily cycling, the battery can only recharge what it actually discharges at night.
    // If night demand is low, the battery only cycles that amount; excess surplus flows to the grid.
    let bessChargeDaily = 0;
    let bessDischargeDaily = 0;

    if (hasBatteryStorage && dailyUsableBatteryKWh > 0) {
      const dailyBessCycle = Math.min(dailySolarSurplus, Math.min(dailyUsableBatteryKWh, nightLoad));
      bessChargeDaily = dailyBessCycle;
      bessDischargeDaily = dailyBessCycle;
    }

    // 5. Total daily in-situ self-consumption: direct solar + battery night displacement
    const dailyTotalSelfConsumption = directSolarDaily + bessDischargeDaily;
    const physicalSelfConsumed = Math.min(
      consumption,
      Math.min(production, Math.round(dailyTotalSelfConsumption * days * 10) / 10)
    );

    // Monthly battery contribution to self-consumption
    // Disabled experimental parameters never influence the historical model.
    const legacySelfConsumed = Math.min(consumption, Math.round(production * (specs.hasBattery ? 0.90 : 0.75) * 10) / 10);
    // El factor clásico supone que la red absorbe el desfase día/noche. Sin red (aislado) no puede servirse más
    // de lo que el balance físico permite (solar directo + ciclo de batería), así que se toma el menor de ambos.
    const solarSelfConsumed = calculationMode === 'legacy'
      ? (isOffGrid ? Math.min(legacySelfConsumed, physicalSelfConsumed) : legacySelfConsumed)
      : physicalSelfConsumed;
    const batteryContributionKWh = calculationMode === 'legacy' ? 0 : Math.round(bessDischargeDaily * days * 10) / 10;

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

    if (calculationMode === 'legacy') gridExported = isZeroExport ? 0 : Math.max(0, Math.round((production - solarSelfConsumed) * 10) / 10);

    // Grid export net metering with SIE-007-2026-REG fee on exported energy
    const netExportCreditKWh = Math.round(gridExported * (1 - (effectiveGridExportFeePct / 100)) * 10) / 10;
    const retainedExportKWh = Math.round((gridExported - netExportCreditKWh) * 10) / 10;

    // Energy savings = (Self consumed in-situ + net export credit recognized) * energy cost
    const effectiveSavedKWh = Math.round((solarSelfConsumed + netExportCreditKWh) * 10) / 10;
    // SIE-007-2026: el cargo por uso de la red se descuenta del ahorro (kWh inyectados × cargo).
    const gridUseChargeUSD = Math.round(gridExported * usdPerInjectedKWh * 100) / 100;
    const savingsUSD = gridUseCharge
      ? Math.round((Math.round(effectiveSavedKWh * energyCostPerKWh * 100) / 100 - gridUseChargeUSD) * 100) / 100
      : Math.round(effectiveSavedKWh * energyCostPerKWh * 100) / 100;

    // Sin acometida, el costo de referencia es el de la energía que el sistema evita (tarifa del proyecto) y el
    // «saldo» es el valor de la energía no servida, que deberá cubrir un respaldo externo.
    const originalBillUSD = Math.round(consumption * energyCostPerKWh * 100) / 100;
    const netBillUSD = Math.max(0, Math.round((originalBillUSD - savingsUSD) * 100) / 100);
    // Sistema aislado: lo que ni el sol ni la batería cubren no se importa de la red; es energía no servida.
    const offGridFields = isOffGrid ? { unservedKWh: Math.max(0, Math.round((consumption - solarSelfConsumed) * 10) / 10) } : {};

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
      ...offGridFields,
      ...(gridUseCharge ? { gridUseChargeUSD } : {}),
    });
  }

  // Sistema aislado: sin factura de la distribuidora (se valora contra su alternativa de suministro).
  return blockBilling && !isOffGrid ? withBlockBilling(results, blockBilling) : results;
}

const usd2 = (dop: number, dopPerUSD: number) => Math.round((dop / dopPerUSD) * 100) / 100;
const kWh1 = (kWh: number) => Math.round(kWh * 10) / 10;

/** Revalora el balance energético con las facturas por bloques (sin y con sistema) del año. */
function withBlockBilling(results: MonthlyEnergyResult[], billing: BlockBillingInput): MonthlyEnergyResult[] {
  // Tasa no válida: la por defecto compartida (ADR 0003), nunca 1:1.
  const fx = resolveAssumption('dopExchangeRate', billing.dopPerUSD);
  const year = calculateBillingYear(
    billing.tariff,
    // Sin redondeo: solo se limpia el ruido de coma flotante de la resta (los dos términos ya vienen a 0.1 kWh).
    results.map((m) => ({ withdrawnKWh: Math.max(0, Math.round((m.consumptionKWh - m.solarSelfConsumedKWh) * 1e9) / 1e9), injectedKWh: m.gridExportedKWh })),
    { gridUseChargeDOPPerKWh: billing.gridUseChargeDOPPerKWh, settlementDOPPerKWh: billing.settlementDOPPerKWh },
  );
  const settlementUSD = usd2(year.settlement.amountDOP, fx);
  return results.map((m, i) => {
    const withSystem = year.months[i];
    const originalBillUSD = usd2(calculateMonthlyBill({ tariff: billing.tariff, withdrawnKWh: m.consumptionKWh }).totalDOP, fx);
    const netBillUSD = usd2(withSystem.totalDOP, fx);
    const isClosingMonth = i === results.length - 1;
    const settlement = isClosingMonth ? { creditSettlementKWh: kWh1(year.settlement.creditKWh), creditSettlementUSD: settlementUSD } : {};
    return {
      ...m,
      originalBillUSD,
      netBillUSD,
      savingsUSD: Math.round((originalBillUSD - netBillUSD + (isClosingMonth ? settlementUSD : 0)) * 100) / 100,
      gridUseChargeUSD: usd2(withSystem.gridUseChargeDOP, fx),
      // Se redondea solo al presentar (0.1 kWh); el cálculo y el arrastre van sin redondear.
      tariffBill: {
        withdrawnKWh: kWh1(withSystem.withdrawnKWh),
        netBilledKWh: kWh1(withSystem.netKWh),
        creditInKWh: kWh1(withSystem.creditInKWh),
        creditAppliedKWh: kWh1(withSystem.creditAppliedKWh),
        creditCarriedKWh: kWh1(withSystem.creditCarriedKWh),
        energyChargeUSD: usd2(withSystem.energyChargeDOP, fx),
        fixedChargeUSD: usd2(withSystem.fixedChargeDOP, fx),
        ...settlement,
      },
    };
  });
}
