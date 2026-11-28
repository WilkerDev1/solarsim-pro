/**
 * Supuestos que el asistente de la app puede declarar (F3c, capa 3 de sus instrucciones). Puro.
 *
 * Lista CERRADA de fuentes: un supuesto solo puede salir de
 *  - `settings`: los Ajustes del usuario (`DefaultSimulationSettings`), que siembran las propuestas nuevas;
 *  - `factory`: los valores de fábrica de una propuesta nueva sin datos (`NEW_PROPOSAL_DEFAULTS`, ADR 0009);
 *  - `sizing`: los supuestos del dimensionado (`SIZING_ASSUMPTIONS`, `src/domain/sizing.ts`);
 *  - `proposal`: un dato de la propia propuesta, por su ruta del registro de campos (`projectFields.ts`).
 * Nada más («lo habitual», «según mi experiencia», un precio de internet): eso no es un supuesto, es una cifra inventada.
 * La validación comprueba la clave contra la fuente y que el valor sea el de verdad: el de la constante (`factory`,
 * `sizing`) o el de las referencias del turno (`settings`, `proposal`). Sin esas referencias, un supuesto de Ajustes o de la
 * propuesta no se puede comprobar y no entra.
 */
import type { ProjectSimulation } from '../../../types';
import type { DefaultSimulationSettings } from '../../../store/types';
import { DEFAULT_SIMULATION_SETTINGS } from '../../../store/defaultSimulationSettings';
import { NEW_PROPOSAL_DEFAULTS } from '../../../domain/newProposal';
import { SIZING_ASSUMPTIONS, type SizingAssumptionUsed } from '../../../domain/sizing';
import { findProjectField, parseFieldPath, readPath } from '../../../domain/projectFields';

export const ASSUMPTION_SOURCES = ['settings', 'factory', 'sizing', 'proposal'] as const;
export type AssumptionSource = (typeof ASSUMPTION_SOURCES)[number];

/** Cómo se nombra cada fuente al usuario (y en las instrucciones). */
export const ASSUMPTION_SOURCE_LABELS: Readonly<Record<AssumptionSource, string>> = {
  settings: 'Ajustes del usuario',
  factory: 'valores de fábrica de una propuesta nueva',
  sizing: 'supuestos del dimensionado',
  proposal: 'datos de la propia propuesta',
};

export interface DeclaredAssumption {
  source: AssumptionSource;
  /** `settings`: campo de Ajustes; `factory`: clave de NEW_PROPOSAL_DEFAULTS; `sizing`: ruta en SIZING_ASSUMPTIONS; `proposal`: ruta del registro. */
  key: string;
  /** Texto para el usuario, en español. */
  label: string;
  value: unknown;
}

export interface AssumptionReferences {
  /** Ajustes vigentes: el valor declarado debe coincidir (sin ellos, la fuente `settings` se rechaza). */
  settings?: DefaultSimulationSettings;
  /** La propuesta del turno: el valor declarado debe ser el suyo (sin ella, la fuente `proposal` se rechaza). */
  project?: ProjectSimulation;
}

