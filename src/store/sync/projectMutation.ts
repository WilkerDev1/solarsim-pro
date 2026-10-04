import { ProjectSimulation, SyncSettings } from '../../types';
import { ownsProject } from './projectReconciliation';

/** A local edit keeps the last confirmed server revision, not a guessed next one. */
export function projectMutationMetadata(project: ProjectSimulation, session: SyncSettings): Pick<ProjectSimulation, 'syncStatus' | 'baseVersion'> {
  const owned = session.currentUser && ownsProject(project, session.serverUrl, session.currentUser.organizationId);
  return { syncStatus: owned ? 'pending' : 'local_only', baseVersion: project.baseVersion ?? project.version ?? 1 };
}

export function restoreProjectContent(current: ProjectSimulation, snapshot: ProjectSimulation, session: SyncSettings): ProjectSimulation {
  return { ...current, client: snapshot.client, specs: snapshot.specs, rates: snapshot.rates,
    financials: snapshot.financials, monthlyConsumption: snapshot.monthlyConsumption,
    customization: snapshot.customization, status: snapshot.status,
    ...projectMutationMetadata(current, session), updatedAt: new Date().toISOString() };
}
