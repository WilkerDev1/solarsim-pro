import type { SyncSettings } from '../types';

/** Draft ownership is durable; token renewal/request generations are transient. */
export function draftOwnerKey(workspaceScope: string, settings: SyncSettings, includeRole = false): string {
  return JSON.stringify([
    workspaceScope,
    settings.serverUrl.trim().replace(/\/+$/, ''),
    settings.currentUser?.id || null,
    settings.currentUser?.organizationId || null,
    ...(includeRole ? [settings.currentUser?.role || null] : []),
  ]);
}
