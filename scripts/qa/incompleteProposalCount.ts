// Recuento de SOLO LECTURA (F7a): cuántas propuestas guardadas pasarían a «Incompleta» con las reglas de F2b y por qué motivo, más
// cuántos espacios de trabajo conservan guardado el margen de fábrica anterior (28 %). Es la medición que el ADR 0009 deja al dueño
// («No está medido cuántas son»): sirve para decidir si alguna regla se relaja (el 0 heredado, el inversor con cantidad 0) y para
// las notas de la 2.11.0.
//
// Aquí solo hay lógica pura sobre JSON ya leído (la prueba la usa con fixtures sintéticos): no abre archivos, ni el almacén de la app,
// ni la red. El script `countIncompleteProposals.ts` es quien lee los archivos que le pasa la persona.
//
// La regla es la de producción (`proposalCompleteness`) sobre las propuestas tal como las dejaría la hidratación (`migrateLegacySpecs`),
// no una copia. Lo que sí es de este archivo es agrupar y desglosar: el desglose del motivo «precio de equipo» (un 0 sin procedencia
// frente a un equipo sin precio) se lee del texto del motivo, y la prueba lo fija con fixtures por si ese texto cambia.
import { proposalCompleteness, type IncompleteReasonCode } from '../../src/domain/proposalCompleteness';
import { PREVIOUS_DEFAULT_TARGET_MARGIN_PCT, DEFAULT_TARGET_MARGIN_PCT } from '../../src/store/defaultSimulationSettings';
import { migrateLegacySpecs, readEquipment } from '../../shared/equipment';
import { commercialState } from '../../shared/proposalCommercial';
import type { ProjectSimulation } from '../../src/types';

/**
 * Desde esta fecha el dock marca `priceSource: 'manual'` al escribir un costo a mano (d73c119, 2.9.0; ADR 0009). Un 0 guardado ANTES
 * no lleva procedencia aunque lo haya tecleado la persona a propósito: son los candidatos a «tratar como dado» si el dueño relaja la regla.
 */
export const MANUAL_PRICE_SOURCE_SINCE = '2026-11-21';
/** Ejemplos antiguos que la hidratación borra del estado guardado (`hydrateSimulationStore`): no son propuestas del usuario. */
const LEGACY_EXAMPLE_IDS = new Set(['benchmark-centro-medico', 'proj-logistics-hub', 'proj-residential-42']);

