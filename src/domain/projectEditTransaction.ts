/**
 * Transacción de edición de una propuesta (F2a2; ADR 0004, «Registro de campos y transacción»). Pura: sin Zustand, sin
 * reloj ni temporizadores. Recibe un lote de ediciones por ruta del registro (`projectFields.ts`) y:
 *
 * 1. valida cada ruta (que exista, que no sea de solo lectura, tipo y rango) y rechaza el lote ENTERO si alguna falla,
 *    con la lista completa de errores (todo o nada: un lote a medias dejaría la propuesta en un estado que nadie pidió);
 * 2. resuelve las dependencias declaradas: activa lo que haga falta («Incluir batería» al elegir una batería) como cambio
 *    derivado y avisado, o rechaza lo que no aplica (el cargo SIE-007 en el régimen anterior), comprobado contra la
 *    propuesta ya aplicada (paso 3) para leer el estado efectivo y no el lote crudo;
 * 3. ordena las ediciones por ruta y las agrupa en un plan por sección, relativo a la base del lote, y lo aplica con
 *    `applyProjectEditPlan`: las reglas de `projectEdit.ts` corren UNA vez contra la base, así que el resultado no
 *    depende del orden de las ediciones;
 * 4. devuelve el proyecto, los cambios (antes → después, con etiqueta y marca de derivado), los avisos y, si se piden,
 *    los resultados del motor antes y después.
 *
 * El sello, la sincronización, el diario de deshacer y la idempotencia son del store (`commitProjectEdits`).
 */
import type { ProjectSimulation } from '../types';
import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import { migrateLegacySpecs } from '../../shared/equipment';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { applyProjectEditPlan, type ProjectEditContext, type ProjectEditPlan } from './projectEdit';
import { expandEditIntents } from './editIntents';
import {
  fieldLabel, findProjectField, formatFieldPath, parseFieldPath, readPath, PROJECT_FIELDS,
  type PathToken, type ProjectFieldDefinition,
} from './projectFields';

/** Quién origina el lote: lo guarda el diario de deshacer y, en F3, decide la política de permisos. */
export type ProjectEditSource = 'user' | 'dock' | 'assistant' | 'external_agent' | 'system';

export interface ProjectFieldEdit {
  /** Ruta del registro, concreta: `rates.targetCoveragePct`, `specs.panels[0].count`. */
  path: string;
  /** Valor nuevo; `undefined` borra el dato si el campo lo admite. */
  value: unknown;
}

export interface ProjectFieldChange {
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  /** No lo pidió el lote (o quedó distinto de lo pedido): lo cambió una regla o una dependencia. */
  derived: boolean;
}

export interface ProjectEditError {
  path: string;
  message: string;
}

/** Resultados del motor que ya muestra la app. */
export interface ProjectEditMetrics {
  systemCapacityKWp: number;
  annualProductionKWh: number;
  energyCoveragePct: number;
  contractPriceUSD: number;
  netInvestmentUSD: number;
  year1SavingsUSD: number;
  paybackYears: number;
}

export interface ProjectEditsContext extends ProjectEditContext {
  /** Modelo energético con que la app calcula (selector efectivo); sin él, `legacy`. */
  calculationMode?: EnergyCalculationMode;
}

export interface ApplyProjectEditsOptions {
  /**
   * `strict` (por defecto; asistente y agentes): tipo y rango. `dock`: solo tipo y rutas. El dock confirma por tecla y sus
   * campos ya acotan o resuelven el valor (ADR 0003: un 0 o un valor fuera de rango guardado se resuelve al leer); rechazar
   * ahí devolvería el campo al valor anterior mientras se escribe. Las dependencias que se rechazan pasan a avisos.
   */
  validation?: 'strict' | 'dock';
  /** Calcula los resultados del motor antes y después (dos corridas del motor). */
  metrics?: boolean;
}

export type ProjectEditsResult =
  | {
    ok: true;
    project: ProjectSimulation;
    changes: ProjectFieldChange[];
    /** Ediciones que añadió la transacción: las reglas del dock (`editIntents.ts`) y las dependencias. */
    derivedEdits: ProjectFieldEdit[];
    warnings: string[];
    metrics?: { before: ProjectEditMetrics; after: ProjectEditMetrics };
  }
  | { ok: false; errors: ProjectEditError[]; warnings: string[] };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