export type AssumptionValidation = { ok: true; assumption: DeclaredAssumption } | { ok: false; reason: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Hojas de SIZING_ASSUMPTIONS por ruta (`battery.peakDailyFraction`), en orden de declaración. */
function sizingLeaves(value: Record<string, unknown> = SIZING_ASSUMPTIONS as unknown as Record<string, unknown>, prefix = ''): [string, unknown][] {
  return Object.entries(value).flatMap(([key, v]) => (isRecord(v) ? sizingLeaves(v, `${prefix}${key}.`) : [[`${prefix}${key}`, v] as [string, unknown]]));
}
export const SIZING_ASSUMPTION_PATHS: readonly string[] = sizingLeaves().map(([path]) => path);
const SIZING_VALUES = new Map(sizingLeaves());

/** Ruta completa en SIZING_ASSUMPTIONS de una clave (también por su nombre corto si es único: `peakDailyFraction`). */
function sizingPath(key: string): string | undefined {
  if (SIZING_VALUES.has(key)) return key;
  const matches = SIZING_ASSUMPTION_PATHS.filter((path) => path.endsWith(`.${key}`));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Valida un supuesto declarado contra la lista cerrada; normaliza la clave del dimensionado a su ruta completa. */
export function validateDeclaredAssumption(input: unknown, refs: AssumptionReferences = {}): AssumptionValidation {
  if (!isRecord(input)) return { ok: false, reason: 'Un supuesto es un objeto {source, key, label, value}.' };
  const { source, key, label, value } = input;
  if (!ASSUMPTION_SOURCES.includes(source as AssumptionSource))
    return { ok: false, reason: `La fuente «${String(source)}» no está en la lista cerrada (${ASSUMPTION_SOURCES.join(', ')}).` };
  if (typeof key !== 'string' || !key) return { ok: false, reason: 'Falta la clave del supuesto.' };
  if (typeof label !== 'string' || !label.trim()) return { ok: false, reason: 'Falta la etiqueta del supuesto para el usuario.' };
  const accepted = (k: string): AssumptionValidation => ({ ok: true, assumption: { source: source as AssumptionSource, key: k, label: label.trim(), value } });
  switch (source as AssumptionSource) {
    case 'factory': {
      if (!Object.prototype.hasOwnProperty.call(NEW_PROPOSAL_DEFAULTS, key)) return { ok: false, reason: `«${key}» no es un valor de fábrica de la propuesta nueva.` };
      const truth = NEW_PROPOSAL_DEFAULTS[key as keyof typeof NEW_PROPOSAL_DEFAULTS];
      return same(truth, value) ? accepted(key) : { ok: false, reason: `${JSON.stringify(value)} no es el valor de fábrica de «${key}» (${JSON.stringify(truth)}).` };
    }
    case 'sizing': {
      const path = sizingPath(key);
      if (!path) return { ok: false, reason: `«${key}» no es un supuesto de dimensionado (${SIZING_ASSUMPTION_PATHS.join(', ')}).` };
      const truth = SIZING_VALUES.get(path);
      return same(truth, value) ? accepted(path) : { ok: false, reason: `${JSON.stringify(value)} no es el supuesto de dimensionado «${path}» (${JSON.stringify(truth)}).` };
    }
    case 'settings': {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_SIMULATION_SETTINGS, key)) return { ok: false, reason: `«${key}» no es un campo de Ajustes.` };
      // Sin los Ajustes vigentes el valor no se puede comprobar: no se acepta a ciegas (podría ser una cifra inventada).
      if (!refs.settings) return { ok: false, reason: `No se puede comprobar «${key}» sin los Ajustes vigentes: el supuesto no entra.` };
      if (!same(refs.settings[key as keyof DefaultSimulationSettings], value))
        return { ok: false, reason: `${JSON.stringify(value)} no coincide con Ajustes («${key}» vale ${JSON.stringify(refs.settings[key as keyof DefaultSimulationSettings])}).` };
      return accepted(key);
    }
    case 'proposal': {
      const tokens = parseFieldPath(key);
      if (!tokens || !findProjectField(key)) return { ok: false, reason: `«${key}» no es una ruta del registro de campos de la propuesta.` };
      // El valor tiene que ser el leído de la propuesta: sin ella, no entra.
      if (!refs.project) return { ok: false, reason: `No se puede comprobar «${key}» sin la propuesta del turno: el supuesto no entra.` };
      if (!same(readPath(refs.project, tokens), value))
        return { ok: false, reason: `${JSON.stringify(value)} no es el dato de la propuesta en «${key}» (${JSON.stringify(readPath(refs.project, tokens))}).` };
      return accepted(key);
    }
  }
}

/** Sección del registro donde vive un supuesto que cita el dimensionado y que pertenece a la propuesta. */
const PROPOSAL_SIZING_KEYS: Readonly<Record<string, string>> = {
  sizingBasis: 'specs.sizingBasis',
  targetCoveragePct: 'rates.targetCoveragePct',
};

/** Argumento de la llamada que, si viene, fija el supuesto citado: entonces es lo que pidió el usuario, no un supuesto. */
const SIZING_KEY_ARGUMENTS: Readonly<Record<string, string>> = {
  targetCoveragePct: 'coveragePct',
};

export interface SizingCitationContext {
  /** La propuesta del turno: un dato «de la propuesta» solo se declara si es el que ella guarda. */
  project?: ProjectSimulation;
  /** Argumentos de la llamada (p. ej. `size_system`). */
  args?: Record<string, unknown>;
}

/**
 * Un supuesto que cita `sizing.ts` (`SizingAssumptionUsed`) como supuesto declarado: lo de SIZING_ASSUMPTIONS con fuente
 * `sizing`; lo de la propuesta con fuente `proposal`, solo si es el valor que guarda la propuesta (sin ella no se declara);
 * una base que falta en la propuesta es la heredada (`sizing`/`legacyBasis`). Lo que vino como argumento de la llamada es
 * lo que pidió el usuario, no un supuesto; y lo que no está en la lista, nada.
 */
export function assumptionFromSizing(used: SizingAssumptionUsed, context: SizingCitationContext = {}): DeclaredAssumption | undefined {
  const argument = SIZING_KEY_ARGUMENTS[used.key];
  if (argument && context.args?.[argument] !== undefined) return undefined;
  const proposalPath = PROPOSAL_SIZING_KEYS[used.key];
  let candidate: DeclaredAssumption = { source: 'sizing', key: used.key, label: used.label, value: used.value };
  if (proposalPath) {
    if (!context.project) return undefined;
    candidate = { source: 'proposal', key: proposalPath, label: used.label, value: used.value };
    if (used.key === 'sizingBasis' && context.project.specs?.sizingBasis === undefined)
      candidate = { source: 'sizing', key: 'legacyBasis', label: used.label, value: used.value };
  }
  const result = validateDeclaredAssumption(candidate, { project: context.project });
  return result.ok ? result.assumption : undefined;
}