export type ExportFormat = 'persisted_state' | 'state' | 'projects_backup' | 'single_project' | 'array' | 'unknown';
export interface ExportedWorkspace {
  /** `activo` o la clave del espacio archivado (servidor::organización; sin datos personales). */
  scope: string;
  projects: ProjectSimulation[];
  /** Ajustes guardados de ese espacio (solo el estado guardado local los lleva; un respaldo de proyectos no). */
  settings?: { defaultTargetMarginPct?: number };
}
export interface ExportedProjects {
  format: ExportFormat;
  /** Propuestas y ajustes del espacio ACTIVO. */
  projects: ProjectSimulation[];
  settings?: { defaultTargetMarginPct?: number };
  /** El activo y, en el estado guardado, los espacios archivados (`organizationWorkspaces`: local u organización). */
  workspaces: ExportedWorkspace[];
}
export interface ExportedFile {
  name: string;
  json: unknown;
  /** Margen leído a mano en Ajustes → Costos y margen, para un respaldo que no lleva los ajustes. */
  margin?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Lo mismo que acepta el importador de la app (`importProjectsFromJSON`). */
const isProject = (value: unknown): value is ProjectSimulation => isRecord(value) && isRecord(value.client) && isRecord(value.specs) && isRecord(value.rates);
const settingsOf = (value: unknown): ExportedProjects['settings'] => {
  if (!isRecord(value) || !isRecord(value.defaultSimulationSettings)) return undefined;
  const margin = value.defaultSimulationSettings.defaultTargetMarginPct;
  return typeof margin === 'number' ? { defaultTargetMarginPct: margin } : {};
};

/**
 * Reconoce lo que puede traer un archivo: el estado guardado local (`{ state: { projects, defaultSimulationSettings }, version }`,
 * la clave `solarsim-pro-storage` del almacenamiento del navegador), el respaldo de Ajustes → Respaldo & Exportación
 * (`{ type: 'projects_backup', projects }`), la exportación de una propuesta (`{ type: 'single_project', project }`), una lista o
 * una propuesta suelta.
 */
export function readExportedProjects(json: unknown): ExportedProjects {
  const keep = (list: unknown[]) => list.filter(isProject);
  const one = (format: ExportFormat, projects: ProjectSimulation[], settings?: ExportedProjects['settings']): ExportedProjects =>
    ({ format, projects, ...(settings ? { settings } : {}), workspaces: projects.length || format !== 'unknown' ? [{ scope: 'activo', projects, ...(settings ? { settings } : {}) }] : [] });
  if (Array.isArray(json)) return one('array', keep(json));
  if (!isRecord(json)) return one('unknown', []);
  if (isRecord(json.state) && Array.isArray(json.state.projects)) {
    const active = one('persisted_state', keep(json.state.projects), settingsOf(json.state));
    // Los otros espacios de trabajo (local u organización) se archivan en `organizationWorkspaces` con sus propuestas y ajustes.
    const archive = isRecord(json.state.organizationWorkspaces) ? json.state.organizationWorkspaces : {};
    for (const [scope, space] of Object.entries(archive)) {
      if (!isRecord(space) || !Array.isArray(space.projects)) continue;
      active.workspaces.push({ scope, projects: keep(space.projects), ...(settingsOf(space) ? { settings: settingsOf(space) } : {}) });
    }
    return active;
  }
  if (json.type === 'projects_backup' && Array.isArray(json.projects)) return one('projects_backup', keep(json.projects));
  if (isRecord(json.project) && isProject(json.project)) return one('single_project', [json.project]);
  if (Array.isArray(json.projects)) return one('state', keep(json.projects), settingsOf(json));
  if (isProject(json)) return one('single_project', [json]);
  return one('unknown', []);
}

export interface IncompleteDetail { file: string; code: string; reasons: IncompleteReasonCode[]; decision: string }
export interface IncompleteCountReport {
  files: number;
  /** Archivos de los que no se pudo sacar ninguna propuesta. */
  unreadable: string[];
  /** Propuestas evaluadas (vivas, sin los ejemplos antiguos). */
  evaluated: number;
  complete: number;
  incomplete: number;
  skipped: { trashed: number; legacyExample: number };
  /** Propuestas con cada motivo (una propuesta puede tener varios). */
  byReason: Record<IncompleteReasonCode, number>;
  /** Desglose del motivo «precio de equipo». */
  priceDetail: {
    /** Con un equipo en 0 sin procedencia (heredado, o tecleado antes de 2.9.0). */
    zeroWithoutOrigin: number;
    /** Con un equipo sin precio (campo vacío). */
    missing: number;
    /** De los ceros: guardados antes de `MANUAL_PRICE_SOURCE_SINCE`, desde esa fecha y sin fecha. */
    zeroSavedBefore: number;
    zeroSavedOnOrAfter: number;
    zeroNoDate: number;
  };
  /** Incompletas SOLO por uno o más ceros sin procedencia: las que se arreglan si el dueño relaja esa regla. */
  onlyZeroWithoutOrigin: number;
  /** Incompletas porque el inversor tiene potencia pero cantidad 0 (una «ampliación»; decisión pendiente del dueño). */
  inverterCountZero: number;
  /** Decisión comercial de las incompletas. */
  byDecision: { pending: number; approved: number; rejected: number };
  /** Espacios de trabajo (el activo de cada archivo y los archivados en `organizationWorkspaces`) según el margen bruto objetivo que guardan. */
  margin: { installations: number; saved28: number; saved40: number; other: number; unknown: number };
  details: IncompleteDetail[];
}

const REASON_CODES: IncompleteReasonCode[] = ['missing_consumption', 'missing_panel', 'missing_inverter', 'missing_energy_price', 'missing_equipment_price'];

export function countIncompleteProposals(files: readonly ExportedFile[], options: { detail?: boolean } = {}): IncompleteCountReport {
  const report: IncompleteCountReport = {
    files: files.length, unreadable: [], evaluated: 0, complete: 0, incomplete: 0, skipped: { trashed: 0, legacyExample: 0 },
    byReason: Object.fromEntries(REASON_CODES.map((code) => [code, 0])) as Record<IncompleteReasonCode, number>,
    priceDetail: { zeroWithoutOrigin: 0, missing: 0, zeroSavedBefore: 0, zeroSavedOnOrAfter: 0, zeroNoDate: 0 },
    onlyZeroWithoutOrigin: 0, inverterCountZero: 0, byDecision: { pending: 0, approved: 0, rejected: 0 },
    margin: { installations: 0, saved28: 0, saved40: 0, other: 0, unknown: 0 }, details: [],
  };
  for (const file of files) {
    const exported = readExportedProjects(file.json);
    if (exported.format === 'unknown') { report.unreadable.push(file.name); continue; }
    const seen = new Set<string>();
    for (const [index, space] of exported.workspaces.entries()) {
      // El margen se mira por espacio de trabajo: el activo puede llevar uno y el de una organización otro.
      const saved = space.settings?.defaultTargetMarginPct ?? (index === 0 ? file.margin : undefined);
      report.margin.installations++;
      if (saved === undefined) report.margin.unknown++;
      else if (saved === PREVIOUS_DEFAULT_TARGET_MARGIN_PCT) report.margin.saved28++;
      else if (saved === DEFAULT_TARGET_MARGIN_PCT) report.margin.saved40++;
      else report.margin.other++;

      for (const stored of space.projects) {
        if (seen.has(stored.id)) continue; // la misma propuesta archivada en dos espacios no se cuenta dos veces
        seen.add(stored.id);
        if (stored.isDeleted || stored.deletedAt) { report.skipped.trashed++; continue; }
        if (LEGACY_EXAMPLE_IDS.has(stored.id)) { report.skipped.legacyExample++; continue; }
        // Como la hidratación: los equipos heredados pasan a grupos antes de mirar nada.
        const project: ProjectSimulation = { ...stored, specs: migrateLegacySpecs(stored.specs) };
        report.evaluated++;
        const { incomplete, reasons } = proposalCompleteness(project);
        if (!incomplete) { report.complete++; continue; }
        report.incomplete++;
        const codes = [...new Set(reasons.map((r) => r.code))];
        for (const code of codes) report.byReason[code]++;
        const status = commercialState(project).status;
        if (status === 'approved') report.byDecision.approved++;
        else if (status === 'rejected') report.byDecision.rejected++;
        else report.byDecision.pending++;

        const price = reasons.find((r) => r.code === 'missing_equipment_price');
        if (price) {
          const zero = /está en 0 sin confirmar/.test(price.message);
          const missing = /Falta el precio de/.test(price.message);
          if (zero) {
            report.priceDetail.zeroWithoutOrigin++;
            const saved = typeof project.updatedAt === 'string' && project.updatedAt ? project.updatedAt.slice(0, 10) : '';
            if (!saved) report.priceDetail.zeroNoDate++;
            else if (saved < MANUAL_PRICE_SOURCE_SINCE) report.priceDetail.zeroSavedBefore++;
            else report.priceDetail.zeroSavedOnOrAfter++;
          }
          if (missing) report.priceDetail.missing++;
          if (zero && !missing && codes.length === 1) report.onlyZeroWithoutOrigin++;
        }
        if (codes.includes('missing_inverter') && readEquipment(project.specs).inverters.some((g) => (g.powerKW ?? 0) > 0 && g.count === 0)) report.inverterCountZero++;
        if (options.detail) report.details.push({ file: file.name, code: project.client.projectId || project.id, reasons: codes, decision: status });
      }
    }
  }
  return report;
}

// ── Informe ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const pct = (part: number, total: number) => (total ? ` (${((part / total) * 100).toFixed(1).replace('.', ',')} %)` : '');

export function formatIncompleteCount(report: IncompleteCountReport, options: { detail?: boolean } = {}): string {
  const r = report;
  const lines = [
    'Propuestas guardadas que pasarían a «Incompleta» con las reglas de F2b (solo lectura)',
    `Archivos: ${r.files}${r.unreadable.length ? ` (sin propuestas legibles: ${r.unreadable.join(', ')})` : ''}.`,
    `Evaluadas: ${r.evaluated} (sin contar ${r.skipped.trashed} en papelera ni ${r.skipped.legacyExample} ejemplos antiguos).`,
    '',
    `Incompletas: ${r.incomplete} de ${r.evaluated}${pct(r.incomplete, r.evaluated)}. Completas: ${r.complete}.`,
    '',
    'Por motivo (una propuesta puede tener varios):',
    `  Consumo: ${r.byReason.missing_consumption}`,
    `  Panel sin potencia o cantidad: ${r.byReason.missing_panel}`,
    `  Inversor sin potencia o cantidad: ${r.byReason.missing_inverter}${r.inverterCountZero ? ` (${r.inverterCountZero} con el inversor en cantidad 0: ampliaciones sobre un inversor del cliente)` : ''}`,
    `  Precio de la energía: ${r.byReason.missing_energy_price}`,
    `  Precio de equipo: ${r.byReason.missing_equipment_price}`,
    `    con un equipo en 0 sin procedencia (heredado): ${r.priceDetail.zeroWithoutOrigin}`
      + ` — con último guardado antes del ${MANUAL_PRICE_SOURCE_SINCE}: ${r.priceDetail.zeroSavedBefore}, desde esa fecha: ${r.priceDetail.zeroSavedOnOrAfter}, sin fecha: ${r.priceDetail.zeroNoDate}`,
    '      (la fecha es la del último guardado: cota inferior del 0 heredado, no la de cuando se tecleó)',
    `    con un equipo sin precio: ${r.priceDetail.missing}`,
    `  Incompletas solo por un cero heredado (las que arreglaría relajar esa regla): ${r.onlyZeroWithoutOrigin}`,
    '',
    `Decisión comercial de las incompletas: ${r.byDecision.pending} pendientes, ${r.byDecision.approved} aprobadas, ${r.byDecision.rejected} rechazadas.`,
    '',
    `Margen bruto objetivo guardado (${r.margin.installations} ${r.margin.installations === 1 ? 'espacio de trabajo' : 'espacios de trabajo'}; el activo y los archivados): ${r.margin.saved28} con 28 % (el de fábrica anterior; las propuestas nuevas nacen con 1,28),`
      + ` ${r.margin.saved40} con 40 %, ${r.margin.other} con otro valor, ${r.margin.unknown} sin dato.`,
  ];
  if (r.margin.unknown) lines.push('  «Sin dato»: un respaldo de proyectos no lleva los ajustes; léelo en Ajustes → Costos y margen y pásalo con --margin <pct>, o usa el estado guardado local.');
  if (options.detail && r.details.length) {
    lines.push('', 'Detalle (código de la propuesta, motivos, decisión; sin nombres de clientes):');
    for (const d of r.details) lines.push(`  ${d.code}  ${d.reasons.join(', ')}  [${d.decision}]  (${d.file})`);
  }
  return lines.join('\n');
}

// ── Argumentos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type ParsedCountArgs =
  | { ok: true; files: string[]; margin?: number; detail: boolean; json: boolean }
  | { ok: false; error: string };

export function parseCountArgs(argv: readonly string[]): ParsedCountArgs {
  const files: string[] = [];
  let margin: number | undefined;
  let detail = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--margin') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) return { ok: false, error: '--margin necesita un porcentaje (por ejemplo 28), el que muestra Ajustes → Costos y margen.' };
      margin = value;
    } else if (arg === '--detail') detail = true;
    else if (arg === '--json') json = true;
    else if (arg.startsWith('--')) return { ok: false, error: `Argumento no reconocido: ${arg}` };
    else files.push(arg);
  }
  if (!files.length) return { ok: false, error: 'Indica al menos un archivo JSON (un respaldo de Ajustes o el estado guardado local).' };
  return { ok: true, files, ...(margin === undefined ? {} : { margin }), detail, json };
}
