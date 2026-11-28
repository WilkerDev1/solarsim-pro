// Destinos de los adjuntos de cotización: «Dentro del PDF» y «Archivo aparte en el correo», combinables y con al menos
// uno (docs/QUOTATION_EDITOR.md#adjuntos). Mapeo sobre `mode` + `alsoSeparate`, validación compartida, compatibilidad con
// la API 2.10.1 desplegada (descarta las claves desconocidas de cada adjunto), páginas de referencia de la vista previa
// (que nunca entran en el PDF exportado) y archivos del correo (docs/QUOTATIONS.md#compatibilidad-de-alsoseparate).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  attachmentDestinationLabel, attachmentDestinationSummary, attachmentDestinations, emptyQuotationContent, toggledDestinations, validateQuotationContent,
  withAttachmentDestinations, type QuotationAttachment, type QuotationContent,
} from '../../shared/quotations';
import type { QuotationRecord } from '../types/quotation';

registerHooks({ load: (url, context, next) => (url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context)) });
const { setAttachmentDestinations, updateAttachment } = await import('../domain/quotationEdit');
const { keepLocalOnlyFields, planQuotationPush, sameQuotationContent } = await import('../store/sync/quotationContent');
const { quotationEmailAttachments } = await import('../features/quotations/quotationEmail');
const { quotationPages } = await import('../features/quotations/exportQuotationPdf');

const attachment = (id: string, extra: Partial<QuotationAttachment> = {}): QuotationAttachment => ({
  id, fileName: `${id}.pdf`, fileSize: 2048, pageCount: 3, title: `Título ${id}`, uploadedAt: '2026-11-27T00:00:00.000Z', mode: 'include', origin: 'manual', ...extra,
});
const pdfOnly = attachment('solo-pdf');
const emailOnly = attachment('solo-correo', { mode: 'related', fileName: 'plano.png' });
const both = attachment('ambos', { alsoSeparate: true, fileName: 'ficha.pdf' });

// --- (1) Mapeo de los tres estados y la regla «al menos uno» -------------------------------------------------------
{
  assert.deepEqual(attachmentDestinations(pdfOnly), { pdf: true, email: false }, 'solo PDF = include');
  assert.deepEqual(attachmentDestinations(emailOnly), { pdf: false, email: true }, 'solo correo = related');
  assert.deepEqual(attachmentDestinations(both), { pdf: true, email: true }, 'ambos = include + alsoSeparate');
  assert.deepEqual(attachmentDestinations({ mode: 'related', alsoSeparate: true }), { pdf: false, email: true }, 'alsoSeparate no significa nada con related');

  const toBoth = withAttachmentDestinations(pdfOnly, { pdf: true, email: true })!;
  assert.equal(toBoth.mode, 'include');
  assert.equal(toBoth.alsoSeparate, true);
  const toEmail = withAttachmentDestinations(both, { pdf: false, email: true })!;
  assert.equal(toEmail.mode, 'related');
  assert.ok(!('alsoSeparate' in toEmail), 'solo correo no arrastra alsoSeparate');
  const toPdf = withAttachmentDestinations(both, { pdf: true, email: false })!;
  assert.equal(toPdf.mode, 'include');
  assert.ok(!('alsoSeparate' in toPdf), 'solo PDF no lleva alsoSeparate');
  assert.equal(withAttachmentDestinations(pdfOnly, { pdf: false, email: false }), null, 'sin ningún destino: no se permite');
  assert.equal(pdfOnly.mode, 'include', 'nunca muta la entrada');
  assert.ok(!('alsoSeparate' in pdfOnly));

  // Conmutar: desmarcar el único destino deja ninguno (la pestaña lo impide); el otro se suma.
  assert.deepEqual(toggledDestinations(pdfOnly, 'pdf'), { pdf: false, email: false });
  assert.deepEqual(toggledDestinations(pdfOnly, 'email'), { pdf: true, email: true });
  assert.deepEqual(toggledDestinations(both, 'pdf'), { pdf: false, email: true });
  assert.deepEqual(toggledDestinations(emailOnly, 'email'), { pdf: false, email: false });

  // Edición pura: los tres estados, y sin destino no cambia nada (misma referencia).
  const content: QuotationContent = { ...emptyQuotationContent('2026-11-27'), attachments: [pdfOnly, emailOnly] };
  const edited = setAttachmentDestinations(content, 'solo-pdf', { pdf: true, email: true });
  assert.deepEqual(edited.attachments[0], { ...pdfOnly, alsoSeparate: true });
  assert.equal(setAttachmentDestinations(content, 'solo-pdf', { pdf: false, email: false }), content, 'al menos uno');
  assert.equal(setAttachmentDestinations(content, 'solo-pdf', { pdf: true, email: false }), content, 'sin cambios: misma referencia');
  assert.equal(setAttachmentDestinations(content, 'nadie', { pdf: true, email: true }), content);
  assert.equal(setAttachmentDestinations(edited, 'solo-pdf', { pdf: false, email: true }).attachments[0].mode, 'related');
  assert.ok(!('alsoSeparate' in updateAttachment(edited, 'solo-pdf', { mode: 'related' }).attachments[0]), 'pasar a related suelta alsoSeparate');

  // Resumen del encabezado de cada grupo y etiqueta corta del dock.
  assert.equal(attachmentDestinationSummary([pdfOnly, both, emailOnly]), '2 en el PDF · 2 aparte');
  assert.equal(attachmentDestinationSummary([pdfOnly, pdfOnly, emailOnly]), '2 en el PDF · 1 aparte');
  assert.equal(attachmentDestinationSummary([emailOnly]), '1 aparte');
  assert.equal(attachmentDestinationSummary([]), 'Ninguno');
  assert.deepEqual([pdfOnly, emailOnly, both].map(attachmentDestinationLabel), ['En el PDF', 'Aparte en el correo', 'En el PDF y aparte']);
}

