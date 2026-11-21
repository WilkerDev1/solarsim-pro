/**
 * Registros de precio de equipos y precio genérico (ADR 0006). TypeScript puro, compartido por la app, la API y el
 * MCP remoto.
 *
 * Un **registro de precio** es una fila de solo inserción: `observation` (un precio visto) o `generic` (fija el
 * precio genérico). El **precio genérico** de un equipo es el registro `generic` no anulado con mayor `seq`; el orden
 * lo da el servidor, nunca el reloj del cliente.
 */

export const PRICE_OBSERVATION_KINDS = ['observation', 'generic'] as const;
export type PriceObservationKind = (typeof PRICE_OBSERVATION_KINDS)[number];
export const PRICE_OBSERVATION_SOURCES = ['supplier_offer', 'ai_scan', 'proposal', 'manual', 'agent'] as const;
export type PriceObservationSource = (typeof PRICE_OBSERVATION_SOURCES)[number];
export type PriceCurrency = 'USD' | 'DOP';

/** `po-<uuid>`, generado por el cliente; hace idempotente el envío. */
export const OBSERVATION_ID_PATTERN = /^po-[0-9a-f-]{36}$/;
export const isObservationId = (value: unknown): value is string => typeof value === 'string' && OBSERVATION_ID_PATTERN.test(value);

export const PRICE_OBSERVATION_LIMITS = {
  equipmentId: 64,
  supplierName: 255,
  supplierOfferId: 128,
  projectId: 128,
  maxPriceUSD: 1_000_000_000,
  /** Por lote: registros y anulaciones. */
  batchObservations: 200,
  batchVoids: 200,
  historyPage: 500,
} as const;
/** Ningún registro es anterior a esta fecha (el servidor la rechaza). */
export const MIN_OBSERVED_AT = '2020-01-01T00:00:00.000Z';
/** Diferencia de precio que se considera igual (redondeo de tipo de cambio). */
export const PRICE_TOLERANCE_USD = 0.005;

export interface EquipmentPriceObservation {
  id: string;
  /** Orden de inserción en el servidor; ausente mientras el registro está en cola local. */
  seq?: number;
  equipmentId: string;
  kind: PriceObservationKind;
  priceUSD: number;
  originalCurrency?: PriceCurrency;
  originalPrice?: number;
  source: PriceObservationSource;
  /** Copia del nombre del proveedor al momento del registro. */
  supplierName?: string;
  supplierOfferId?: string;
  /** Solo para `source: 'proposal'`. */
  projectId?: string;
  /** En un `generic`, el registro del que salió. */
  derivedFromId?: string;
  observedAt: string;
  createdById?: string | null;
  createdByName?: string | null;
  createdAt?: string;
  voidedAt?: string | null;
  voidedById?: string | null;
  /** Lo resuelve la API al leer el historial; `null` si la propuesta ya no existe. */
  projectName?: string | null;
  projectCode?: string | null;
}

/** Copia del precio genérico vigente (la entrada de `GET /api/equipment-prices/generic`). */
export interface GenericPriceInfo {
  priceUSD: number;
  observedAt: string;
  observationId: string;
}

/** Campos que un cliente envía; el resto (`seq`, autor, anulación, nombres) los pone el servidor. */
export type ObservationInput = Pick<
  EquipmentPriceObservation,
  'id' | 'equipmentId' | 'kind' | 'priceUSD' | 'originalCurrency' | 'originalPrice' | 'source' | 'supplierName' | 'supplierOfferId' | 'projectId' | 'derivedFromId' | 'observedAt'
>;

export type ObservationValidation = { ok: true; value: ObservationInput } | { ok: false; error: string };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** PostgreSQL `text` cannot store U+0000: a value carrying it is invalid, never sent to the database. */
export const hasNulCharacter = (value: string) => value.includes('\u0000');

const cleanText = (value: unknown) => (typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : value);

function optionalText(source: Record<string, unknown>, key: string, max: number): { value?: string; error?: string } {
  const raw = source[key];
  if (raw === undefined || raw === null) return {};
  const value = cleanText(raw);
  if (typeof value !== 'string' || hasNulCharacter(value)) return { error: `${key} inválido` };
  if (value.length > max) return { error: `${key} excede ${max} caracteres` };
  return value ? { value } : {};
}