const shown = (value: unknown): string => {
  const text = typeof value === 'string' ? `«${value}»` : JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};
const isPrefix = (prefix: readonly PathToken[], tokens: readonly PathToken[]) =>
  prefix.length <= tokens.length && prefix.every((token, i) => token === tokens[i]);

/** JSON con las claves ordenadas; las que valen `undefined` se omiten (como `JSON.stringify` en objetos). */
const canonicalJson = (value: unknown): string | undefined => JSON.stringify(value, (_key, v: unknown) =>
  (isRecord(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));

/**
 * Huella del lote para la idempotencia: la del lote canónico (ordenado por ruta, claves ordenadas, `value: undefined`
 * explícito u omitido por igual). El orden no cuenta en la transacción, así que tampoco en la huella: un reintento con las
 * ediciones en otro orden es el mismo lote. Un lote que no es lista se serializa tal cual (lo rechaza la transacción).
 */
export function editBatchFingerprint(edits: unknown): string {
  if (!Array.isArray(edits)) return `!${canonicalJson(edits) ?? String(edits)}`;
  const entries = edits.map((edit) => {
    const record: Record<string, unknown> = isRecord(edit) ? edit : { value: edit };
    // `undefined` (explícito u omitido) no es `null`: la transacción los trata distinto.
    return JSON.stringify([typeof record.path === 'string' ? record.path : canonicalJson(record.path) ?? null, canonicalJson(record.value) ?? '\u0000undefined']);
  });
  return `[${entries.sort().join(',')}]`;
}

/** Un parche de sección del store (`updateSpecs({...})`) como ediciones por ruta; conserva las claves que valen `undefined`. */
export function editsFromPatch(section: 'client' | 'specs' | 'rates' | 'financials', patch: object | null | undefined): ProjectFieldEdit[] {
  return Object.entries(patch ?? {}).map(([key, value]) => ({ path: `${section}.${key}`, value }));
}

// ── Validación ──────────────────────────────────────────────────────────────────────────────

function rangeText(def: ProjectFieldDefinition): string {
  const low = def.min === undefined ? '' : def.exclusiveMin ? `mayor que ${def.min}` : `al menos ${def.min}`;
  const high = def.max === undefined ? '' : `como mucho ${def.max}`;
  return [low, high].filter(Boolean).join(' y ');
}

/** Mensaje de error del valor para `def`, o `null` si vale. `strict` añade rango, largo y tamaño al tipo. */
function valueError(def: ProjectFieldDefinition, value: unknown, strict: boolean): string | null {
  const label = `«${def.label}»`;
  if (value === undefined) return def.optional ? null : `${label} no puede quedar vacío.`;
  switch (def.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${label} debe ser un número; recibió ${shown(value)}.`;
      if (!strict) return null;
      if (def.integer && !Number.isInteger(value)) return `${label} debe ser un número entero; recibió ${value}.`;
      const below = def.min !== undefined && (def.exclusiveMin ? value <= def.min : value < def.min);
      const above = def.max !== undefined && value > def.max;
      return below || above ? `${label} fuera de rango: debe ser ${rangeText(def)}; recibió ${value}.` : null;
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : `${label} debe ser sí o no (true/false); recibió ${shown(value)}.`;
    case 'string': {
      if (typeof value !== 'string') return `${label} debe ser un texto; recibió ${shown(value)}.`;
      if (!strict) return null;
      if (def.maxLength !== undefined && value.length > def.maxLength) return `${label} admite como mucho ${def.maxLength} caracteres; recibió ${value.length}.`;
      if (def.minLength !== undefined && value.trim().length < def.minLength) return `${label} no puede quedar vacío.`;
      return null;
    }
    case 'date':
      if (typeof value !== 'string') return `${label} debe ser una fecha AAAA-MM-DD; recibió ${shown(value)}.`;
      return !strict || /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? null : `${label} debe ser una fecha AAAA-MM-DD; recibió ${shown(value)}.`;
    case 'enum': {
      if (!def.values || def.values.includes(value as string | boolean)) return null;
      const options = def.values.length > 6 ? `${def.values.slice(0, 6).map(shown).join(', ')}…` : def.values.map(shown).join(', ');
      return `${label} debe ser uno de: ${options}; recibió ${shown(value)}.`;
    }
    case 'numberList': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return `${label} debe ser una lista de números.`;
      if (!strict) return null;
      if (def.length !== undefined && value.length !== def.length) return `${label} debe tener ${def.length} valores; recibió ${value.length}.`;
      const bad = value.find((v) => (def.min !== undefined && v < def.min) || (def.max !== undefined && v > def.max));
      return bad === undefined ? null : `${label} fuera de rango: cada valor debe ser ${rangeText(def)}; recibió ${bad}.`;
    }
    case 'list': {
      if (!Array.isArray(value) || value.some((v) => !isRecord(v))) return `${label} debe ser una lista de registros.`;
      if (!strict) return null;
      if (def.minItems !== undefined && value.length < def.minItems) return `${label} necesita al menos ${def.minItems} elemento(s).`;
      if (def.maxItems !== undefined && value.length > def.maxItems) return `${label} admite como mucho ${def.maxItems} elementos; recibió ${value.length}.`;
      return null;
    }
    case 'object':
      return isRecord(value) ? null : `${label} debe ser un objeto; recibió ${shown(value)}.`;
  }
}

/** Campos de cada elemento de una lista de registros (grupos, ítems, descuentos). */
function listItemErrors(def: ProjectFieldDefinition, path: string, list: Record<string, unknown>[], strict: boolean): ProjectEditError[] {
  const prefix = `${def.path}[].`;
  const itemDefs = PROJECT_FIELDS.filter((field) => field.path.startsWith(prefix) && !field.path.slice(prefix.length).includes('.'));
  const required = itemDefs.filter((field) => !field.optional && (!field.readOnly || field.path.endsWith('[].id')));
  const errors: ProjectEditError[] = [];
  list.forEach((item, index) => {
    const at = (key: string) => `${path}[${index}].${key}`;
    for (const [key, value] of Object.entries(item)) {
      if (value === undefined) continue;
      const itemDef = itemDefs.find((field) => field.path === prefix + key);
      if (!itemDef) {
        if (strict) errors.push({ path: at(key), message: `«${key}» no es un campo de ${def.label} (#${index + 1}).` });
        continue;
      }
      const message = valueError({ ...itemDef, label: `${itemDef.label} (#${index + 1})` }, value, strict);
      if (message) errors.push({ path: at(key), message });
    }
    if (strict) for (const field of required) {
      const key = field.path.slice(prefix.length);
      if (item[key] === undefined || item[key] === '') errors.push({ path: at(key), message: `Falta «${field.label}» en ${def.label} (#${index + 1}).` });
    }
  });
  return errors;
}