// --- (2) Validación compartida: opcional, descartado con related, el contenido sin él sigue igual -------------------
{
  const validate = (attachments: unknown[]) => validateQuotationContent({ ...emptyQuotationContent('2026-11-27'), attachments });
  const ok = (attachments: unknown[]) => { const r = validate(attachments); assert.ok(r.ok, r.ok ? '' : r.error); return r.ok ? r.value.attachments : []; };
  assert.equal(ok([both])[0].alsoSeparate, true, 'con include se guarda');
  assert.ok(!('alsoSeparate' in ok([{ ...emailOnly, alsoSeparate: true }])[0]), 'con related se descarta');
  assert.ok(!('alsoSeparate' in ok([{ ...pdfOnly, alsoSeparate: false }])[0]), 'false = ausente');
  assert.ok(!('alsoSeparate' in ok([{ ...pdfOnly, alsoSeparate: null }])[0]), 'null = ausente (no 400)');
  assert.deepEqual(ok([pdfOnly]), [pdfOnly], 'sin el campo, igual que antes');
  const garbage = validate([{ ...pdfOnly, alsoSeparate: 'sí' }]);
  assert.equal(garbage.ok, false, 'un valor que no es booleano se rechaza');
  const again = validateQuotationContent({ ...emptyQuotationContent('2026-11-27'), attachments: ok([both, emailOnly]) });
  assert.ok(again.ok && again.value.attachments[0].alsoSeparate === true, 'validar lo validado no lo cambia');
}

// API 2.10.1 desplegada: su validador (el `shared/` de origin/beta) rearma cada adjunto solo con las claves que conoce,
// así que descarta `alsoSeparate` sin error. Se emula con esa misma lista blanca.
const KNOWN_2_10_1 = ['id', 'fileName', 'fileSize', 'pageCount', 'title', 'uploadedAt', 'mode', 'origin', 'assetId', 'catalogItemId', 'sourceProjectId', 'thumbnailDataUrl'];
const asOldApi = (content: QuotationContent): QuotationContent => ({
  ...content,
  attachments: content.attachments.map((a) => Object.fromEntries(Object.entries(a).filter(([key]) => KNOWN_2_10_1.includes(key))) as unknown as QuotationAttachment),
});

