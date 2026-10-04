import type { StoredProposal } from './types';
import type { Env } from './bindings';
export function generateProposalId(): string { return crypto.randomUUID().replace(/-/g, ''); }
export async function readProposal(env: Env, id: string): Promise<StoredProposal | null> {
  const raw = await env.PROPOSALS_KV.get(`proposal:${id}`);
  if (!raw) return null;
  const value: StoredProposal = JSON.parse(raw);
  if (!Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) return null;
  return value;
}
export async function storeProposal(env: Env, proposal: StoredProposal): Promise<void> {
  await env.PROPOSALS_KV.put(`proposal:${proposal.id}`, JSON.stringify(proposal), { expirationTtl: proposal.validityDays * 86400 });
}
export function proposalMetadata(stored: StoredProposal, origin: string) {
  const client = stored.project?.client;
  const specs = stored.project?.specs;
  return {
    id: stored.id,
    projectId: stored.project?.id || '',
    clientName: client?.name || 'Cliente Solar',
    projectCode: client?.projectId || stored.project?.id || 'SP-XXXX',
    quoteNumber: client?.quoteNumber || 'C-0001',
    systemKWp: stored.summary?.systemCapacityKWp ?? Number(((Number(specs?.panelCount) * Number(specs?.panelPowerW)) / 1000 || 0).toFixed(2)),
    location: client?.province || client?.location || 'República Dominicana',
    companyName: stored.project?.customization?.companyName || 'electsun',
    createdAt: stored.createdAt, expiresAt: stored.expiresAt, validityDays: stored.validityDays,
    shareUrl: `${origin}/p/${stored.id}`,
    calculationSnapshot: stored.calculationSnapshot,
  };
}
