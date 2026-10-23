import type { ClientInput } from '../../shared/clients';

/** Directory client. Independent of the client data printed in each proposal (`ProjectSimulation.client`). */
export interface ClientRecord extends ClientInput {
  id: string;
  organizationId?: string;
  createdById?: string;
  createdBy?: string;
  version?: number;
  baseVersion?: number;
  createdAt: string;
  updatedAt?: string;
}

/** Pending local write; `serverClient` holds the authoritative record of an unresolved conflict. */
export interface ClientChange {
  revision: string;
  ownerId?: string;
  baseVersion: number;
  serverClient?: ClientRecord;
  /** A teammate deleted the client while this device still had unsynced edits; the local copy is kept for review. */
  serverDeleted?: boolean;
}

export interface ClientDeletionCommand {
  id: string;
  ownerId?: string;
  baseVersion: number;
}

export type ClientMutationResult =
  | { ok: true; client: ClientRecord }
  | { ok: false; error: string };