/** Los índices de la ruta tienen que existir en la propuesta (no se crean grupos por ruta: se escribe la lista). */
function indexError(project: ProjectSimulation, tokens: PathToken[], def: ProjectFieldDefinition): string | null {
  const base = { ...project, specs: migrateLegacySpecs(project.specs) };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (typeof token !== 'number') continue;
    const container = readPath(base, tokens.slice(0, i));
    const parent = findProjectField(formatFieldPath(tokens.slice(0, i)));
    const limit = parent?.type === 'numberList' && parent.length !== undefined ? parent.length : Array.isArray(container) ? container.length : 0;
    if (token >= limit) return `«${def.label}»: no existe el elemento #${token + 1}.`;
  }
  return null;
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────

/** Copia de `target` con `value` en `tokens` (sin mutar). */
function setPath(target: unknown, tokens: readonly PathToken[], value: unknown): unknown {
  if (!tokens.length) return value;
  const [head, ...rest] = tokens;
  const container: Record<string | number, unknown> | unknown[] = Array.isArray(target) ? [...target] : isRecord(target) ? { ...target } : typeof head === 'number' ? [] : {};
  (container as Record<string | number, unknown>)[head] = setPath((container as Record<string | number, unknown>)[head], rest, value);
  return container;
}

/** La propuesta con los valores del lote escritos tal cual, sin reglas: de ella leen las dependencias. */
function preview(project: ProjectSimulation, edits: readonly ParsedEdit[]): ProjectSimulation {
  let next: unknown = project;
  for (const edit of edits) next = setPath(next, edit.tokens, edit.value);
  return next as ProjectSimulation;
}

