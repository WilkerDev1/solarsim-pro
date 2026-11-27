import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { createAndOpenQuotation } from '../features/quotations/newQuotation';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import type { SimulationStore } from '../store/types';

const store = useSimulationStore;

// Abrir una cotización lleva al editor con esa cotización; cerrarlo vuelve al catálogo.
store.getState().setActiveView('quotations-hub');
store.getState().openQuotation('q-1');
assert.equal(store.getState().activeView, 'quotation-editor');
assert.equal(store.getState().activeQuotationId, 'q-1');
store.getState().closeQuotation();
assert.equal(store.getState().activeView, 'quotations-hub');
assert.equal(store.getState().activeQuotationId, null);

// «Nueva cotización» crea un borrador y lo abre.
const before = store.getState().quotations.length;
const created = createAndOpenQuotation({ projectLabel: 'Alimentación de planta' });
assert.equal(created.ok, true);
assert.equal(store.getState().quotations.length, before + 1);
if (created.ok) {
  assert.equal(store.getState().activeQuotationId, created.id);
  assert.equal(store.getState().activeView, 'quotation-editor');
  const quotation = store.getState().quotations.find((q) => q.id === created.id);
  assert.equal(quotation?.status, 'draft');
  assert.equal(quotation?.projectLabel, 'Alimentación de planta');
}

// Reabrir la app: `activeView` se guarda y `activeQuotationId` no, así que el editor sin cotización vuelve al catálogo.
{
  store.getState().openQuotation('q-persisted');
  const saved = JSON.parse(JSON.stringify(serializeSimulationStore(store.getState()))) as SimulationStore;
  assert.equal(saved.activeView, 'quotation-editor');
  assert.equal('activeQuotationId' in saved, false);
  hydrateSimulationStore(saved);
  assert.equal(saved.activeView, 'quotations-hub');
  const hub = JSON.parse(JSON.stringify({ ...serializeSimulationStore(store.getState()), activeView: 'clients-hub' })) as SimulationStore;
  hydrateSimulationStore(hub);
  assert.equal(hub.activeView, 'clients-hub', 'otras vistas se conservan');
}

// Gestor de plantillas, firmas y sellos: desde el catálogo vuelve al catálogo; desde el editor, a la cotización abierta.
store.setState({ activeQuotationId: null });
store.getState().setActiveView('quotations-hub');
store.getState().openQuotationLibrary('signatures');
assert.equal(store.getState().activeView, 'quotation-library');
assert.equal(store.getState().quotationLibrarySection, 'signatures');
store.getState().openQuotationLibrary();
assert.equal(store.getState().quotationLibrarySection, 'signatures', 'sin sección, recuerda la última');
store.getState().closeQuotationLibrary();
assert.equal(store.getState().activeView, 'quotations-hub');
const opened = createAndOpenQuotation();
assert.ok(opened.ok);
store.getState().openQuotationLibrary('templates');
store.getState().closeQuotationLibrary();
assert.equal(store.getState().activeView, 'quotation-editor', 'vuelve a la cotización abierta');
{
  const { isQuotationsView } = await import('../features/application/quotationsFeature');
  assert.ok(isQuotationsView('quotation-library'), 'apagar la función también saca del gestor');
}

console.log('Quotation navigation tests passed.');
