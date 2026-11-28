// `dismissedSourceDocuments` con la API anterior (2.10.0, que valida con el `shared/` previo y descarta el campo en
// silencio) y con la nueva: lo quitado sobrevive a la sincronización y a «Actualizar desde la propuesta», un recibo
// perdido se recupera sin conflicto y no hay bucle de PUT (docs/QUOTATIONS.md#compatibilidad-de-dismissedsourcedocuments).
import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { installLockingApi } from './quotationLockingApi';
import { forgetQuotationApiSupport } from '../store/sync/quotationContent';
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
  // Bloqueada con la base sin el campo: el cambio de estado no la reabre, y el PUT no lleva lo que la base no tiene (una
  // API nueva lo tomaría por una edición de la bloqueada y respondería 400 `quotation_locked`).
  const issuedBase = content({ status: 'issued', client: { ...content().client, name: 'C' }, items: [{ id: 'l1', kind: 'item', description: 'x', quantity: 1, unit: 'UD', unitPriceCents: 100, discountPct: 0, taxable: false }] });
  const accepted = { ...issuedBase, status: 'accepted' as const, dismissedSourceDocuments: ['a1'] };
  const plan = planQuotationPush(issuedBase, accepted);
  assert.deepEqual(plan.map((c) => c.status), ['accepted']);
  assert.equal(plan[0].dismissedSourceDocuments, undefined);
  assert.deepEqual(planQuotationPush(issuedBase, { ...accepted, status: 'void' }).map((c) => c.status), ['void']);
  assert.deepEqual(planQuotationPush(issuedBase, { ...issuedBase, dismissedSourceDocuments: ['a1'] }), [], 'mismo estado y solo el campo: nada');
  // Salir de una bloqueada lleva el campo exactamente como lo tiene la base (la copia del servidor): una bloqueada no se
  // edita, así que una lista local distinta es solo lo conservado aquí; nunca reabre ni da 400 `quotation_locked`.
  const fromServer = planQuotationPush({ ...issuedBase, dismissedSourceDocuments: ['a2'] }, accepted);
  assert.deepEqual(fromServer.map((c) => c.status), ['accepted']);
  assert.deepEqual(fromServer[0].dismissedSourceDocuments, ['a2']);
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

async function setup(apiVersion: 'old' | 'new') {
  // La API 2.10.0 valida con el `shared/` anterior, que no conoce el campo: lo descarta sin error. Las dos aplican el
  // bloqueo de la API real (`quotation_locked`, `invalid_transition`).
  const validate = (raw: unknown) => {
    const result = validateQuotationContent(raw);
    if (result.ok && apiVersion === 'old') delete result.value.dismissedSourceDocuments;
    return result;
  };
  const { rows, puts, responses, drop, rejectNext } = installLockingApi(validate);
  api().setSyncSettings({ serverUrl: `https://${apiVersion}.invalid`, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });
  const annex = (id: string, hash: string) => ({ id, enabled: true, fileName: `${id}.pdf`, title: id, fileSize: 10, pageCount: 1, uploadedAt: '2026-11-01', assetId: `asset:sha256:${hash.repeat(64)}`, origin: 'manual', addToTableOfContents: false });
  const project = { id: 'p1', isDeleted: false, client: { name: 'Propuesta' }, customization: { attachedPdfs: [annex('a1', 'a'), annex('a2', 'b'), annex('a3', 'c')] } };
  store.setState({ quotations: [], quotationChanges: {}, quotationDeletionQueue: [], quotationSyncCursor: null, quotationSyncFeedback: null, projects: [project as never] });
  const created = api().createQuotationRecord({
    client: { name: 'Cliente', attention: '', taxId: '', phone: '', email: '', address: '' },
    items: [{ id: 'l1', kind: 'item', description: 'Sistema', quantity: 1, unit: 'UD', unitPriceCents: 100_00, discountPct: 0, taxable: false }],
  });
  assert.ok(created.ok);
  const id = created.ok ? created.quotation.id : '';
  const actions = quotationEditorActions(api, id);
  assert.equal(actions.linkProposal('p1').added, 3);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  return { rows, puts, responses, id, actions, drop, rejectNext };
}

