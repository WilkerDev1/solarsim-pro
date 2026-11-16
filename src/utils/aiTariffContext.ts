import { GlobalTariffMatrix, UtilityDistributor, UtilityTariffDetails } from '../types/tariffs';
import { tariffMatrixKey } from '../../shared/tariffRules';
import { factoryGridUseCharge, isValidGridUseCharge } from '../../shared/netMetering';

export const TARIFF_DISTRIBUTORS: UtilityDistributor[] = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'];

export interface TariffSource {
  resolutionCode: string;
  effectiveDate: string;
  publishedBy: string;
  fields?: string[];
  fieldSources?: Record<string,{resolutionCode:string;effectiveDate:string;publishedBy:string}>;
}

export function getTariffSource(matrix: GlobalTariffMatrix, tariff: UtilityTariffDetails): TariffSource {
  return tariff.source || {
    resolutionCode: matrix.resolutionCode,
    effectiveDate: matrix.effectiveDate,
    publishedBy: matrix.publishedBy,
  };
}

/** Periodo de vigencia de los pliegos conocidos: pasado el último día, el contexto IA pide confirmar tarifas. */
const KNOWN_TARIFF_PERIODS: Record<string, { end: string; label: string }> = {
  'SIE-176-2025-TF': { end: '2026-03-31', label: 'enero-marzo 2026' },
  'SIE-121-2026-TF': { end: '2026-12-31', label: 'octubre-diciembre 2026' },
  'SIE-147-2026-TF': { end: '2026-09-30', label: 'septiembre 2026 (CEPM)' },
};

export interface GridUseChargeReference {
  dopPerKWh: number;
  resolutionCode: string;
  period: string;
  /** `matrix`: leído de una resolución con el escáner y guardado en la matriz; `factory`: el de fábrica (`shared/netMetering.ts`). */
  origin: 'matrix' | 'factory';
}

/** Cargo por uso de la red (RD$/kWh inyectado) de una distribuidora: el de la matriz si trae uno válido; si no, el de fábrica. */
export function gridUseChargeReference(matrix: GlobalTariffMatrix, distributor: UtilityDistributor): GridUseChargeReference {
  const schedule = matrix.schedules[distributor];
  const scanned = schedule?.gridUseChargeDOPPerKWh;
  if (isValidGridUseCharge(scanned)) {
    const source = schedule.gridUseChargeSource ?? { resolutionCode: matrix.resolutionCode, effectiveDate: matrix.effectiveDate };
    return { dopPerKWh: scanned, resolutionCode: source.resolutionCode, period: `vigente desde ${source.effectiveDate}`, origin: 'matrix' };
  }
  return { ...factoryGridUseCharge(distributor), origin: 'factory' };
}

