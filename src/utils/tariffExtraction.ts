import { DEFAULT_GRID_EXPORT_FEE_PCT } from '../../shared/assumptions';
import { isValidGridUseCharge, MAX_GRID_USE_CHARGE_DOP_PER_KWH } from '../../shared/netMetering';
import { normalizeTariffCode, tariffMatrixKey } from '../../shared/tariffRules';
import { FixedChargeTier, GlobalTariffMatrix, UtilityDistributor, UtilityTariffDetails } from '../types/tariffs';
import { getTariffSource, gridUseChargeReference, knownTariffPeriod, TARIFF_DISTRIBUTORS } from './aiTariffContext';

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
    if (!record(schedule) || (schedule.tariffs != null && !record(schedule.tariffs))) throw new Error(`Tarifas inválidas de ${distributor}.`);
    const target = schedules[distributor as UtilityDistributor];
    // Cargo por uso de la red (RD$/kWh inyectado): ausente o null = no documentado (conserva el anterior y su fuente).
    const charge = schedule.gridUseChargeDOPPerKWh;
    if (charge !== undefined && charge !== null) {
      if (!isValidGridUseCharge(charge)) throw new Error(`Cargo por uso de la red inválido en ${distributor}: debe estar entre 0 y ${MAX_GRID_USE_CHARGE_DOP_PER_KWH} RD$/kWh.`);
      target.gridUseChargeDOPPerKWh = charge;
      target.gridUseChargeSource = { resolutionCode, effectiveDate, publishedBy };
      chargesUpdated++;
    }
    for (const [code, value] of Object.entries((schedule.tariffs ?? {}) as Record<string, unknown>)) {
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

// ---------------------------------------------------------------------------------------------------------------------------
// Revisión del escáner de resoluciones: origen, procedencia, comparación con la matriz y tarifas no soportadas.
// ---------------------------------------------------------------------------------------------------------------------------

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const optionalText = (value: unknown, max = 500) => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null);
/** Lo observado nunca se pierde por largo: una cadena no vacía cuenta como observada (y se valida entera). */
const observedText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const shown = (value: string) => (value.length > 120 ? `${value.slice(0, 120)}…` : value);
const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const DOMINICAN_COUNTRIES = new Set(['do', 'dom', 'rd', 'republica dominicana', 'dominican republic']);
/**
 * Reguladores claramente extranjeros (Argentina, Colombia, México, Perú, Centroamérica, Uruguay, Brasil…). Un regulador o emisor
 * dominicano distinto de SIE/CNE (Ministerio de Energía y Minas, la propia distribuidora, «Dirección Comercial») no rechaza.
 */
const FOREIGN_REGULATOR = /\b(enre|enrege|enargas|epre|ersep|creg|cre|osinergmin|aresep|siget|cnee|asep|ursea|aneel|ofgem|ferc|cnmc)\b|ente nacional regulador|comision reguladora de energia|comision de regulacion de energia/;
/** Palabras con las que se escribe una moneda dominicana o el dólar (DOP, USD, RD$, pesos dominicanos, dólares). */
const DOMINICAN_CURRENCY_WORDS = /\b(dop|usd|pesos?|dominicanos?|dolar(es)?|estadounidenses?|americanos?|de|los|eeuu|ee\.uu\.)\b|rd\$|us\$|\$|[()\-.,/]/g;
const isDominicanCurrency = (value: string) => fold(value).replace(DOMINICAN_CURRENCY_WORDS, '').trim() === '';
/** Familias de códigos del pliego dominicano (EDE: BTS, BTD, BTH, MTD, MTH, VMT…; CEPM: RBT, RMT, ESTRBT). Ya normalizados. */
const DOMINICAN_TARIFF_CODE = /^(BTS|BTD|BTH|MTD|MTH|MTS|ATD|ATH|VMT|RBT|RMT|ESTRBT)/;
/** Código de resolución real (SIE-121-2026-TF, CNE-…); excluye marcadores internos de procedencia. */
const REAL_RESOLUTION = /^(SIE|CNE)-\d{1,4}-\d{4}(?:-[A-Z]{2,4})?$/i;

