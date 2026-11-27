// Conversión propuesta → cotización desde el store, listas enlazadas (por propuesta y por cliente), propuesta de origen
// en el editor, puntos de entrada y función `quotations` apagada (docs/QUOTATION_FROM_PROPOSAL.md).
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { DEFAULT_FEATURE_SETTINGS } from '../../shared/applicationFeatures';
import { computeQuotationTotals, toCents } from '../../shared/quotations';
import type { ProjectSimulation } from '../types';
import type { ClientRecord } from '../types/client';

registerHooks({ load: (url, context, next) => (url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context)) });
const { useSimulationStore } = await import('../store/useSimulationStore');
const { BENCHMARK_PROJECT } = await import('../engine/referenceCase');
const { calculateProjectFinancialSummary } = await import('../engine/financeEngine');
const { ALL_CONVERSION_BLOCKS } = await import('../features/quotations/proposalSource');
const { createQuotationFromProposal } = await import('../features/quotations/proposalConversion');
const { convertibleProposals, quotationsForClient, quotationsFromProposal, selectSourceProject, sourceProposalLink, sourceProposalOptions } = await import('../features/quotations/linkedQuotations');
const { quotationEditorActions } = await import('../features/quotations/editorActions');
const { setSourceProject } = await import('../domain/quotationEdit');
const { ProjectHubView } = await import('../components/hub/ProjectHubView');
const { ClientDetailPanel } = await import('../components/clients/ClientDetailPanel');
const { QuotationsHub } = await import('../components/quotations/hub/QuotationsHub');
const { ConvertProposalDialog, closeFocusTarget, toggleBlockChoice, totalDifferenceText } = await import('../components/quotations/convert/ConvertProposalDialog');
const { QuotationEditorView } = await import('../components/quotations/editor/QuotationEditorView');

const store = useSimulationStore;
const initial = { ...store.getState() };
const client: ClientRecord = { id: 'cli-1', kind: 'company', name: 'Centro Médico Hispánico', taxId: '', phone: '', email: '', address: '', notes: '', version: 0, baseVersion: 0, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' } as unknown as ClientRecord;
const proposal = (id: string, patch: (p: ProjectSimulation) => void = () => undefined): ProjectSimulation => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = id;
  p.clientId = 'cli-1';
  patch(p);
  return p;
};
const p1 = proposal('p-1', (p) => { p.folderId = 'f-com'; p.updatedAt = '2026-11-20T00:00:00Z'; });
const p2 = proposal('p-2', (p) => { p.isDeleted = true; p.client.name = 'En papelera'; });
const p3 = proposal('p-3', (p) => { delete p.clientId; p.client.name = 'Agroindustrial del Cibao'; p.updatedAt = '2026-11-25T00:00:00Z'; });
const p4 = proposal('p-4', (p) => { p.clientId = 'cli-gone'; p.client.name = 'Hotel Brisas del Este'; p.updatedAt = '2026-11-10T00:00:00Z'; });
const reader = { id: 'u-r', name: 'Lucía', email: 'l@example.invalid', role: 'LECTOR', organizationId: 'org-a' };

const reset = (extra: Record<string, unknown> = {}) => {
  store.setState({
    projects: [p1, p2, p3, p4].map((p) => structuredClone(p)),
    clients: [client],
    folders: [{ id: 'f-com', name: 'Comercial', createdAt: '2026-01-01T00:00:00.000Z' } as never],
    quotations: [], quotationChanges: {}, quotationDeletionQueue: [], quotationNumberCounters: {},
    activeView: 'project-hub', activeProjectId: 'p-1', activeQuotationId: null, sidebarTheme: 'light',
    localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS },
    syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
    ...extra,
  });
  Object.assign(store.getInitialState(), store.getState());
};
const render = (element: React.ReactElement) => { Object.assign(store.getInitialState(), store.getState()); return renderToStaticMarkup(element); };

