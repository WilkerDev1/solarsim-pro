import type { EquipmentType, SolarEquipmentItem } from '../src/types/equipment';
import { KNOWN_SOLAR_BRANDS, areBrandsMatching, inferBrandFromText, isGenericBrand, normalizeBrandName } from './equipmentBrands';

/**
 * Emparejador único entre lo que se pide en texto libre o en campos sueltos («batería WeCo 16 kWh», «inversor híbrido
 * 10 kW», una variante de ficha técnica, una fila de lista de precios) y los equipos del catálogo. Puro y explicable:
 * cada comparación dice si encaja, de qué forma (exacta, por especificación, parcial) y por qué no cuando no encaja.
 * Lo usan el borrador de propuesta (`normalizeProposalDraft`), la revisión del borrador, el escáner de fichas, el de
 * listas de precios y la búsqueda del asistente; ninguno debe comparar marcas, modelos o magnitudes por su cuenta.
 */
export type EquipmentFitKind = 'exact' | 'spec' | 'partial' | 'none';
export type EquipmentMatchKind = 'exact' | 'spec' | 'partial' | 'ambiguous' | 'none';

export interface EquipmentRequest {
  type: EquipmentType;
  /** Texto libre: «Batería WeCo 16 kWh», «JA Solar 630 W», «WeCo 5K Pro». Cada palabra significativa debe aparecer en el equipo. */
  text?: string;
  /** Marca declarada aparte (ficha técnica, lista de precios); se compara con alias. */
  brand?: string;
  /** Código de modelo declarado aparte; no excluye, pero distingue exacta de por especificación. */
  model?: string;
  /** Potencia o capacidad unitaria en la unidad del tipo: W (panel), kW (inversor), kWh (batería). */
  magnitude?: number;
  /** Capacidad en Ah (baterías): evidencia de apoyo, nunca excluye. */
  capacityAh?: number;
}

export interface EquipmentFit {
  item: SolarEquipmentItem;
  fits: boolean;
  kind: EquipmentFitKind;
  /** Frase en español: por qué encaja o por qué no. */
  reason: string;
  /** Diferencia absoluta entre la magnitud pedida y la del equipo (unidad del tipo). */
  magnitudeDelta?: number;
  brandMatch?: boolean;
  modelMatch?: 'exact' | 'compatible';
  ahMatch?: boolean;
}

export interface EquipmentMatch {
  kind: EquipmentMatchKind;
  /** Equipo elegido cuando la coincidencia es única (exacta, por especificación o parcial: esta última siempre pide confirmación). */
  item?: SolarEquipmentItem;
  /** Equipos que encajan, del mejor al peor (en `ambiguous`, los empatados). */
  candidates: EquipmentFit[];
  reason: string;
}

const UNIT: Record<EquipmentType, string> = { panel: 'W', inverter: 'kW', battery: 'kWh' };
const NOUN: Record<EquipmentType, string> = { panel: 'panel', inverter: 'inversor', battery: 'batería' };
/** Palabras genéricas que no identifican un modelo. */
const STOPWORDS = new Set(['panel', 'paneles', 'modulo', 'modulos', 'module', 'inversor', 'inversores', 'inverter', 'bateria', 'baterias', 'battery',
  'solar', 'de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'y', 'un', 'una', 'hibrido', 'hibrida', 'hibridos', 'hybrid', 'litio', 'lithium',
  'lifepo4', 'modelo', 'marca', 'unidad', 'unidades', 'w', 'wp', 'kw', 'kwh', 'kwp', 'ah', 'k', 'v', 'vdc', 'vac']);

export const equipmentMagnitude = (item: Pick<SolarEquipmentItem, 'type' | 'powerW' | 'powerKW' | 'capacityKWh'>): number | undefined => {
  const value = item.type === 'panel' ? item.powerW : item.type === 'inverter' ? item.powerKW : item.capacityKWh;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
};

