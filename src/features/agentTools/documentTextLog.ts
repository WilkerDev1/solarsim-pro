// Registro legible de los cambios de textos del documento (puro): lo usan la herramienta, la tarjeta del chat y el anuncio.
import type { AgentChange } from '../../store/slices/agentSlice';

/** Propuesta afectada por un cambio, fijada al aplicarlo (la abierta puede cambiar después). */
export interface ChangeSubject { proposalId: string; label: string; outsideOpen: boolean }

const MAX_SUMMARY = 120;

/** Una línea sin saltos ni espacios repetidos, recortada con «…»; vacío se marca. */
export function condenseText(text: string, max = MAX_SUMMARY): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '(vacío)';
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const quoted = (text: string) => (text.trim() ? `«${condenseText(text)}»` : condenseText(text));

export const textChangeSummary = (before: string, after: string): string => `${quoted(before)} → ${quoted(after)}`;

export interface TextChangeRow { label: string; before: string; after: string; reset?: boolean }

export const textChangeRows = (rows: readonly TextChangeRow[]): AgentChange[] =>
  rows.map((r) => ({ label: r.label, value: `${textChangeSummary(r.before, r.after)}${r.reset ? ' (predeterminado)' : ''}` }));

export function proposalSubject(project: { id: string; client: { name: string; projectId?: string } }, activeProjectId?: string | null): ChangeSubject {
  const id = project.client.projectId?.trim();
  return { proposalId: project.id, label: id ? `${id} · ${project.client.name}` : project.client.name, outsideOpen: project.id !== activeProjectId };
}

export const subjectHeadline = (subject: ChangeSubject): string =>
  subject.outsideOpen ? `Cambio en otra propuesta: ${subject.label}` : `Propuesta: ${subject.label}`;

/** Anuncio de las actividades con esos ids (un turno del chat o una confirmación manual). */
export const announceActivities = (ids: readonly string[], activity: readonly { id: string; title: string; subject?: ChangeSubject; changes: readonly AgentChange[] }[]): string =>
  announceAppliedChanges(activity.filter((a) => ids.includes(a.id)));

/** Texto para el anuncio (aria-live) de los cambios de textos recién aplicados; vacío si ninguno lleva propuesta. */
export function announceAppliedChanges(entries: readonly { title: string; subject?: ChangeSubject; changes: readonly AgentChange[] }[]): string {
  return entries
    .filter((e) => e.subject)
    .map((e) => {
      const s = e.subject!;
      const head = s.outsideOpen ? `Cambio aplicado en otra propuesta: ${s.label}.` : `Cambio aplicado en ${s.label}.`;
      const shown = e.changes.slice(0, 4).map((c) => `${c.label}: ${c.value}`).join('. ');
      return `${head} ${shown}${e.changes.length > 4 ? `. Y ${e.changes.length - 4} más` : ''}. Puedes deshacerlo.`;
    })
    .join(' ');
}