/** Valida y normaliza lo que un cliente envía para un registro. Nunca acepta `seq`, autor ni anulación. */
export function validateObservation(input: unknown): ObservationValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Se requiere un objeto' };
  const source = input as Record<string, unknown>;
  if (!isObservationId(source.id)) return { ok: false, error: 'id inválido (po-<uuid>)' };
  const equipmentId = source.equipmentId;
  if (typeof equipmentId !== 'string' || !equipmentId.trim() || equipmentId.length > PRICE_OBSERVATION_LIMITS.equipmentId || hasNulCharacter(equipmentId)) return { ok: false, error: 'equipmentId inválido' };
  const kind = source.kind;
  if (!PRICE_OBSERVATION_KINDS.includes(kind as PriceObservationKind)) return { ok: false, error: 'kind inválido' };
  const priceUSD = source.priceUSD;
  if (!finite(priceUSD) || priceUSD < 0 || priceUSD > PRICE_OBSERVATION_LIMITS.maxPriceUSD) return { ok: false, error: 'priceUSD inválido' };
  if (kind === 'generic' && !(priceUSD > 0)) return { ok: false, error: 'El precio genérico debe ser mayor que 0' };
  const origin = source.source;
  if (!PRICE_OBSERVATION_SOURCES.includes(origin as PriceObservationSource)) return { ok: false, error: 'source inválido' };
  const currency = source.originalCurrency;
  if (currency !== undefined && currency !== null && currency !== 'USD' && currency !== 'DOP') return { ok: false, error: 'originalCurrency inválida' };
  const originalPrice = source.originalPrice;
  if (originalPrice !== undefined && originalPrice !== null && (!finite(originalPrice) || originalPrice < 0 || originalPrice > PRICE_OBSERVATION_LIMITS.maxPriceUSD * 1000))
    return { ok: false, error: 'originalPrice inválido' };
  const observed = typeof source.observedAt === 'string' ? Date.parse(source.observedAt) : Number.NaN;
  if (!Number.isFinite(observed)) return { ok: false, error: 'observedAt inválido' };
  if (observed < Date.parse(MIN_OBSERVED_AT)) return { ok: false, error: 'observedAt anterior a 2020' };
  const supplierName = optionalText(source, 'supplierName', PRICE_OBSERVATION_LIMITS.supplierName);
  const supplierOfferId = optionalText(source, 'supplierOfferId', PRICE_OBSERVATION_LIMITS.supplierOfferId);
  const projectId = optionalText(source, 'projectId', PRICE_OBSERVATION_LIMITS.projectId);
  const error = supplierName.error ?? supplierOfferId.error ?? projectId.error;
  if (error) return { ok: false, error };
  if (projectId.value && origin !== 'proposal') return { ok: false, error: 'projectId solo se admite en registros de propuesta' };
  const derived = source.derivedFromId;
  if (derived !== undefined && derived !== null) {
    if (kind !== 'generic') return { ok: false, error: 'derivedFromId solo se admite en un precio genérico' };
    if (!isObservationId(derived)) return { ok: false, error: 'derivedFromId inválido' };
  }
  const value: ObservationInput = {
    id: source.id,
    equipmentId,
    kind: kind as PriceObservationKind,
    priceUSD,
    source: origin as PriceObservationSource,
    observedAt: new Date(observed).toISOString(),
  };
  if (currency) value.originalCurrency = currency as PriceCurrency;
  if (finite(originalPrice)) value.originalPrice = originalPrice;
  if (supplierName.value) value.supplierName = supplierName.value;
  if (supplierOfferId.value) value.supplierOfferId = supplierOfferId.value;
  if (projectId.value) value.projectId = projectId.value;
  if (typeof derived === 'string') value.derivedFromId = derived;
  return { ok: true, value };
}

/**
 * Registro `generic` vigente: el no anulado con mayor `seq`. Los pendientes (sin `seq`, aún en cola local) van por
 * encima de los del servidor y, entre ellos, gana el último en orden de inserción.
 */