// --- Crear borrador desde una propuesta: enlazado, abierto en el editor, y la propuesta no cambia -----------------------
reset();
{
  const projectsBefore = structuredClone(store.getState().projects);
  const result = createQuotationFromProposal('p-1', { ...ALL_CONVERSION_BLOCKS });
  assert(result.ok, result.ok ? '' : result.error);
  const state = store.getState();
  const created = state.quotations.find((q) => q.id === result.id);
  assert(created);
  assert.equal(created.status, 'draft');
  assert.equal(created.sourceProjectId, 'p-1');
  assert.equal(created.clientId, 'cli-1', 'el cliente del directorio pasa enlazado (existe)');
  assert.match(created.number ?? '', /^COT-\d{4}-0001$/, 'número local');
  assert.equal(state.activeView, 'quotation-editor');
  assert.equal(state.activeQuotationId, result.id);
  assert.equal(computeQuotationTotals(created).totalCents, toCents(calculateProjectFinancialSummary(p1).contractPriceUSD));
  assert.deepEqual(state.projects, projectsBefore, 'la propuesta de origen no se modifica (igualdad profunda)');
}
// Cliente de la propuesta que ya no está en el directorio: no se enlaza (la misma regla que rechaza `invalid_client`).
{
  const result = createQuotationFromProposal('p-4', { ...ALL_CONVERSION_BLOCKS });
  assert(result.ok, result.ok ? '' : result.error);
  const created = store.getState().quotations.find((q) => q.id === result.id);
  assert.equal(created?.clientId, undefined);
  assert.equal(created?.client.name, 'Hotel Brisas del Este');
  assert(result.notices.some((n) => /directorio/.test(n)));
}
// Papelera, inexistente y LECTOR: error, nada se crea.
{
  const count = store.getState().quotations.length;
  const trashed = createQuotationFromProposal('p-2', { ...ALL_CONVERSION_BLOCKS });
  assert.equal(trashed.ok, false);
  assert.equal(createQuotationFromProposal('p-404', { ...ALL_CONVERSION_BLOCKS }).ok, false);
  store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: reader as never } });
  const denied = createQuotationFromProposal('p-1', { ...ALL_CONVERSION_BLOCKS });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.error, /rol/);
  store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: null } });
  assert.equal(store.getState().quotations.length, count);
}

// --- Listas enlazadas: por propuesta y por cliente, sin las borradas --------------------------------------------------
{
  const second = createQuotationFromProposal('p-1', { ...ALL_CONVERSION_BLOCKS, client: false });
  assert(second.ok);
  const other = createQuotationFromProposal('p-3', { ...ALL_CONVERSION_BLOCKS });
  assert(other.ok);
  const state = store.getState();
  const fromP1 = quotationsFromProposal(state.quotations, 'p-1', state.quotationDeletionQueue);
  assert.equal(fromP1.length, 2);
  assert(fromP1.every((q) => q.sourceProjectId === 'p-1'));
  assert.deepEqual(quotationsForClient(state.quotations, 'cli-1').map((q) => q.sourceProjectId), ['p-1'], 'por clientId: la segunda se creó sin cliente');
  assert.equal(quotationsFromProposal(state.quotations, '').length, 0);
  // Eliminar una cotización la quita de las listas.
  assert(store.getState().deleteQuotationRecord(fromP1[0].id).ok);
  const after = store.getState();
  assert.equal(quotationsFromProposal(after.quotations, 'p-1', after.quotationDeletionQueue).length, 1);
  // Una copia antigua que aún la tuviera en la lista también la ignora (borrado en cola).
  assert.equal(quotationsFromProposal([...after.quotations, fromP1[0]], 'p-1', after.quotationDeletionQueue).length, 1);
}

// --- Propuesta de origen: estado del enlace --------------------------------------------------------------------------
{
  const projects = store.getState().projects;
  assert.equal(sourceProposalLink(projects, undefined).state, 'none');
  assert.equal(sourceProposalLink(projects, 'p-1').state, 'available');
  assert.equal(sourceProposalLink(projects, 'p-2').state, 'trashed');
  assert.equal(sourceProposalLink(projects, 'p-404').state, 'missing');
}

