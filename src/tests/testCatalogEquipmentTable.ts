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
    item('b', 'battery', 'QA Batería 16', { capacityKWh: 16, dodPct: 90 }),
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
