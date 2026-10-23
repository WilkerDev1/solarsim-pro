import { equipmentTotals, readEquipment } from '../../../shared/equipment';
import type { StoredProposal } from './types';
import type { Env } from './bindings';
export function generateProposalId(): string { return crypto.randomUUID().replace(/-/g, ''); }
export async function readProposal(env: Env, id: string): Promise<StoredProposal | null> {
  const raw = await env.PROPOSALS_KV.get(`proposal:${id}`);
  if (!raw) return null;
  let value: StoredProposal;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) return null;
  return value;
}
export async function storeProposal(env: Env, proposal: StoredProposal): Promise<void> {
  const origin = ''; // Stored metadata is origin-independent; request origin supplies the public URL.
  // KV has no transaction: never advertise an entry before its content was stored.
  await env.PROPOSALS_KV.put(`proposal:${proposal.id}`, JSON.stringify(proposal), { expirationTtl: proposal.validityDays * 86400 });
  await env.PROPOSALS_KV.put(`history:${proposal.publishedBy!.organizationId}:${proposal.id}`, JSON.stringify(proposalMetadata(proposal, origin)));
}
export function proposalMetadata(stored: StoredProposal, origin: string) {
  const client = stored.project?.client;
  const specs = stored.project?.specs;
  return {
    id: stored.id,
    organizationId: stored.publishedBy?.organizationId,
    createdById: stored.publishedBy?.userId,
    createdByName: stored.publishedBy?.userName,
    projectId: stored.project?.id || '',
    clientName: client?.name || 'Cliente Solar',
    projectCode: client?.projectId || stored.project?.id || 'SP-XXXX',
    quoteNumber: client?.quoteNumber || 'C-0001',
    systemKWp: stored.summary?.systemCapacityKWp ?? (specs ? Number(equipmentTotals(readEquipment(specs)).capacityKWp.toFixed(2)) : 0),
    location: client?.province || client?.location || 'República Dominicana',
    companyName: stored.project?.customization?.companyName || 'electsun',
    createdAt: stored.createdAt, expiresAt: stored.expiresAt, validityDays: stored.validityDays,
    shareUrl: `${origin}/p/${stored.id}`,
    calculationSnapshot: stored.calculationSnapshot,
  };
}
