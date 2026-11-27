// `dismissedSourceDocuments` con la API anterior (2.10.0, que valida con el `shared/` previo y descarta el campo en
// silencio) y con la nueva: lo quitado sobrevive a la sincronización y a «Actualizar desde la propuesta», un recibo
// perdido se recupera sin conflicto y no hay bucle de PUT (docs/QUOTATIONS.md#compatibilidad-de-dismissedsourcedocuments).
import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { QuotationSyncService } from '../services/quotationSyncService';
import { emptyQuotationContent, validateQuotationContent } from '../../shared/quotations';
import { quotationEditorActions } from '../features/quotations/editorActions';
import { keepLocalOnlyFields, planQuotationPush, sameQuotationContent } from '../store/sync/quotationContent';
import type { QuotationContent, QuotationRecord } from '../types/quotation';

// --- Puras: comparación y copia del servidor ---------------------------------------------------------------------------
{
  const content = (extra: Partial<QuotationContent> = {}): QuotationContent => ({ ...emptyQuotationContent('2026-11-27'), sourceProjectId: 'p1', ...extra });
  const server = content();
  const local = content({ dismissedSourceDocuments: ['a1'] });
  assert.equal(sameQuotationContent(server, local), true, 'la API anterior no lo guarda: no cuenta como diferencia');
  assert.equal(sameQuotationContent(content({ dismissedSourceDocuments: ['a2'] }), local), false, 'con la API nueva, un valor distinto sí cuenta');
  assert.equal(sameQuotationContent(local, server), false, 'el servidor lo tiene y la copia local no: es una diferencia');
  assert.equal(sameQuotationContent(content({ notes: 'x' }), local), false, 'cualquier otro cambio sigue contando');
  assert.deepEqual(planQuotationPush(server, local), [], 'solo añadir el campo no publica nada');
  assert.equal(planQuotationPush(content({ notes: 'x' }), local).length, 1);
  const record = (c: QuotationContent): QuotationRecord => ({ ...c, id: 'q', number: 'COT-2026-0001', version: 1, baseVersion: 1, createdById: '', createdBy: '', createdAt: '', updatedAt: '' });
  assert.deepEqual(keepLocalOnlyFields(record(server), record(local)).dismissedSourceDocuments, ['a1'], 'se conserva lo local');
  assert.equal(keepLocalOnlyFields(record(content({ sourceProjectId: 'p2' })), record(local)).dismissedSourceDocuments, undefined, 'otra propuesta enlazada: no');
  assert.deepEqual(keepLocalOnlyFields(record(content({ dismissedSourceDocuments: ['b'] })), record(local)).dismissedSourceDocuments, ['b'], 'si el servidor lo trae, manda el servidor');
  assert.equal(keepLocalOnlyFields(record(server), undefined).dismissedSourceDocuments, undefined);
}

// --- Con el store real contra una API sintética ------------------------------------------------------------------------
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'org' };
const api = () => store.getState();
const ids = (id: string) => api().quotations.find((q) => q.id === id)!.attachments.map((a) => a.id);
const local = (id: string) => api().quotations.find((q) => q.id === id)!;

