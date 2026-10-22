import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { clientNameKey } from '../../shared/clients';
import { clientProposals, linkedProposalCounts, summarizeClient, DOCUMENT_STATUS_LABELS, filterClients } from '../utils/clientSummary';
import type { ProjectSimulation } from '../types';
import type { ClientRecord } from '../types/client';
import type { ProposalDecision } from '../../shared/proposalCommercial';

const proposal = (id: string, clientId: string | undefined, status: ProjectSimulation['status'], decision: ProposalDecision, extra: Partial<ProjectSimulation> = {}): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id,
  clientId,
  status,
  commercial: { status: decision, note: '', ownerName: 'QA' },
  updatedAt: `2026-10-0${id.slice(-1)}T00:00:00.000Z`,
  ...extra,
});
const projects = [
  proposal('p1', 'c1', 'Draft', 'pending'),
  proposal('p2', 'c1', 'Final', 'approved'),
  proposal('p3', 'c1', 'Final', 'rejected'),
  proposal('p4', 'c1', 'Archived', 'test'),
  proposal('p5', 'c1', 'Final', 'approved', { isDeleted: true }),
  proposal('p6', 'c2', 'Draft', 'approved'),
  proposal('p7', undefined, 'Draft', 'pending'),
];

assert.deepEqual(clientProposals(projects, 'c1').map((p) => p.id), ['p4', 'p3', 'p2', 'p1'], 'Newest first, trash excluded');
const summary = summarizeClient(projects, 'c1', (p) => (p.id === 'p2' ? 12500 : 99999));
assert.equal(summary.total, 4);
assert.deepEqual(summary.documents, { Draft: 1, Final: 2, Archived: 1 });
assert.deepEqual(summary.decisions, { pending: 1, approved: 1, rejected: 1, test: 1 });
assert.equal(summary.approvedAmountUSD, 12500, 'Only approved, non-test quotes add to the amount');
assert.equal(summary.lastActivityAt, '2026-10-04T00:00:00.000Z');
assert.equal(summarizeClient(projects, 'missing', () => 0).total, 0);
assert.equal(summarizeClient(projects, 'missing', () => 0).lastActivityAt, null);
assert.deepEqual(Object.fromEntries(linkedProposalCounts(projects)), { c1: 4, c2: 1 });
assert.deepEqual(DOCUMENT_STATUS_LABELS, { Draft: 'Borrador', Final: 'Final', Archived: 'Archivada' });

const record = (id: string, name: string, kind: ClientRecord['kind'], taxId = ''): ClientRecord => ({
  id, name, kind, taxId, phone: '', email: '', address: '', province: '', notes: '', createdAt: '2026-10-01',
});
const clients = [record('c1', 'Hotel Las Palmas', 'empresa', '131123456'), record('c2', 'Ana Pérez', 'persona'), record('c3', 'Ángel Núñez', 'persona')];
assert.deepEqual(filterClients(clients, '', 'all').map((c) => c.id), ['c2', 'c3', 'c1'], 'Alphabetical, accent-insensitive');
assert.deepEqual(filterClients(clients, 'angel', 'all').map((c) => c.id), ['c3']);
assert.deepEqual(filterClients(clients, '1-31-12345', 'all').map((c) => c.id), ['c1'], 'Tax id search ignores separators');
assert.deepEqual(filterClients(clients, '', 'empresa').map((c) => c.id), ['c1']);

assert.equal(clientNameKey('Hotel Las Palmas, S.R.L.'), clientNameKey('hotel las palmas'));
assert.equal(clientNameKey('Inversiones SAS'), 'inversiones');
assert.equal(clientNameKey('Sasha'), 'sasha');
console.log('✅ Client summary: linked proposals, document and commercial counts, amounts and filters passed.');
