// Propuesta enlazada en el editor de cotización (docs/QUOTATION_EDITOR.md#visor-de-la-propuesta y
// docs/QUOTATION_FROM_PROPOSAL.md#documentos-de-la-propuesta-enlazada): enlazar trae los documentos agrupados, actualizar
// sin duplicar ni reactivar quitados, quitar el enlace conservando o quitando, incluir/relacionado/quitar, documento sin
// bytes no incluible, bloqueada y LECTOR, el visor de solo lectura no escribe nada ni cambia la propuesta activa, y
// «Volver a COT-…» desde la propuesta.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { DEFAULT_FEATURE_SETTINGS } from '../../shared/applicationFeatures';
import { QUOTATION_LIMITS, emptyQuotationContent, validateQuotationContent } from '../../shared/quotations';
import type { ProjectSimulation } from '../types';
import type { AttachedPDFDocument } from '../types';
import type { QuotationAttachment, QuotationContent } from '../types/quotation';

registerHooks({ load: (url, context, next) => (url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context)) });
const { useSimulationStore } = await import('../store/useSimulationStore');
const { BENCHMARK_PROJECT } = await import('../engine/referenceCase');
const { ALL_CONVERSION_BLOCKS } = await import('../features/quotations/proposalSource');
const { createQuotationFromProposal } = await import('../features/quotations/proposalConversion');
const { quotationEditorActions } = await import('../features/quotations/editorActions');
const { proposalDocumentAttachments, attachmentAvailability, UNAVAILABLE_ATTACHMENT_REASON } = await import('../features/quotations/proposalDocuments');
const {
  linkSourceProposal, mergeSourceDocuments, moveAttachmentAmong, pendingSourceDocuments, removeSourceDocument, sourceDocuments, unlinkSourceProposal, updateAttachment,
} = await import('../domain/quotationEdit');
const { QuotationEditorView } = await import('../components/quotations/editor/QuotationEditorView');
const { AttachmentsTab } = await import('../components/quotations/editor/AttachmentsTab');
const { UnlinkSourcePrompt, linkedDocumentsNotice } = await import('../components/quotations/editor/ContentSections');
const { ReturnToQuotationPill, returnPillLabel } = await import('../components/quotations/linked/ReturnToQuotationPill');
const { ProposalViewerDocument } = await import('../components/quotations/editor/ProposalViewerDocument');
const { calculateProjectFinancialSummary } = await import('../engine/financeEngine');

const store = useSimulationStore;
const initial = { ...store.getState() };
const annex = (id: string, extra: Partial<AttachedPDFDocument> = {}): AttachedPDFDocument => ({
  id, fileName: `${id}.pdf`, fileSize: 2048, pageCount: 2, title: `Anexo ${id}`, uploadedAt: '2026-11-01T10:00:00.000Z', enabled: true, addToTableOfContents: true,
  assetId: `asset:sha256:${id.padEnd(64, '0').slice(0, 64)}`, ...extra,
});
const proposal = (id: string, annexes: AttachedPDFDocument[], patch: (p: ProjectSimulation) => void = () => undefined): ProjectSimulation => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = id;
  p.client.name = id === 'p-1' ? 'Centro Médico Hispánico' : `Propuesta ${id}`;
  p.customization = { ...(p.customization ?? {}), attachedPdfs: annexes };
  patch(p);
  return p;
};
const p1Annexes = [
  annex('plano'),
  annex('ficha-panel', { origin: 'catalog', catalogItemId: 'eq-panel', assetId: 'equipment-asset-panel' }),
  annex('solo-local', { assetId: undefined }),
  annex('apagado', { enabled: false }),
];
const reader = { id: 'u-r', name: 'Lucía', email: 'l@example.invalid', role: 'LECTOR', organizationId: 'org-a' };
const editor = { id: 'u-e', name: 'Pedro', email: 'p@example.invalid', role: 'EDITOR', organizationId: 'org-a' };

