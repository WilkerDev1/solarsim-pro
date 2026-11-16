import { DEFAULT_GRID_EXPORT_FEE_PCT } from '../../shared/assumptions';
import { isValidGridUseCharge, MAX_GRID_USE_CHARGE_DOP_PER_KWH } from '../../shared/netMetering';
import { FixedChargeTier, GlobalTariffMatrix, UtilityDistributor, UtilityTariffDetails } from '../types/tariffs';
import { getTariffSource, TARIFF_DISTRIBUTORS } from './aiTariffContext';

const numericFields = ['baseEnergyRateDOP', 'baseEnergyRateUSD', 'fixedChargeDOP', 'fixedChargeUSD', 'demandChargePerKWDOP', 'demandChargePerKWUSD', 'peakEnergyRateDOP', 'offPeakEnergyRateDOP', 'netMeteringRetentionPct'] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const MAX_FIXED_CHARGE_TIERS = 5;
const requiredText = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error(`El documento no identifica ${label}. Revisa la extracción.`);
  return value.trim();
};

/** Cargo fijo por rango de consumo (BTS1: 0–100 y ≥101 kWh): contiguos desde 0, el último abierto y su cargo igual al cargo fijo escalar. */
function parseFixedChargeTiers(raw: unknown, currency: 'DOP' | 'USD', fixedCharge: number, label: string): FixedChargeTier[] {
  if (currency !== 'DOP' || !Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FIXED_CHARGE_TIERS) throw new Error(`Rangos de cargo fijo inválidos en ${label}.`);
  let previousMax = -1;
  const tiers = raw.map((tier, index, all): FixedChargeTier => {
    if (!record(tier)) throw new Error(`Rango de cargo fijo inválido en ${label}.`);
    const { minKWh: min, maxKWh: max, chargeDOP: charge } = tier;
    const last = index === all.length - 1;
    if (typeof min !== 'number' || !Number.isFinite(min) || min < 0 || (index === 0 ? min !== 0 : min < previousMax || min > previousMax + 1)
      || (last ? max !== null : typeof max !== 'number' || !Number.isFinite(max) || max <= min)
      || typeof charge !== 'number' || !Number.isFinite(charge) || charge < 0) throw new Error(`Rangos de cargo fijo inválidos en ${label}.`);
    previousMax = max as number;
    return { minKWh: min, maxKWh: max as number | null, chargeDOP: charge };
  });
  if (Math.abs(tiers[tiers.length - 1].chargeDOP - fixedCharge) > 0.005) throw new Error(`El cargo fijo de ${label} no coincide con el del último rango.`);
  return tiers;
}