// --- (3) Compatibilidad pura: comparación, plan y copia del servidor ------------------------------------------------
{
  const content = (attachments: QuotationAttachment[], extra: Partial<QuotationContent> = {}): QuotationContent => ({ ...emptyQuotationContent('2026-11-27'), attachments, ...extra });
  const local = content([both, emailOnly]);
  const server = asOldApi(local);
  assert.equal(server.attachments[0].alsoSeparate, undefined, 'la emulación descarta el campo');
  assert.equal(sameQuotationContent(server, local), true, 'la API anterior no lo guarda: no cuenta como diferencia');
  assert.equal(sameQuotationContent(local, server), false, 'el servidor lo tiene y la copia local no: diferencia');
  assert.equal(sameQuotationContent(content([{ ...both, mode: 'related', alsoSeparate: undefined }, emailOnly]), local), false, 'otro destino en el servidor sí cuenta');
  assert.equal(sameQuotationContent(content([pdfOnly, emailOnly]), local), false, 'otro adjunto sí cuenta');
  assert.equal(sameQuotationContent(server, local, { separate: false }), false, 'sin relajo (servidor sin moverse): es un cambio por publicar');
  // Planear desde la base: la base de una edición es el registro local confirmado, con lo conservado incluido.
  assert.deepEqual(planQuotationPush(local, local), [], 'lo conservado no se vuelve a publicar (sin bucle de PUT)');
  const fresh = planQuotationPush(server, local);
  assert.equal(fresh.length, 1, 'un destino recién marcado se publica aunque sea el único cambio');
  assert.equal(fresh[0].attachments[0].alsoSeparate, true);
  const plan = planQuotationPush(asOldApi(content([both, emailOnly], { notes: 'antes' })), local);
  assert.equal(plan.length, 1, 'cualquier otro cambio publica');
  assert.equal(plan[0].attachments[0].alsoSeparate, true, 'y el PUT lleva el campo para que la API nueva lo guarde');

  // Bloqueada con la base sin el campo: cambiar el estado no la reabre y el PUT no lleva lo que la base no tiene (una API
  // nueva lo tomaría por una edición de una bloqueada: 400 quotation_locked).
  const issued = content([both], {
    status: 'issued', client: { ...emptyQuotationContent('2026-11-27').client, name: 'C' },
    items: [{ id: 'l1', kind: 'item', description: 'x', quantity: 1, unit: 'UD', unitPriceCents: 100, discountPct: 0, taxable: false }],
  });
  const issuedBase = asOldApi(issued);
  const accepting = planQuotationPush(issuedBase, { ...issued, status: 'accepted' });
  assert.deepEqual(accepting.map((c) => c.status), ['accepted'], 'issued → accepted sin reabrir');
  assert.equal(accepting[0].attachments[0].alsoSeparate, undefined, 'el cambio de estado publica lo confirmado');
  assert.deepEqual(planQuotationPush(issuedBase, { ...issued, status: 'void' }).map((c) => c.status), ['void']);
  assert.deepEqual(planQuotationPush(issuedBase, issued), [], 'mismo estado y solo el campo: nada');
  // Con la base que sí lo trae (API nueva), salir de la bloqueada lo envía como lo tiene el servidor, sin reabrir.
  const fromServer = planQuotationPush(issued, { ...asOldApi(issued), status: 'accepted' });
  assert.deepEqual(fromServer.map((c) => c.status), ['accepted']);
  assert.equal(fromServer[0].attachments[0].alsoSeparate, true);
  // Con una edición real (otra nota), reabre primero con el contenido del servidor.
  assert.deepEqual(planQuotationPush(issued, { ...issued, notes: 'otra', status: 'accepted' }).map((c) => c.status), ['draft', 'issued', 'accepted']);

  const record = (c: QuotationContent): QuotationRecord => ({ ...c, id: 'q', number: 'COT-2026-0001', version: 1, baseVersion: 1, createdById: '', createdBy: '', createdAt: '', updatedAt: '' });
  assert.equal(keepLocalOnlyFields(record(server), record(local)).attachments[0].alsoSeparate, true, 'se conserva lo local');
  assert.equal(keepLocalOnlyFields(record(server), undefined).attachments[0].alsoSeparate, undefined);
  const serverRelated = content([{ ...pdfOnly, id: 'ambos', mode: 'related' }]);
  assert.equal(keepLocalOnlyFields(record(serverRelated), record(local)).attachments[0].alsoSeparate, undefined, 'otro destino en el servidor: manda el servidor');
  const unchanged = record(content([pdfOnly]));
  assert.equal(keepLocalOnlyFields(unchanged, record(content([pdfOnly]))), unchanged, 'nada que conservar: misma referencia');
}

// --- (4) Store real contra una API sintética (2.10.1 que descarta el campo, y una nueva que lo guarda) ---------------
const { useSimulationStore: store } = await import('../store/useSimulationStore');
const { installLockingApi } = await import('./quotationLockingApi');
const { forgetQuotationApiSupport } = await import('../store/sync/quotationContent');
const { quotationEditorActions } = await import('../features/quotations/editorActions');
const user = { id: 'owner', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'org' };
const api = () => store.getState();
const local = (id: string) => api().quotations.find((q) => q.id === id)!;
const separateOf = (id: string, attachmentId: string) => local(id).attachments.find((a) => a.id === attachmentId)?.alsoSeparate;

const validators = {
  old: (raw: unknown) => { const result = validateQuotationContent(raw); return result.ok ? { ...result, value: asOldApi(result.value) } : result; },
  new: (raw: unknown) => validateQuotationContent(raw),
};