interface ParsedEdit extends ProjectFieldEdit {
  tokens: PathToken[];
  def: ProjectFieldDefinition;
}

/** Plan por sección, en orden de ruta: relativo a la base, así el orden de llegada no cuenta. */
function planOf(project: ProjectSimulation, edits: readonly ParsedEdit[]): ProjectEditPlan {
  const base = { ...project, specs: migrateLegacySpecs(project.specs) };
  const patches: Partial<Record<'client' | 'specs' | 'rates' | 'financials', Record<string, unknown>>> = {};
  let consumption: number[] | undefined;
  for (const edit of edits) {
    const [section, key, ...rest] = edit.tokens as [string, PathToken | undefined, ...PathToken[]];
    if (section === 'monthlyConsumption') {
      if (key === undefined) consumption = [...(edit.value as number[])];
      else (consumption ??= [...(project.monthlyConsumption ?? [])])[key as number] = edit.value as number;
      continue;
    }
    const patch = (patches[section as keyof typeof patches] ??= {});
    const name = key as string;
    patch[name] = rest.length === 0 ? clone(edit.value) : setPath(name in patch ? patch[name] : clone(readPath(base, [section, name])), rest, clone(edit.value));
  }
  const plan: ProjectEditPlan = {};
  if (patches.client) plan.client = patches.client;
  if (patches.specs) plan.specs = patches.specs;
  if (patches.rates) plan.rates = patches.rates;
  if (patches.financials) plan.financials = patches.financials;
  if (consumption) plan.consumption = { monthlyConsumption: consumption };
  return plan;
}

// ── Diff ────────────────────────────────────────────────────────────────────────────────────

const DIFF_SECTIONS = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization', 'aiSource'] as const;

/** Un objeto o lista vacíos cuentan como ausentes: la edición de cliente crea `customization: {}` sin cambiar nada visible. */
const orAbsent = (value: unknown) => ((isRecord(value) && Object.keys(value).every((key) => value[key] === undefined)) || (Array.isArray(value) && !value.length) ? undefined : value);

function collectChanges(before: unknown, after: unknown, tokens: PathToken[], out: Array<{ tokens: PathToken[]; before: unknown; after: unknown }>) {
  // Misma referencia: sin serializar. Los objetos y listas de registros se recorren clave por clave ANTES de serializar
  // nada, así lo que no cambió se descarta por referencia: la personalización puede llevar logos en base64, cada edición
  // de cliente la copia (espejo de contacto) y el dock confirma por tecla. Solo se serializan las hojas que difieren.
  if (before === after) return;
  const def = findProjectField(formatFieldPath(tokens));
  const leaf = !!def?.leaf || def?.type === 'numberList';
  if (!leaf && isRecord(before) && isRecord(after)) {
    const keys = [...Object.keys(before), ...Object.keys(after).filter((key) => !(key in before))];
    for (const key of keys) collectChanges(before[key], after[key], [...tokens, key], out);
    return;
  }
  const records = (value: unknown) => Array.isArray(value) && value.some(isRecord);
  if (!leaf && Array.isArray(before) && Array.isArray(after) && (records(before) || records(after))) {
    for (let i = 0; i < Math.max(before.length, after.length); i++) collectChanges(before[i], after[i], [...tokens, i], out);
    return;
  }
  if (sameJson(before, after) || sameJson(orAbsent(before), orAbsent(after))) return;
  out.push({ tokens, before: clone(before), after: clone(after) });
}

function diffProjects(before: ProjectSimulation, after: ProjectSimulation, requested: readonly ParsedEdit[]): ProjectFieldChange[] {
  const raw: Array<{ tokens: PathToken[]; before: unknown; after: unknown }> = [];
  for (const section of DIFF_SECTIONS) collectChanges(before[section], after[section], [section], raw);
  return raw.map((change) => {
    const path = formatFieldPath(change.tokens);
    let derived = true;
    for (const edit of requested) {
      if (isPrefix(edit.tokens, change.tokens)) { derived = !sameJson(readPath(edit.value, change.tokens.slice(edit.tokens.length)), change.after); break; }
      if (isPrefix(change.tokens, edit.tokens)) { derived = false; break; }
    }
    return { path, label: fieldLabel(path), before: change.before, after: change.after, derived };
  });
}