export function mergeExtractedTariffs(raw: unknown, current: GlobalTariffMatrix): GlobalTariffMatrix {
  if (!record(raw) || !record(raw.schedules)) throw new Error('La extracción no contiene distribuidoras válidas.');
  const resolutionCode = requiredText(raw.resolutionCode, 'la resolución');
  const effectiveDate = requiredText(raw.effectiveDate, 'la fecha de inicio');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || Number.isNaN(Date.parse(effectiveDate)) || new Date(effectiveDate).toISOString().slice(0, 10) !== effectiveDate) throw new Error('Fecha de inicio inválida en el documento.');
  const publishedBy = requiredText(raw.publishedBy, 'la entidad emisora');
  const schedules = Object.fromEntries(TARIFF_DISTRIBUTORS.map((distributor) => {
    const schedule = current.schedules[distributor];
    return [distributor, { ...schedule, tariffs: Object.fromEntries(Object.entries(schedule.tariffs).map(([code, tariff]) => [code, { ...tariff, source: getTariffSource(current, tariff) }])) }];
  })) as GlobalTariffMatrix['schedules'];
  let updated = 0;
  let chargesUpdated = 0;
  for (const [distributor, schedule] of Object.entries(raw.schedules)) {
    if (!TARIFF_DISTRIBUTORS.includes(distributor as UtilityDistributor)) throw new Error(`Distribuidora no reconocida: ${distributor}.`);
    if (!record(schedule) || (schedule.tariffs !== undefined && !record(schedule.tariffs))) throw new Error(`Tarifas inválidas de ${distributor}.`);
    const target = schedules[distributor as UtilityDistributor];
    // Cargo por uso de la red (RD$/kWh inyectado): ausente o null = no documentado (conserva el anterior y su fuente).
    const charge = schedule.gridUseChargeDOPPerKWh;
    if (charge !== undefined && charge !== null) {
      if (!isValidGridUseCharge(charge)) throw new Error(`Cargo por uso de la red inválido en ${distributor}: debe estar entre 0 y ${MAX_GRID_USE_CHARGE_DOP_PER_KWH} RD$/kWh.`);
      target.gridUseChargeDOPPerKWh = charge;
      target.gridUseChargeSource = { resolutionCode, effectiveDate, publishedBy };
      chargesUpdated++;
    }
    for (const [code, value] of Object.entries(schedule.tariffs ?? {})) {
      if (!/^[A-Z][A-Z0-9-]{1,20}$/.test(code) || !record(value)) throw new Error('Código de tarifa inválido.');
      if (value.currency !== 'DOP' && value.currency !== 'USD') throw new Error(`La tarifa ${distributor}/${code} no indica moneda válida.`);
      const currency = value.currency;
      const energyKey = currency === 'USD' ? 'baseEnergyRateUSD' : 'baseEnergyRateDOP';
      const fixedKey = currency === 'USD' ? 'fixedChargeUSD' : 'fixedChargeDOP';
      for (const field of [energyKey, fixedKey]) if (typeof value[field] !== 'number') throw new Error(`Falta ${field} en ${distributor}/${code}. No se completan cargos con valores inventados.`);
      const fixedChargeTiers = value.fixedChargeTiersDOP === undefined || value.fixedChargeTiersDOP === null ? undefined : parseFixedChargeTiers(value.fixedChargeTiersDOP, currency, value[fixedKey] as number, `${distributor}/${code}`);
      const old = target.tariffs[code];
      const next: UtilityTariffDetails = {
        ...(old && old.currency === currency ? old : {}),
        code, name: typeof value.name === 'string' ? value.name.slice(0, 200) : old?.name || code,
        description: typeof value.description === 'string' ? value.description.slice(0, 1000) : old?.description || '',
        currency, baseEnergyRateDOP: currency === old?.currency ? old.baseEnergyRateDOP : 0, fixedChargeDOP: currency === old?.currency ? old.fixedChargeDOP : 0,
        netMeteringRetentionPct: old?.netMeteringRetentionPct ?? DEFAULT_GRID_EXPORT_FEE_PCT,
      };
      // Cargo fijo por rango: los del documento; si no trae rangos, los anteriores solo sirven con el mismo cargo fijo abierto.
      if (fixedChargeTiers) next.fixedChargeTiersDOP = fixedChargeTiers;
      else if (old?.fixedChargeTiersDOP && old.currency === currency && old.fixedChargeTiersDOP[old.fixedChargeTiersDOP.length - 1]?.chargeDOP === value[fixedKey]) next.fixedChargeTiersDOP = old.fixedChargeTiersDOP;
      else delete next.fixedChargeTiersDOP;
      for (const field of numericFields) {
        if (value[field] === undefined || value[field] === null) continue;
        if (typeof value[field] !== 'number' || !Number.isFinite(value[field]) || value[field] < 0 || (field === 'netMeteringRetentionPct' && value[field] > 100)) throw new Error(`Valor inválido en ${distributor}/${code}: ${field}.`);
        next[field] = value[field];
      }
      if (value.blocks !== undefined && value.blocks !== null) {
        if (currency !== 'DOP' || !Array.isArray(value.blocks) || value.blocks.length === 0 || value.blocks.length > 20) throw new Error(`Bloques inválidos en ${distributor}/${code}.`);
        let previousMax = -1;
        next.blocks = value.blocks.map((block, index, all) => {
          if (!record(block)) throw new Error('Bloque de consumo inválido.');
          const min = block.minKWh;
          const max = block.maxKWh === null || block.maxKWh === 999999 ? Infinity : block.maxKWh;
          const rate = block.rateDOP;
          if (typeof min !== 'number' || !Number.isFinite(min) || min < 0 || typeof max !== 'number' || (max !== Infinity && !Number.isFinite(max)) || max <= min || typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || (index === 0 ? min !== 0 : min < previousMax || min > previousMax + 1) || (max === Infinity && index !== all.length - 1)) throw new Error(`Rangos de consumo inválidos en ${distributor}/${code}.`);
          previousMax = max;
          return { minKWh: min, maxKWh: max, rateDOP: rate };
        });
        if (previousMax !== Infinity) throw new Error(`Falta bloque final sin límite en ${distributor}/${code}.`);
      }
      const fields = [...numericFields.filter((field) => value[field] != null), ...(value.blocks != null ? ['blocks'] : []), ...(fixedChargeTiers ? ['fixedChargeTiersDOP'] : [])];
      const fieldSources: NonNullable<NonNullable<UtilityTariffDetails['source']>['fieldSources']> = {};
      for (const field of [...numericFields, 'blocks', 'fixedChargeTiersDOP']) {
        if ((next as any)[field] === undefined) continue;
        const origin = fields.includes(field) ? { resolutionCode, effectiveDate, publishedBy } : old?.source?.fieldSources?.[field] || getTariffSource(current, old || next);
        fieldSources[field] = {resolutionCode:origin.resolutionCode,effectiveDate:origin.effectiveDate,publishedBy:origin.publishedBy};
      }
      next.source = { resolutionCode, effectiveDate, publishedBy, fields, fieldSources };
      target.tariffs[code] = next;
      updated++;
    }
  }
  if (!updated && !chargesUpdated) throw new Error('No se encontraron tarifas con cargos y moneda verificables en el documento.');
  const retained = Object.values(schedules).reduce((count, schedule) => count + Object.keys(schedule.tariffs).length, 0) - updated;
  return {
    ...current, resolutionCode, effectiveDate, publishedBy, lastUpdatedAt: new Date().toISOString(), schedules,
    notes: `${typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) + '\n' : ''}Extracción pendiente de revisión: ${updated} tarifas documentadas${chargesUpdated ? ` y el cargo por uso de la red de ${chargesUpdated} distribuidora(s)` : ''}; ${retained} tarifas conservadas con su fuente anterior. Confirma cifras, moneda y vigencia antes de aplicar.`,
  };
}

/** JSON persistence converts Infinity to null. Restore only the last open block, with full validation. */
export function normalizeStoredTariffMatrix(raw: unknown): GlobalTariffMatrix {
  if (!record(raw) || !record(raw.schedules) || TARIFF_DISTRIBUTORS.some((dist) => !record((raw.schedules as Record<string, unknown>)[dist]))) throw new Error('El pliego guardado está incompleto.');
  const matrix = raw as unknown as GlobalTariffMatrix;
  const validated = mergeExtractedTariffs(matrix, matrix);
  for (const dist of TARIFF_DISTRIBUTORS) {
    for (const [code, tariff] of Object.entries(validated.schedules[dist].tariffs)) {
      tariff.code = matrix.schedules[dist].tariffs[code].code;
      tariff.source = matrix.schedules[dist].tariffs[code].source;
    }
  }
  for (const dist of TARIFF_DISTRIBUTORS) {
    // La validación no es una lectura nueva: el cargo por uso conserva la resolución de la que se leyó.
    const source = matrix.schedules[dist].gridUseChargeSource;
    if (source) validated.schedules[dist].gridUseChargeSource = source;
    else delete validated.schedules[dist].gridUseChargeSource;
  }
  return { ...matrix, schedules: validated.schedules };
}
