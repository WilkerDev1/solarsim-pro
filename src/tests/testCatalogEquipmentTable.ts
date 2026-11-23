import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import type { SolarEquipmentItem } from '../types/equipment';

// The catalog tab imports stylesheets; node only needs their absence.
registerHooks({ load: (url, context, next) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) });
const { useSimulationStore } = await import('../store/useSimulationStore');
const { EquipmentManagerSettingsTab } = await import('../components/common/EquipmentManagerSettingsTab');

const item = (id: string, type: SolarEquipmentItem['type'], displayName: string, extra: Partial<SolarEquipmentItem> = {}): SolarEquipmentItem => ({
  id, type, displayName, brand: 'QA', modelSeries: 'Serie QA', createdAt: '2026-10-21', updatedAt: '2026-10-21', ...extra,
});
const offer = (id: string, priceUSD: number, stockStatus: 'in_stock' | 'out_of_stock' = 'in_stock') => ({ id, supplierName: 'Dist QA', priceUSD, stockStatus, updatedAt: '2026-10-21' });
useSimulationStore.setState({
  equipmentCatalog: [
    item('p', 'panel', 'QA Panel 600', { powerW: 600, efficiencyPct: 22.1, supplierPrices: [offer('o1', 95), offer('o2', 80, 'out_of_stock')], imageAssetIds: ['img-p'] }),
    item('i', 'inverter', 'QA Inversor 8K', { powerKW: 8, datasheetAssetId: 'ds-i', datasheetName: 'abc.pdf' }),
    item('b', 'battery', 'QA Batería 16', { capacityKWh: 16, dodPct: 90, supplierPrices: [offer('o3', 500)] }),
  ],
  equipmentConflicts: { b: { localItem: {} as SolarEquipmentItem, serverItem: {} as SolarEquipmentItem } } as any,
});
// Server rendering reads the store's initial snapshot; seed it with the live state.
Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
const html = renderToStaticMarkup(React.createElement(EquipmentManagerSettingsTab, { isDark: false }));
const body = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
if (process.env.CATALOG_TABLE_SNAPSHOT) writeFileSync(process.env.CATALOG_TABLE_SNAPSHOT, body);
const rows = body.split('<tr').slice(1);
assert.equal(rows.length, 4, 'Three equipment rows plus the conflict row');
assert.match(rows[0], /QA Panel 600/);
assert.match(rows[0], /600 Wp/);
assert.match(rows[0], /22.1% eficiencia/);
assert.match(rows[0], /\$95\.00/, 'Lowest available offer; out-of-stock ignored');
assert.match(rows[0], /2 ofertas registradas/);
assert.match(rows[1], /8 kW AC/);
assert.match(rows[1], /MPPT sin dato/);
assert.match(rows[1], /Sin precio disponible/);
assert.match(rows[2], /16 kWh/);
assert.match(rows[2], /90% DoD/);
assert.match(rows[2], /1 oferta registrada</, 'singular for one offer');
assert.match(rows[3], /pendientes de resolver/);
assert.match(rows[3], /Usar servidor/);
assert.match(rows[3], /Guardar copia/);
assert.ok(rows.slice(0, 3).every(row => /Editar/.test(row) && /aria-label="Eliminar /.test(row)));
// Preview icon in the "Equipo / modelo" cell: opens the gallery only when the model has assets.
assert.ok(rows.slice(0, 3).every(row => /data-preview-status=/.test(row)), 'Every model shows a preview icon');
assert.match(rows[0], /aria-label="Ver imágenes y ficha técnica de QA Panel 600"/);
assert.match(rows[1], /aria-label="Ver imágenes y ficha técnica de QA Inversor 8K"/);
assert.doesNotMatch(rows[2], /Ver imágenes y ficha técnica/, 'Without assets the type icon is not a button');
// Dropdowns that close on outside clicks must ignore the preview dialog, which lives in a body portal.
const { isInsideEquipmentPreview, EQUIPMENT_PREVIEW_ATTRIBUTE } = await import('../components/common/equipment/EquipmentPreviewDialog');
const node = (insideDialog: boolean) => ({ closest: (selector: string) => (insideDialog && selector === `[${EQUIPMENT_PREVIEW_ATTRIBUTE}]` ? {} : null) });
assert.equal(isInsideEquipmentPreview(node(true) as unknown as EventTarget), true);
assert.equal(isInsideEquipmentPreview(node(false) as unknown as EventTarget), false);
assert.equal(isInsideEquipmentPreview(null), false);
console.log('Catalog equipment table rows, offers, nominal values, conflict row and preview icons passed.');

// ADR 0006 §5: con sesión, la fila muestra «Genérico US$ X» bajo el precio de ofertas; el modal de ofertas lo muestra
// en la cabecera con «Cambiar»/«Quitar» (también para equipos de referencia); sin sesión, nada.
{
  const generic = { priceUSD: 88.5, observedAt: '2026-11-01T12:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-000000000123' };
  const session = { ...useSimulationStore.getState().syncSettings, serverUrl: 'https://catalog.invalid', authToken: 'synthetic', currentUser: { id: 'qa', name: 'QA', email: 'qa@example.invalid', role: 'EDITOR' as const, organizationId: 'org-qa' } };
  const { REFERENCE_EQUIPMENT_IDS } = await import('../../shared/referenceEquipment');
  const reference = item(REFERENCE_EQUIPMENT_IDS[0], 'panel', 'QA Referencia', { powerW: 550, organizationId: 'org-electsun-default' });
  useSimulationStore.setState({
    syncSettings: session, genericPrices: { i: generic, [reference.id]: generic }, pricePending: { observations: [], voids: [] }, equipmentConflicts: {},
    equipmentCatalog: [...useSimulationStore.getState().equipmentCatalog, reference],
  });
  Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
  const withGeneric = renderToStaticMarkup(React.createElement(EquipmentManagerSettingsTab, { isDark: false }));
  const genericRows = withGeneric.slice(withGeneric.indexOf('<tbody'), withGeneric.indexOf('</tbody>')).split('<tr').slice(1);
  assert.match(genericRows[1], /Genérico US\$\s?88[.,]50/, 'inverter row shows its generic price');
  assert.doesNotMatch(genericRows[0], /Genérico/, 'no generic price, no line');
  assert.match(genericRows[1], /Sin ofertas/, 'generic-only row does not claim it has no price');
  assert.doesNotMatch(genericRows[1], /Sin precio disponible/);
  assert.match(genericRows[1], /0 ofertas registradas/);
  const { SupplierPricesDetailModal } = await import('../components/common/SupplierPricesDetailModal');
  useSimulationStore.setState({ supplierPriceModalEquipment: reference });
  Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
  const modal = renderToStaticMarkup(React.createElement(SupplierPricesDetailModal));
  assert.match(modal, /Genérico US\$\s?88[.,]50/, 'offers header shows the generic price');
  assert.match(modal, />Cambiar</);
  assert.match(modal, />Quitar</);
  // LECTOR: ve el genérico pero sin acciones.
  useSimulationStore.setState({ syncSettings: { ...session, currentUser: { ...session.currentUser, role: 'LECTOR' as const } } });
  Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
  const readerModal = renderToStaticMarkup(React.createElement(SupplierPricesDetailModal));
  assert.match(readerModal, /Genérico US\$\s?88[.,]50/, 'readers see the generic price');
  assert.doesNotMatch(readerModal, />(Cambiar|Asignar|Quitar)</, 'readers get no generic price actions');
  useSimulationStore.setState({ syncSettings: session });
  Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
  // Regla 1: línea compacta tras guardar, con el texto del ADR para asignar y para actualizar.
  const { GenericPriceSuggestion } = await import('../components/common/equipment/GenericPrice');
  const base = { equipmentId: 'i', observationId: 'po-00000000-0000-4000-8000-000000000124', priceUSD: 80, scope: 'x', userId: 'qa' };
  const assign = renderToStaticMarkup(React.createElement(GenericPriceSuggestion, { suggestion: { ...base, decision: 'assign' }, onDismiss: () => {} }));
  assert.match(assign, /Oferta guardada · Sin precio genérico/);
  assert.match(assign, /Usar US\$\s?80[.,]00 como genérico/);
  const change = renderToStaticMarkup(React.createElement(GenericPriceSuggestion, { suggestion: { ...base, currentUSD: 88.5, decision: 'update' }, onDismiss: () => {} }));
  assert.match(change, /Oferta guardada · Genérico US\$\s?88[.,]50/);
  assert.match(change, /Cambiar a US\$\s?80[.,]00/);
  assert.doesNotMatch(assign + change, /bg-(amber|red|yellow)-/, 'no coloured warning boxes');
  // Editor del equipo: línea de solo lectura con el genérico.
  const { EquipmentEditorModal } = await import('../components/common/EquipmentEditorModal');
  const noop = () => {};
  const editor = (genericPrice: typeof generic | null | undefined) => renderToStaticMarkup(React.createElement(EquipmentEditorModal, {
    isDark: false, canEdit: true, isNewItem: false, editingItem: useSimulationStore.getState().equipmentCatalog[1], setEditingItem: noop, setIsEditorOpen: noop,
    handleSaveEditor: noop, genericPrice, feedbackMessage: null, allUniqueBrands: [], equipmentCatalog: useSimulationStore.getState().equipmentCatalog,
    assetBusy: false, setAssetBusy: noop, editorRef: { current: null },
  } as any));
  assert.match(editor(generic), /Precio genérico: US\$\s?88[.,]50 · .*Se cambia desde las ofertas del equipo\./);
  assert.match(editor(null), /Sin precio genérico · Se cambia desde las ofertas del equipo\./);
  assert.doesNotMatch(editor(undefined), /data-generic-price/, 'hidden without a session or for a new equipment');
  // Sin sesión (modo local) la función está apagada.
  useSimulationStore.setState({ syncSettings: { ...session, authToken: null, currentUser: null } });
  Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(SupplierPricesDetailModal)), /genérico/i, 'local mode shows nothing');
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(EquipmentManagerSettingsTab, { isDark: false })), /Genérico US/);
  console.log('Generic price line in catalog rows and offers header passed.');
}

