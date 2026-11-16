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
  'lifepo4', 'modelo', 'marca', 'unidad', 'unidades', 'w', 'wp', 'kw', 'kwh', 'kwp', 'ah']);

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
const canonical = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/lux[\s-]*power(?!tek)/g, 'luxpowertek').replace(/\bcanadian(?![\s-]*solar)/g, 'canadian solar').replace(/watts?|vatios?/g, 'w');
const UNIT_WORDS = '(?:kwh|kwp|kw|wp|w|ah)';
/** Número con unidad solo con frontera delante: «550 W», «0.63kWp», «-100AH»; nunca dentro de un código («CS6W-550MB»). */
const UNITS = new RegExp(`(?<![a-z0-9.,])(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS.slice(3, -1)})\\b`, 'g');
/** Una palabra pegada a una cifra con unidad («Solar630W», «HinaESS15kW») se separa; un código corto («CS6W») no. */
const GLUED_UNIT = new RegExp(`([a-z]{4,})(?=\\d+(?:[.,]\\d+)?\\s*${UNIT_WORDS}\\b)`, 'g');
const forParsing = (text: string) => canonical(text).replace(GLUED_UNIT, '$1 ');
const compact = (text: string) => canonical(text).replace(/[^a-z0-9]/g, '');
const WARRANTY = /\(?\s*\d+\s*(?:anos?\s*(?:de\s*)?garantia)\)?/g;
const QUANTITY = /\b\d+\s*x\s+|\s+x\s*\d+\b/g;
const words = (text: string) => text.split(/[^a-z0-9]+/).filter(Boolean);

/** Marca efectiva de un equipo: la guardada salvo genérica («Fabricante», vacía), entonces la inferida del nombre; siempre en su forma canónica. */
export function effectiveBrand(item: Pick<SolarEquipmentItem, 'brand' | 'displayName' | 'modelSeries'>): string | undefined {
  const stored = item.brand?.trim();
  if (stored && !isGenericBrand(stored)) return normalizeBrandName(stored);
  const inferred = inferBrandFromText(item.displayName, item.modelSeries);
  return inferred && !isGenericBrand(inferred) ? inferred : undefined;
}

interface ParsedText { tokens: string[]; codes: string[][]; magnitudes: { value: number; unit: string }[] }
function parseText(text: string): ParsedText {
  let value = forParsing(text).replace(WARRANTY, ' ').replace(QUANTITY, ' ');
  const magnitudes = [...value.matchAll(UNITS)].map(m => ({ value: Number(m[1].replace(',', '.')), unit: m[2] }));
  value = value.replace(UNITS, ' ');
  const codes = (value.match(/\b[a-z][a-z0-9]*(?:[-./][a-z0-9]+)+\b/g) || []).map(words);
  return { tokens: words(value).filter(t => !STOPWORDS.has(t)), codes, magnitudes };
}