export function currentGenericPrice<T extends Pick<EquipmentPriceObservation, 'kind' | 'seq' | 'voidedAt'>>(observations: readonly T[]): T | undefined {
  let best: T | undefined;
  let pending: T | undefined;
  for (const entry of observations) {
    if (entry.kind !== 'generic' || entry.voidedAt) continue;
    if (entry.seq === undefined || entry.seq === null) pending = entry;
    else if (!best || (best.seq as number) < entry.seq) best = entry;
  }
  return pending ?? best;
}

const samePrice = (a: number, b: number) => Math.abs(a - b) <= PRICE_TOLERANCE_USD + 1e-9;

/** Qué ofrecer ante un precio candidato: nada, asignar (sin genérico) o cambiar el genérico vigente. */
export function genericPriceDecision(current: number | null | undefined, candidate: number): 'none' | 'assign' | 'update' {
  if (!finite(candidate) || candidate <= 0) return 'none';
  if (!finite(current) || current <= 0) return 'assign';
  return samePrice(current, candidate) ? 'none' : 'update';
}

/** Oferta de proveedor tal como la guarda el catálogo (`EquipmentSupplierPrice`), sin depender de `src/`. */
export interface PriceOffer {
  id: string;
  supplierName: string;
  priceUSD: number;
  currency?: PriceCurrency;
  priceDOP?: number;
  stockStatus?: 'in_stock' | 'on_order' | 'out_of_stock' | 'consult';
  source?: 'manual' | 'ai_scan';
}
/** Equipo del catálogo con sus ofertas (`SolarEquipmentItem`). */
export interface PricedItem {
  id: string;
  supplierPrices?: readonly PriceOffer[];
  preferredSupplierId?: string;
}

export interface OfferObservationCandidate {
  equipmentId: string;
  kind: 'observation';
  priceUSD: number;
  source: 'supplier_offer' | 'ai_scan';
  supplierName: string;
  supplierOfferId: string;
  originalCurrency: PriceCurrency;
  originalPrice: number;
}

export const normalizeSupplierName = (value: unknown) => (typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es') : '');

/**
 * Registros que genera guardar un equipo: una oferta nueva o con `priceUSD` distinto. Empareja por id y, si no, por
 * nombre de proveedor normalizado. Stock, SKU, notas, renombrar o borrar un proveedor no generan nada.
 */
export function offerObservations(previous: PricedItem | null | undefined, next: PricedItem): OfferObservationCandidate[] {
  const before = previous?.supplierPrices ?? [];
  const out: OfferObservationCandidate[] = [];
  for (const offer of next.supplierPrices ?? []) {
    if (!finite(offer.priceUSD) || offer.priceUSD <= 0) continue;
    const name = normalizeSupplierName(offer.supplierName);
    const match = before.find((old) => old.id === offer.id) ?? (name ? before.find((old) => normalizeSupplierName(old.supplierName) === name) : undefined);
    if (match && finite(match.priceUSD) && samePrice(match.priceUSD, offer.priceUSD)) continue;
    const dop = offer.currency === 'DOP' && finite(offer.priceDOP) && offer.priceDOP > 0;
    out.push({
      equipmentId: next.id,
      kind: 'observation',
      priceUSD: offer.priceUSD,
      source: offer.source === 'ai_scan' ? 'ai_scan' : 'supplier_offer',
      supplierName: typeof offer.supplierName === 'string' ? offer.supplierName.trim() : '',
      supplierOfferId: offer.id,
      originalCurrency: dop ? 'DOP' : 'USD',
      originalPrice: dop ? (offer.priceDOP as number) : offer.priceUSD,
    });
  }
  return out;
}

/** Ofertas que pueden poner precio: precio > 0 y no agotadas. */
export function usableOffers<O extends PriceOffer>(item: { supplierPrices?: readonly O[] }): O[] {
  return (item.supplierPrices ?? []).filter((offer) => finite(offer.priceUSD) && offer.priceUSD > 0 && offer.stockStatus !== 'out_of_stock');
}

export type AutoPrice<O extends PriceOffer = PriceOffer> = { priceUSD: number; kind: 'supplier'; offer: O } | { priceUSD: number; kind: 'generic'; generic: GenericPriceInfo };

/** Único resolvedor de precio automático: oferta utilizable (preferida o la más barata) → precio genérico → nada. */
export function resolveAutoPrice<O extends PriceOffer>(
  item: { supplierPrices?: readonly O[]; preferredSupplierId?: string },
  generic: GenericPriceInfo | null | undefined,
): AutoPrice<O> | undefined {
  const offers = usableOffers(item);
  let chosen = offers.find((offer) => item.preferredSupplierId !== undefined && offer.id === item.preferredSupplierId);
  if (!chosen) for (const offer of offers) if (!chosen || offer.priceUSD < chosen.priceUSD) chosen = offer;
  if (chosen) return { priceUSD: chosen.priceUSD, kind: 'supplier', offer: chosen };
  if (generic && finite(generic.priceUSD) && generic.priceUSD > 0) return { priceUSD: generic.priceUSD, kind: 'generic', generic };
  return undefined;
}

/** Zona horaria de la República Dominicana (UTC−4, sin horario de verano): define el mes de cada registro. */
const DR_OFFSET_MS = -4 * 60 * 60 * 1000;

export interface MonthPriceStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}
export interface PriceHistoryStats {
  /** Mes del año (1..12): estacionalidad sobre todos los años. Meses sin registros quedan en `null`. */
  byCalendarMonth: (MonthPriceStats & { month: number })[];
  /** Serie por año-mes (`YYYY-MM`), ascendente; solo meses con registros. */
  series: (MonthPriceStats & { month: string })[];
  /** Último mes con registros: la base de `change`. */
  latestMonth: string | null;
  /** Variación (%) del promedio de `latestMonth` contra el mes exactamente 3, 6 y 12 meses antes; `null` sin datos. */
  change: { m3: number | null; m6: number | null; m12: number | null };
  /** Fecha del primer registro no anulado (cualquier tipo). */
  firstObservedAt: string | null;
}