export function projectEditMetrics(project: ProjectSimulation, mode: EnergyCalculationMode = 'legacy'): ProjectEditMetrics {
  const s = calculateProjectFinancialSummary(project, mode);
  return {
    systemCapacityKWp: s.systemCapacityKWp, annualProductionKWh: s.annualProductionKWh, energyCoveragePct: s.energyCoveragePct,
    contractPriceUSD: s.contractPriceUSD, netInvestmentUSD: s.netInvestmentUSD, year1SavingsUSD: s.year1SavingsUSD, paybackYears: s.paybackYears,
  };
}

// ── Transacción ─────────────────────────────────────────────────────────────────────────────

/** Aplica el lote a `project` (sin mutarlo). Ver el encabezado del módulo. */
export function applyProjectEdits(project: ProjectSimulation, edits: readonly ProjectFieldEdit[], ctx: ProjectEditsContext, options: ApplyProjectEditsOptions = {}): ProjectEditsResult {
  const strict = options.validation !== 'dock';
  const errors: ProjectEditError[] = [];
  const warnings: string[] = [];

  // 0. El lote es una lista (una llamada de herramienta mal formada puede mandar un objeto): no es un lote vacío.
  if (!Array.isArray(edits)) {
    return { ok: false, errors: [{ path: '', message: `El lote debe ser una lista de {path, value}; recibió ${shown(edits)}.` }], warnings };
  }

  // 1. Rutas, tipos y rangos.
  const parsed: ParsedEdit[] = [];
  for (const edit of edits) {
    const path = typeof edit?.path === 'string' ? edit.path : '';
    const tokens = parseFieldPath(path);
    if (!tokens) { errors.push({ path, message: `Ruta mal formada ${shown(path)}: usa sección.campo, con [n] para elementos de una lista.` }); continue; }
    const def = findProjectField(path);
    if (!def) { errors.push({ path, message: `La ruta ${shown(path)} no existe en el registro de campos de la propuesta.` }); continue; }
    if (def.readOnly) { errors.push({ path, message: `«${def.label}» lo calculan las reglas o lo escribe su lista; no se edita por ruta.` }); continue; }
    const missing = indexError(project, tokens, def);
    if (missing) { errors.push({ path, message: missing }); continue; }
    const message = valueError(def, edit.value, strict);
    if (message) { errors.push({ path, message }); continue; }
    if (def.type === 'list') errors.push(...listItemErrors(def, path, edit.value as Record<string, unknown>[], strict));
    parsed.push({ path, value: edit.value, tokens, def });
  }

  // 2. Duplicados y rutas que se pisan; orden canónico por ruta.
  parsed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const requested: ParsedEdit[] = [];
  for (const edit of parsed) {
    const same = requested.find((other) => other.path === edit.path);
    if (same) {
      if (!sameJson(same.value, edit.value)) errors.push({ path: edit.path, message: `${shown(fieldLabel(edit.path))} aparece dos veces con valores distintos en el mismo lote.` });
      continue;
    }
    const overlap = requested.find((other) => isPrefix(other.tokens, edit.tokens) || isPrefix(edit.tokens, other.tokens));
    if (overlap) { errors.push({ path: edit.path, message: `«${overlap.path}» y «${edit.path}» se pisan: envía la lista completa o solo sus campos, no ambos.` }); continue; }
    requested.push(edit);
  }

  // 3. Reglas del dock (F2b, `editIntents.ts`): lo que el lote pide como intención («cambia la distribuidora», «elige este
  // panel del catálogo») se completa con los mismos campos que escribe el gesto del dock. Lo que el lote ya fija manda.
  const expansion = expandEditIntents(project, preview(project, requested), requested, ctx);
  errors.push(...expansion.errors);
  warnings.push(...expansion.warnings);
  const ruleEdits: ParsedEdit[] = [];
  for (const edit of expansion.edits) {
    const def = findProjectField(edit.path);
    const tokens = parseFieldPath(edit.path);
    if (!def || !tokens) throw new Error(`Regla de edición con una ruta sin registrar: ${edit.path}`);
    ruleEdits.push({ ...edit, tokens, def });
  }
  const planned = [...requested.filter((edit) => !expansion.replaced.has(edit.path)), ...ruleEdits];

  // 4. Dependencias: activar lo necesario (derivado y avisado) hasta que no haga falta nada más; luego comprobar el resto.
  const derivedEdits: ParsedEdit[] = [];
  const all = () => [...planned, ...derivedEdits];
  const effective = (path: string, state: ProjectSimulation) => {
    const def = findProjectField(path);
    return def?.effective ? def.effective(state) : readPath(state, parseFieldPath(path) ?? []);
  };
  for (let round = 0; round < 4; round++) {
    const state = preview(project, all());
    let added = false;
    for (const edit of all()) for (const requirement of edit.def.requires ?? []) {
      if (requirement.resolve !== 'activate' || (requirement.when && !requirement.when(edit.value))) continue;
      if (sameJson(effective(requirement.path, state), requirement.value) || all().some((other) => other.path === requirement.path)) continue;
      const def = findProjectField(requirement.path)!;
      derivedEdits.push({ path: requirement.path, value: requirement.value, tokens: parseFieldPath(requirement.path)!, def });
      warnings.push(`Se activó «${def.label}» para aplicar «${fieldLabel(edit.path)}».`);
      added = true;
    }
    if (!added) break;
  }
  /**
   * Comprueba las dependencias de un tipo contra `state`. Las que se activan, contra el lote escrito tal cual (lo que
   * pidió el llamador contradice o no la activación). Las que se rechazan, contra la propuesta ya aplicada: las reglas
   * normalizan lo que el lote escribe a medias (pasar a aislado deriva `isZeroExport`, sin el cual «Conexión a la red»
   * se seguiría resolviendo como conectada) y la dependencia vale por el estado efectivo, no por el valor crudo.
   */
  const checkRequirements = (resolve: 'activate' | 'reject', state: ProjectSimulation) => {
    for (const edit of all()) for (const requirement of edit.def.requires ?? []) {
      if (requirement.resolve !== resolve || (requirement.when && !requirement.when(edit.value))) continue;
      const current = effective(requirement.path, state);
      if (sameJson(current, requirement.value)) continue;
      const def = findProjectField(requirement.path)!;
      const inBatch = all().some((other) => other.path === requirement.path);
      const message = resolve === 'activate'
        ? `«${fieldLabel(edit.path)}» exige «${def.label}» = ${shown(requirement.value)}, pero el lote lo fija en ${shown(current)}.`
        : inBatch
          ? `«${fieldLabel(edit.path)}» solo aplica cuando «${def.label}» es ${shown(requirement.value)}; el lote lo deja en ${shown(current)}.`
          : `«${fieldLabel(edit.path)}» solo aplica cuando «${def.label}» es ${shown(requirement.value)} (ahora es ${shown(current)}); inclúyelo en el mismo lote.`;
      if (resolve === 'activate' || strict) errors.push({ path: edit.path, message });
      else warnings.push(message);
    }
  };
  checkRequirements('activate', preview(project, all()));

  // 5. Una sola aplicación de las reglas contra la base; después, las dependencias que se rechazan sobre el resultado.
  // `all()` solo lleva rutas válidas con valores de su tipo, así que se aplica aunque ya haya errores: la lista de errores
  // sigue completa (las dependencias rechazadas se informan junto con las de ruta, tipo y rango). Si con errores las
  // reglas no pueden aplicarse (p. ej. un elemento de lista mal formado), se devuelven los que ya hay.
  const ordered = all().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let next: ProjectSimulation;
  try {
    next = applyProjectEditPlan(project, planOf(project, ordered), ctx);
  } catch (error) {
    if (!errors.length) throw error;
    return { ok: false, errors, warnings };
  }
  checkRequirements('reject', next);
  if (errors.length) return { ok: false, errors, warnings };
  const changes = diffProjects(project, next, requested);
  const result: Extract<ProjectEditsResult, { ok: true }> = {
    ok: true, project: next, changes, warnings,
    derivedEdits: [...ruleEdits, ...derivedEdits].map(({ path, value }) => ({ path, value })),
  };
  if (options.metrics) result.metrics = { before: projectEditMetrics(project, ctx.calculationMode), after: projectEditMetrics(next, ctx.calculationMode) };
  return result;
}