interface ItemIndex { tokens: Set<string>; sequence: string[]; required: string[]; series: string[]; brand?: string }
function indexItem(item: SolarEquipmentItem): ItemIndex {
  const brand = effectiveBrand(item);
  const brandText = `${brand || ''} ${item.brand || ''}`;
  const brandWords = new Set([...words(canonical(brandText)), compact(brand || ''), compact(item.brand || '')]);
  const names = forParsing(`${item.modelSeries || ''} ${item.displayName || ''}`).replace(UNITS, ' ');
  // Secuencia ordenada de palabras (marca, serie y nombre) para casar fragmentos pegados sin cruzar fronteras.
  const sequence = words(forParsing(`${brandText} ${item.modelSeries || ''} ${item.displayName || ''}`));
  return {
    tokens: new Set(sequence),
    sequence,
    // Palabras que distinguen el modelo; los números sueltos cortos («8», «16») no lo identifican.
    required: [...new Set(words(names).filter(t => !STOPWORDS.has(t) && !brandWords.has(t) && (!/^\d+$/.test(t) || t.length >= 3)))],
    series: words(forParsing(item.modelSeries || '')).filter(t => !STOPWORDS.has(t)),
    brand,
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
  const parsed = request.text ? parseText(request.text) : { tokens: [], codes: [], magnitudes: [] };

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
      if (item.capacityAh) {
        ahMatch = Math.abs(m.value - item.capacityAh) <= Math.max(5, item.capacityAh * 0.03);
        if (!ahMatch) return no(`Se pidió ${formatNumber(m.value)} Ah y ${item.displayName} tiene ${formatNumber(item.capacityAh)} Ah.`);
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
  if (request.type === 'battery' && request.capacityAh && item.capacityAh) ahMatch = Math.abs(request.capacityAh - item.capacityAh) <= Math.max(5, item.capacityAh * 0.03);
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
  const code = parsed.codes.find(c => !wordsForming(index.sequence, c.join('')) && !c.every(t => index.tokens.has(t)));
  if (code) return no(`El código «${code.join('-')}» no aparece en ${item.displayName}.`, { magnitudeDelta });

  // Código de modelo declarado aparte, por palabras completas: exacto (mismas palabras que la serie o el modelo),
  // compatible (uno contiene al otro: «5K» en «5K Pro») o ninguno («5K» frente a «15K»). No excluye.
  let modelMatch: EquipmentFit['modelMatch'];
  const modelWords = words(forParsing(request.model || '')).filter(t => !STOPWORDS.has(t));
  if (modelWords.length) {
    const asked = new Set(modelWords);
    const same = (other: readonly string[]) => other.length > 0 && subset(other, asked) && subset(modelWords, new Set(other));
    if (same(index.series) || same(index.required)) modelMatch = 'exact';
    else if (subset(modelWords, new Set(index.required)) || subset(index.series, asked)) modelMatch = 'compatible';
  }
  if (!modelWords.length && !parsed.tokens.length && requested === undefined && brandMatch === undefined) return no('La solicitud no indica marca, modelo ni especificación.');

  const namesCovered = parsed.tokens.length > 0 && index.required.length > 0 && index.required.every(t => covered.has(t));
  const shown = magnitude !== undefined ? ` (${formatNumber(magnitude)} ${unit})` : '';
  const base = { item, fits: true, magnitudeDelta, brandMatch, modelMatch, ahMatch } as const;
  if (namesCovered || modelMatch === 'exact') return { ...base, kind: 'exact', reason: `Modelo exacto: ${item.displayName}${shown}.` };
  if (requested !== undefined) return { ...base, kind: 'spec', reason: `Coincide por especificación: ${index.brand ? `${index.brand}, ` : ''}${formatNumber(requested)} ${unit} → ${item.displayName}${shown}.` };
  return { ...base, kind: 'partial', reason: `Coincide por marca y nombre, sin ${request.type === 'battery' ? 'capacidad' : 'potencia'} que confirmar: ${item.displayName}${shown}.` };
}

const RANK: Record<EquipmentFitKind, number> = { exact: 0, spec: 1, partial: 2, none: 3 };

/** El equipo del catálogo que corresponde a lo pedido: único exacto, único por especificación, ambiguo o ninguno, con el porqué. */
export function matchEquipment(request: EquipmentRequest, catalog: readonly SolarEquipmentItem[]): EquipmentMatch {
  const fits = catalog.filter(item => item.type === request.type).map(item => fitEquipment(request, item)).filter(fit => fit.fits)
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || (a.magnitudeDelta ?? 0) - (b.magnitudeDelta ?? 0));
  const asked = request.text?.trim() || [request.brand, request.model, request.magnitude !== undefined ? `${formatNumber(request.magnitude)} ${UNIT[request.type]}` : ''].filter(Boolean).join(' ');
  if (!fits.length) return { kind: 'none', candidates: [], reason: `Ningún ${NOUN[request.type]} del catálogo coincide con «${asked}».` };
  const tier = fits.filter(fit => fit.kind === fits[0].kind);
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