const reset = (extra: Record<string, unknown> = {}) => {
  store.setState({
    projects: [proposal('p-1', p1Annexes), proposal('p-3', [annex('otro')])],
    clients: [], folders: [],
    quotations: [], quotationChanges: {}, quotationDeletionQueue: [], quotationNumberCounters: {},
    activeView: 'project-hub', activeProjectId: 'p-3', activeQuotationId: null, sidebarTheme: 'light',
    quotationReturn: null, quotationEditorEntry: null,
    localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS },
    syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
    ...extra,
  });
  Object.assign(store.getInitialState(), store.getState());
};
const render = (element: React.ReactElement) => { Object.assign(store.getInitialState(), store.getState()); return renderToStaticMarkup(element); };
const quotationById = (id: string) => store.getState().quotations.find((q) => q.id === id)!;
const projectSnapshot = (id: string) => JSON.stringify(store.getState().projects.find((p) => p.id === id));
/** Estado serializable del store (sin funciones), para comparar antes y después de mirar. */
const stateSnapshot = () => JSON.stringify(store.getState(), (_key, value) => (typeof value === 'function' ? undefined : value));

// --- (1) Conversión de los documentos: la regla de F7, como «Archivo aparte en el correo» y con su propuesta --------------------
{
  const project = proposal('p-1', p1Annexes);
  const before = JSON.stringify(project);
  const { attachments, omitted } = proposalDocumentAttachments(project);
  assert.deepEqual(attachments.map((a) => a.id), ['plano', 'ficha-panel'], 'solo los activos con referencia reutilizable');
  assert.ok(attachments.every((a) => a.mode === 'related' && a.sourceProjectId === 'p-1'));
  assert.deepEqual(attachments.map((a) => a.origin), ['proposal', 'catalog']);
  assert.equal(attachments[1].catalogItemId, 'eq-panel');
  assert.deepEqual(omitted.map((o) => o.id), ['solo-local'], 'el anexo solo local se omite con su motivo');
  assert.equal(JSON.stringify(project), before, 'la propuesta no cambia');
}

const docsOf = (project: ProjectSimulation) => proposalDocumentAttachments(project).attachments;
const base = (): QuotationContent => ({ ...emptyQuotationContent('2026-11-27'), attachments: [] });
const manual: QuotationAttachment = { id: 'attachment-1', fileName: 'foto.png', fileSize: 10, pageCount: 1, title: 'Foto', uploadedAt: '2026-11-02T00:00:00.000Z', mode: 'include', origin: 'manual', assetId: 'asset:sha256:'.padEnd(77, 'f') };

// --- (2) Enlazar trae los documentos agrupados; sin duplicar una ficha ya añadida desde el catálogo -----------------
{
  const project = proposal('p-1', p1Annexes);
  const catalogCopy: QuotationAttachment = { id: 'att-catalog-equipment-asset-panel', fileName: 'ficha.pdf', fileSize: 0, pageCount: 0, title: 'Ficha', uploadedAt: '2026-11-02T00:00:00.000Z', mode: 'include', origin: 'catalog', assetId: 'equipment-asset-panel', catalogItemId: 'eq-panel' };
  const linked = linkSourceProposal({ ...base(), attachments: [manual, catalogCopy] }, 'p-1', docsOf(project));
  assert.equal(linked.content.sourceProjectId, 'p-1');
  assert.equal(linked.added, 1, 'la ficha que ya estaba (mismo archivo) no se duplica');
  assert.deepEqual(sourceDocuments(linked.content).map((a) => a.id), ['plano']);
  assert.deepEqual(linked.content.attachments.map((a) => a.id), ['attachment-1', 'att-catalog-equipment-asset-panel', 'plano']);
  assert.equal(validateQuotationContent(linked.content).ok, true);
  // Máximo de adjuntos: entran los que caben y se dice cuántos no.
  const crowded = { ...base(), attachments: Array.from({ length: QUOTATION_LIMITS.maxAttachments - 1 }, (_, i) => ({ ...manual, id: `m-${i}`, assetId: undefined })) };
  const full = linkSourceProposal(crowded, 'p-1', docsOf(project));
  assert.deepEqual([full.added, full.overflow], [1, 1]);
  assert.equal(full.content.attachments.length, QUOTATION_LIMITS.maxAttachments);
}