// --- Propuestas convertibles: sin papelera, búsqueda por cliente (sin acentos) y carpeta, más recientes primero ----------
{
  const { projects, folders } = store.getState();
  assert.deepEqual(convertibleProposals(projects, folders).map((p) => p.id), ['p-3', 'p-1', 'p-4']);
  assert.deepEqual(convertibleProposals(projects, folders, 'comercial').map((p) => p.id), ['p-1'], 'por carpeta');
  assert.deepEqual(convertibleProposals(projects, folders, 'cibao').map((p) => p.id), ['p-3']);
  assert.deepEqual(convertibleProposals(projects, folders, 'SP-2024').length, 3, 'por código');
  assert.deepEqual(convertibleProposals(projects, folders, 'papelera'), []);
}

// --- Enlazar o quitar la propuesta de origen desde el editor (solo el enlace) -------------------------------------------
{
  const blank = store.getState().createQuotationRecord({});
  assert(blank.ok);
  const actions = quotationEditorActions(store.getState, blank.quotation.id);
  assert.equal(actions.edit((c) => setSourceProject(c, 'p-3')), null);
  const linked = store.getState().quotations.find((q) => q.id === blank.quotation.id);
  assert.equal(linked?.sourceProjectId, 'p-3');
  assert.deepEqual(linked?.items, [], 'enlazar no importa contenido');
  assert.equal(actions.edit((c) => setSourceProject(c, null)), null);
  const unlinked = store.getState().quotations.find((q) => q.id === blank.quotation.id);
  assert.equal(unlinked && 'sourceProjectId' in unlinked ? unlinked.sourceProjectId : undefined, undefined);
}

// --- Puntos de entrada y listas en la interfaz ------------------------------------------------------------------------
reset();
{
  const created = createQuotationFromProposal('p-1', { ...ALL_CONVERSION_BLOCKS });
  assert(created.ok);
  store.setState({ activeView: 'project-hub', activeProjectId: 'p-1' });
  const hub = render(React.createElement(ProjectHubView));
  assert.match(hub, /Crear cotización/);
  assert.match(hub, /aria-label="Cotizaciones creadas desde esta propuesta"/);
  assert.match(hub, /COT-\d{4}-0001/, 'número resaltado en la lista');
  assert.match(hub, /US\$ /, 'total en su moneda');
  const clientPanel = render(React.createElement(ClientDetailPanel, { client, readOnly: false }));
  assert.match(clientPanel, /aria-label="Cotizaciones del cliente"/);
  assert.match(clientPanel, /COT-\d{4}-0001/);
  const catalog = render(React.createElement(QuotationsHub));
  assert.match(catalog, /aria-haspopup="menu"/, '«Nueva» abre un menú (En blanco / Desde una propuesta)');
  // Papelera: el resumen no ofrece crear cotización.
  store.setState({ activeProjectId: 'p-2' });
  assert.doesNotMatch(render(React.createElement(ProjectHubView)), /Crear cotización/);
  // LECTOR: tampoco.
  store.setState({ activeProjectId: 'p-1', syncSettings: { ...store.getState().syncSettings, currentUser: reader as never } });
  const readOnlyHub = render(React.createElement(ProjectHubView));
  assert.doesNotMatch(readOnlyHub, /Crear cotización/);
  assert.match(readOnlyHub, /Cotizaciones creadas desde esta propuesta/, 'la lista sí se ve');
  store.setState({ syncSettings: { ...store.getState().syncSettings, currentUser: null } });

  // Función apagada: ningún punto de entrada ni lista.
  store.setState({ localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS, quotations: false } });
  const off = render(React.createElement(ProjectHubView));
  assert.doesNotMatch(off, /Crear cotización/);
  assert.doesNotMatch(off, /Cotizaciones creadas desde esta propuesta/);
  const offClient = render(React.createElement(ClientDetailPanel, { client, readOnly: false }));
  assert.doesNotMatch(offClient, /Cotizaciones del cliente/);
  store.setState({ localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS } });
}