export interface TariffScanOrigin { country: string | null; regulator: string | null; currency: string | null }

/**
 * El escáner solo acepta pliegos de República Dominicana. La extracción declara país, regulador y moneda observados (`null` si
 * el documento no los muestra). Se rechaza otro país, un regulador claramente extranjero (ENRE, ENReGE, CREG, CRE…), una moneda
 * que no sea DOP o USD y códigos que no casan con los dominicanos, aunque la distribuidora se llame igual (EDESUR existe en
 * Argentina). Un regulador dominicano distinto de SIE/CNE no rechaza.
 */
export function assertDominicanTariffOrigin(raw: unknown): TariffScanOrigin {
  if (!record(raw)) throw new Error('La extracción no contiene distribuidoras válidas.');
  const origin: TariffScanOrigin = { country: observedText(raw.country), regulator: observedText(raw.regulator), currency: observedText(raw.currency) };
  const problems: string[] = [];
  const foreignCountry = !!origin.country && !DOMINICAN_COUNTRIES.has(fold(origin.country));
  if (foreignCountry) problems.push(`país «${shown(origin.country!)}»`);
  if (origin.regulator && (foreignCountry || FOREIGN_REGULATOR.test(fold(origin.regulator)))) problems.push(`regulador «${shown(origin.regulator)}»`);
  const schedules = record(raw.schedules) ? Object.entries(raw.schedules) : [];
  const tariffs = schedules.flatMap(([, schedule]) => (record(schedule) && record(schedule.tariffs) ? Object.entries(schedule.tariffs) : []));
  const currencies = new Set([origin.currency, ...tariffs.map(([, tariff]) => (record(tariff) ? observedText(tariff.currency) : null))]
    .filter((value): value is string => !!value && !isDominicanCurrency(value)));
  if (currencies.size) problems.push(`moneda ${[...currencies].map((value) => `«${shown(value)}»`).join(', ')}`);
  const foreignCodes = tariffs.map(([code]) => code).filter((code) => !DOMINICAN_TARIFF_CODE.test(normalizeTariffCode(code)));
  if (foreignCodes.length) problems.push(`códigos ${foreignCodes.slice(0, 5).join(', ')}${foreignCodes.length > 5 ? '…' : ''} que no son del pliego dominicano`);
  if (problems.length) {
    const names = schedules.map(([name]) => name).slice(0, 4);
    throw new Error(`El documento no es un pliego tarifario de República Dominicana (${problems.join('; ')})${names.length ? `, aunque la distribuidora figure como ${names.map((name) => `«${name}»`).join(', ')}` : ''}. Solo se aceptan resoluciones y cuadros de EDEESTE, EDESUR, EDENORTE o CEPM con precios en DOP o USD. No se aplicó nada.`);
  }
  return origin;
}

/** Procedencia elegida en la revisión: la resolución (del documento o tecleada) o un cuadro de la distribuidora sin resolución citada. */
export type TariffProvenanceDecision =
  | { kind: 'resolution'; resolutionCode: string; effectiveDate: string }
  | { kind: 'distributor_table'; period: string };

export interface TariffScanRow {
  distributor: UtilityDistributor;
  /** Clave de la matriz (normalizada) o, en una tarifa no soportada, el código tal como figura. */
  code: string;
  name: string;
  /** `unsupported`: SolarSim todavía no la soporta (la matriz no tiene esa tarifa); se muestra y se descarta, nunca se incorpora. */
  status: 'unchanged' | 'changed' | 'unsupported';
  changedFields: string[];
  /** Fila validada tal como quedaría (no existe en las no soportadas, que no se validan). */
  tariff?: UtilityTariffDetails;
}