async function setup(apiVersion: 'old' | 'new', serverUrl = `https://${apiVersion}-destinos.invalid`) {
  // Con el bloqueo de la API real: `quotation_locked` e `invalid_transition` (quotationLockingApi.ts).
  const locking = installLockingApi(validators[apiVersion]);
  const { rows, puts } = locking;
  api().setSyncSettings({ serverUrl, currentUser: user, authToken: 'synthetic', autoSyncEnabled: false, lastSyncTimestamp: null });
  store.setState({ quotations: [], quotationChanges: {}, quotationDeletionQueue: [], quotationSyncCursor: null, quotationSyncFeedback: null, projects: [] });
  // Referencias que el servidor ya conoce (como las de una propuesta): no hay bytes locales que subir.
  const ref = (c: string) => `asset:sha256:${c.repeat(64)}`;
  const created = api().createQuotationRecord({
    client: { name: 'Cliente', attention: '', taxId: '', phone: '', email: '', address: '' },
    items: [{ id: 'l1', kind: 'item', description: 'Sistema', quantity: 1, unit: 'UD', unitPriceCents: 100_00, discountPct: 0, taxable: false }],
    attachments: [attachment('a1', { assetId: ref('a') }), attachment('a2', { mode: 'related', assetId: ref('b') })],
  });
  assert.ok(created.ok);
  const id = created.ok ? created.quotation.id : '';
  const actions = quotationEditorActions(api, id);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  return { ...locking, rows, puts, id, actions };
}

const storedSeparate = (rows: Map<string, Record<string, unknown>>, id: string, attachmentId: string) =>
  (rows.get(id)!.attachments as QuotationAttachment[]).find((a) => a.id === attachmentId)?.alsoSeparate;

async function scenario(apiVersion: 'old' | 'new') {
  const { rows, puts, id, actions, drop } = await setup(apiVersion);
  // «Ambos» y sincronizar: el valor local sobrevive, sin bucle de PUT.
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true, `${apiVersion}: sync`);
  assert.equal(api().quotationChanges[id], undefined, `${apiVersion}: publicado sin conflicto`);
  assert.equal(storedSeparate(rows, id, 'a1'), apiVersion === 'new' ? true : undefined, `${apiVersion}: lo que guarda el servidor`);
  assert.equal(separateOf(id, 'a1'), true, `${apiVersion}: sobrevive a la sincronización`);
  let before = puts.length;
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(puts.length, before, `${apiVersion}: sin bucle de PUT`);

  // Recibo perdido: la siguiente pasada lo recupera sin reenviar ni conflicto.
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a2', { pdf: true, email: true })), null);
  drop();
  assert.equal((await api().syncQuotationsWithServer()).success, false);
  const lost = puts.length;
  assert.equal((await api().syncQuotationsWithServer()).success, true, `${apiVersion}: recibo recuperado`);
  assert.equal(puts.length, lost, `${apiVersion}: sin reenviar`);
  assert.equal(api().quotationChanges[id], undefined, `${apiVersion}: sin conflicto ni cambio pendiente`);
  assert.deepEqual([separateOf(id, 'a1'), separateOf(id, 'a2'), local(id).attachments[1].mode], [true, true, 'include']);

  // Otra edición cualquiera publica el contenido entero, campo incluido.
  assert.equal(actions.edit((c) => ({ ...c, notes: 'Nota nueva' })), null);
  before = puts.length;
  await api().syncQuotationsWithServer();
  assert.equal(puts.length, before + 1);
  assert.equal(puts.at(-1)!.attachments[0].alsoSeparate, true, `${apiVersion}: el PUT lleva el campo`);
  assert.equal(separateOf(id, 'a1'), true);

  // Otro equipo pasa el adjunto a «solo correo» en el servidor: manda el servidor.
  rows.set(id, { ...rows.get(id)!, version: rows.get(id)!.version + 1, attachments: (rows.get(id)!.attachments as QuotationAttachment[]).map((a) => (a.id === 'a1' ? { ...a, mode: 'related', alsoSeparate: undefined } : a)) });
  store.setState({ quotationSyncCursor: null });
  await api().syncQuotationsWithServer();
  assert.equal(local(id).attachments[0].mode, 'related');
  assert.equal(separateOf(id, 'a1'), undefined, `${apiVersion}: con otro destino en el servidor no se arrastra lo local`);
}

