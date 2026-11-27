/**
 * Enlaces entre cotizaciones, propuestas y clientes (docs/QUOTATION_FROM_PROPOSAL.md). Selectores puros: reciben las
 * listas del store y nunca escriben.
 */
import type { ProjectFolder } from '../../types/folder';
import type { ProjectSimulation } from '../../types';
import type { QuotationDeletionCommand, QuotationRecord } from '../../types/quotation';
import { compareQuotationsByIssueDate } from '../../utils/quotationSummary';
import { DOCUMENT_STATUS_LABELS } from '../../utils/clientSummary';

const searchKey = (value: string | undefined) => (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Ids con un borrado en cola: ya no se listan (el store las quita, esto lo asegura también para copias antiguas). */
const pendingDeletion = (queue: readonly Pick<QuotationDeletionCommand, 'id' | 'rejected'>[] | undefined) =>
  new Set((queue ?? []).filter((command) => !command.rejected).map((command) => command.id));

/** Cotizaciones creadas desde (o enlazadas a) una propuesta, por fecha de emisión descendente. */
export function quotationsFromProposal(
  quotations: readonly QuotationRecord[], projectId: string, deletionQueue?: readonly Pick<QuotationDeletionCommand, 'id' | 'rejected'>[],
): QuotationRecord[] {
  if (!projectId) return [];
  const deleted = pendingDeletion(deletionQueue);
  return quotations.filter((q) => q.sourceProjectId === projectId && !deleted.has(q.id)).sort(compareQuotationsByIssueDate);
}

/** Cotizaciones enlazadas a un cliente del directorio (`clientId`), por fecha de emisión descendente. */
export function quotationsForClient(
  quotations: readonly QuotationRecord[], clientId: string, deletionQueue?: readonly Pick<QuotationDeletionCommand, 'id' | 'rejected'>[],
): QuotationRecord[] {
  if (!clientId) return [];
  const deleted = pendingDeletion(deletionQueue);
  return quotations.filter((q) => q.clientId === clientId && !deleted.has(q.id)).sort(compareQuotationsByIssueDate);
}

/** Estado del enlace de una cotización con su propuesta de origen. */
export type SourceProposalLink =
  | { state: 'none' }
  | { state: 'available'; project: ProjectSimulation }
  | { state: 'trashed'; project: ProjectSimulation }
  | { state: 'missing' };

/** `missing`: borrada del todo, de otra organización o sin acceso (no está en este espacio de trabajo). */
export function sourceProposalLink(projects: readonly ProjectSimulation[], sourceProjectId: string | undefined): SourceProposalLink {
  if (!sourceProjectId) return { state: 'none' };
  const project = projects.find((p) => p.id === sourceProjectId);
  if (!project) return { state: 'missing' };
  return project.isDeleted ? { state: 'trashed', project } : { state: 'available', project };
}

/** Texto discreto de un enlace que ya no se puede abrir. */
export const SOURCE_PROPOSAL_NOTICES = {
  trashed: 'La propuesta de origen está en la papelera.',
  missing: 'La propuesta de origen ya no está disponible (eliminada o sin acceso).',
} as const;

/** Nombre visible de una propuesta. */
export const proposalName = (project: ProjectSimulation): string => project.client.name?.trim() || 'Propuesta sin nombre';

/** Metadatos de una propuesta en las listas: estado del documento, código y carpeta. */
export function proposalMeta(project: ProjectSimulation, folders: readonly ProjectFolder[]): string {
  const folder = project.folderId ? folders.find((f) => f.id === project.folderId) : undefined;
  return [
    DOCUMENT_STATUS_LABELS[project.status] ?? project.status,
    project.client.projectId?.trim() || null,
    folder ? `carpeta ${folder.name}` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Propuestas que se pueden convertir: las del espacio de trabajo fuera de la papelera, por actualización descendente.
 * La búsqueda (sin mayúsculas ni acentos) mira el cliente, la empresa, el código, el número de cotización y la carpeta.
 */
export function convertibleProposals(projects: readonly ProjectSimulation[], folders: readonly ProjectFolder[], query = ''): ProjectSimulation[] {
  const key = searchKey(query);
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  return projects
    .filter((p) => !p.isDeleted)
    .filter((p) => !key || [p.client.name, p.client.company, p.client.projectId, p.client.quoteNumber, p.folderId ? folderName.get(p.folderId) : '']
      .some((field) => searchKey(field).includes(key)))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/**
 * Propuesta de origen de una cotización, para el selector del editor: devuelve la misma referencia mientras esa
 * propuesta no cambie, así editar otra propuesta no vuelve a pintar el editor (no se suscribe a toda la lista).
 */
export const selectSourceProject = (state: { projects: readonly ProjectSimulation[] }, sourceProjectId: string | undefined): ProjectSimulation | undefined =>
  sourceProjectId ? state.projects.find((p) => p.id === sourceProjectId) : undefined;

/** Opciones de «Enlazar propuesta…»: se calculan solo al abrir o enfocar el selector. */
export function sourceProposalOptions(projects: readonly ProjectSimulation[], folders: readonly ProjectFolder[]): { id: string; label: string }[] {
  return convertibleProposals(projects, folders).map((project) => ({ id: project.id, label: `${proposalName(project)} · ${proposalMeta(project, folders)}` }));
}