export interface TariffScanReview {
  /** Matriz sobre la que se extrajo; aplicar sobre otra exige volver a escanear. */
  basis: GlobalTariffMatrix;
  /** Vista previa con procedencia provisional. Solo para mostrar; nunca se aplica. */
  preview: GlobalTariffMatrix;
  /** Borrador validado, solo con tarifas soportadas y con sus claves normalizadas. */
  draft: Record<string, unknown> & { schedules: Record<string, Record<string, unknown>> };
  origin: TariffScanOrigin;
  document: { resolutionCode: string | null; effectiveDate: string | null; publishedBy: string | null };
  /** El documento no cita resolución o fecha válida: el usuario debe indicar la procedencia antes de aplicar. */
  provenanceRequired: boolean;
  suggestion?: { resolutionCode: string; reason: string };
  /** Procedencia prellenada para el formulario; nada se aplica sin confirmación. */
  defaultDecision: TariffProvenanceDecision;
  rows: TariffScanRow[];
  gridUseCharges: Array<{ distributor: UtilityDistributor; dopPerKWh: number; status: 'unchanged' | 'changed' }>;
  /** `false`: todas las cifras documentadas de tarifas existentes coinciden con la matriz («sin cambios de precio»). */
  priceChanges: boolean;
  /** Hay algo soportado que aplicar (tarifas existentes o cargo por uso de la red). */
  applicable: boolean;
}

const PENDING = 'Procedencia pendiente de revisión';
const sameNumber = (a: unknown, b: unknown) => typeof a === 'number' && typeof b === 'number' && (a === b || Math.abs(a - b) < 1e-6);
const sameRanges = (a: Array<{ minKWh: number; maxKWh: number | null }> | undefined, b: typeof a, rate: (item: any) => number) =>
  !!a && !!b && a.length === b.length && a.every((item, index) => sameNumber(item.minKWh, b[index].minKWh) && (item.maxKWh ?? Infinity) === (b[index].maxKWh ?? Infinity) && sameNumber(rate(item), rate(b[index])));
const RESOLUTION_IN_TEXT = /\b(SIE|CNE)-\d{1,4}-\d{4}(?:-[A-Z]{2,4})?\b/i;

/** Clave de la fila de la matriz para un código escrito de cualquier forma (BTS-1, «bts 1», RBT1), o `null` si no existe. */
function matrixRowKey(distributor: UtilityDistributor, code: string, existing: Record<string, UtilityTariffDetails>): string | null {
  for (const key of [normalizeTariffCode(code), tariffMatrixKey(distributor, code)]) if (key && existing[key]) return key;
  return null;
}

/**
 * Prepara la revisión de una extracción sin aplicarla: comprueba el origen, casa los códigos con las filas de la matriz (siempre
 * normalizados), separa las tarifas que SolarSim no soporta todavía (se muestran y se descartan), valida las demás con las mismas
 * reglas que `mergeExtractedTariffs`, compara sus cifras con la matriz vigente y, si el documento no cita resolución, sugiere una
 * resolución real (nota del usuario, valores idénticos o periodo conocido de la matriz) sin aplicarla.
 */