// --- (3) Actualizar sin duplicar ni reactivar los quitados; el grupo se ordena aparte -------------------------------
{
  const project = proposal('p-1', p1Annexes);
  let content = linkSourceProposal({ ...base(), attachments: [manual] }, 'p-1', docsOf(project)).content;
  assert.deepEqual(sourceDocuments(content).map((a) => a.id), ['plano', 'ficha-panel']);
  content = removeSourceDocument(content, 'plano');
  assert.deepEqual(content.dismissedSourceDocuments, ['plano'], 'el quitado se recuerda');
  assert.deepEqual(removeSourceDocument(content, 'attachment-1').dismissedSourceDocuments, ['plano'], 'quitar uno propio no se recuerda');
  const withNew = proposal('p-1', [...p1Annexes, annex('memoria')]);
  assert.deepEqual(pendingSourceDocuments(content, docsOf(withNew)).map((a) => a.id), ['memoria'], 'solo el nuevo: ni duplicados ni el quitado');
  const refreshed = mergeSourceDocuments(content, docsOf(withNew));
  assert.equal(refreshed.added, 1);
  assert.deepEqual(sourceDocuments(refreshed.content).map((a) => a.id), ['ficha-panel', 'memoria']);
  assert.equal(mergeSourceDocuments(refreshed.content, docsOf(withNew)).content, refreshed.content, 'actualizar dos veces no cambia nada');
  // Mover dentro del grupo salta los otros adjuntos.
  const moved = moveAttachmentAmong(refreshed.content, 'memoria', -1, ['ficha-panel', 'memoria']);
  assert.deepEqual(moved.attachments.map((a) => a.id), ['attachment-1', 'memoria', 'ficha-panel']);
  assert.equal(moveAttachmentAmong(moved, 'attachment-1', 1, ['attachment-1']), moved, 'el único de su grupo no se mueve');
  // Incluir / relacionado.
  assert.equal(updateAttachment(refreshed.content, 'memoria', { mode: 'include' }).attachments.find((a) => a.id === 'memoria')!.mode, 'include');
  const validated = validateQuotationContent(refreshed.content);
  assert.ok(validated.ok && validated.value.dismissedSourceDocuments?.[0] === 'plano', 'los quitados viajan en el contenido validado');
}

// --- (4) Quitar el enlace: conservar o quitar los documentos; los quitados se olvidan ------------------------------
{
  const project = proposal('p-1', p1Annexes);
  const content = removeSourceDocument(linkSourceProposal({ ...base(), attachments: [manual] }, 'p-1', docsOf(project)).content, 'plano');
  const kept = unlinkSourceProposal(content, true);
  assert.equal(kept.sourceProjectId, undefined);
  assert.equal(kept.dismissedSourceDocuments, undefined);
  assert.deepEqual(kept.attachments.map((a) => a.id), ['attachment-1', 'ficha-panel'], 'conservados como adjuntos normales');
  assert.equal(sourceDocuments(kept).length, 0, 'sin enlace ya no hay grupo');
  const removed = unlinkSourceProposal(content, false);
  assert.deepEqual(removed.attachments.map((a) => a.id), ['attachment-1'], 'quitados: solo quedan los propios');
  // Volver a enlazar la misma propuesta trae otra vez el que se había quitado (los quitados se olvidaron) sin duplicar.
  const relinked = linkSourceProposal(kept, 'p-1', docsOf(project));
  assert.deepEqual(relinked.content.attachments.map((a) => a.id), ['attachment-1', 'ficha-panel', 'plano']);
}

// --- (5) Contrato: `dismissedSourceDocuments` opcional y acotado ----------------------------------------------------
{
  const ok = validateQuotationContent({ ...base(), sourceProjectId: 'p-1', dismissedSourceDocuments: ['a', 'b'] });
  assert.ok(ok.ok && ok.value.dismissedSourceDocuments!.join() === 'a,b');
  const orphan = validateQuotationContent({ ...base(), dismissedSourceDocuments: ['a'] });
  assert.ok(orphan.ok && orphan.value.dismissedSourceDocuments === undefined, 'sin propuesta de origen no se guarda');
  const legacy = validateQuotationContent({ ...base(), sourceProjectId: 'p-1' });
  assert.ok(legacy.ok && !('dismissedSourceDocuments' in legacy.value), 'lo guardado sin el campo sigue igual');
  assert.equal(validateQuotationContent({ ...base(), sourceProjectId: 'p-1', dismissedSourceDocuments: ['a', 'a'] }).ok, false);
  assert.equal(validateQuotationContent({ ...base(), sourceProjectId: 'p-1', dismissedSourceDocuments: 'a' }).ok, false);
  const many = Array.from({ length: QUOTATION_LIMITS.maxDismissedSourceDocuments + 1 }, (_, i) => `d-${i}`);
  assert.equal(validateQuotationContent({ ...base(), sourceProjectId: 'p-1', dismissedSourceDocuments: many }).ok, false);
  // Se recuerdan como mucho los más recientes.
  let content: QuotationContent = { ...base(), sourceProjectId: 'p-1', dismissedSourceDocuments: many.slice(0, QUOTATION_LIMITS.maxDismissedSourceDocuments) };
  content = { ...content, attachments: [{ ...manual, id: 'nuevo', sourceProjectId: 'p-1', origin: 'proposal' }] };
  const trimmed = removeSourceDocument(content, 'nuevo').dismissedSourceDocuments!;
  assert.equal(trimmed.length, QUOTATION_LIMITS.maxDismissedSourceDocuments);
  assert.equal(trimmed.at(-1), 'nuevo');
}

