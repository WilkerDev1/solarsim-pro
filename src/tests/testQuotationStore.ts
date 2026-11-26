import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import type { SimulationStore } from '../store/types';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { captureWorkspace, changeWorkspace } from '../store/sync/organizationWorkspace';
import { assumptionFields } from '../../shared/assumptions';
import { localIsoDate } from '../utils/localDate';
import type { QuotationLine } from '../types/quotation';

const today = localIsoDate();
const year = Number(today.slice(0, 4));
const number = (sequence: number) => `COT-${year}-${String(sequence).padStart(4, '0')}`;
const line = (id: string, extra: Partial<QuotationLine> = {}): QuotationLine => ({
  id, kind: 'item', description: 'Panel 550 W', quantity: 2, unit: 'UD', unitPriceCents: 1_500_000, discountPct: 0, taxable: true, ...extra,
});

store.getState().setSyncSettings({ currentUser: null, authToken: null, autoSyncEnabled: false });
store.setState({
  quotations: [], quotationChanges: {}, quotationDeletionQueue: [], quotationSyncCursor: null, quotationNumberCounters: {},
  clients: [], clientChanges: {}, clientDeletionQueue: [], folders: [], folderChanges: {}, folderDeletionQueue: [],
});
const api = () => store.getState();

// ── Local mode: create with today's date, the effective exchange rate of new proposals and the seller in the store ──
const created = api().createQuotationRecord({ client: { name: 'Hotel Las Palmas', attention: '', taxId: '', phone: '', email: '', address: '' } });
assert.ok(created.ok, !created.ok ? created.error : '');
const first = created.quotation;
assert.match(first.id, /^quotation-/);
assert.equal(first.status, 'draft');
assert.equal(first.issueDate, today);
assert.equal(first.exchangeRate, assumptionFields(undefined, api().defaultSimulationSettings).specs.dopExchangeRate);
assert.equal(first.seller, api().localUserProfile.name);
assert.equal(first.number, number(1), 'Local workspaces number on creation');
assert.equal(first.version, 0);
assert.equal(first.baseVersion, 0);
assert.equal(api().quotationChanges[first.id].baseVersion, 0);
assert.deepEqual(api().quotationNumberCounters, { [String(year)]: 1 });
const forced = api().createQuotationRecord({ status: 'issued' });
assert.ok(forced.ok && forced.quotation.status === 'draft', 'A new quotation is always a draft');
assert.equal(api().quotations.at(-1)!.number, number(2));
assert.equal(api().createQuotationRecord({ exchangeRate: 0 }).ok, false, 'Invalid content is rejected');
assert.equal(api().quotations.length, 2);
assert.equal(api().createQuotationRecord({ clientId: 'client-missing' }).ok, false, 'Unknown client links are rejected');

// Editing validates, never changes the status and ignores unknown keys.
const edited = api().updateQuotationRecord(first.id, { items: [line('l1')], notes: '  Entrega en 15 días ', status: 'issued' });
assert.ok(edited.ok);
assert.equal(edited.quotation.status, 'draft');
assert.equal(edited.quotation.notes, 'Entrega en 15 días');
assert.equal(edited.quotation.number, number(1), 'Editing keeps the number');
assert.equal(api().updateQuotationRecord(first.id, { items: [line('l1', { quantity: -1 })] }).ok, false);
assert.equal(api().updateQuotationRecord('missing', { notes: 'x' }).ok, false);

// Transitions follow the shared rules; issuing requires content that validates as issued.
assert.equal(api().setQuotationStatus(first.id, 'accepted').ok, false, 'draft → accepted is not a transition');
const emptyDraft = api().quotations[1];
assert.equal(api().setQuotationStatus(emptyDraft.id, 'issued').ok, false, 'An empty draft cannot be issued');
assert.equal(api().quotations[1].status, 'draft');
const issued = api().setQuotationStatus(first.id, 'issued');
assert.ok(issued.ok);
assert.equal(issued.quotation.status, 'issued');
assert.equal(api().setQuotationStatus(first.id, 'issued').ok, false, 'Same status is not a transition');

// An issued quotation is locked: reopen → edit → issue again.
const locked = api().updateQuotationRecord(first.id, { notes: 'Cambio tardío' });
assert.equal(locked.ok, false);
assert.equal(api().quotations[0].notes, 'Entrega en 15 días');
assert.ok(api().setQuotationStatus(first.id, 'draft').ok, 'Reopen');
assert.ok(api().updateQuotationRecord(first.id, { notes: 'Cambio tras reabrir' }).ok);
assert.ok(api().setQuotationStatus(first.id, 'issued').ok);
assert.ok(api().setQuotationStatus(first.id, 'accepted').ok);
assert.equal(api().setQuotationStatus(first.id, 'draft').ok, false, 'accepted → draft is not a transition');
assert.ok(api().setQuotationStatus(first.id, 'void').ok);
assert.equal(api().setQuotationStatus(first.id, 'draft').ok, false, 'void is final');

