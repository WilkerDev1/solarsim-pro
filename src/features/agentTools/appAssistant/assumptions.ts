/**
 * Supuestos que el asistente de la app puede declarar (F3c, capa 3 de sus instrucciones). Puro.
 *
 * Lista CERRADA de fuentes: un supuesto solo puede salir de
 *  - `settings`: los Ajustes del usuario (`DefaultSimulationSettings`), que siembran las propuestas nuevas;
 *  - `factory`: los valores de fábrica de una propuesta nueva sin datos (`NEW_PROPOSAL_DEFAULTS`, ADR 0009);
 *  - `sizing`: los supuestos del dimensionado (`SIZING_ASSUMPTIONS`, `src/domain/sizing.ts`);
 *  - `proposal`: un dato de la propia propuesta, por su ruta del registro de campos (`projectFields.ts`).
 * Nada más («lo habitual», «según mi experiencia», un precio de internet): eso no es un supuesto, es una cifra inventada.
 * La validación comprueba la clave contra la fuente y, cuando la fuente es una constante, que el valor sea el de verdad.
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
  /** Ajustes vigentes: si se dan, el valor declarado debe coincidir. */
  settings?: DefaultSimulationSettings;
  /** La propuesta: si se da, el valor declarado debe ser el suyo. */
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
      if (refs.settings && !same(refs.settings[key as keyof DefaultSimulationSettings], value))
        return { ok: false, reason: `${JSON.stringify(value)} no coincide con Ajustes («${key}» vale ${JSON.stringify(refs.settings[key as keyof DefaultSimulationSettings])}).` };
      return accepted(key);
    }
    case 'proposal': {
      const tokens = parseFieldPath(key);
      if (!tokens || !findProjectField(key)) return { ok: false, reason: `«${key}» no es una ruta del registro de campos de la propuesta.` };
      if (refs.project && !same(readPath(refs.project, tokens), value))
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

/**
 * Un supuesto que cita `sizing.ts` (`SizingAssumptionUsed`) como supuesto declarado: lo de SIZING_ASSUMPTIONS con fuente
 * `sizing`, lo de la propuesta con fuente `proposal`; lo que no está en la lista, nada.
 */
export function assumptionFromSizing(used: SizingAssumptionUsed): DeclaredAssumption | undefined {
  const proposalPath = PROPOSAL_SIZING_KEYS[used.key];
  const candidate: DeclaredAssumption = proposalPath
    ? { source: 'proposal', key: proposalPath, label: used.label, value: used.value }
    : { source: 'sizing', key: used.key, label: used.label, value: used.value };
  const result = validateDeclaredAssumption(candidate);
  return result.ok ? result.assumption : undefined;
}