// --- (6) Disponibilidad de los bytes: sin sesión ni copia local no se puede incluir ---------------------------------
assert.deepEqual(attachmentAvailability({ assetId: 'asset:sha256:x' }, { online: true, local: false }), { includable: true });
assert.deepEqual(attachmentAvailability({ assetId: 'asset:sha256:x' }, { online: false, local: true }), { includable: true });
assert.deepEqual(attachmentAvailability({ assetId: 'asset:sha256:x' }, { online: false, local: false }), { includable: false, reason: UNAVAILABLE_ATTACHMENT_REASON });
assert.equal(attachmentAvailability({}, { online: true, local: false }).includable, false, 'sin referencia ni copia local, tampoco con sesión');

// --- (7) Con el store real: enlazar, actualizar, quitar y desenlazar; la propuesta nunca cambia ----------------------
reset();
{
  const created = store.getState().createQuotationRecord({ ...base() });
  assert.ok(created.ok);
  const id = created.ok ? created.quotation.id : '';
  const actions = quotationEditorActions(store.getState, id);
  const before = projectSnapshot('p-1');
  const linked = actions.linkProposal('p-1');
  assert.deepEqual(linked, { error: null, added: 2, overflow: 0 });
  assert.equal(projectSnapshot('p-1'), before, 'enlazar no modifica la propuesta');
  assert.equal(linkedDocumentsNotice(linked.added, linked.overflow), 'Se agregaron 2 documentos de la propuesta en Adjuntos, como «Archivo aparte en el correo».');
  assert.equal(linkedDocumentsNotice(0, 0), null);
  assert.deepEqual(sourceDocuments(quotationById(id)).map((a) => a.id), ['plano', 'ficha-panel']);
  assert.equal(actions.removeProposalDocument('plano'), null);
  assert.deepEqual(quotationById(id).dismissedSourceDocuments, ['plano']);
  assert.deepEqual(actions.refreshProposalDocuments(), { error: null, added: 0, overflow: 0 }, 'el quitado no vuelve');
  store.setState({ projects: store.getState().projects.map((p) => (p.id === 'p-1' ? proposal('p-1', [...p1Annexes, annex('memoria')]) : p)) });
  const beforeRefresh = projectSnapshot('p-1');
  assert.deepEqual(actions.refreshProposalDocuments(), { error: null, added: 1, overflow: 0 });
  assert.deepEqual(sourceDocuments(quotationById(id)).map((a) => a.id), ['ficha-panel', 'memoria']);
  assert.equal(projectSnapshot('p-1'), beforeRefresh, 'actualizar no modifica la propuesta');
  assert.equal(actions.unlinkProposal(true), null);
  assert.deepEqual(quotationById(id).attachments.map((a) => a.id), ['ficha-panel', 'memoria']);
  assert.equal(quotationById(id).sourceProjectId, undefined);
  assert.equal(quotationById(id).dismissedSourceDocuments, undefined);
  actions.linkProposal('p-1');
  assert.equal(actions.unlinkProposal(false), null);
  assert.deepEqual(quotationById(id).attachments, [], 'quitar el enlace con «Quitarlos» deja la lista sin los de la propuesta');
  // Bloqueada: el store rechaza traer documentos y no cambia nada.
  actions.linkProposal('p-1');
  store.setState({ quotations: store.getState().quotations.map((q) => (q.id === id ? { ...q, status: 'issued' as const } : q)) });
  const locked = JSON.stringify(quotationById(id));
  store.setState({ projects: store.getState().projects.map((p) => (p.id === 'p-1' ? proposal('p-1', [...p1Annexes, annex('memoria'), annex('anexo-nuevo')]) : p)) });
  assert.ok(actions.refreshProposalDocuments().error, 'bloqueada: el store rechaza «Actualizar»');
  assert.equal(JSON.stringify(quotationById(id)), locked);
  assert.ok(actions.removeProposalDocument('ficha-panel'), 'bloqueada: el store rechaza quitar');
  assert.equal(JSON.stringify(quotationById(id)), locked);
  assert.ok(actions.unlinkProposal(false), 'bloqueada: el store rechaza quitar el enlace');
  assert.equal(JSON.stringify(quotationById(id)), locked);
}