export function prepareTariffScanReview(raw: unknown, current: GlobalTariffMatrix, userNotes?: string): TariffScanReview {
  const origin = assertDominicanTariffOrigin(raw);
  const source = raw as Record<string, unknown>;
  if (!record(source.schedules)) throw new Error('La extracción no contiene distribuidoras válidas.');
  const schedules: Record<string, Record<string, unknown>> = {};
  const unsupported: TariffScanRow[] = [];
  for (const [distributor, schedule] of Object.entries(source.schedules)) {
    if (!TARIFF_DISTRIBUTORS.includes(distributor as UtilityDistributor)) throw new Error(`Distribuidora no reconocida: ${distributor}.`);
    if (!record(schedule) || (schedule.tariffs != null && !record(schedule.tariffs))) throw new Error(`Tarifas inválidas de ${distributor}.`);
    const dist = distributor as UtilityDistributor;
    const tariffs: Record<string, unknown> = {};
    for (const [code, value] of Object.entries((schedule.tariffs ?? {}) as Record<string, unknown>)) {
      const key = matrixRowKey(dist, code, current.schedules[dist].tariffs);
      if (!key) {
        unsupported.push({ distributor: dist, code: code.trim().slice(0, 40), name: record(value) && typeof value.name === 'string' ? value.name.slice(0, 200) : code.trim().slice(0, 40), status: 'unsupported', changedFields: [] });
        continue;
      }
      if (key in tariffs) throw new Error(`La tarifa ${distributor}/${key} aparece repetida en la extracción.`);
      tariffs[key] = record(value) && 'code' in value ? { ...value, code: key } : value;
    }
    schedules[distributor] = { ...schedule, tariffs };
  }
  const document = {
    resolutionCode: optionalText(source.resolutionCode),
    effectiveDate: isIsoDate(source.effectiveDate) ? source.effectiveDate : null,
    publishedBy: optionalText(source.publishedBy),
  };
  const draft = { ...source, schedules };
  const supportedCount = Object.values(schedules).reduce((count, schedule) => count + Object.keys(schedule.tariffs as object).length, 0);
  const hasCharges = Object.values(schedules).some((schedule) => schedule.gridUseChargeDOPPerKWh != null);
  const applicable = supportedCount > 0 || hasCharges;
  // Valida lo soportado con una procedencia provisional que nunca se aplica.
  const preview = applicable
    ? mergeExtractedTariffs({ ...draft, resolutionCode: document.resolutionCode ?? PENDING, effectiveDate: document.effectiveDate ?? '2000-01-01', publishedBy: document.publishedBy ?? PENDING }, current)
    : current;

  const rows: TariffScanRow[] = [];
  for (const [distributor, schedule] of Object.entries(schedules) as Array<[UtilityDistributor, Record<string, unknown>]>) {
    for (const [code, value] of Object.entries(schedule.tariffs as Record<string, Record<string, unknown>>)) {
      const tariff = preview.schedules[distributor].tariffs[code];
      const old = current.schedules[distributor].tariffs[code];
      const changedFields = old.currency !== tariff.currency ? ['currency'] : [
        ...numericFields.filter((field) => value[field] != null && !sameNumber(old[field], tariff[field])),
        ...(value.blocks != null && !sameRanges(old.blocks, tariff.blocks, (block) => block.rateDOP) ? ['blocks'] : []),
        ...(value.fixedChargeTiersDOP != null && !sameRanges(old.fixedChargeTiersDOP, tariff.fixedChargeTiersDOP, (tier) => tier.chargeDOP) ? ['fixedChargeTiersDOP'] : []),
      ];
      rows.push({ distributor, code, name: tariff.name, status: changedFields.length ? 'changed' : 'unchanged', changedFields, tariff });
    }
  }
  rows.push(...unsupported);
  const gridUseCharges = (Object.entries(schedules) as Array<[UtilityDistributor, Record<string, unknown>]>)
    .filter(([, schedule]) => schedule.gridUseChargeDOPPerKWh != null)
    .map(([distributor, schedule]) => {
      const dopPerKWh = schedule.gridUseChargeDOPPerKWh as number;
      return { distributor, dopPerKWh, status: sameNumber(dopPerKWh, gridUseChargeReference(current, distributor).dopPerKWh) ? 'unchanged' as const : 'changed' as const };
    });
  const priceChanges = rows.some((row) => row.status === 'changed') || gridUseCharges.some((charge) => charge.status === 'changed');

  let suggestion: TariffScanReview['suggestion'];
  if (!document.resolutionCode) {
    const fromUser = userNotes?.match(RESOLUTION_IN_TEXT)?.[0];
    const fromNotes = typeof source.notes === 'string' ? source.notes.match(RESOLUTION_IN_TEXT)?.[0] : undefined;
    const compared = rows.filter((row) => row.status !== 'unsupported');
    const matchedSources = new Set(compared.map((row) => getTariffSource(current, current.schedules[row.distributor].tariffs[row.code]).resolutionCode));
    const matched = matchedSources.size === 1 ? [...matchedSources][0] : undefined;
    const periodSource = document.effectiveDate && [...new Set(Object.keys(schedules).flatMap((distributor) => Object.values(current.schedules[distributor as UtilityDistributor].tariffs).map((tariff) => getTariffSource(current, tariff).resolutionCode)))]
      .find((code) => { const period = knownTariffPeriod(code); return REAL_RESOLUTION.test(code) && !!period && document.effectiveDate! >= period.start && document.effectiveDate! <= period.end; });
    if (fromUser) suggestion = { resolutionCode: fromUser.toUpperCase(), reason: 'indicada en tu nota' };
    else if (fromNotes) suggestion = { resolutionCode: fromNotes.toUpperCase(), reason: 'mencionada en las notas de la extracción' };
    else if (compared.length && !priceChanges && matched && REAL_RESOLUTION.test(matched)) suggestion = { resolutionCode: matched, reason: `los valores coinciden con ${matched} de la matriz vigente` };
    else if (periodSource) suggestion = { resolutionCode: periodSource, reason: `es la resolución de la matriz para ese periodo (${knownTariffPeriod(periodSource)!.label})` };
  }
  const resolutionCode = document.resolutionCode ?? suggestion?.resolutionCode;
  const defaultDecision: TariffProvenanceDecision = resolutionCode
    ? { kind: 'resolution', resolutionCode, effectiveDate: document.effectiveDate ?? '' }
    : { kind: 'distributor_table', period: document.effectiveDate?.slice(0, 7) ?? '' };
  return { basis: current, preview, draft, origin, document, provenanceRequired: !document.resolutionCode || !document.effectiveDate, suggestion, defaultDecision, rows, gridUseCharges, priceChanges, applicable };
}

