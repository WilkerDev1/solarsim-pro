export interface ShareProposalPayload {
  project: any;
  summary: any;
  validityDays: number;
}

export interface StoredProposal {
  id: string;
  createdAt: string;
  expiresAt: string;
  validityDays: number;
  project: any;
  summary: any;
}

export interface Env {
  PROPOSALS_KV: KVNamespace;
}
