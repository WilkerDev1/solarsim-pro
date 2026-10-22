import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../../../../../data/rdTariffs';
import { getRecommendedLoadProfile } from '../../../../../engine/solarEngine';
import type { ProjectSimulation, SystemSpecs, UtilityRates } from '../../../../../types';
import { mapTariffCodeOnDistributorChange, type UtilityDistributor } from '../../../../../types/tariffs';
import { detectLoadProfilePreset, type LoadProfilePreset } from '../../logic/loadProfilePreview';
import { DEFAULT_DOP_RATE, DEFAULT_GRID_EXPORT_FEE_PCT, DEFAULT_MONTHLY_CONSUMPTION_KWH } from '../../logic/dockDefaults';

type TariffMatrix = Parameters<typeof getReferenceEnergyRateUSD>[0];

export const DAYTIME_MIN = 15;
export const DAYTIME_MAX = 95;

export function averageMonthlyConsumption(project: Pick<ProjectSimulation, 'monthlyConsumption'>): number {
  const months = project.monthlyConsumption;
  return months && months.length > 0 ? months.reduce((a, b) => a + b, 0) / months.length : DEFAULT_MONTHLY_CONSUMPTION_KWH;
}

export const currentDistributor = (rates: Pick<UtilityRates, 'distributor'>): UtilityDistributor =>
  (rates.distributor as UtilityDistributor) || 'EDESUR';

export const currentTariffCode = (rates: Pick<UtilityRates, 'distributor' | 'tariffCode'>): string =>
  rates.tariffCode || (currentDistributor(rates) === 'CEPM' ? 'RBT-1' : 'BTS2');

interface ReferenceInput {
  matrix: TariffMatrix | undefined | null;
  avgMonthlyConsumption: number;
  dopExchangeRate?: number;
}

/** Precio oficial de referencia en USD para una distribuidora y tarifa. */
export function referenceRate(input: ReferenceInput, distributor: UtilityDistributor | string, tariffCode: string): number {
  return getReferenceEnergyRateUSD(
    input.matrix || DEFAULT_RD_TARIFF_MATRIX,
    distributor,
    tariffCode,
    input.avgMonthlyConsumption,
    input.dopExchangeRate || DEFAULT_DOP_RATE
  );
}

export const isMatchingReference = (energyCostPerKWh: number | undefined, reference: number): boolean =>
  Math.abs((energyCostPerKWh || 0) - reference) < 0.001;

export interface TariffChangePlan {
  rates: Partial<UtilityRates>;
  /** null cuando el perfil es manual o no hay forma de escribir specs: el perfil no se toca. */
  specs: Partial<SystemSpecs> | null;
}

function profileSpecs(tariffCode: string, avgMonthlyConsumption: number): Partial<SystemSpecs> {
  const rec = getRecommendedLoadProfile(tariffCode, avgMonthlyConsumption);
  return { daytimeLoadRatio: rec.daytimeRatio, daytimeSelfConsumptionRatio: rec.daytimeRatio, loadProfilePreset: rec.preset };
}

export interface ChangeContext extends ReferenceInput {
  rates: Pick<UtilityRates, 'distributor' | 'tariffCode'>;
  loadProfilePreset?: SystemSpecs['loadProfilePreset'];
  canWriteSpecs: boolean;
}

const shouldRecommendProfile = (ctx: ChangeContext) => ctx.canWriteSpecs && ctx.loadProfilePreset !== 'custom';

/** Al cambiar la distribuidora: mapea el código de tarifa, recalcula la referencia y el perfil recomendado. */
export function planDistributorChange(ctx: ChangeContext, newDistributor: UtilityDistributor): TariffChangePlan {
  const mappedCode = mapTariffCodeOnDistributorChange(currentDistributor(ctx.rates), newDistributor, currentTariffCode(ctx.rates));
  return {
    rates: { distributor: newDistributor, tariffCode: mappedCode, energyCostPerKWh: referenceRate(ctx, newDistributor, mappedCode) },
    specs: shouldRecommendProfile(ctx) ? profileSpecs(mappedCode, ctx.avgMonthlyConsumption) : null,
  };
}

/** Al cambiar la tarifa: recalcula la referencia y el perfil recomendado (salvo perfil manual). */
export function planTariffChange(ctx: ChangeContext, newCode: string): TariffChangePlan {
  return {
    rates: { tariffCode: newCode, energyCostPerKWh: referenceRate(ctx, currentDistributor(ctx.rates), newCode) },
    specs: shouldRecommendProfile(ctx) ? profileSpecs(newCode, ctx.avgMonthlyConsumption) : null,
  };
}

/** Valor del cargo de exportación que muestra el campo: 0 con inyección cero. */
export const exportFeeValue = (rates: { isZeroExport?: boolean; gridExportFeePct?: number }): number =>
  rates.isZeroExport ? 0 : (rates.gridExportFeePct ?? DEFAULT_GRID_EXPORT_FEE_PCT);

/** Perfil de carga activo: el preset explícito manda (incluido «Manual»); solo sin preset se infiere del porcentaje (35/75/90). */
export function activeLoadPreset(preset: string | undefined, daytimeRatio: number): LoadProfilePreset {
  if (preset === 'residential' || preset === 'commercial' || preset === 'industrial' || preset === 'custom') return preset;
  return detectLoadProfilePreset(daytimeRatio);
}

/** Cambios de specs al elegir un perfil; «Manual» solo marca el preset y conserva el slider. */
export function loadProfileChange(preset: LoadProfilePreset): Partial<SystemSpecs> {
  const ratio = preset === 'residential' ? 35 : preset === 'commercial' ? 75 : preset === 'industrial' ? 90 : null;
  return ratio === null
    ? { loadProfilePreset: 'custom' }
    : { daytimeLoadRatio: ratio, daytimeSelfConsumptionRatio: ratio, loadProfilePreset: preset };
}

/** El slider siempre deja el perfil en manual. */
export function daytimeSliderChange(value: number): Partial<SystemSpecs> {
  return { daytimeLoadRatio: value, daytimeSelfConsumptionRatio: value, loadProfilePreset: 'custom' };
}