// --- (8) Crear desde la propuesta: sus documentos aparecen en el grupo «De la propuesta …» --------------------------
reset();
{
  const before = projectSnapshot('p-1');
  const created = createQuotationFromProposal('p-1', ALL_CONVERSION_BLOCKS);
  assert.ok(created.ok);
  assert.equal(projectSnapshot('p-1'), before);
  const id = created.ok ? created.id : '';
  const html = render(React.createElement(QuotationEditorView, { initialTab: 'attachments' }));
  assert.match(html, /De la propuesta (?:<!-- -->)?Centro Médico Hispánico/);
  assert.match(html, />2 aparte</);
  assert.match(html, /Otros documentos/);
  assert.match(html, /aria-label="Quitar documento de la propuesta 1"/);
  assert.match(html, /1 anexo de la propuesta no se puede enlazar/, 'el anexo solo local se dice con discreción');
  assert.doesNotMatch(html, /Actualizar desde la propuesta \(/, 'nada pendiente: sin contador');
  assert.match(html, /disabled=""[^>]*><svg[^>]*lucide-refresh-cw[^]*?Actualizar desde la propuesta/, 'sin pendientes el botón queda desactivado');
  // Sin sesión y sin copia local: «Dentro del PDF» desactivado con ⓘ; nunca rompe.
  assert.match(html, /<button type="button" class="qe-destination" aria-pressed="false" disabled=""[^>]*><span[^>]*>(?:<svg[^]*?<\/svg>)?<\/span>Dentro del PDF<\/button>/);
  assert.match(html, /Por qué no se puede incluir el documento de la propuesta 1/);
  // Con sesión: se puede incluir.
  store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: editor as never, authToken: 'tok' } });
  const online = render(React.createElement(QuotationEditorView, { initialTab: 'attachments' }));
  assert.doesNotMatch(online, /Por qué no se puede incluir/);
  assert.match(online, /<button type="button" class="qe-destination" aria-pressed="false"(?! disabled)[^>]*><span[^>]*>(?:<svg[^]*?<\/svg>)?<\/span>Dentro del PDF<\/button>/);
  // LECTOR: el grupo se ve, no se edita.
  store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: reader as never } });
  const readOnly = render(React.createElement(QuotationEditorView, { initialTab: 'attachments' }));
  assert.match(readOnly, /De la propuesta/);
  assert.doesNotMatch(readOnly, /Actualizar desde la propuesta|Quitar documento de la propuesta/);
  assert.doesNotMatch(readOnly, /class="qe-destination" aria-pressed="(?:true|false)"(?! disabled="")/, 'todos los destinos desactivados');
  store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null } });
  // Bloqueada (emitida): igual que LECTOR.
  store.setState({ quotations: store.getState().quotations.map((q) => (q.id === id ? { ...q, status: 'issued' as const } : q)) });
  const issued = render(React.createElement(QuotationEditorView, { initialTab: 'attachments' }));
  assert.match(issued, /De la propuesta/);
  assert.doesNotMatch(issued, /Actualizar desde la propuesta|Quitar documento de la propuesta/);
}

