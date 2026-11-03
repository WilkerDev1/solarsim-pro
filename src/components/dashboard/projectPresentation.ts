import { ProjectSimulation } from '../../types';
import { canonicalProposalDate } from '../../../shared/proposalDates';

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

/** Misma regla que la API (shared/proposalDates.ts): lo que la API no aceptaría tampoco se muestra. */
function stamp(kind: ProjectDateKind, raw: unknown): ProjectDateStamp | null {
  const iso = canonicalProposalDate(raw);
  return iso ? { kind, iso, text: new Date(iso).toLocaleDateString('es-DO') } : null;
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