// --- Diálogo: propuesta preseleccionada, cinco bloques, papelera fuera, roles ARIA -------------------------------------
{
  const html = render(React.createElement(ConvertProposalDialog, { initialProjectId: 'p-1', onClose: () => undefined }));
  assert.match(html, /<dialog[^>]*aria-modal="true"[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/);
  assert.match(html, /Crear cotización desde una propuesta/);
  assert.match(html, /La propuesta no se modifica\. El borrador queda enlazado a ella\./);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3, 'tres propuestas accesibles (sin la de la papelera)');
  assert.match(html, /<input type="radio" name="qconv-proposal" checked="" value="p-1"/);
  assert.equal((html.match(/type="checkbox"[^>]*checked=""/g) ?? []).length, 5);
  for (const label of ['Cliente enlazado', 'Equipos y materiales', 'Documentos', 'Moneda y tasa', 'Condiciones y vigencia']) assert.match(html, new RegExp(label));
  assert.match(html, /5 de 5 bloques seleccionados/);
  assert.doesNotMatch(html, /En papelera/);
  assert.match(html, /aria-label="Cerrar"/);
  assert.doesNotMatch(html, /disabled=""[^>]*>Crear borrador/, 'con propuesta elegida se puede crear');
  // Preseleccionada fuera del primer tramo o de la búsqueda: sigue a la vista, nunca hay una selección oculta.
  store.setState({ projects: [...store.getState().projects, ...Array.from({ length: 60 }, (_, i) => proposal(`bulk-${i}`, (p) => { p.client.name = `Lote ${i}`; p.updatedAt = '2026-11-26T00:00:00Z'; }))] });
  const many = render(React.createElement(ConvertProposalDialog, { initialProjectId: 'p-4', onClose: () => undefined }));
  assert.equal((many.match(/type="radio"/g) ?? []).length, 51, '50 a la vez y la elegida');
  assert.match(many, /checked="" value="p-4"/);
  assert.match(many, /Se muestran 50 de 63/);
  store.setState({ projects: store.getState().projects.filter((p) => !p.id.startsWith('bulk-')) });
  const none = render(React.createElement(ConvertProposalDialog, { onClose: () => undefined }));
  assert.match(none, /disabled=""[^>]*>Crear borrador/, 'sin propuesta elegida no');
}

// --- Editor: la propuesta de origen se ve, se abre y se degrada sin romper ---------------------------------------------
{
  const state = store.getState();
  const quotation = state.quotations[0];
  store.setState({ activeQuotationId: quotation.id, activeView: 'quotation-editor' });
  const available = render(React.createElement(QuotationEditorView));
  assert.match(available, /Propuesta de origen/);
  assert.match(available, /Ver propuesta/);
  store.setState({ projects: state.projects.map((p) => (p.id === 'p-1' ? { ...p, isDeleted: true } : p)) });
  const trashed = render(React.createElement(QuotationEditorView));
  assert.match(trashed, /La propuesta de origen está en la papelera\./);
  assert.doesNotMatch(trashed, /Ver propuesta/);
  store.setState({ projects: state.projects.filter((p) => p.id !== 'p-1') });
  const missing = render(React.createElement(QuotationEditorView));
  assert.match(missing, /La propuesta de origen ya no está disponible/);
  assert.match(missing, /Quitar enlace/, 'en borrador se puede quitar el enlace roto');
  // Sin enlace, en borrador: «Enlazar propuesta…».
  store.setState({ projects: state.projects, quotations: state.quotations.map((q) => (q.id === quotation.id ? { ...q, sourceProjectId: undefined } : q)) });
  assert.match(render(React.createElement(QuotationEditorView)), /Enlazar propuesta…/);
}

// --- (8) Editor: lista de propuestas perezosa y selector estrecho de la propuesta de origen ----------------------------
{
  const html = render(React.createElement(QuotationEditorView));
  assert.match(html, /Enlazar propuesta…/);
  assert.doesNotMatch(html, /<option value="p-3"/, 'las propuestas del selector no se calculan al pintar');
  const { projects, folders } = store.getState();
  assert.deepEqual(sourceProposalOptions(projects, folders).map((o) => o.id), ['p-3', 'p-1', 'p-4']);
  assert.match(sourceProposalOptions(projects, folders)[1].label, /CENTRO MEDICO HISPANICO · Final · SP-2024-089 · carpeta Comercial/);
  const source = selectSourceProject({ projects }, 'p-1');
  const edited = projects.map((p) => (p.id === 'p-3' ? { ...p, updatedAt: '2026-11-27T00:00:00Z' } : p));
  assert.equal(selectSourceProject({ projects: edited }, 'p-1'), source, 'editar otra propuesta no cambia la referencia');
  assert.equal(selectSourceProject({ projects }, undefined), undefined);
}