async function scenario(apiVersion: 'old' | 'new') {
  const { rows, puts, id, actions, drop } = await setup(apiVersion);

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
  drop();
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

/**
 * Bloqueada con una base sin el campo (API anterior tras «Conservar la mía»): cambiar el estado no la reabre por el
 * campo. «Usar la del servidor» descarta la lista local.
 */
async function lockedScenario(apiVersion: 'old' | 'new', next: 'accepted' | 'void') {
  const { rows, puts, id, actions } = await setup(apiVersion);
  assert.equal(actions.removeProposalDocument('a1'), null);
  assert.ok(api().setQuotationStatus(id, 'issued').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(local(id).status, 'issued');
  assert.deepEqual(local(id).dismissedSourceDocuments, ['a1']);
  // Otro equipo cambia la emitida en el servidor (otra versión) mientras aquí se cambia el estado: conflicto.
  const other = () => rows.set(id, { ...rows.get(id)!, version: rows.get(id)!.version + 1, updatedAt: '2026-11-02T00:00:00.000Z' });
  other();
  assert.ok(api().setQuotationStatus(id, next).ok);
  await api().syncQuotationsWithServer();
  assert.ok(api().quotationChanges[id]?.serverQuotation, `${apiVersion}: conflicto`);
  const before = puts.length;
  api().resolveQuotationConflict(id, 'keep_local');
  await api().syncQuotationsWithServer();
  assert.deepEqual(puts.slice(before).map((c) => c.status), [next], `${apiVersion}: issued → ${next} sin reabrir por el campo`);
  assert.equal(rows.get(id)!.status, next);
  assert.equal(api().quotationChanges[id], undefined);
  assert.deepEqual(local(id).dismissedSourceDocuments, ['a1'], `${apiVersion}: lo quitado sigue tras «Conservar la mía»`);
  return { rows, id };
}

/** «Usar la del servidor»: la lista local no se conserva (se queda la del servidor, o ninguna si no la trae). */
async function acceptServerScenario(apiVersion: 'old' | 'new') {
  const { rows, id, actions } = await setup(apiVersion);
  assert.equal(actions.removeProposalDocument('a1'), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  const serverList = apiVersion === 'new' ? ['a3'] : undefined;
  rows.set(id, { ...rows.get(id)!, version: rows.get(id)!.version + 1, notes: 'del otro equipo', dismissedSourceDocuments: serverList });
  assert.equal(actions.removeProposalDocument('a2'), null);
  await api().syncQuotationsWithServer();
  assert.ok(api().quotationChanges[id]?.serverQuotation, `${apiVersion}: conflicto`);
  api().resolveQuotationConflict(id, 'accept_server');
  assert.equal(local(id).notes, 'del otro equipo');
  assert.deepEqual(local(id).dismissedSourceDocuments, serverList, `${apiVersion}: «Usar la del servidor» descarta la lista local`);
  assert.deepEqual(ids(id), ['a1', 'a2', 'a3'].filter((a) => rows.get(id)!.attachments && (rows.get(id)!.attachments as { id: string }[]).some((x) => x.id === a)));
}

await scenario('old');
await scenario('new');
for (const apiVersion of ['old', 'new'] as const) {
  await lockedScenario(apiVersion, 'accepted');
  await lockedScenario(apiVersion, 'void');
  await acceptServerScenario(apiVersion);
}

/**
 * Solo API nueva: lo quitado se guardó; un cliente 2.10.0 edita (borra el campo) y emite; este equipo descarga y la
 * acepta. Con la API detectada como «guarda el campo» se respeta lo del servidor; tras reiniciar (sin esa memoria) se
 * conserva lo local, pero el cambio de estado sale con lo del servidor: nunca 400 `quotation_locked`.
 */
async function lostByOldClientScenario(restart: boolean) {
  const { rows, responses, id, actions } = await setup('new');
  assert.equal(actions.removeProposalDocument('a1'), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  const { dismissedSourceDocuments: _erased, ...row } = rows.get(id)!;
  rows.set(id, { ...row, status: 'issued', notes: 'emitida en 2.10.0', version: rows.get(id)!.version + 1 });
  if (restart) forgetQuotationApiSupport();
  store.setState({ quotationSyncCursor: null });
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(local(id).status, 'issued');
  assert.deepEqual(local(id).dismissedSourceDocuments, restart ? ['a1'] : undefined, restart ? 'sin memoria de la API: se conserva lo local' : 'API que guarda el campo: manda el servidor');
  const before = responses.length;
  assert.ok(api().setQuotationStatus(id, 'accepted').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true, 'aceptar no queda atascado');
  assert.deepEqual(responses.slice(before), ['ok'], 'un solo PUT, sin 400');
  assert.equal(rows.get(id)!.status, 'accepted');
  assert.equal(api().quotationChanges[id], undefined, 'sin cambios pendientes');
}

/** Registro guardado por una versión anterior (sin la copia confirmada): el 400 `quotation_locked` se reintenta una vez. */
async function legacyRecordScenario() {
  const { rows, responses, id, actions } = await setup('new');
  assert.equal(actions.removeProposalDocument('a1'), null);
  assert.ok(api().setQuotationStatus(id, 'issued').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  const { dismissedSourceDocuments: _erased, ...row } = rows.get(id)!;
  rows.set(id, { ...row, version: rows.get(id)!.version + 1 });
  forgetQuotationApiSupport();
  store.setState({ quotationSyncCursor: null });
  await api().syncQuotationsWithServer();
  assert.deepEqual(local(id).dismissedSourceDocuments, ['a1']);
  store.setState({ quotations: api().quotations.map((q) => { const { confirmedLocalOnly: _old, ...rest } = q; return rest; }) });
  const before = responses.length;
  assert.ok(api().setQuotationStatus(id, 'void').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.deepEqual(responses.slice(before), ['quotation_locked', 'ok'], 'reintento único con la copia del servidor');
  assert.equal(rows.get(id)!.status, 'void');
  assert.equal(api().quotationChanges[id], undefined);
}

await lostByOldClientScenario(false);
await lostByOldClientScenario(true);
await legacyRecordScenario();

console.log('Quotation dismissed documents sync tests passed.');