{ // Ids de equipos nuevos: el prefijo sigue al tipo elegido en el editor; los existentes nunca cambian
  const { newEquipmentItemId, savedEquipmentItemId } = await import('../utils/equipmentIds');
  const { readFileSync } = await import('node:fs');
  assert.equal(newEquipmentItemId('battery', 1700000000000, () => 0.5), 'eq-battery-1700000000000-i');
  assert.match(newEquipmentItemId('inverter'), /^eq-inverter-\d+-[a-z0-9]+$/);
  const draft = newEquipmentItemId('panel', 1700000000000, () => 0.123456);
  assert.equal(savedEquipmentItemId(draft, 'battery', true), draft.replace('eq-panel-', 'eq-battery-'), 'nuevo: abierto como panel y guardado como batería');
  assert.equal(savedEquipmentItemId(draft, 'inverter', true), draft.replace('eq-panel-', 'eq-inverter-'));
  assert.equal(savedEquipmentItemId(draft, 'panel', true), draft, 'mismo tipo: igual');
  assert.equal(savedEquipmentItemId('eq-panel-123-abcd', 'battery', false), 'eq-panel-123-abcd', 'existente: el id no cambia nunca');
  assert.equal(savedEquipmentItemId('eq-6f1c-uuid', 'battery', false), 'eq-6f1c-uuid');
  assert.match(savedEquipmentItemId('', 'battery', true), /^eq-battery-\d+-[a-z0-9]+$/, 'sin id: se genera con su tipo');
  const tab = readFileSync('src/components/common/EquipmentManagerSettingsTab.tsx', 'utf8');
  assert.match(tab, /id: newEquipmentItemId\(type\)/, 'el borrador usa el generador');
  assert.match(tab, /id: savedEquipmentItemId\(editingItem\.id, editingItem\.type \|\| "panel", isNewItem\)/, 'al guardar, el prefijo sigue al tipo final');
  console.log('New equipment ids follow the item type passed.');
}