// --- (7) Foco al cerrar y (9) cambiar un bloque limpia el error del diálogo --------------------------------------------
{
  const button = { isConnected: true } as unknown as HTMLElement;
  const opener = { isConnected: true } as unknown as HTMLElement;
  assert.equal(closeFocusTarget({ current: button }, opener), button, 'vuelve al botón «Nueva cotización»');
  assert.equal(closeFocusTarget({ current: null }, opener), opener);
  assert.equal(closeFocusTarget(undefined, opener), opener);
  assert.equal(closeFocusTarget({ current: { isConnected: false } as unknown as HTMLElement }, opener), opener, 'un botón ya desmontado no');
  const next = toggleBlockChoice({ blocks: { ...ALL_CONVERSION_BLOCKS }, error: 'La propuesta ya no está disponible.' }, 'items');
  assert.equal(next.error, null);
  assert.equal(next.blocks.items, false);
  assert.equal(next.blocks.client, true);
}

// --- (1) Con descuentos y líneas gravadas el borrador cuadra: no hay aviso de diferencia. Solo el resto de un descuento
// mayor que la parte sin ITBIS deja una diferencia exacta, visible junto al resumen, fuera de los avisos plegados -------
{
  const discounted = proposal('p-disc', (p) => {
    p.client.name = 'Con descuento';
    p.financials = { ...p.financials, applyITBISExemption: false, customITBISSavedUSD: undefined, customDiscounts: [{ id: 'd', description: 'Cierre', type: 'percentage', value: 10 }] };
  });
  const residual = proposal('p-resto', (p) => {
    p.client.name = 'Descuento mayor';
    p.specs = { ...p.specs, pricingMode: 'direct_watt', pricePerWattUSD: 0.2 };
    p.financials = {
      ...p.financials,
      customItems: [
        { id: 'x-tax', description: 'Transformador', quantity: 2, unit: 'UD', unitPriceUSD: 1_500, exonerateITBIS: false, applyMargin: false },
      ],
      customDiscounts: [{ id: 'd', description: 'Liquidación', type: 'percentage', value: 60 }],
    };
  });
  store.setState({ projects: [...store.getState().projects, discounted, residual] });
  assert.doesNotMatch(render(React.createElement(ConvertProposalDialog, { initialProjectId: 'p-disc', onClose: () => undefined })), /qconv-difference/, 'exención apagada con 10 %: cuadra, sin aviso');
  const html = render(React.createElement(ConvertProposalDialog, { initialProjectId: 'p-resto', onClose: () => undefined }));
  const line = /<p class="qconv-difference">([^<]+)<\/p>/.exec(html);
  assert(line, 'la diferencia del resto se ve');
  assert.match(line[1], /^El total quedará US\$ [\d,]+\.\d\d por debajo del de la propuesta: US\$ [\d,]+\.\d\d del descuento superan las líneas sin ITBIS y se descuentan de todo el documento, ITBIS incluido\.$/);
  assert.equal(html.indexOf('qconv-difference') > html.indexOf('qconv-foot'), true, 'en el pie, no en el plegado');
  assert.doesNotMatch(render(React.createElement(ConvertProposalDialog, { initialProjectId: 'p-3', onClose: () => undefined })), /qconv-difference/, 'si cuadra no se muestra');
  assert.equal(totalDifferenceText({ totalDifferenceCents: 0, totalDifferenceReason: null, residualDiscountCents: 0 }, 'USD'), null);
  assert.equal(totalDifferenceText({ totalDifferenceCents: -22_444, totalDifferenceReason: 'residual_discount', residualDiscountCents: 411_500 }, 'USD'), 'El total quedará US$ 224.44 por debajo del de la propuesta: US$ 4,115.00 del descuento superan las líneas sin ITBIS y se descuentan de todo el documento, ITBIS incluido.');
  assert.equal(totalDifferenceText({ totalDifferenceCents: 3, totalDifferenceReason: 'other', residualDiscountCents: 0 }, 'DOP'), 'El total quedará RD$ 0.03 por encima del de la propuesta: revisa los importes del borrador.');
}

console.log('Quotation proposal links tests passed.');
