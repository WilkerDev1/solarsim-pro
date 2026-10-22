import { clientNameKey, normalizeTaxId, type ClientKind } from '../../shared/clients';
import type { ProposalDecision } from '../../shared/proposalCommercial';
import { salesPerformance } from '../features/proposals/commercial';
import type { ProjectSimulation } from '../types';
import type { ClientRecord } from '../types/client';

export const DOCUMENT_STATUS_LABELS: Record<ProjectSimulation['status'], string> = {
  Draft: 'Borrador',
  Final: 'Final',
  Archived: 'Archivada',
};

export interface ClientSummary {
  total: number;
  documents: Record<ProjectSimulation['status'], number>;
  decisions: Record<ProposalDecision, number>;
  /** Contract price of approved proposals (tests excluded), as in the sales summary. */
  approvedAmountUSD: number;
  lastActivityAt: string | null;
}

const activity = (project: ProjectSimulation) => project.updatedAt || project.lastModifiedAt || project.createdAt || '';

/** Proposals linked to a client, newest first; trash is excluded. */
export function clientProposals(projects: readonly ProjectSimulation[], clientId: string): ProjectSimulation[] {
  return projects
    .filter((p) => !p.isDeleted && p.clientId === clientId)
    .sort((a, b) => activity(b).localeCompare(activity(a)));
}

export function summarizeClient(
  projects: readonly ProjectSimulation[],
  clientId: string,
  amount: (project: ProjectSimulation) => number,
): ClientSummary {
  const linked = clientProposals(projects, clientId);
  const documents = { Draft: 0, Final: 0, Archived: 0 };
  for (const project of linked) documents[project.status in documents ? project.status : 'Draft']++;
  const { counts, sellers } = salesPerformance(linked, amount);
  return {
    total: linked.length,
    documents,
    decisions: counts,
    approvedAmountUSD: sellers.reduce((sum, seller) => sum + seller.amountUSD, 0),
    lastActivityAt: linked.length ? activity(linked[0]) || null : null,
  };
}

/** Number of active proposals per linked client id. */
export function linkedProposalCounts(projects: readonly ProjectSimulation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const project of projects)
    if (!project.isDeleted && project.clientId) counts.set(project.clientId, (counts.get(project.clientId) ?? 0) + 1);
  return counts;
}

/** Search by name, tax id, phone or email; sorted by name ignoring case and accents. */
export function filterClients(
  clients: readonly ClientRecord[],
  query: string,
  kind: ClientKind | 'all',
): ClientRecord[] {
  const text = clientNameKey(query);
  const taxId = normalizeTaxId(query);
  return clients
    .filter((client) => kind === 'all' || client.kind === kind)
    .filter((client) =>
      !query.trim() ||
      (text && clientNameKey(`${client.name} ${client.email} ${client.phone}`).includes(text)) ||
      (taxId && normalizeTaxId(client.taxId).includes(taxId)),
    )
    .sort((a, b) => clientNameKey(a.name).localeCompare(clientNameKey(b.name)) || a.id.localeCompare(b.id));
}
