import type { ProjectSimulation } from '../../types';
import type { SyncAuthSlice } from '../types';
import type { SyncPushOutcome } from '../../services/syncService';

export type ProjectDeletionCommand = SyncAuthSlice['projectDeletionQueue'][number];

/** Keep deletion intent separate from the visible collection until the server confirms it. */
export function createProjectDeletion(project: ProjectSimulation, scope: string): ProjectDeletionCommand {
  const baseVersion = project.baseVersion ?? project.version ?? 0;
  const snapshot = structuredClone(project);
  const now = new Date().toISOString();
  return {
    scope, id: project.id, baseVersion,
    stage: project.syncStatus === 'synced' && project.isDeleted ? 'delete' : 'trash',
    project: { ...snapshot, isDeleted: true, deletedAt: snapshot.deletedAt || now, updatedAt: now, baseVersion, syncStatus: 'pending' },
  };
}

/** A create/update already in flight may finish after the document left the visible collection. */
export function acknowledgeQueuedProjectDeletions(queue: ProjectDeletionCommand[], outcomes: SyncPushOutcome[], scope: string, sent: ProjectSimulation[] = []): ProjectDeletionCommand[] {
  const results = new Map(outcomes.filter((result) => result.status !== 'conflict').map((result) => [result.originalId || result.id, result]));
  const sentMap = new Map(sent.map((project) => [project.id, project]));
  return queue.map((command) => {
    if (command.scope !== scope) return command;
    const result = results.get(command.id);
    if (!result) return command;
    return {
      ...command, id: result.id, baseVersion: result.version,
      stage: !result.awaitingConfirmation && (result.project?.isDeleted ?? sentMap.get(command.id)?.isDeleted) ? 'delete' : 'trash',
      project: command.project ? { ...command.project, id: result.id, version: result.version, baseVersion: result.version, pendingCanonicalAck: result.awaitingConfirmation ? { version: result.version } : undefined } : undefined,
    };
  });
}