const monthKey = (year: number, monthIndex: number) => `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

function summarize(prices: number[]): MonthPriceStats {
  if (!prices.length) return { avg: null, min: null, max: null, count: 0 };
  return { avg: prices.reduce((sum, value) => sum + value, 0) / prices.length, min: Math.min(...prices), max: Math.max(...prices), count: prices.length };
}

/**
 * Estadísticas del historial sobre registros `observation` no anulados con precio > 0 y fecha ≤ `now`. Nunca
 * interpola: un mes sin registros queda vacío y una variación sin mes de referencia es `null`.
 */
export function priceHistoryStats(observations: readonly EquipmentPriceObservation[], now: Date | string = new Date()): PriceHistoryStats {
  const limit = new Date(now).getTime();
  const live = observations.filter((entry) => !entry.voidedAt && Number.isFinite(Date.parse(entry.observedAt)));
  const calendar: number[][] = Array.from({ length: 12 }, () => []);
  const byMonth = new Map<string, number[]>();
  for (const entry of live) {
    const time = Date.parse(entry.observedAt);
    if (entry.kind !== 'observation' || !finite(entry.priceUSD) || entry.priceUSD <= 0 || time > limit) continue;
    const local = new Date(time + DR_OFFSET_MS);
    calendar[local.getUTCMonth()].push(entry.priceUSD);
    const key = monthKey(local.getUTCFullYear(), local.getUTCMonth());
    byMonth.set(key, [...(byMonth.get(key) ?? []), entry.priceUSD]);
  }
  const series = [...byMonth.keys()].sort().map((month) => ({ month, ...summarize(byMonth.get(month) as number[]) }));
  const latest = series.at(-1);
  const changeFor = (months: number): number | null => {
    if (!latest || latest.avg === null) return null;
    const [year, month] = latest.month.split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1 - months, 1));
    const reference = series.find((entry) => entry.month === monthKey(target.getUTCFullYear(), target.getUTCMonth()));
    if (!reference || !reference.avg) return null;
    return ((latest.avg - reference.avg) / reference.avg) * 100;
  };
  const first = live.reduce<string | null>((min, entry) => (min === null || Date.parse(entry.observedAt) < Date.parse(min) ? entry.observedAt : min), null);
  return {
    byCalendarMonth: calendar.map((prices, index) => ({ month: index + 1, ...summarize(prices) })),
    series,
    latestMonth: latest?.month ?? null,
    change: { m3: changeFor(3), m6: changeFor(6), m12: changeFor(12) },
    firstObservedAt: first,
  };
}