// --- (9) AttachmentsTab suelta: nuevo pendiente, ya incluido sin bytes, y el aviso del quitar enlace ---------------
{
  const content: QuotationContent = {
    ...base(), sourceProjectId: 'p-1',
    attachments: [manual, { ...manual, id: 'plano', origin: 'proposal', mode: 'include', sourceProjectId: 'p-1', assetId: 'asset:sha256:'.padEnd(77, 'a') }],
  };
  const group = { name: 'Centro Médico', available: true, pending: 2, omitted: 0, refresh: () => ({ error: null, added: 0, overflow: 0 }), remove: () => null };
  const html = renderToStaticMarkup(React.createElement(AttachmentsTab, { quotationId: 'q', content, readOnly: false, edit: () => null, catalog: [], sourceGroup: group }));
  assert.match(html, /Actualizar desde la propuesta<!-- --> \(2\)|Actualizar desde la propuesta \(2\)/);
  assert.match(html, /<button type="button" class="qe-destination" aria-pressed="true"(?! disabled)[^>]*><span[^>]*>(?:<svg[^]*?<\/svg>)?<\/span>Dentro del PDF<\/button>/, 'ya incluido: se puede desmarcar');
  assert.match(html, /si no llega al exportar, el PDF sale sin él|Si no llega al exportar, el PDF sale sin él/);
  assert.match(html, /aria-label="Quitar adjunto 1"/, 'los propios conservan su numeración');
  const prompt = renderToStaticMarkup(React.createElement(UnlinkSourcePrompt, { count: 2, onAnswer: () => undefined }));
  for (const text of ['La cotización tiene 2 documentos de esta propuesta.', 'Conservar documentos', 'Quitarlos', 'Cancelar']) assert.ok(prompt.includes(text), text);
}

// --- (10) Visor de solo lectura: abrirlo no escribe nada ni cambia la propuesta activa ------------------------------
reset();
{
  const created = createQuotationFromProposal('p-1', ALL_CONVERSION_BLOCKS);
  assert.ok(created.ok);
  // La propuesta activa es otra (p-3) y la vista es el editor.
  store.setState({ activeProjectId: 'p-3', activeView: 'quotation-editor' });
  Object.assign(store.getInitialState(), store.getState());
  const before = stateSnapshot();
  let writes = 0;
  const unsubscribe = store.subscribe(() => { writes++; });
  const htmlFor: Record<string, string> = {};
  for (const tab of ['summary', 'document', 'parameters', 'costs'] as const) htmlFor[tab] = renderToStaticMarkup(React.createElement(QuotationEditorView, { initialViewer: tab }));
  // «Documento» se carga en diferido (las páginas pesan): el editor muestra un aviso breve y el módulo dibuja las páginas.
  const viewed = store.getState().projects.find((p) => p.id === 'p-1')!;
  const pagesHtml = renderToStaticMarkup(React.createElement(ProposalViewerDocument, { project: viewed, summary: calculateProjectFinancialSummary(viewed) }));
  unsubscribe();
  assert.equal(writes, 0, 'pintar el visor no llama a ningún escritor del store');
  assert.equal(stateSnapshot(), before, 'el store queda idéntico (propuestas, cotizaciones, cambios y sincronización)');
  assert.equal(store.getState().activeProjectId, 'p-3', 'la propuesta activa no cambia');
  for (const html of Object.values(htmlFor)) {
    for (const text of ['Propuesta de origen · solo lectura', 'Centro Médico Hispánico', 'Resumen', 'Documento', 'Parámetros', 'Costos', 'Abrir propuesta', 'Cerrar el visor de la propuesta']) assert.ok(html.includes(text), text);
    assert.match(html, /class="qe-body"[^>]*data-viewer=""/);
    assert.match(html, /role="separator"/, 'panel redimensionable');
    assert.match(html, /class="qe-preview" hidden=""/, 'el visor sustituye a la vista previa');
    assert.match(html, /aria-pressed="true"[^>]*>.*?Propuesta<\/button>/, 'en pantallas estrechas, el selector muestra «Propuesta»');
  }
  for (const text of ['Potencia instalada', 'Precio de la propuesta', 'Sistema propuesto', 'Producción y consumo', 'Precio y retorno']) assert.ok(htmlFor.summary.includes(text), text);
  assert.match(htmlFor.document, /Cargando el documento…/, 'Documento se carga en diferido');
  assert.match(pagesHtml, /pdf-page/, 'Documento dibuja las páginas del PDF de la propuesta');
  assert.doesNotMatch(pagesHtml, /data-pdf-chrome/, 'sin cromo de edición');
  for (const text of ['Consumo anual', 'Medición neta', 'Modo de precio', 'Tasa de descuento']) assert.ok(htmlFor.parameters.includes(text), text);
  // «Costos»: la misma tabla interna de costos del simulador (matriz de costos), en solo lectura salvo la moneda.
  for (const text of ['Costos proyectos', 'Uso Interno Confidencial', 'Factor Venta', 'Precio Neto', 'Total Neto (Costo Total)', 'Precio kilos costo', 'Métricas de Margen', 'Ganancia Proyectada', 'Precio Unit. USD', 'Precio Total RD', 'ITBIS USD']) assert.ok(htmlFor.costs.includes(text), `costos: ${text}`);
  const viewedSummary = calculateProjectFinancialSummary(viewed);
  assert.ok(viewedSummary.costMatrix.items.length > 0, 'la propuesta de prueba tiene filas en la matriz');
  for (const item of viewedSummary.costMatrix.items) assert.ok(htmlFor.costs.includes(item.name.replace(/&/g, '&amp;')), `fila ${item.name}`);
  assert.ok(htmlFor.costs.includes(viewedSummary.costMatrix.gananciaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), 'ganancia de la propuesta vista');
  assert.match(htmlFor.costs, /aria-pressed="true"[^>]*>[^<]*Dual/, 'la moneda empieza en Dual y se marca con aria-pressed');
  assert.match(htmlFor.summary, /aria-selected="true"[^>]*>.*?Resumen/);
  // Sin visor: vista previa normal.
  const closed = renderToStaticMarkup(React.createElement(QuotationEditorView));
  assert.doesNotMatch(closed, /data-viewer|Propuesta de origen · solo lectura/);
  assert.match(closed, /<div class="qe-preview">/);
}

