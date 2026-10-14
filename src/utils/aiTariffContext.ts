import { GlobalTariffMatrix, UtilityDistributor, UtilityTariffDetails } from '../types/tariffs';

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
      if (source.resolutionCode === 'SIE-176-2025-TF' && now.toISOString().slice(0, 10) > '2026-03-31' && distributor !== 'CEPM') {
        const warning = 'El pliego base SIE-176-2025-TF corresponde a enero-marzo 2026; confirmar tarifas para el período solicitado.';
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
        retentionPct: tariff.netMeteringRetentionPct,
        blocksDOP: tariff.blocks?.map((block) => ({ fromKWh: block.minKWh, toKWh: Number.isFinite(block.maxKWh) ? block.maxKWh : null, rateDOP: block.rateDOP })),
        source,
      };
    }),
  }));
  return { resolutionCode: matrix.resolutionCode, effectiveDate: matrix.effectiveDate, schedules, warnings };
}

/** Unknown distributor/code returns null: callers must request confirmation, never silently choose BTS2. */
export function resolveAITariffSelection(matrix: GlobalTariffMatrix, distributor: string, code: string): UtilityTariffDetails | null {
  if (!TARIFF_DISTRIBUTORS.includes(distributor as UtilityDistributor)) return null;
  const normalized = code.toUpperCase().trim();
  const canonical = distributor === 'CEPM' ? ({ BTS1: 'RBT-1', BTS2: 'RBT-1', BTD: 'RBT-2', MTD1: 'RMT-1', MTD2: 'RMT-1' } as Record<string, string>)[normalized] || normalized : normalized;
  return matrix.schedules[distributor as UtilityDistributor]?.tariffs[canonical] || null;
}

export function tariffSourceFieldLabel(field: string): string {
  return ({baseEnergyRateDOP:"Energía (RD$)",baseEnergyRateUSD:"Energía (USD)",fixedChargeDOP:"Cargo fijo (RD$)",fixedChargeUSD:"Cargo fijo (USD)",demandChargePerKWDOP:"Demanda (RD$)",demandChargePerKWUSD:"Demanda (USD)",blocks:"Bloques",peakEnergyRateDOP:"Energía punta",offPeakEnergyRateDOP:"Energía fuera de punta",netMeteringRetentionPct:"Retención"} as Record<string,string>)[field] || field;
}