// Duplicate: new id, new local number, draft, today's date, expired validity dropped; the source is untouched.
store.setState((s) => ({ quotations: s.quotations.map((q) => (q.id === first.id ? { ...q, issueDate: '2025-01-02', validUntil: '2025-01-10' } : q)) }));
const copy = api().duplicateQuotationRecord(first.id);
assert.ok(copy.ok);
assert.notEqual(copy.quotation.id, first.id);
assert.equal(copy.quotation.status, 'draft');
assert.equal(copy.quotation.issueDate, today);
assert.equal(copy.quotation.validUntil, null);
assert.equal(copy.quotation.number, number(3));
assert.deepEqual(copy.quotation.items, api().quotations[0].items);
assert.equal(api().quotations.find((q) => q.id === first.id)!.status, 'void');
const future = `${year + 1}-12-31`;
assert.ok(api().updateQuotationRecord(copy.quotation.id, { validUntil: future }).ok);
const copy2 = api().duplicateQuotationRecord(copy.quotation.id);
assert.ok(copy2.ok);
assert.equal(copy2.quotation.validUntil, future, 'A validity that has not expired is kept');

// Deleting never reuses a local number.
assert.deepEqual(api().deleteQuotationRecord(copy2.quotation.id), { ok: true });
assert.equal(api().deleteQuotationRecord(copy2.quotation.id).ok, false);
assert.ok(!api().quotations.some((q) => q.id === copy2.quotation.id));
assert.equal(api().quotationChanges[copy2.quotation.id], undefined);
const queued = api().quotationDeletionQueue.at(-1)!;
assert.deepEqual({ id: queued.id, ownerId: queued.ownerId, baseVersion: queued.baseVersion }, { id: copy2.quotation.id, ownerId: undefined, baseVersion: 0 });
assert.equal(queued.quotation?.id, copy2.quotation.id, "The command keeps a copy to show again if the API rejects it");
const afterDelete = api().createQuotationRecord();
assert.ok(afterDelete.ok);
assert.equal(afterDelete.quotation.number, number(5), 'Sequence 4 belonged to the deleted quotation and is not reused');
const numbers = api().quotations.map((q) => q.number);
assert.equal(new Set(numbers).size, numbers.length, 'No repeated numbers');

// ── Links: client and folder are optional; the printed client data is never rewritten ──
const client = api().createClientRecord({ name: 'Cliente del directorio', phone: '809-555-0000' });
assert.ok(client.ok);
const folder = api().createFolder('Cotizaciones 2026')!;
const draftId = copy.quotation.id;
const printedBefore = api().quotations.find((q) => q.id === draftId)!.client;
assert.deepEqual(api().linkQuotationToClient(draftId, client.client.id), { ok: true });
assert.equal(api().quotations.find((q) => q.id === draftId)!.clientId, client.client.id);
assert.deepEqual(api().quotations.find((q) => q.id === draftId)!.client, printedBefore, 'Linking never rewrites the printed client');
assert.equal(api().linkQuotationToClient(draftId, 'client-unknown').ok, false);
assert.equal(api().linkQuotationToClient('missing', client.client.id).ok, false);
assert.deepEqual(api().moveQuotationToFolder(draftId, folder.id), { ok: true });
assert.equal(api().quotations.find((q) => q.id === draftId)!.folderId, folder.id);
assert.equal(api().moveQuotationToFolder(draftId, 'folder-unknown').ok, false);
assert.equal(api().linkQuotationToClient(first.id, client.client.id).ok, false, 'A locked quotation keeps its content, links included');

// Local workspace (no API cascade): deleting a client or folder drops the link from every quotation, also locked ones.
const issuedLinked = api().createQuotationRecord({
  client: { name: 'Cliente impreso', attention: '', taxId: '', phone: '', email: '', address: '' }, items: [line('l9')],
});
assert.ok(issuedLinked.ok);
const tempClient = api().createClientRecord({ name: 'Temporal' });
const tempFolder = api().createFolder('Temporal')!;
assert.ok(tempClient.ok);
assert.ok(api().linkQuotationToClient(issuedLinked.quotation.id, tempClient.client.id).ok);
assert.ok(api().moveQuotationToFolder(issuedLinked.quotation.id, tempFolder.id).ok);
assert.ok(api().setQuotationStatus(issuedLinked.quotation.id, 'issued').ok);
assert.equal(api().deleteClientRecord(tempClient.client.id), true);
api().deleteFolder(tempFolder.id);
const issuedAfter = api().quotations.find((q) => q.id === issuedLinked.quotation.id)!;
assert.equal(issuedAfter.clientId, undefined);
assert.equal(issuedAfter.folderId, undefined);
assert.equal(issuedAfter.status, 'issued');
assert.equal(issuedAfter.client.name, 'Cliente impreso', 'Printed data untouched');

