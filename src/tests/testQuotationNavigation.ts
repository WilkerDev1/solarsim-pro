import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { createAndOpenQuotation } from '../features/quotations/newQuotation';

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

console.log('Quotation navigation tests passed.');
