import { isWriterRole } from '../../../shared/permissions';
import type { ProjectSimulation, SyncSettings } from "../../types";
import { ownsProject } from "../../store/sync/projectReconciliation";
import {
  commercialState,
  type ProposalDecision,
} from "../../../shared/proposalCommercial";
export function canEditCommercial(
  project: ProjectSimulation,
  session: SyncSettings,
) {
  return (
    !project.isDeleted &&
    project.syncStatus !== "conflict" &&
    (!session.currentUser ||
      (isWriterRole(session.currentUser.role) &&
        ownsProject(
          project,
          session.serverUrl,
          session.currentUser.organizationId,
        )))
  );
}
export function salesPerformance(
  projects: ProjectSimulation[],
  amount: (project: ProjectSimulation) => number,
) {
  const counts: Record<ProposalDecision, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    test: 0,
  };
  const sellers = new Map<
    string,
    {
      id: string;
      name: string;
      approved: number;
      rejected: number;
      pending: number;
      amountUSD: number;
    }
  >();
  for (const project of projects) {
    if (project.isDeleted) continue;
    const state = commercialState(project);
    counts[state.status]++;
    if (state.status === "test") continue;
    const id = state.ownerId || `name:${state.ownerName || "Sin responsable"}`;
    const row = sellers.get(id) || {
      id,
      name: state.ownerName || "Sin responsable",
      approved: 0,
      rejected: 0,
      pending: 0,
      amountUSD: 0,
    };
    row[state.status]++;
    if (state.status === "approved") {
      const quote = amount(project);
      if (Number.isFinite(quote)) row.amountUSD += quote;
    }
    sellers.set(id, row);
  }
  return {
    counts,
    sellers: [...sellers.values()].sort(
      (a, b) =>
        b.approved - a.approved ||
        b.amountUSD - a.amountUSD ||
        a.name.localeCompare(b.name),
    ),
  };
}