// Deleting the client or the folder drops only the link.
assert.equal(api().deleteClientRecord(client.client.id), true);
let draft = api().quotations.find((q) => q.id === draftId)!;
assert.equal(draft.clientId, undefined);
assert.deepEqual(draft.client, printedBefore);
api().deleteFolder(folder.id);
draft = api().quotations.find((q) => q.id === draftId)!;
assert.equal(draft.folderId, undefined);
assert.ok(api().moveQuotationToFolder(draftId, null).ok, 'Unlinking an already unlinked quotation is a no-op');

// ── Persistence: serialize → hydrate keeps quotations, queues, cursor and counter ──
store.setState({ quotationSyncCursor: { scope: 'local', serverTimestamp: '2026-11-01T00:00:00.000Z' } });
const serialized = serializeSimulationStore(api());
assert.equal(serialized.quotations.length, api().quotations.length);
assert.ok(serialized.quotationChanges[draftId]);
assert.equal(serialized.quotationDeletionQueue.length, 1);
assert.deepEqual(serialized.quotationSyncCursor, { scope: 'local', serverTimestamp: '2026-11-01T00:00:00.000Z' });
assert.deepEqual(serialized.quotationNumberCounters, { [String(year)]: 6 });
const before = structuredClone({
  quotations: api().quotations, quotationChanges: api().quotationChanges, quotationDeletionQueue: api().quotationDeletionQueue,
  quotationSyncCursor: api().quotationSyncCursor, quotationNumberCounters: api().quotationNumberCounters,
});
// Same path as a restart: JSON round trip of the persisted payload, then the hydration step.
const restored = { ...store.getState(), ...JSON.parse(JSON.stringify(serialized)) } as SimulationStore;
hydrateSimulationStore(restored);
assert.deepEqual({
  quotations: restored.quotations, quotationChanges: restored.quotationChanges, quotationDeletionQueue: restored.quotationDeletionQueue,
  quotationSyncCursor: restored.quotationSyncCursor, quotationNumberCounters: restored.quotationNumberCounters,
}, JSON.parse(JSON.stringify(before)));
assert.equal(restored.quotationNumberCounters[String(year)], 6);

// ── Workspaces: local quotations are never assigned to an organization; logging out restores them ──
assert.equal(captureWorkspace(api()).quotations?.length, before.quotations.length);
const editor = { id: 'editor', name: 'Editora', email: 'e@example.invalid', role: 'EDITOR' as const, organizationId: 'org-q' };
const orgSession = { ...api().syncSettings, serverUrl: 'https://quotations-store.invalid', currentUser: editor, authToken: 'synthetic' };
const orgWorkspace = changeWorkspace(api(), orgSession);
assert.deepEqual(orgWorkspace.quotations, [], 'Local quotations stay in the local workspace');
assert.deepEqual(orgWorkspace.quotationChanges, {});
assert.deepEqual(orgWorkspace.quotationDeletionQueue, []);
assert.equal(orgWorkspace.quotationSyncCursor, null);
assert.deepEqual(orgWorkspace.quotationNumberCounters, {});
store.setState({ ...orgWorkspace, syncSettings: orgSession });

// With a session the number waits for the server.
const orgDraft = api().createQuotationRecord();
assert.ok(orgDraft.ok);
assert.equal(orgDraft.quotation.number, null);
assert.equal(orgDraft.quotation.organizationId, 'org-q');
assert.equal(orgDraft.quotation.seller, 'Editora');
assert.deepEqual(api().quotationNumberCounters, {}, 'No local counter in an organization workspace');
const orgCopy = api().duplicateQuotationRecord(orgDraft.quotation.id);
assert.ok(orgCopy.ok && orgCopy.quotation.number === null);

// Readers cannot write.
store.getState().setSyncSettings({ currentUser: { ...editor, role: 'LECTOR' } });
assert.equal(api().createQuotationRecord().ok, false);
assert.equal(api().updateQuotationRecord(orgDraft.quotation.id, { notes: 'x' }).ok, false);
assert.equal(api().deleteQuotationRecord(orgDraft.quotation.id).ok, false);
store.getState().setSyncSettings({ currentUser: editor });

const back = changeWorkspace(api(), { ...orgSession, currentUser: null, authToken: null });
assert.deepEqual(back.quotations, before.quotations, 'The local quotations come back on logout');
assert.deepEqual(back.quotationNumberCounters, before.quotationNumberCounters);
const archived = Object.values(back.organizationWorkspaces ?? {}).find((w) => w.quotations?.some((q) => q.id === orgDraft.quotation.id));
assert.equal(archived?.quotations?.length, 2, 'The organization quotations are archived with their workspace');

console.log('✅ Quotations store: local numbering, locks, transitions, duplicate, links, persistence and workspaces passed.');