/** Bloqueada con una base sin el campo (tras «Conservar la mía»): cambiar el estado no la reabre. */
async function lockedScenario(apiVersion: 'old' | 'new', next: 'accepted' | 'void') {
  const { rows, puts, id, actions } = await setup(apiVersion);
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.ok(api().setQuotationStatus(id, 'issued').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(local(id).status, 'issued');
  assert.equal(separateOf(id, 'a1'), true);
  // La base confirmada no lo trae (p. ej. guardada por la API anterior antes de redesplegar): conflicto y «Conservar la mía».
  rows.set(id, { ...asOldApi(rows.get(id) as never), version: rows.get(id)!.version + 1, updatedAt: '2026-11-02T00:00:00.000Z' } as never);
  assert.ok(api().setQuotationStatus(id, next).ok);
  await api().syncQuotationsWithServer();
  assert.ok(api().quotationChanges[id]?.serverQuotation, `${apiVersion}: conflicto`);
  const before = puts.length;
  api().resolveQuotationConflict(id, 'keep_local');
  await api().syncQuotationsWithServer();
  assert.deepEqual(puts.slice(before).map((c) => c.status), [next], `${apiVersion}: issued → ${next} sin reabrir por el campo`);
  assert.equal(rows.get(id)!.status, next);
  assert.equal(api().quotationChanges[id], undefined);
  // Con la API anterior se conserva lo local; con la nueva (ya detectada: guarda el campo), un servidor sin él es su valor.
  assert.equal(separateOf(id, 'a1'), apiVersion === 'old' ? true : undefined, `${apiVersion}: destino tras «Conservar la mía»`);
}

/** «Usar la del servidor»: el valor local se descarta (queda el del servidor, o ninguno). */
async function acceptServerScenario(apiVersion: 'old' | 'new') {
  const { rows, id, actions } = await setup(apiVersion);
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  rows.set(id, { ...asOldApi(rows.get(id) as never), version: rows.get(id)!.version + 1, notes: 'del otro equipo' } as never);
  assert.equal(actions.edit((c) => ({ ...c, notes: 'mía' })), null);
  await api().syncQuotationsWithServer();
  assert.ok(api().quotationChanges[id]?.serverQuotation, `${apiVersion}: conflicto`);
  api().resolveQuotationConflict(id, 'accept_server');
  assert.equal(local(id).notes, 'del otro equipo');
  assert.equal(separateOf(id, 'a1'), undefined, `${apiVersion}: «Usar la del servidor» descarta lo local`);
}

/** Escenario A: emitida con la API anterior (descarta el campo), aceptada después de redesplegar la API nueva. */
async function redeployScenario() {
  const locking = await setup('old', 'https://redeploy-destinos.invalid');
  const { rows, responses, id, actions } = locking;
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.ok(api().setQuotationStatus(id, 'issued').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(storedSeparate(rows, id, 'a1'), undefined);
  assert.equal(separateOf(id, 'a1'), true);
  locking.setValidate(validators.new);
  const before = responses.length;
  assert.ok(api().setQuotationStatus(id, 'accepted').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true, 'A: aceptar tras redesplegar');
  assert.deepEqual(responses.slice(before), ['ok'], 'A: sin 400');
  assert.equal(api().quotationChanges[id], undefined);
  assert.equal(separateOf(id, 'a1'), true, 'A: lo local sigue aquí');
}

/** Escenario D: solo API nueva; un 2.10.x edita (borra el campo) y emite; este equipo la acepta. */
async function oldClientScenario(restart: boolean) {
  const { rows, responses, id, actions } = await setup('new', `https://d${restart ? '-restart' : ''}-destinos.invalid`);
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(storedSeparate(rows, id, 'a1'), true);
  rows.set(id, { ...asOldApi(rows.get(id) as never), status: 'issued', notes: 'emitida por 2.10.x', version: rows.get(id)!.version + 1 } as never);
  if (restart) forgetQuotationApiSupport();
  store.setState({ quotationSyncCursor: null });
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(separateOf(id, 'a1'), restart ? true : undefined, restart ? 'D: sin memoria se conserva lo local' : 'D: API que lo guarda: manda el servidor');
  const before = responses.length;
  assert.ok(api().setQuotationStatus(id, 'accepted').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true, 'D: aceptar no se atasca');
  assert.deepEqual(responses.slice(before), ['ok'], 'D: sin 400');
  assert.equal(rows.get(id)!.status, 'accepted');
  assert.equal(api().quotationChanges[id], undefined);
}

/** Escenario E: tras «Conservar la mía» con la base sin el campo, reabrir la emitida (→ borrador) no da 400. */
async function reopenScenario(apiVersion: 'old' | 'new') {
  const { rows, responses, id, actions } = await setup(apiVersion, `https://e-${apiVersion}-destinos.invalid`);
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.ok(api().setQuotationStatus(id, 'issued').ok);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  rows.set(id, { ...asOldApi(rows.get(id) as never), version: rows.get(id)!.version + 1 } as never);
  forgetQuotationApiSupport();
  assert.ok(api().setQuotationStatus(id, 'draft').ok);
  await api().syncQuotationsWithServer();
  assert.ok(api().quotationChanges[id]?.serverQuotation, `E ${apiVersion}: conflicto`);
  api().resolveQuotationConflict(id, 'keep_local');
  const before = responses.length;
  assert.equal((await api().syncQuotationsWithServer()).success, true, `E ${apiVersion}: reabrir`);
  assert.deepEqual(responses.slice(before), ['ok'], `E ${apiVersion}: sin 400`);
  assert.equal(rows.get(id)!.status, 'draft');
  assert.equal(api().quotationChanges[id], undefined);
  // Ya en borrador, la siguiente edición publica el destino local (la API nueva lo guarda).
  assert.equal(actions.edit((c) => ({ ...c, notes: 'reabierta' })), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(storedSeparate(rows, id, 'a1'), apiVersion === 'new' ? true : undefined);
  assert.equal(api().quotationChanges[id], undefined);
}

/** I1: con la API nueva detectada, desmarcar «aparte» en otro equipo se respeta aquí y no se revierte. */
async function unmarkedElsewhereScenario() {
  const { rows, puts, id } = await setup('new', 'https://i1-destinos.invalid');
  const actions = quotationEditorActions(api, id);
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  const row = rows.get(id)!;
  rows.set(id, { ...row, version: row.version + 1, attachments: (row.attachments as QuotationAttachment[]).map((a) => (a.id === 'a1' ? { ...a, alsoSeparate: undefined } : a)) });
  store.setState({ quotationSyncCursor: null });
  const before = puts.length;
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(separateOf(id, 'a1'), undefined, 'I1: se respeta lo desmarcado en otro equipo');
  assert.equal(actions.edit((c) => ({ ...c, notes: 'otra cosa' })), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(storedSeparate(rows, id, 'a1'), undefined, 'I1: no se revierte');
  assert.equal(puts.length, before + 1);
}

/** «Usar la del servidor» tras un rechazo: no vuelve a añadir lo local en la siguiente descarga, hasta una nueva edición. */
async function rejectedAcceptServerScenario() {
  const { rows, rejectNext, id, actions } = await setup('old', 'https://reject-destinos.invalid');
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(separateOf(id, 'a1'), true);
  assert.equal(actions.edit((c) => ({ ...c, notes: 'rechazada' })), null);
  rejectNext('invalid');
  await api().syncQuotationsWithServer();
  assert.ok(api().quotationChanges[id]?.rejected, 'rechazo');
  api().resolveQuotationConflict(id, 'accept_server');
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(separateOf(id, 'a1'), undefined, '«Usar la del servidor» no vuelve a añadir el campo');
  store.setState({ quotationSyncCursor: null });
  await api().syncQuotationsWithServer();
  assert.equal(separateOf(id, 'a1'), undefined, 'ni en la descarga siguiente');
  assert.equal(api().quotationChanges[id], undefined);
  // Una nueva edición del campo vuelve a conservarlo.
  assert.equal(actions.edit((c) => setAttachmentDestinations(c, 'a1', { pdf: true, email: true })), null);
  assert.equal((await api().syncQuotationsWithServer()).success, true);
  assert.equal(separateOf(id, 'a1'), true);
  void rows;
}

await redeployScenario();
await oldClientScenario(false);
await oldClientScenario(true);
await reopenScenario('old');
await reopenScenario('new');
await unmarkedElsewhereScenario();
await rejectedAcceptServerScenario();
await scenario('old');
await scenario('new');
for (const apiVersion of ['old', 'new'] as const) {
  await lockedScenario(apiVersion, 'accepted');
  await lockedScenario(apiVersion, 'void');
  await acceptServerScenario(apiVersion);
}

// --- (5) Correo: el PDF dice cuántos anexos lleva; aparte, los que van como archivo suelto ---------------------------
{
  const files = quotationEmailAttachments('COT-2026-0147', [pdfOnly, emailOnly, both]);
  assert.deepEqual(files.map((f) => [f.id, f.name, f.separate]), [['quotation-pdf', 'COT-2026-0147.pdf', false], ['solo-correo', 'plano.png', true], ['ambos', 'ficha.pdf', true]]);
  assert.equal(files[0].note, 'Incluye 2 adjuntos');
  assert.match(files[2].note, /también va dentro del PDF/, 'el de ambos destinos lo dice');
  assert.doesNotMatch(files[1].note, /dentro del PDF/);
  assert.equal(quotationEmailAttachments(null, [pdfOnly])[0].note, 'Incluye 1 adjunto');
  assert.equal(quotationEmailAttachments(null, [pdfOnly]).length, 1, 'solo PDF: no va aparte');
  assert.equal(quotationEmailAttachments(null, [emailOnly])[0].note, 'La cotización', 'solo correo: el PDF no lo incluye');

  const { QuotationEmailPreview } = await import('../components/quotations/editor/QuotationEmailPreview');
  const html = (attachments: QuotationAttachment[]) => renderToStaticMarkup(React.createElement(QuotationEmailPreview, {
    quotation: { ...emptyQuotationContent('2026-11-27'), number: 'COT-2026-0147', signature: null, attachments }, draft: { overrides: {}, context: null }, onDraftChange: () => {},
  }));
  const mixed = html([pdfOnly, emailOnly, both]);
  assert.match(mixed, />incluye 2 adjuntos</, 'junto al PDF, cuántos adjuntos lleva dentro');
  assert.equal(mixed.match(/>[^<]*ncluye 2 adjuntos[^<]*</gi)?.length, 1, 'M1: no se repite para lectores de pantalla');
  assert.equal(mixed.match(/qe-mail-file-tag">Aparte</g)?.length, 2, 'aparte: solo correo y ambos');
  assert.ok(!mixed.includes('solo-pdf.pdf'), 'solo PDF no se lista aparte');
  assert.match(mixed, /Descarga el PDF \(ya lleva dentro sus adjuntos\) y adjúntalo junto con los archivos marcados «Aparte»/);
  const onlyPdf = html([pdfOnly]);
  assert.match(onlyPdf, />incluye 1 adjunto</);
  assert.doesNotMatch(onlyPdf, /Aparte/);
  assert.match(onlyPdf, /Descarga el PDF \(ya lleva dentro sus adjuntos\) y adjúntalo\./);
  const none = html([]);
  assert.doesNotMatch(none, /incluye/i);
  assert.match(none, /Descarga el PDF y adjúntalo\./);
}

// --- (6) Vista previa: páginas de referencia de los anexos, fuera de la exportación ---------------------------------
{
  const { QuotationPreview, previewPageLabel } = await import('../components/quotations/editor/QuotationPreview');
  const sheet = { ...emptyQuotationContent('2026-11-27'), number: 'COT-2026-0147', signature: null, attachments: [pdfOnly, emailOnly, both] };
  const preview = (initialPage: number) => renderToStaticMarkup(React.createElement(QuotationPreview, { quotation: sheet, attachments: sheet.attachments, initialPage }));
  const first = preview(0);
  assert.match(first, /Página 1 de 1/, 'la hoja cuenta solo sus páginas');
  assert.match(first, /data-quotation-page="1"/);
  assert.doesNotMatch(first, /data-quotation-annex-preview/);
  assert.match(first, /2 adjuntos se ven al final como referencia/);
  const annex = preview(1);
  assert.match(annex, /Anexo 1 de 2/, 'numeración propia de los anexos');
  assert.doesNotMatch(annex, /Página 2 de/, 'no mezcla la numeración de la hoja');
  assert.match(annex, /data-quotation-annex-preview="1"/);
  assert.doesNotMatch(annex, /data-quotation-page=/, 'una página de referencia nunca lleva la marca de la hoja');
  for (const text of ['Vista previa', 'Se añadirá completo al exportar', 'Título solo-pdf', 'solo-pdf.pdf', '3 páginas']) assert.ok(annex.includes(text), `anexo: ${text}`);
  const second = preview(2);
  assert.match(second, /Anexo 2 de 2/);
  assert.ok(second.includes('Título ambos') && second.includes('También va aparte en el correo'));
  assert.ok(!second.includes('Título solo-correo') && !preview(3).includes('Título solo-correo'), 'solo correo no tiene página de anexo');
  // Miniatura de una ficha con `thumbnailDataUrl`; páginas por confirmar en una ficha del catálogo.
  const thumb = 'data:image/png;base64,iVBORw0KGgo=';
  const withThumb = renderToStaticMarkup(React.createElement(QuotationPreview, {
    quotation: sheet, attachments: [attachment('ficha', { origin: 'catalog', pageCount: 0, thumbnailDataUrl: thumb })], initialPage: 1,
  }));
  assert.ok(withThumb.includes(`src="${thumb}"`) && withThumb.includes('Páginas por confirmar'));

  assert.equal(previewPageLabel(0, 2, 3), 'Página 1 de 2');
  assert.equal(previewPageLabel(1, 2, 3), 'Página 2 de 2');
  assert.equal(previewPageLabel(2, 2, 3), 'Anexo 1 de 3');
  assert.equal(previewPageLabel(4, 2, 3), 'Anexo 3 de 3');

  // La exportación solo rasteriza la hoja: aunque un contenedor devolviera también páginas de referencia, se descartan.
  const element = (attrs: Record<string, string>) => ({ hasAttribute: (name: string) => name in attrs, attrs }) as unknown as HTMLElement;
  const sheetPage = element({ 'data-quotation-page': '1' });
  const fakeRoot = { querySelectorAll: () => [sheetPage, element({ 'data-quotation-page': '2', 'data-quotation-annex-preview': '1' }), element({ 'data-quotation-annex-preview': '2' })] } as unknown as ParentNode;
  assert.deepEqual(quotationPages(fakeRoot), [sheetPage]);
  // Y la raíz de exportación solo monta la hoja (nunca las páginas de referencia).
  const source = readFileSync(new URL('../components/quotations/editor/QuotationPreview.tsx', import.meta.url), 'utf8');
  const exportBlock = source.slice(source.indexOf('className="qe-export-root"'));
  assert.ok(exportBlock.includes('<QuotationSheet') && !exportBlock.includes('AnnexPreviewPage'), 'la raíz de exportación solo monta la hoja');
}

// --- (7) Pestaña «Adjuntos»: control de destinos en todos los grupos; bloqueada y LECTOR deshabilitado -------------
{
  const { AttachmentsTab, LAST_DESTINATION_NOTICE } = await import('../components/quotations/editor/AttachmentsTab');
  const content: QuotationContent = {
    ...emptyQuotationContent('2026-11-27'), sourceProjectId: 'p-1',
    attachments: [pdfOnly, emailOnly, both, attachment('doc-propuesta', { mode: 'related', origin: 'proposal', sourceProjectId: 'p-1', assetId: `asset:sha256:${'c'.repeat(64)}` })],
  };
  const group = { name: 'Centro Médico', available: true, pending: 0, omitted: 0, refresh: () => ({ error: null, added: 0, overflow: 0 }), remove: () => null };
  const render = (readOnly: boolean) => renderToStaticMarkup(React.createElement(AttachmentsTab, { quotationId: 'q', content, readOnly, edit: () => null, catalog: [], online: true, sourceGroup: group }));
  const html = render(false);
  assert.equal(html.match(/role="group" aria-label="Destino del /g)?.length, 4, 'un control por adjunto, en todos los grupos');
  assert.ok(!html.includes('Solo relacionado') && !html.includes('Incluir en el PDF'), 'sin el par anterior');
  const groupOf = (name: string) => [...html.matchAll(new RegExp(`aria-label="Destino del ${name}">([^]*?)</div>`, 'g'))][0][1];
  const state = (name: string) => [...groupOf(name).matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^]*?)<\/button>/g)].map((m) => `${m[2].replace(/<[^>]+>/g, '')}:${m[1]}`);
  assert.deepEqual(state('adjunto 1'), ['Dentro del PDF:true', 'Archivo aparte en el correo:false']);
  assert.deepEqual(state('adjunto 2'), ['Dentro del PDF:false', 'Archivo aparte en el correo:true']);
  assert.deepEqual(state('adjunto 3'), ['Dentro del PDF:true', 'Archivo aparte en el correo:true']);
  assert.deepEqual(state('documento de la propuesta 1'), ['Dentro del PDF:false', 'Archivo aparte en el correo:true']);
  assert.match(html, /2 en el PDF · 2 aparte/, 'resumen de «Otros documentos»');
  assert.match(html, />1 aparte</, 'resumen de «De la propuesta»');
  assert.match(html, /Se añade completo al final del PDF de la cotización/, 'qué hace «Dentro del PDF»');
  assert.match(html, /Va como archivo suelto junto al PDF/, 'qué hace «Archivo aparte en el correo»');
  assert.match(LAST_DESTINATION_NOTICE, /al menos un destino/);
  assert.doesNotMatch(html, /aria-pressed="(?:true|false)" disabled=""/, 'editable: nada desactivado');
  for (const locked of [render(true)]) {
    assert.equal(locked.match(/role="group" aria-label="Destino del /g)?.length, 4, 'bloqueada o LECTOR: se ve');
    assert.doesNotMatch(locked, /aria-pressed="(?:true|false)"(?! disabled="")/, 'todos los destinos deshabilitados');
  }
}

console.log('Quotation attachment destinations tests passed.');
