import { ProjectSimulation } from '../../types';

export function projectType(project: ProjectSimulation): string {
  if (project.rates.isZeroExport) return 'Inyección cero';
  return project.specs.hasBattery ? 'Híbrido' : 'Inyección';
}

export function projectSyncLabel(project: ProjectSimulation): string {
  switch (project.syncStatus) {
    case 'synced': return 'Sincronizado';
    case 'pending': return 'Pendiente';
    case 'conflict': return 'En conflicto';
    default: return 'Solo local';
  }
}

export type ProjectDateKind = 'created' | 'updated';
export interface ProjectDateStamp {
  kind: ProjectDateKind;
  /** Valor original, para `<time dateTime>`. */
  iso: string;
  /** Día en formato es-DO (d/m/aaaa). */
  text: string;
}
export type ProjectDateLabels = 'long' | 'short';

const DATE_LABELS: Record<ProjectDateLabels, Record<ProjectDateKind, string>> = {
  long: { created: 'Creada', updated: 'Actualizada' },
  short: { created: 'Creada', updated: 'Act.' },
};

export function projectDateLabel(kind: ProjectDateKind, labels: ProjectDateLabels = 'long'): string {
  return DATE_LABELS[labels][kind];
}

/** `Date` normaliza fechas imposibles (2026-02-30 → 2 de marzo); se rechazan antes de mostrarlas. */
function isCalendarDate(value: string): boolean {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!ymd) return true;
  const [year, month, day] = ymd.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function stamp(kind: ProjectDateKind, value: unknown): ProjectDateStamp | null {
  if (typeof value !== 'string' || !value.trim() || !isCalendarDate(value)) return null;
  // "2026-10-12" sin hora es ese día local; `new Date` lo leería como medianoche UTC (el día anterior en RD).
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : { kind, iso: value, text: date.toLocaleDateString('es-DO') };
}

/** Creación y última actualización de una propuesta, en ese orden; omite la que falte o no sea una fecha válida. */
export function projectDateStamps(project: Pick<ProjectSimulation, 'createdAt' | 'updatedAt'>): ProjectDateStamp[] {
  return [stamp('created', project.createdAt), stamp('updated', project.updatedAt)].filter((s): s is ProjectDateStamp => s !== null);
}

/** Una sola fecha de la propuesta (para columnas separadas); "—" si falta o no es válida. */
export function projectDateText(project: Pick<ProjectSimulation, 'createdAt' | 'updatedAt'>, kind: ProjectDateKind): string {
  return projectDateStamps(project).find((s) => s.kind === kind)?.text ?? '—';
}

/** "Creada 12/10/2026 · Actualizada 2/11/2026" (`short`: "Act."); "Sin fecha" si ninguna es válida. */
export function projectDateSummary(project: Pick<ProjectSimulation, 'createdAt' | 'updatedAt'>, labels: ProjectDateLabels = 'long'): string {
  const stamps = projectDateStamps(project);
  return stamps.length ? stamps.map((s) => `${projectDateLabel(s.kind, labels)} ${s.text}`).join(' · ') : 'Sin fecha';
}
