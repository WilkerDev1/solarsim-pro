import { ProjectSimulation } from '../../types';
import { SyncPushOutcome } from '../../services/syncService';

export function ownsProject(project: ProjectSimulation, serverUrl: string, organizationId: string): boolean {
  return project.organizationId === organizationId && (!project.syncServerUrl || project.syncServerUrl === serverUrl.trim().replace(/\/+$/, ''));
}

export function reconcilePulledProjects(local: ProjectSimulation[], remote: ProjectSimulation[], deletedIds: string[], pendingDeletions: Set<string>, serverUrl: string, organizationId: string): ProjectSimulation[] {
  serverUrl = serverUrl.trim().replace(/\/+$/, '');
  const remoteMap = new Map(remote.map((project) => [project.id, project]));
  const deleted = new Set(deletedIds);
  const next: ProjectSimulation[] = [];
  for (const project of local) {
    const server = remoteMap.get(project.id);
    if (pendingDeletions.has(project.id)) { remoteMap.delete(project.id); continue; }
    if (deleted.has(project.id) && ownsProject(project, serverUrl, organizationId)) { remoteMap.delete(project.id); continue; }
    if (!server || (project.organizationId && !ownsProject(project, serverUrl, organizationId))) { next.push(project); continue; }
    remoteMap.delete(project.id);
    if (!project.organizationId && project.syncStatus !== 'synced') {
      // An unscoped local document cannot be claimed by the active tenant.
      next.push(project);
      continue;
    }
    if (project.syncStatus === 'pending' || project.syncStatus === 'conflict') {
      next.push({ ...project, organizationId, syncServerUrl: serverUrl, baseVersion: project.baseVersion ?? project.version ?? 1 });
    } else {
      next.push({ ...server, organizationId, syncServerUrl: serverUrl, baseVersion: server.version ?? 1, folderId: project.folderId ?? server.folderId, syncStatus: 'synced' });
    }
  }
  for (const project of remoteMap.values()) {
    if (!pendingDeletions.has(project.id) && !deleted.has(project.id) && !next.some((item) => item.id === project.id)) next.unshift({ ...project, organizationId, syncServerUrl: serverUrl, baseVersion: project.version ?? 1, syncStatus: 'synced' });
  }
  return next;
}

export function acknowledgeProjectPush(fresh: ProjectSimulation[], sent: ProjectSimulation[], outcomes: SyncPushOutcome[], serverUrl: string, organizationId: string) {
  serverUrl = serverUrl.trim().replace(/\/+$/, '');
  const sentMap = new Map(sent.map((project) => [project.id, project]));
  const results = new Map(outcomes.map((outcome) => [outcome.originalId || outcome.id, outcome]));
  const idChanges: Record<string, string> = {};
  const conflicts: Array<{ local: ProjectSimulation; result: Extract<SyncPushOutcome, { status: 'conflict' }> }> = [];
  const projects = fresh.map((project): ProjectSimulation => {
    const result = results.get(project.id);
    const captured = sentMap.get(project.id);
    if (!result || !captured) return project;
    if (result.status === 'conflict') {
      conflicts.push({ local: project, result });
      return { ...project, syncStatus: 'conflict' };
    }
    idChanges[project.id] = result.id;
    // Identity of immutable documents detects changes even within one millisecond.
    if (project !== captured) return { ...project, id: result.id, organizationId, syncServerUrl: serverUrl, version: result.version, baseVersion: result.version, syncStatus: 'pending' };
    return { ...project, ...result.project, id: result.id, organizationId, syncServerUrl: serverUrl, folderId: project.folderId, version: result.version, baseVersion: result.version, syncStatus: 'synced' };
  });
  return { projects, idChanges, conflicts };
}