/** Tolerancia de potencia/capacidad: absorbe redondeos de catálogo (16 kWh ↔ 16.06 kWh, 630 W ↔ 630.5 W) sin confundir modelos (620 W ≠ 630 W). */
export function magnitudeTolerance(type: EquipmentType, magnitude: number): number {
  if (type === 'panel') return Math.max(3, magnitude * 0.005);
  if (type === 'inverter') return Math.max(0.25, magnitude * 0.01);
  return Math.max(0.3, magnitude * 0.02);
}
export function magnitudesMatch(type: EquipmentType, requested: number, catalog: number): boolean {
  return Number.isFinite(requested) && Number.isFinite(catalog) && catalog > 0 && Math.abs(requested - catalog) <= magnitudeTolerance(type, catalog);
}

const formatNumber = (n: number) => String(Number(n.toFixed(3)));
/** Alias de marca escritos con guion o espacio («We-Co», «Sol Ark») a su forma compacta, igual en pedido y equipo. */
const SPLIT_BRAND_ALIASES = Object.keys(KNOWN_SOLAR_BRANDS).filter(k => k.includes('-'))
  .map(k => [new RegExp(`\\b${k.split('-').join('[\\s-]?')}\\b`, 'g'), k.replace(/-/g, '')] as const);
const canonical = (text: string) => SPLIT_BRAND_ALIASES.reduce((value, [pattern, compactAlias]) => value.replace(pattern, compactAlias),
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  .replace(/\blux[\s-]*power(?:[\s-]*tek)?\b/g, 'luxpowertek').replace(/\bcanadian(?![\s-]*solar)/g, 'canadian solar')
  // Unidad escrita en palabras, solo como palabra completa («kilowatts» → kw; «Growatt» queda intacta).
  .replace(/\bkilo(?:watts?|vatios?)\b/g, 'kw').replace(/\b(?:watts?|vatios?)\b/g, 'w');
/** Unidades de potencia/capacidad que se leen como magnitud (de la más larga a la más corta); todas las regex salen de aquí. */
const UNIT_LIST = ['kwh', 'kwp', 'kw', 'wp', 'w', 'ah'] as const;
const UNIT_ALT = UNIT_LIST.join('|');
const NUMBER = '\\d+(?:[.,]\\d+)?';
/** Número con unidad solo con frontera delante: «550 W», «0.63kWp», «-100AH»; nunca dentro de un código («CS6W-550MB»). */
const UNITS = new RegExp(`(?<![a-z0-9.,])(${NUMBER})\\s*(${UNIT_ALT})\\b`, 'g');
/** Una palabra pegada a una cifra con unidad («Solar630W», «HinaESS15kW») se separa; un código corto («CS6W») no. */
const GLUED_UNIT = new RegExp(`([a-z]{4,})(?=${NUMBER}\\s*(?:${UNIT_ALT})\\b)`, 'g');
/** Tensión nominal en el nombre («48 vdc»): dato del equipo, no palabra que distinga el modelo. */
const VOLTAGE = new RegExp(`(?<![a-z0-9.,])${NUMBER}\\s*v(?:dc|ac)?\\b`, 'g');
/** Cifra con sufijo de unidad dentro de un código («8K» en «SUN-8K», «12KW», «16kWh»): se indexa la cifra («5» no es «15»). */
const NUMBER_WITH_UNIT = /^(\d+(?:_\d+)?)(?:kwh|kwp|kw|wp|w|ah|k|v|vdc|vac)$/;
const forParsing = (text: string) => canonical(text).replace(GLUED_UNIT, '$1 ');
const compact = (text: string) => canonical(text).replace(/[^a-z0-9]/g, '');
const WARRANTY = /\(?\s*\d+\s*(?:anos?\s*(?:de\s*)?garantia)\)?/g;
const QUANTITY = /\b\d+\s*x\s+|\s+x\s*\d+\b/g;
const words = (text: string) => text.split(/[^a-z0-9]+/).filter(Boolean);
/**
 * Misma normalización a ambos lados (pedido y equipo): minúsculas sin acentos, decimales como una palabra («5.0» → «5_0»),
 * cifra separada de su unidad («550W» → «550», «8K» → «8») y sin palabras genéricas. Los números cortos se conservan.
 */
function modelTokens(text: string, keepGeneric = false): string[] {
  const all = forParsing(text).replace(/(\d)[.,](\d)/g, '$1_$2').split(/[^a-z0-9_]+/).filter(Boolean)
    .map(t => NUMBER_WITH_UNIT.exec(t)?.[1] ?? t);
  return keepGeneric ? all : all.filter(t => !STOPWORDS.has(t));
}

/** Marca efectiva de un equipo: la guardada salvo genérica («Fabricante», vacía), entonces la inferida del nombre; siempre en su forma canónica. */
export function effectiveBrand(item: Pick<SolarEquipmentItem, 'brand' | 'displayName' | 'modelSeries'>): string | undefined {
  const stored = item.brand?.trim();
  if (stored && !isGenericBrand(stored)) return normalizeBrandName(stored);
  const inferred = inferBrandFromText(item.displayName, item.modelSeries);
  return inferred && !isGenericBrand(inferred) ? inferred : undefined;
}

interface ParsedText { tokens: string[]; magnitudes: { value: number; unit: string }[] }
function parseText(text: string): ParsedText {
  // La tensión nominal («48V») no distingue el modelo: se quita igual que en el equipo.
  const value = forParsing(text).replace(WARRANTY, ' ').replace(QUANTITY, ' ').replace(VOLTAGE, ' ');
  const magnitudes = [...value.matchAll(UNITS)].map(m => ({ value: Number(m[1].replace(',', '.')), unit: m[2] }));
  return { tokens: modelTokens(value.replace(UNITS, ' ')), magnitudes };
}

const ahInName = (text: string) => {
  const found = [...forParsing(text).matchAll(UNITS)].find(m => m[2] === 'ah');
  return found ? Number(found[1].replace(',', '.')) : undefined;
};
interface ItemIndex { tokens: Set<string>; sequence: string[]; required: string[]; series: string[]; brandWords: Set<string>; brand?: string; capacityAh?: number }
function indexItem(item: SolarEquipmentItem): ItemIndex {
  const brand = effectiveBrand(item);
  const brandText = `${brand || ''} ${item.brand || ''}`;
  // Las palabras de la marca (también compuesta: «JinkoSolar», «Sol-Ark», «Lux Power») nunca hacen falta para el modelo.
  const brandWords = new Set([...modelTokens(brandText), compact(brand || ''), compact(item.brand || '')]);
  const strip = (text: string) => forParsing(text).replace(UNITS, ' ').replace(VOLTAGE, ' ');
  const displayWords = modelTokens(strip(item.displayName || '')).filter(t => !brandWords.has(t));
  const seriesWords = modelTokens(strip(item.modelSeries || '')).filter(t => !brandWords.has(t));
  // Secuencia ordenada (marca, serie y nombre, con las cifras de sus magnitudes) para casar fragmentos pegados sin cruzar fronteras.
  const sequence = modelTokens(`${brandText} ${item.modelSeries || ''} ${item.displayName || ''}`, true);
  return {
    tokens: new Set(sequence),
    sequence,
    // Palabras que distinguen el modelo (serie y nombre, sin magnitudes ni marca), números cortos incluidos («Powerwall 2»).
    // Las del nombre; la serie solo cuando el nombre no trae ninguna (una serie «de marketing» como FusionSolar no se exige).
    required: [...new Set(displayWords.length ? displayWords : seriesWords)],
    series: seriesWords,
    brandWords,
    brand,
    // Ah del campo o, si falta, del nombre («B4850 50Ah»).
    capacityAh: item.capacityAh || ahInName(`${item.modelSeries || ''} ${item.displayName || ''}`),
  };
}
/** Palabras del equipo que forman `fragment` juntando palabras consecutivas completas («canadiansolar», «jam66d45630lb»); nunca media palabra. */
function wordsForming(sequence: readonly string[], fragment: string): string[] | undefined {
  for (let i = 0; i < sequence.length; i++) {
    let joined = '';
    for (let j = i; j < sequence.length && joined.length < fragment.length; j++) {
      joined += sequence[j];
      if (joined === fragment) return sequence.slice(i, j + 1);
    }
  }
  return undefined;
}
/** Palabras del equipo que cubren la palabra pedida, o nada si no aparece (con alias de marca: Hina → HinaESS). */
function matchToken(index: ItemIndex, token: string): string[] | undefined {
  if (index.tokens.has(token)) return [token];
  const joined = wordsForming(index.sequence, token);
  if (joined) return joined;
  const alias = KNOWN_SOLAR_BRANDS[token];
  if (alias) return wordsForming(index.sequence, compact(alias)) ?? (index.tokens.has(compact(alias)) ? [compact(alias)] : undefined);
  return undefined;
}
const subset = (a: readonly string[], b: ReadonlySet<string>) => a.length > 0 && a.every(t => b.has(t));

/** ¿Encaja este equipo con lo pedido? Respuesta explicable; no mira el resto del catálogo (eso es `matchEquipment`). */
export function fitEquipment(request: EquipmentRequest, item: SolarEquipmentItem): EquipmentFit {
  const no = (reason: string, extra: Partial<EquipmentFit> = {}): EquipmentFit => ({ item, fits: false, kind: 'none', reason, ...extra });
  const unit = UNIT[request.type];
  if (item.type !== request.type) return no(`${item.displayName} no es un ${NOUN[request.type]}.`);
  const index = indexItem(item);
  const parsed = request.text ? parseText(request.text) : { tokens: [], magnitudes: [] };

  // Marca declarada aparte: con ambas conocidas, deben coincidir (con alias: Luxpower ↔ LuxpowerTek).
  let brandMatch: boolean | undefined;
  if (request.brand?.trim() && !isGenericBrand(request.brand) && index.brand) {
    brandMatch = areBrandsMatching(request.brand, index.brand);
    if (!brandMatch) return no(`La marca ${request.brand.trim()} no es ${index.brand} (${item.displayName}).`, { brandMatch });
  }

  // Magnitud: la del texto con su unidad, o la numérica del pedido.
  let requested = request.magnitude !== undefined && Number.isFinite(request.magnitude) && request.magnitude > 0 ? request.magnitude : undefined;
  let ahMatch: boolean | undefined;
  for (const m of parsed.magnitudes) {
    if (request.type === 'battery' && m.unit === 'ah') {
      if (index.capacityAh) {
        ahMatch = Math.abs(m.value - index.capacityAh) <= Math.max(5, index.capacityAh * 0.03);
        if (!ahMatch) return no(`Se pidió ${formatNumber(m.value)} Ah y ${item.displayName} tiene ${formatNumber(index.capacityAh)} Ah.`);
      }
      continue;
    }
    const fitsUnit = request.type === 'battery' ? m.unit === 'kwh' : request.type === 'inverter' ? m.unit === 'kw' : m.unit !== 'kwh' && m.unit !== 'ah';
    const shown = { kwh: 'kWh', kwp: 'kWp', kw: 'kW', wp: 'Wp', w: 'W', ah: 'Ah' }[m.unit] || m.unit;
    if (!fitsUnit) return no(`La solicitud indica ${formatNumber(m.value)} ${shown}; un ${NOUN[request.type]} se mide en ${unit}.`);
    const value = request.type === 'panel' && (m.unit === 'kw' || m.unit === 'kwp') ? m.value * 1000 : m.value;
    if (requested !== undefined && !magnitudesMatch(request.type, value, requested)) return no(`La solicitud indica dos valores distintos (${formatNumber(value)} y ${formatNumber(requested)} ${unit}).`);
    requested = value;
  }
  if (request.type === 'battery' && request.capacityAh && index.capacityAh) ahMatch = Math.abs(request.capacityAh - index.capacityAh) <= Math.max(5, index.capacityAh * 0.03);
  const magnitude = equipmentMagnitude(item);
  let magnitudeDelta: number | undefined;
  if (requested !== undefined) {
    if (magnitude === undefined) return no(`${item.displayName} no tiene ${request.type === 'battery' ? 'capacidad' : 'potencia'} en el catálogo para confirmar ${formatNumber(requested)} ${unit}.`);
    magnitudeDelta = Math.abs(requested - magnitude);
    if (!magnitudesMatch(request.type, requested, magnitude)) return no(`Se pidió ${formatNumber(requested)} ${unit} y ${item.displayName} tiene ${formatNumber(magnitude)} ${unit}.`, { magnitudeDelta });
  }

  // Palabras del texto: todas deben aparecer en el equipo (marca, serie o nombre) como palabras completas.
  const covered = new Set<string>();
  for (const token of parsed.tokens) {
    const found = matchToken(index, token);
    if (!found) return no(`«${token}» no aparece en ${item.displayName}.`, { magnitudeDelta });
    found.forEach(t => covered.add(t));
  }

  // Código de modelo declarado aparte (ficha técnica), por palabras completas y con la misma normalización:
  // exacto si cubre todas las palabras que distinguen al equipo y no trae otras que el equipo no tiene («5K» frente a
  // «5K Pro» es compatible; «Powerwall 2» frente a «Powerwall 3», nada). No excluye.
  let modelMatch: EquipmentFit['modelMatch'];
  // Misma lectura que el texto: sin unidades ni tensión, y las palabras pegadas («5K3Pro») cubren las del equipo que las forman.
  const modelWords = modelTokens(forParsing(request.model || '').replace(UNITS, ' ').replace(VOLTAGE, ' ')).filter(t => !index.brandWords.has(t));
  if (modelWords.length) {
    const asked = new Set<string>();
    let known = true;
    for (const word of modelWords) {
      const found = matchToken(index, word);
      if (found) found.forEach(t => asked.add(t)); else { known = false; asked.add(word); }
    }
    if (known && subset(index.required, asked)) modelMatch = 'exact';
    else if (subset([...asked], new Set(index.required)) || subset(index.series, asked)) modelMatch = 'compatible';
    // Un modelo que el equipo no tiene, sin marca ni especificación que lo respalden, no basta para encajar.
    else if (!modelWords.some(t => matchToken(index, t)) && requested === undefined && !brandMatch && !ahMatch && !parsed.tokens.length)
      return no(`El modelo ${request.model} no aparece en ${item.displayName}.`, { magnitudeDelta });
  }
  if (!modelWords.length && !parsed.tokens.length && requested === undefined && brandMatch === undefined && !ahMatch) return no('La solicitud no indica marca, modelo ni especificación.');

  const namesCovered = parsed.tokens.length > 0 && index.required.length > 0 && index.required.every(t => covered.has(t));
  const shown = magnitude !== undefined ? ` (${formatNumber(magnitude)} ${unit})` : '';
  const base = { item, fits: true, magnitudeDelta, brandMatch, modelMatch, ahMatch } as const;
  if (namesCovered || modelMatch === 'exact') return { ...base, kind: 'exact', reason: `Modelo exacto: ${item.displayName}${shown}.` };
  if (requested === undefined && ahMatch) return { ...base, kind: 'spec', reason: `Coincide por especificación: ${formatNumber(index.capacityAh!)} Ah → ${item.displayName}${shown}.` };
  if (requested !== undefined) return { ...base, kind: 'spec', reason: `Coincide por especificación: ${index.brand ? `${index.brand}, ` : ''}${formatNumber(requested)} ${unit} → ${item.displayName}${shown}.` };
  return { ...base, kind: 'partial', reason: `Coincide por marca y nombre, sin ${request.type === 'battery' ? 'capacidad' : 'potencia'} que confirmar: ${item.displayName}${shown}.` };
}

const RANK: Record<EquipmentFitKind, number> = { exact: 0, spec: 1, partial: 2, none: 3 };
/** Dentro del mismo nivel, gana el modelo exacto y después el compatible con el código pedido. */
const modelRank = (fit: EquipmentFit) => fit.modelMatch === 'exact' ? 0 : fit.modelMatch === 'compatible' ? 1 : 2;
const byBest = (a: EquipmentFit, b: EquipmentFit) => RANK[a.kind] - RANK[b.kind] || modelRank(a) - modelRank(b) || (a.magnitudeDelta ?? 0) - (b.magnitudeDelta ?? 0);

/** El equipo del catálogo que corresponde a lo pedido: único exacto, único por especificación, ambiguo o ninguno, con el porqué. */
export function matchEquipment(request: EquipmentRequest, catalog: readonly SolarEquipmentItem[]): EquipmentMatch {
  const fits = catalog.filter(item => item.type === request.type).map(item => fitEquipment(request, item)).filter(fit => fit.fits).sort(byBest);
  const asked = request.text?.trim() || [request.brand, request.model, request.magnitude !== undefined ? `${formatNumber(request.magnitude)} ${UNIT[request.type]}` : ''].filter(Boolean).join(' ');
  if (!fits.length) return { kind: 'none', candidates: [], reason: `Ningún ${NOUN[request.type]} del catálogo coincide con «${asked}».` };
  const tier = fits.filter(fit => fit.kind === fits[0].kind && modelRank(fit) === modelRank(fits[0]));
  if (tier.length > 1) {
    const names = tier.slice(0, 5).map(fit => fit.item.displayName).join(', ');
    return { kind: 'ambiguous', candidates: tier, reason: `«${asked}» coincide con ${tier.length} modelos: ${names}. Indica cuál.` };
  }
  // Parcial (marca o parte del nombre, sin especificación): resultado propio que siempre pide confirmación.
  const kind = fits[0].kind === 'exact' ? 'exact' : fits[0].kind === 'spec' ? 'spec' : 'partial';
  return { kind, item: fits[0].item, candidates: fits, reason: fits[0].reason };
}

/** Búsqueda libre en el catálogo (asistente): los equipos que encajan con el texto, del mejor al peor; el tipo sale del texto si lo nombra. */
export function searchEquipmentByRequest(text: string, catalog: readonly SolarEquipmentItem[], limit = 12): EquipmentFit[] {
  const named = equipmentTypeInText(text);
  const types: EquipmentType[] = named ? [named] : ['panel', 'inverter', 'battery'];
  return types.flatMap(type => catalog.filter(item => item.type === type).map(item => fitEquipment({ type, text }, item)))
    .filter(fit => fit.fits)
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || (a.magnitudeDelta ?? 0) - (b.magnitudeDelta ?? 0))
    .slice(0, limit);
}

/** Tipo de equipo nombrado en un texto libre («batería…», «inversor…», «panel…»), si lo hay. */
export function equipmentTypeInText(text: string): EquipmentType | undefined {
  const value = canonical(text);
  if (/\bbaterias?\b|\bbattery\b|\bkwh\b|\d\s*kwh/.test(value)) return 'battery';
  if (/\binversor(es)?\b|\binverter\b/.test(value)) return 'inverter';
  if (/\bpaneles?\b|\bmodulos?\b|\bmodule\b/.test(value)) return 'panel';
  return undefined;
}