/** Compact, deterministic reference. These rows are application data, never a prompt to infer new rates. */
export function buildAITariffContext(matrix: GlobalTariffMatrix, now = new Date()) {
  const warnings: string[] = [
    'La vigencia debe verificarse con la factura o resolución; una fecha de inicio no demuestra vigencia actual.',
    'Las tasas de energía no incluyen cargos fijos ni demanda. No dividir el total de factura entre kWh para inferirlas.',
  ];
  const schedules = TARIFF_DISTRIBUTORS.map((distributor) => ({
    distributor,
    tariffs: Object.entries(matrix.schedules[distributor]?.tariffs || {}).filter(([key, tariff]) => key === tariff.code || !matrix.schedules[distributor].tariffs[tariff.code]).map(([, tariff]) => tariff).sort((a, b) => a.code.localeCompare(b.code)).map((tariff) => {
      const source = getTariffSource(matrix, tariff);
      const period = KNOWN_TARIFF_PERIODS[source.resolutionCode];
      if (period && now.toISOString().slice(0, 10) > period.end) {
        const warning = `El pliego base ${source.resolutionCode} corresponde a ${period.label}; confirmar tarifas para el período solicitado.`;
        if (!warnings.includes(warning)) warnings.push(warning);
      }
      if (source.effectiveDate > now.toISOString().slice(0, 10)) {
        const warning = `La tarifa ${distributor}/${tariff.code} tiene fecha de inicio futura (${source.effectiveDate}).`;
        if (!warnings.includes(warning)) warnings.push(warning);
      }
      const sources = Object.values(source.fieldSources || {});
      if(sources.some(s=>s.resolutionCode !== source.resolutionCode || s.effectiveDate !== source.effectiveDate)) {
        const warning = `${distributor}/${tariff.code} conserva cargos o bloques de fuentes anteriores; revisar procedencia por campo.`;
        if(!warnings.includes(warning)) warnings.push(warning);
      }
      return {
        code: tariff.code, currency: tariff.currency,
        energyRate: tariff.currency === 'USD' ? tariff.baseEnergyRateUSD : tariff.baseEnergyRateDOP,
        fixedCharge: tariff.currency === 'USD' ? tariff.fixedChargeUSD : tariff.fixedChargeDOP,
        demandChargePerKW: tariff.currency === 'USD' ? tariff.demandChargePerKWUSD : tariff.demandChargePerKWDOP,
        peakEnergyRateDOP: tariff.peakEnergyRateDOP,
        offPeakEnergyRateDOP: tariff.offPeakEnergyRateDOP,
        fixedChargeTiersDOP: tariff.fixedChargeTiersDOP?.map((tier) => ({ minKWh: tier.minKWh, maxKWh: tier.maxKWh, chargeDOP: tier.chargeDOP })),
        retentionPct: tariff.netMeteringRetentionPct,
        blocksDOP: tariff.blocks?.map((block) => ({ fromKWh: block.minKWh, toKWh: Number.isFinite(block.maxKWh) ? block.maxKWh : null, rateDOP: block.rateDOP })),
        source,
      };
    }),
  }));
  // Cargo por uso de la red SIE-007-2026 (RD$/kWh inyectado) con su procedencia: el que el escáner leyó de una resolución y
  // guardó en la matriz de la organización y, si no hay, el de fábrica (`shared/netMetering.ts`). Solo tarifas de un solo precio.
  const gridUseCharges = TARIFF_DISTRIBUTORS.map((distributor) => ({
    distributor,
    ...gridUseChargeReference(matrix, distributor),
    appliesTo: 'tarifas de un solo precio (BTS-1, BTS-2, RBT-1); 0 con potencia o inyección cero',
  }));
  return { resolutionCode: matrix.resolutionCode, effectiveDate: matrix.effectiveDate, schedules, gridUseCharges, warnings };
}

/** Unknown distributor/code returns null: callers must request confirmation, never silently choose BTS2. */
export function resolveAITariffSelection(matrix: GlobalTariffMatrix, distributor: string, code: string): UtilityTariffDetails | null {
  if (!TARIFF_DISTRIBUTORS.includes(distributor as UtilityDistributor)) return null;
  // BTS-1, «bts 1» y BTS1 son la misma fila; en CEPM los códigos de las EDE se resuelven a su alias.
  return matrix.schedules[distributor as UtilityDistributor]?.tariffs[tariffMatrixKey(distributor, code)] || null;
}

export function tariffSourceFieldLabel(field: string): string {
  return ({baseEnergyRateDOP:"Energía (RD$)",baseEnergyRateUSD:"Energía (USD)",fixedChargeDOP:"Cargo fijo (RD$)",fixedChargeUSD:"Cargo fijo (USD)",demandChargePerKWDOP:"Demanda (RD$)",demandChargePerKWUSD:"Demanda (USD)",blocks:"Bloques",peakEnergyRateDOP:"Energía punta",offPeakEnergyRateDOP:"Energía fuera de punta",netMeteringRetentionPct:"Retención",fixedChargeTiersDOP:"Cargo fijo por rango"} as Record<string,string>)[field] || field;
}
