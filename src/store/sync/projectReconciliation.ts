import { ProjectSimulation } from '../../types';
import { projectDifferences } from './projectDifferences';
import { SyncPushOutcome } from '../../services/syncService';

export function ownsProject(project: ProjectSimulation, serverUrl: string, organizationId: string): boolean {
  return project.organizationId === organizationId && (!project.syncServerUrl || project.syncServerUrl === serverUrl.trim().replace(/\/+$/, ''));
}

export function reconcilePulledProjects(local: ProjectSimulation[], remote: ProjectSimulation[], deletedIds: string[], pendingDeletions: Set<string>, serverUrl: string, organizationId: string): ProjectSimulation[] {
  serverUrl = serverUrl.trim().replace(/\/+$/, '');
  const remoteMap = new Map(remote.map((project) => [project.id, project]));
  const deleted = new Set(deletedIds);
  const next: ProjectSimulation[] = [];
  for (let project of local) {
    const server = remoteMap.get(project.id);
    if (pendingDeletions.has(project.id)) { remoteMap.delete(project.id); continue; }
    if (deleted.has(project.id) && ownsProject(project, serverUrl, organizationId)) {
      remoteMap.delete(project.id);
      // A teammate's purge cannot discard unconfirmed local work.
      if (project.syncStatus === 'pending' || project.syncStatus === 'conflict') next.push({ ...project, syncStatus: 'conflict' });
      continue;
    }
    if (!server || (project.organizationId && !ownsProject(project, serverUrl, organizationId))) { next.push(project); continue; }
    remoteMap.delete(project.id);
    if (project.pendingCanonicalAck && (!Number.isSafeInteger(server.version) || server.version! < project.pendingCanonicalAck.version)) { next.push(project); continue; }
    if (project.pendingCanonicalAck) project = { ...project, pendingCanonicalAck: undefined };
    if (!project.organizationId && project.syncStatus !== 'synced') {
      // An unscoped local document cannot be claimed by the active tenant.
      next.push(project);
      continue;
    }
    if ((project.syncStatus === 'pending' || project.syncStatus === 'conflict') && ownsProject(project, serverUrl, organizationId) && Number.isSafeInteger(server.version) && server.version! >= (project.baseVersion ?? 0) && projectDifferences(server, project).length === 0) {
      // A lost/legacy ACK is recoverable only after an authoritative, identical read.
      next.push({ ...server, organizationId, syncServerUrl: serverUrl, baseVersion: server.version, folderId: project.folderId ?? server.folderId, syncStatus: 'synced' });
    } else if (project.syncStatus === 'pending' || project.syncStatus === 'conflict') {
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
      const conflicted = { ...project, id: result.id, baseVersion: result.originalId && result.id !== project.id ? result.localVersion ?? 0 : project.baseVersion, syncStatus: 'conflict' as const };
      idChanges[project.id] = result.id;
      conflicts.push({ local: conflicted, result });
      return conflicted;
    }
    idChanges[project.id] = result.id;
    if (result.awaitingConfirmation) {
      const { forceNewVersion, forceOverwrite, ...content } = project as ProjectSimulation & { forceNewVersion?: boolean; forceOverwrite?: boolean };
      return { ...content, id: result.id, organizationId, syncServerUrl: serverUrl, version: result.version, baseVersion: result.version, pendingCanonicalAck: { version: result.version }, syncStatus: 'pending' };
    }
    // Identity of immutable documents detects changes even within one millisecond.
    if (project !== captured) return { ...project, id: result.id, organizationId, syncServerUrl: serverUrl, version: result.version, baseVersion: result.version, syncStatus: 'pending' };
    return { ...project, ...result.project, id: result.id, organizationId, syncServerUrl: serverUrl, folderId: project.folderId, pendingCanonicalAck: undefined, version: result.version, baseVersion: result.version, syncStatus: 'synced' };
  });
  return { projects, idChanges, conflicts };
}