// Guarda de código (lista blanca): el visor y todo lo que dibuja no toca el store salvo los selectores de lectura
// permitidos aquí, no monta la sincronización de anexos ni pasa acciones de edición a las páginas.
{
  const root = process.cwd();
  const pagesDir = 'src/components/pdf/pages';
  const files = [
    'src/components/quotations/editor/ProposalViewer.tsx', 'src/components/quotations/editor/ProposalViewerDocument.tsx',
    'src/components/pdf/ProposalDocumentPages.tsx', 'src/components/hub/proposalSummaryData.ts', 'src/components/simulator/tabs/CostMatrixTable.tsx', 'src/features/quotations/proposalDocuments.ts',
    ...readdirSync(path.join(root, pagesDir), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => `${pagesDir}/${f}`),
  ];
  // Únicas lecturas del store permitidas (texto exacto).
  const ALLOWED_STORE_READS = [
    'useSimulationStore((s) => s.companies.find((c) => c.id === project.companyProfileId))',
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8');
    let rest = source;
    for (const allowed of ALLOWED_STORE_READS) rest = rest.split(allowed).join('');
    if (/\buseSimulationStore\b(?!['"])/.test(rest.replace(/^import .*$/gm, ''))) offenders.push(`${file}: lectura del store fuera de la lista blanca`);
    if (/\b(?:getState|setState)\s*\(/.test(source)) offenders.push(`${file}: getState/setState`);
    if (/\b(?:ProposalAnnexSync|useDocumentLayout)\b/.test(source)) offenders.push(`${file}: monta la sincronización de anexos o el diseño editable`);
  }
  assert.ok(files.length > 10, 'incluye las páginas del documento');
  assert.deepEqual(offenders, []);
  // El visor nunca pasa `editing` a las páginas ni acciones al proveedor de textos.
  const viewerDocument = readFileSync(path.join(root, 'src/components/quotations/editor/ProposalViewerDocument.tsx'), 'utf8');
  assert.doesNotMatch(viewerDocument, /editing\s*[:=]|\bactions=|writable=\{true\}|mode="edit"/);
  assert.match(viewerDocument, /mode="view" writable=\{false\}/);
  // El detector funciona.
  assert.ok(/\buseSimulationStore\b(?!['"])/.test('const x = useSimulationStore((s) => s.projects);'));
  assert.ok(/\b(?:getState|setState)\s*\(/.test('useSimulationStore.getState({})'));
}

// --- (11) «Abrir propuesta» y «Volver a COT-…» -----------------------------------------------------------------------
reset({ syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
{
  const created = createQuotationFromProposal('p-1', ALL_CONVERSION_BLOCKS);
  assert.ok(created.ok);
  const id = created.ok ? created.id : '';
  const number = quotationById(id).number!;
  assert.ok(number, 'sin cuenta la cotización tiene número local');
  store.getState().openProposalFromQuotation({ quotationId: id, projectId: 'p-1', tab: 'attachments', viewer: 'document' });
  let state = store.getState();
  assert.equal(state.activeView, 'project-hub');
  assert.equal(state.activeProjectId, 'p-1', 'abrir la propuesta completa sí la activa (acción explícita)');
  assert.equal(returnPillLabel(state), `Volver a ${number}`);
  const pill = render(React.createElement(ReturnToQuotationPill));
  assert.match(pill, new RegExp(`Volver a ${number}`));
  assert.match(pill, /Descartar el regreso a la cotización/);
  // También en el simulador y el documento; no en otra propuesta ni en otras vistas.
  for (const view of ['simulator', 'pdf-preview'] as const) assert.ok(returnPillLabel({ ...state, activeView: view }));
  assert.equal(returnPillLabel({ ...state, activeProjectId: 'p-3' }), null);
  assert.equal(returnPillLabel({ ...state, activeView: 'dashboard' }), null);
  // Con la función apagada no se ve.
  store.setState({ localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS, quotations: false } });
  assert.equal(render(React.createElement(ReturnToQuotationPill)), '');
  store.setState({ localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS } });
  // Volver: el editor en la misma pestaña y con el visor abierto en el mismo modo.
  state.returnToQuotation();
  state = store.getState();
  assert.equal(state.activeView, 'quotation-editor');
  assert.equal(state.activeQuotationId, id);
  assert.deepEqual(state.quotationEditorEntry, { tab: 'attachments', viewer: 'document' });
  assert.equal(state.quotationReturn, null);
  const back = render(React.createElement(QuotationEditorView));
  assert.match(back, /id="qe-tab-attachments"[^>]*aria-selected="true"/);
  assert.match(back, /id="pv-tab-document"[^>]*aria-selected="true"/);
  // El editor consume el punto de entrada al montarse; ir al gestor de plantillas y volver no reabre el visor.
  store.getState().consumeQuotationEditorEntry();
  assert.equal(store.getState().quotationEditorEntry, null);
  store.setState({ quotationEditorEntry: { tab: 'attachments', viewer: 'document' } });
  store.getState().openQuotationLibrary();
  assert.equal(store.getState().quotationEditorEntry, null, 'el gestor reinicia el punto de entrada');
  store.getState().closeQuotationLibrary();
  assert.equal(store.getState().activeView, 'quotation-editor');
  const fromLibrary = render(React.createElement(QuotationEditorView));
  assert.doesNotMatch(fromLibrary, /Propuesta de origen · solo lectura/, 'volver del gestor no reabre el visor');
  assert.match(fromLibrary, /id="qe-tab-content"[^>]*aria-selected="true"/);
  store.setState({ quotationEditorEntry: { tab: 'attachments', viewer: 'document' } });
  store.getState().closeQuotation();
  assert.equal(store.getState().quotationEditorEntry, null, 'cerrar el editor también lo reinicia');
  store.setState({ activeQuotationId: id, activeView: 'quotation-editor' });
  // Código: el editor la consume en un efecto que solo cambia la vista (no el contenido).
  assert.match(readFileSync(path.join(process.cwd(), 'src/components/quotations/editor/QuotationEditorView.tsx'), 'utf8'), /consumeQuotationEditorEntry\(\)/);
  // Abrir otra cotización por el catálogo reinicia el punto de entrada y olvida el regreso.
  state.openProposalFromQuotation({ quotationId: id, projectId: 'p-1', tab: 'content', viewer: null });
  store.getState().openQuotation(id);
  assert.equal(store.getState().quotationEditorEntry, null);
  assert.equal(store.getState().quotationReturn, null);
  // Descartar sin volver.
  store.getState().openProposalFromQuotation({ quotationId: id, projectId: 'p-1', tab: 'content', viewer: null });
  store.getState().dismissQuotationReturn();
  assert.equal(returnPillLabel(store.getState()), null);
  // Una propuesta que ya no existe no se abre; una cotización borrada no deja volver.
  store.getState().openProposalFromQuotation({ quotationId: id, projectId: 'p-ninguna', tab: 'content', viewer: null });
  assert.equal(store.getState().quotationReturn, null);
  store.setState({ quotationReturn: { quotationId: 'q-borrada', projectId: 'p-1', tab: 'content', viewer: null } });
  const viewBefore = store.getState().activeView;
  store.getState().returnToQuotation();
  assert.equal(store.getState().quotationReturn, null);
  assert.equal(store.getState().activeView, viewBefore, 'sin la cotización no cambia la vista');
}

console.log('Quotation linked proposal tests passed.');
