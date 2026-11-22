// Regla 1 del ADR 0006 §4: las acciones explícitas del catálogo registran solo las ofertas nuevas o con precio
// distinto que de verdad quedaron guardadas; la herramienta de agente registra con fuente `agent` y su deshacer anula.
import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { acceptGenericSuggestion, genericSuggestionFor } from '../store/slices/equipmentPriceSlice';
import type { EquipmentSupplierPrice, SolarEquipmentItem } from '../types/equipment';

const serverUrl = 'https://offers.invalid';
const ana = { id: 'ana', name: 'Ana', email: 'ana@example.invalid', role: 'EDITOR' as const, organizationId: 'org-a' };
const offer = (id: string, supplierName: string, priceUSD: number, extra: Partial<EquipmentSupplierPrice> = {}): EquipmentSupplierPrice =>
  ({ id, supplierName, priceUSD, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z', ...extra });
const panel = (id: string, supplierPrices: EquipmentSupplierPrice[] = [], organizationId = 'org-a'): SolarEquipmentItem => ({
  id, type: 'panel', brand: 'QA', modelSeries: id, displayName: `Panel ${id}`, powerW: 600, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  organizationId, syncServerUrl: serverUrl, version: 1, baseVersion: 1, supplierPrices,
});
function reset(catalog: SolarEquipmentItem[], role: 'EDITOR' | 'LECTOR' = 'EDITOR') {
  store.getState().setSyncSettings({ serverUrl, authToken: 'synthetic', currentUser: { ...ana, role }, autoSyncEnabled: false });
  store.setState({ equipmentCatalog: catalog, equipmentChanges: {}, equipmentDeletionQueue: [], equipmentConflicts: {}, deletedEquipmentIds: [], genericPrices: {}, pricePending: { observations: [], voids: [] }, agentActivity: [], pendingAgentActions: [], agentPolicy: DEFAULT_AGENT_POLICY });
}
const observations = () => store.getState().pricePending.observations;
const summary = () => observations().map((o) => `${o.equipmentId}:${o.supplierOfferId}:${o.priceUSD}:${o.source}`).sort();

const originalFetch = globalThis.fetch;
const initial = store.getState();
globalThis.fetch = async () => { throw new Error('Real network forbidden'); };
try {
  // addOrUpdateSupplierPrice: oferta nueva y precio cambiado registran; stock solo no.
  reset([panel('eq-1', [offer('sp-a', 'Prov A', 100)])]);
  const created = store.getState().addOrUpdateSupplierPrice('eq-1', { id: 'sp-b', supplierName: 'Prov B', priceUSD: 90, source: 'manual' });
  assert.deepEqual(summary(), ['eq-1:sp-b:90:supplier_offer']);
  assert.deepEqual(created, [observations()[0].id], 'returns the recorded observation ids');
  store.getState().addOrUpdateSupplierPrice('eq-1', { ...offer('sp-a', 'Prov A', 100), stockStatus: 'out_of_stock' });
  assert.equal(observations().length, 1, 'stock-only edits record nothing');
  store.getState().addOrUpdateSupplierPrice('eq-1', { ...offer('sp-a', 'Prov A', 105), currency: 'DOP', priceDOP: 6300 });
  const dop = observations().find((o) => o.supplierOfferId === 'sp-a')!;
  assert.equal(dop.priceUSD, 105);
  assert.equal(dop.originalCurrency, 'DOP');
  assert.equal(dop.originalPrice, 6300);
  assert.equal(dop.supplierName, 'Prov A');

  // batchUpdateSupplierPrices: exactamente las ofertas cambiadas.
  reset([panel('eq-1', [offer('sp-a', 'Prov A', 100)]), panel('eq-2', [offer('sp-c', 'Prov A', 50)])]);
  const ids = store.getState().batchUpdateSupplierPrices([
    { equipmentId: 'eq-1', supplierPrice: offer('sp-a', 'Prov A', 100, { stockStatus: 'consult' }) },
    { equipmentId: 'eq-2', supplierPrice: offer('sp-c', 'Prov A', 55, { source: 'ai_scan' }) },
  ]);
  assert.deepEqual(summary(), ['eq-2:sp-c:55:ai_scan']);
  assert.equal(ids.length, 1);

  // Renombrar o borrar un proveedor no registra nada.
  store.getState().renameSupplier('Prov A', 'Proveedor A');
  store.getState().deleteSupplier('Proveedor A');
  assert.equal(observations().length, 1, 'rename/delete record nothing');

  // updateEquipmentItem: solo ofertas con precio distinto; renombrar el equipo, nada.
  reset([panel('eq-1', [offer('sp-a', 'Prov A', 100), offer('sp-b', 'Prov B', 80)])]);
  store.getState().updateEquipmentItem('eq-1', { displayName: 'Nuevo nombre' });
  assert.equal(observations().length, 0, 'renaming the equipment records nothing');
  const editorIds = store.getState().updateEquipmentItem('eq-1', { supplierPrices: [offer('sp-a', 'Prov A', 100), offer('sp-b', 'Prov B', 70), offer('sp-n', 'Prov N', 75)] });
  assert.deepEqual(summary(), ['eq-1:sp-b:70:supplier_offer', 'eq-1:sp-n:75:supplier_offer']);
  assert.equal(editorIds.length, 2);
  // Rule 1 (editor): una sola sugerencia, la oferta más baja de las cambiadas.
  const suggestion = genericSuggestionFor(store.getState(), editorIds)!;
  assert.equal(suggestion.priceUSD, 70);
  assert.equal(suggestion.decision, 'assign');
  assert.equal(suggestion.equipmentId, 'eq-1');
  store.setState({ genericPrices: { 'eq-1': { priceUSD: 70, observedAt: '2026-10-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-000000000001' } } });
  assert.equal(genericSuggestionFor(store.getState(), editorIds), null, 'same price as the generic: nothing to offer');
  store.setState({ genericPrices: { 'eq-1': { priceUSD: 60, observedAt: '2026-10-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-000000000001' } } });
  const updating = genericSuggestionFor(store.getState(), editorIds)!;
  assert.deepEqual({ equipmentId: updating.equipmentId, priceUSD: updating.priceUSD, currentUSD: updating.currentUSD, decision: updating.decision }, { equipmentId: 'eq-1', priceUSD: 70, currentUSD: 60, decision: 'update' });
  // Restaurar sin registrar (deshacer de agente).
  store.getState().updateEquipmentItem('eq-1', { supplierPrices: [offer('sp-a', 'Prov A', 1)] }, { recordPrices: false });
  assert.equal(observations().length, 2, 'recordPrices: false records nothing');

  // Regla 1, aceptar: la procedencia se captura al guardar, así que aceptar después de que la cola se envió conserva el proveedor.
  reset([panel('eq-1', [offer('sp-a', 'Prov A', 100)])]);
  store.setState({ genericPrices: { 'eq-1': { priceUSD: 60, observedAt: '2026-10-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-000000000001' } } });
  const acceptIds = store.getState().updateEquipmentItem('eq-1', { supplierPrices: [offer('sp-a', 'Prov A', 100), offer('sp-b', 'Prov B', 70, { currency: 'DOP', priceDOP: 4200 })] });
  const update = genericSuggestionFor(store.getState(), acceptIds)!;
  assert.equal(update.supplierName, 'Prov B');
  assert.equal(update.supplierOfferId, 'sp-b');
  store.setState({ pricePending: { observations: [], voids: [] } });
  const acceptedId = acceptGenericSuggestion(store.getState(), update)!;
  assert.ok(acceptedId, 'accepting queues a generic');
  const accepted = observations().find((o) => o.id === acceptedId)!;
  assert.equal(accepted.kind, 'generic');
  assert.equal(accepted.priceUSD, 70);
  assert.equal(accepted.source, 'supplier_offer');
  assert.equal(accepted.derivedFromId, update.observationId);
  assert.equal(accepted.supplierName, 'Prov B');
  assert.equal(accepted.supplierOfferId, 'sp-b');
  assert.equal(accepted.originalCurrency, 'DOP');
  assert.equal(accepted.originalPrice, 4200);
  // Una sugerencia de otro espacio de trabajo nunca se aplica en el actual.
  store.getState().setSyncSettings({ serverUrl, authToken: 'synthetic', currentUser: { ...ana, organizationId: 'org-b' }, autoSyncEnabled: false });
  store.setState({ equipmentCatalog: [panel('eq-1', [], 'org-b')] });
  assert.equal(acceptGenericSuggestion(store.getState(), update), null, 'a suggestion from another workspace is refused');
  assert.equal(observations().length, 0, 'and records nothing there');

  // addEquipmentItem / addEquipmentBatch: un equipo nuevo registra sus ofertas con precio > 0.
  reset([]);
  store.getState().addEquipmentItem(panel('eq-new', [offer('sp-1', 'P1', 10), offer('sp-0', 'P0', 0)]));
  assert.deepEqual(summary(), ['eq-new:sp-1:10:supplier_offer']);
  store.getState().addEquipmentBatch([panel('eq-b1', [offer('sp-2', 'P2', 20)]), panel('eq-b2')]);
  assert.deepEqual(summary(), ['eq-b1:sp-2:20:supplier_offer', 'eq-new:sp-1:10:supplier_offer']);

  // Escritura rechazada (equipo de otra organización): no registra nada.
  reset([panel('eq-foreign', [offer('sp-f', 'Prov F', 100)], 'org-b')]);
  store.getState().addOrUpdateSupplierPrice('eq-foreign', { id: 'sp-f', supplierName: 'Prov F', priceUSD: 1 });
  assert.equal(store.getState().equipmentCatalog[0].supplierPrices?.[0].priceUSD, 100, 'write rejected');
  assert.equal(observations().length, 0, 'a rejected write records nothing');
  store.getState().updateEquipmentItem('eq-foreign', { supplierPrices: [offer('sp-f', 'Prov F', 2)] });
  assert.equal(observations().length, 0);

  // LECTOR: el catálogo rechaza y no hay registro.
  reset([panel('eq-1', [offer('sp-a', 'Prov A', 100)])], 'LECTOR');
  store.getState().addOrUpdateSupplierPrice('eq-1', { id: 'sp-a', supplierName: 'Prov A', priceUSD: 1 });
  assert.equal(observations().length, 0);

  // Modo local: el catálogo cambia pero la función está apagada.
  store.getState().setSyncSettings({ serverUrl, authToken: null, currentUser: null, autoSyncEnabled: false });
  store.setState({ equipmentCatalog: [panel('eq-l', [offer('sp-l', 'L', 10)], undefined as unknown as string)], pricePending: { observations: [], voids: [] } });
  store.getState().addOrUpdateSupplierPrice('eq-l', { id: 'sp-l', supplierName: 'L', priceUSD: 12 });
  assert.equal(store.getState().equipmentCatalog[0].supplierPrices?.[0].priceUSD, 12);
  assert.equal(observations().length, 0, 'local mode records nothing');

  // Agente: update_supplier_price registra con fuente `agent`, avisa si difiere del genérico y su deshacer anula.
  reset([panel('eq-1', [offer('sp-a', 'Prov A', 100)])]);
  store.setState({ genericPrices: { 'eq-1': { priceUSD: 95, observedAt: '2026-10-01T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-000000000002' } } });
  const ctx = { source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'qa' };
  const queued = await executeAgentTool({ name: 'update_supplier_price', args: { equipmentId: 'eq-1', offerId: 'sp-a', priceUSD: 91 } }, ctx);
  assert.equal(queued.status, 'pending_confirmation');
  assert.equal(observations().length, 0, 'nothing recorded before confirmation');
  const confirmed = store.getState().confirmAgentAction(queued.actionId);
  assert.equal(confirmed.success, true);
  assert.deepEqual(summary(), ['eq-1:sp-a:91:agent']);
  const agentObservation = observations()[0].id;
  const entry = store.getState().agentActivity.find((a) => a.id === confirmed.activityId)!;
  assert.deepEqual(entry.undo?.priceObservationIds, [agentObservation]);
  // Bypass: aplica directo y el resultado dice que difiere del genérico.
  store.setState({ agentPolicy: { ...DEFAULT_AGENT_POLICY, external: { ...DEFAULT_AGENT_POLICY.external, guarded: 'allow' } } });
  const direct = await executeAgentTool({ name: 'update_supplier_price', args: { equipmentId: 'eq-1', offerId: 'sp-a', priceUSD: 93 } }, ctx);
  assert.equal(direct.status, 'applied', JSON.stringify(direct));
  assert.match(String((direct.data as { genericPrice?: string }).genericPrice), /difiere del precio genérico/);
  const stockOnly = await executeAgentTool({ name: 'update_supplier_price', args: { equipmentId: 'eq-1', offerId: 'sp-a', stockStatus: 'on_order' } }, ctx);
  assert.equal(stockOnly.status, 'applied');
  assert.equal(observations().length, 2, 'stock-only agent edit records nothing');
  assert.equal((stockOnly.data as { genericPrice?: string }).genericPrice, undefined);
  // Deshacer la última de precio: restaura la oferta sin registrar y anula su registro.
  const undoStock = store.getState().undoAgentActivity(stockOnly.activityId!);
  assert.equal(undoStock.success, true);
  const undo = store.getState().undoAgentActivity(direct.activityId!);
  assert.equal(undo.success, true, JSON.stringify(undo));
  assert.equal(store.getState().equipmentCatalog[0].supplierPrices?.[0].priceUSD, 91);
  assert.equal(observations().length, 2, 'undo does not record the restored price');
  const directObservation = observations().find((o) => o.priceUSD === 93)!.id;
  assert.ok(store.getState().pricePending.voids.some((v) => v.id === directObservation), 'undo voids the agent observation');
} finally {
  globalThis.fetch = originalFetch;
  store.setState(initial, true);
}
console.log('PASS: offer actions record exactly the landed price changes (never stock, renames, rejected writes, readers or local mode); the agent records as agent and its undo voids.');