async function scenario(apiVersion: 'old' | 'new') {
  const rows = new Map<string, Record<string, unknown> & { version: number; number?: string }>();
  const puts: QuotationContent[] = [];
  let dropNext = false;
  let clock = Date.parse('2026-11-01T00:00:00Z');
  const tick = () => new Date(++clock).toISOString();
  // La API 2.10.0 valida con el `shared/` anterior, que no conoce el campo: lo descarta sin error.
  const validate = (raw: unknown) => {
    const result = validateQuotationContent(raw);
    if (result.ok && apiVersion === 'old') delete result.value.dismissedSourceDocuments;
    return result;
  };
  QuotationSyncService.setTransportFactory(() => async (path, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET') return Response.json({ success: true, quotations: [...rows.values()].map((r) => structuredClone(r)), deletedIds: [], serverTimestamp: tick() });
    const id = decodeURIComponent(path.slice(1).split('?')[0]);
    const body = JSON.parse(String(init.body));
    puts.push(body.content);
    const valid = validate(body.content);
    if (!valid.ok) return Response.json({ error: valid.error }, { status: 400 });
    const current = rows.get(id);
    if ((current?.version ?? 0) !== body.baseVersion) return Response.json({ error: 'cambió', quotation: current ?? null }, { status: 409 });
    const version = (current?.version ?? 0) + 1;
    const saved = { ...valid.value, id, number: current?.number ?? 'COT-2026-0001', organizationId: 'org', version, baseVersion: version, createdById: 'owner', createdBy: 'QA', createdAt: tick(), updatedAt: tick() };
    rows.set(id, saved);
    if (dropNext) { dropNext = false; throw new Error('respuesta perdida'); }
    return Response.json({ success: true, quotation: saved });
  });
  api().setSyncSettings({ serverUrl: `https://${apiVersion}.invalid`, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });
  const annex = (id: string, hash: string) => ({ id, enabled: true, fileName: `${id}.pdf`, title: id, fileSize: 10, pageCount: 1, uploadedAt: '2026-11-01', assetId: `asset:sha256:${hash.repeat(64)}`, origin: 'manual', addToTableOfContents: false });
  const project = { id: 'p1', isDeleted: false, client: { name: 'Propuesta' }, customization: { attachedPdfs: [annex('a1', 'a'), annex('a2', 'b'), annex('a3', 'c')] } };
  store.setState({ quotations: [], quotationChanges: {}, quotationDeletionQueue: [], quotationSyncCursor: null, quotationSyncFeedback: null, projects: [project as never] });
  const created = api().createQuotationRecord({ client: { name: 'Cliente', attention: '', taxId: '', phone: '', email: '', address: '' } });
  assert.ok(created.ok);
  const id = created.ok ? created.quotation.id : '';
  const actions = quotationEditorActions(api, id);
  assert.equal(actions.linkProposal('p1').added, 3);
  assert.equal((await api().syncQuotationsWithServer()).success, true);

  // Quitar y sincronizar: lo quitado sigue recordado y «Actualizar» no lo trae.
  assert.equal(actions.removeProposalDocument('a1'), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true, `${apiVersion}: sync tras quitar`);
  assert.equal(api().quotationChanges[id], undefined, `${apiVersion}: publicado`);
  assert.deepEqual(rows.get(id)!.dismissedSourceDocuments, apiVersion === 'new' ? ['a1'] : undefined, `${apiVersion}: lo que guarda el servidor`);
  assert.deepEqual(local(id).dismissedSourceDocuments, ['a1'], `${apiVersion}: lo quitado sobrevive a la sincronización`);
  const before = puts.length;
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(puts.length, before, `${apiVersion}: sin bucle de PUT`);
  assert.deepEqual(actions.refreshProposalDocuments(), { error: null, added: 0, overflow: 0 }, `${apiVersion}: «Actualizar» no reactiva lo quitado`);
  assert.deepEqual(ids(id), ['a2', 'a3']);

  // Recibo perdido: el PUT llega pero no la respuesta; la siguiente pasada lo recupera sin reenviar ni conflicto.
  assert.equal(actions.removeProposalDocument('a2'), null);
  dropNext = true;
  assert.equal((await api().syncQuotationsWithServer()).success, false);
  const lost = puts.length;
  const recovered = await api().syncQuotationsWithServer();
  assert.equal(recovered.success, true, `${apiVersion}: recibo recuperado`);
  assert.equal(puts.length, lost, `${apiVersion}: sin reenviar`);
  assert.equal(api().quotationChanges[id], undefined, `${apiVersion}: sin conflicto ni cambio pendiente`);
  assert.deepEqual(local(id).dismissedSourceDocuments, ['a1', 'a2']);
  assert.deepEqual(actions.refreshProposalDocuments().added, 0);
  assert.deepEqual(ids(id), ['a3']);
  const settled = puts.length;
  await api().syncQuotationsWithServer();
  assert.equal(puts.length, settled, `${apiVersion}: sigue sin bucle`);

  // Otro equipo cambia la propuesta enlazada en el servidor: lo local de la anterior no se conserva.
  rows.set(id, { ...rows.get(id)!, sourceProjectId: 'p-otra', dismissedSourceDocuments: undefined, version: rows.get(id)!.version + 1 });
  store.setState({ quotationSyncCursor: null });
  await api().syncQuotationsWithServer();
  assert.equal(local(id).sourceProjectId, 'p-otra');
  assert.equal(local(id).dismissedSourceDocuments, undefined, `${apiVersion}: con otra propuesta no se arrastra`);
}

await scenario('old');
await scenario('new');

console.log('Quotation dismissed documents sync tests passed.');