/** Clave de una fila de la revisión: `DISTRIBUIDORA/CÓDIGO`. */
export const tariffScanRowKey = (row: Pick<TariffScanRow, 'distributor' | 'code'>) => `${row.distributor}/${row.code}`;

/** Resumen en una o dos frases para la revisión: cambios de precio frente a la matriz vigente y tarifas no soportadas. */
export function summarizeTariffScan(review: TariffScanReview): string {
  const count = (status: TariffScanRow['status']) => review.rows.filter((row) => row.status === status).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const unchanged = count('unchanged');
  const changed = count('changed');
  const unsupported = review.rows.filter((row) => row.status === 'unsupported');
  const reference = `la matriz vigente (${review.basis.resolutionCode})`;
  const parts = [!review.applicable
    ? 'Nada que aplicar: el documento solo trae tarifas no soportadas todavía por SolarSim.'
    : !review.priceChanges
      ? unchanged
        ? `Sin cambios de precio: ${plural(unchanged, 'tarifa')} ${unchanged === 1 ? 'coincide' : 'coinciden'}${review.gridUseCharges.length ? ', igual que el cargo por uso de la red,' : ''} con ${reference}.`
        : `Sin cambios de precio en las tarifas que ya tiene ${reference}.`
      : `${plural(changed, 'tarifa')} con cambios de precio y ${unchanged} sin cambios frente a ${reference}${review.gridUseCharges.some((charge) => charge.status === 'changed') ? '; cambia el cargo por uso de la red' : ''}.`];
  if (unsupported.length) {
    const one = unsupported.length === 1;
    parts.push(`${one ? 'Tarifa no soportada todavía por SolarSim' : 'Tarifas no soportadas todavía por SolarSim'} (${unsupported.map(tariffScanRowKey).join(', ')}): no se ${one ? 'incorpora' : 'incorporan'}.`);
  }
  return parts.join(' ');
}

/**
 * Aplica la revisión con la procedencia confirmada por el usuario. Las tarifas no soportadas nunca entran. Una procedencia
 * tecleada o un cuadro sin resolución quedan declarados en las notas.
 */
export function applyTariffScanReview(review: TariffScanReview, decision: TariffProvenanceDecision): GlobalTariffMatrix {
  if (!review.applicable) throw new Error('Nada que aplicar: el documento solo trae tarifas no soportadas todavía por SolarSim.');
  let resolutionCode: string;
  let effectiveDate: string;
  const declared: string[] = [];
  if (decision.kind === 'resolution') {
    resolutionCode = decision.resolutionCode.trim();
    if (!resolutionCode || resolutionCode.length > 120) throw new Error('Indica la resolución que respalda el cuadro (p. ej. SIE-121-2026-TF) o márcalo como cuadro de la distribuidora sin resolución citada.');
    if (!isIsoDate(decision.effectiveDate)) throw new Error('Indica la fecha de inicio de vigencia (AAAA-MM-DD).');
    effectiveDate = decision.effectiveDate;
    if (resolutionCode !== review.document.resolutionCode) declared.push(`Resolución ${resolutionCode} indicada por el usuario; el documento no la cita.`);
    if (effectiveDate !== review.document.effectiveDate) declared.push(`Fecha de inicio ${effectiveDate} indicada por el usuario.`);
  } else {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(decision.period)) throw new Error('Indica la vigencia (mes y año) del cuadro de la distribuidora.');
    resolutionCode = `Cuadro de ${Object.keys(review.draft.schedules).join(', ')} sin resolución citada (${decision.period})`;
    effectiveDate = `${decision.period}-01`;
    declared.push(`Cuadro de la distribuidora sin resolución citada; vigencia ${decision.period} indicada por el usuario.`);
  }
  const unsupported = review.rows.filter((row) => row.status === 'unsupported').map(tariffScanRowKey);
  if (unsupported.length) declared.push(`Descartadas por no estar soportadas todavía por SolarSim: ${unsupported.join(', ')}.`);
  const notes = [...declared, typeof review.draft.notes === 'string' ? review.draft.notes : ''].filter(Boolean).join('\n');
  return mergeExtractedTariffs({ ...review.draft, resolutionCode, effectiveDate, publishedBy: review.document.publishedBy ?? 'Emisor no indicado en el documento', notes }, review.basis);
}

/**
 * Lo guardado nunca rompe la lectura (ADR 0003): unos rangos de cargo fijo incoherentes con `fixedChargeDOP` (p. ej. se editó el
 * cargo a mano) se alinean (el último rango toma el cargo fijo) y, si aun así no son válidos, se descartan; un cargo por uso de
 * la red fuera de rango se descarta. La validación estricta es solo para lo que entra del escáner.
 */
function healStoredTariffExtras(matrix: GlobalTariffMatrix): GlobalTariffMatrix {
  const healed = structuredClone(matrix);
  for (const dist of TARIFF_DISTRIBUTORS) {
    const schedule = healed.schedules[dist];
    if (schedule.gridUseChargeDOPPerKWh !== undefined && !isValidGridUseCharge(schedule.gridUseChargeDOPPerKWh)) {
      delete schedule.gridUseChargeDOPPerKWh;
      delete schedule.gridUseChargeSource;
    }
    for (const tariff of Object.values(schedule.tariffs)) {
      if (tariff.fixedChargeTiersDOP === undefined || tariff.fixedChargeTiersDOP === null) continue;
      const fixed = tariff.currency === 'USD' ? tariff.fixedChargeUSD : tariff.fixedChargeDOP;
      const attempt = (tiers: unknown) => { try { return parseFixedChargeTiers(tiers, tariff.currency, fixed as number, ''); } catch { return undefined; } };
      const last = Array.isArray(tariff.fixedChargeTiersDOP) ? tariff.fixedChargeTiersDOP[tariff.fixedChargeTiersDOP.length - 1] : undefined;
      const aligned = Array.isArray(tariff.fixedChargeTiersDOP) && record(last) ? [...tariff.fixedChargeTiersDOP.slice(0, -1), { ...last, chargeDOP: fixed }] : undefined;
      const tiers = attempt(tariff.fixedChargeTiersDOP) ?? attempt(aligned);
      if (tiers) tariff.fixedChargeTiersDOP = tiers;
      else delete tariff.fixedChargeTiersDOP;
    }
  }
  return healed;
}

/** JSON persistence converts Infinity to null. Restore only the last open block, with full validation. */
export function normalizeStoredTariffMatrix(raw: unknown): GlobalTariffMatrix {
  if (!record(raw) || !record(raw.schedules) || TARIFF_DISTRIBUTORS.some((dist) => !record((raw.schedules as Record<string, unknown>)[dist]))) throw new Error('El pliego guardado está incompleto.');
  const matrix = raw as unknown as GlobalTariffMatrix;
  const validated = mergeExtractedTariffs(healStoredTariffExtras(matrix), matrix);
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
