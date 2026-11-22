// Vista «Historial» del modal de ofertas (ADR 0006 §6): fusión con lo pendiente, resumen mensual sin datos
// inventados, variación, «Propuesta eliminada», solo lectura para LECTOR y anulación del genérico vigente.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import type { EquipmentPriceObservation } from '../../shared/equipmentPrices';
import type { SolarEquipmentItem } from '../types/equipment';

registerHooks({ load: (url, context, next) => (url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context)) });
const { useSimulationStore } = await import('../store/useSimulationStore');
const { effectiveGenericPrice } = await import('../store/slices/equipmentPriceSlice');
const { mergePriceHistory, previousGenericPrice, voidHistoryRecord, PRICE_SOURCE_LABELS } = await import('../features/equipmentPrices/priceHistory');
const { PriceHistoryContent } = await import('../components/common/equipment/PriceHistory');

const serverUrl = 'https://history.invalid';
const editor = { id: 'ana', name: 'Ana', email: 'ana@example.invalid', role: 'EDITOR' as 'EDITOR' | 'LECTOR', organizationId: 'org-a' };
const session = (user = editor) => ({ serverUrl, authToken: 'synthetic', currentUser: user, autoSyncEnabled: false });
const panel: SolarEquipmentItem = {
  id: 'eq-h', type: 'panel', brand: 'QA', modelSeries: 'H', displayName: 'Panel Historial', powerW: 600,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', organizationId: 'org-a', syncServerUrl: serverUrl,
};
const id = (n: number) => `po-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const record = (n: number, extra: Partial<EquipmentPriceObservation>): EquipmentPriceObservation => ({
  id: id(n), seq: n, equipmentId: panel.id, kind: 'observation', priceUSD: 100, source: 'supplier_offer', observedAt: '2026-01-15T12:00:00.000Z', createdByName: 'Ana', ...extra,
});
// Enero 100; abril 110 (oferta, anulación en cola) y 90 (propuesta borrada); octubre 120 (propuesta viva); marzo vacío.
const server: EquipmentPriceObservation[] = [
  record(7, { kind: 'generic', priceUSD: 115, source: 'manual', observedAt: '2026-10-20T12:00:00.000Z' }),
  record(6, { priceUSD: 120, source: 'proposal', projectId: 'p-live', projectName: 'Hotel Brisa', projectCode: 'SP-77', observedAt: '2026-10-10T12:00:00.000Z' }),
  record(5, { priceUSD: 90, source: 'proposal', projectId: 'p-gone', projectName: null, projectCode: null, observedAt: '2026-04-12T12:00:00.000Z' }),
  record(4, { priceUSD: 110, supplierName: 'Dist QA', originalCurrency: 'DOP', originalPrice: 6600, observedAt: '2026-04-05T12:00:00.000Z' }),
  record(3, { kind: 'generic', priceUSD: 105, source: 'supplier_offer', supplierName: 'Dist QA', observedAt: '2026-02-01T12:00:00.000Z' }),
  record(2, { priceUSD: 999, voidedAt: '2026-02-02T00:00:00.000Z', observedAt: '2026-02-01T12:00:00.000Z' }),
  record(1, { priceUSD: 100, supplierName: 'Dist QA', observedAt: '2026-01-15T12:00:00.000Z' }),
];

// --- Fusión con la cola local: registros y anulaciones pendientes del usuario actual, solo de este equipo.
useSimulationStore.getState().setSyncSettings(session());
const scope = useSimulationStore.getState().workspaceScope;
useSimulationStore.setState({
  equipmentCatalog: [panel], equipmentConflicts: {}, genericPrices: { [panel.id]: { priceUSD: 115, observedAt: '2026-10-20T12:00:00.000Z', observationId: id(7) } },
  pricePending: {
    observations: [
      { id: id(50), equipmentId: panel.id, kind: 'observation', priceUSD: 130, source: 'manual', observedAt: '2026-11-01T12:00:00.000Z', scope, userId: 'ana' },
      { id: id(51), equipmentId: 'otro', kind: 'observation', priceUSD: 1, source: 'manual', observedAt: '2026-11-01T12:00:00.000Z', scope, userId: 'ana' },
      { id: id(52), equipmentId: panel.id, kind: 'observation', priceUSD: 2, source: 'manual', observedAt: '2026-11-01T12:00:00.000Z', scope, userId: 'otra' },
    ],
    voids: [{ id: id(4), scope, userId: 'ana' }],
  },
});
const rows = mergePriceHistory(server, useSimulationStore.getState(), panel.id);
assert.equal(rows[0].id, id(50), 'pending records go first');
assert.equal(rows[0].pendingSync, true);
assert.equal(rows[0].createdByName, 'Ana', 'a pending record is authored by the current user');
assert.ok(!rows.some((row) => row.id === id(51) || row.id === id(52)), 'other equipment or other users never appear');
assert.equal(rows.find((row) => row.id === id(4))?.voidPending, true, 'a queued void marks the server record');
assert.equal(rows.length, server.length + 1);
assert.equal(PRICE_SOURCE_LABELS.proposal, 'Propuesta');

// --- Contenido: gráfico accesible, resumen mensual (meses vacíos vacíos), variación, inicio, tabla.
Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
type ContentProps = Parameters<typeof PriceHistoryContent>[0];
const render = (canVoid: boolean, extra: Partial<ContentProps> = {}) =>
  renderToStaticMarkup(React.createElement(PriceHistoryContent, {
    rows, status: 'ready', hasMore: false, canVoid, onVoid: () => {}, onLoadMore: () => {}, now: new Date('2026-11-21T12:00:00.000Z'), ...extra,
  }));
const html = render(true);
assert.match(html, /role="img"/);
assert.match(html, /aria-label="Precio en el tiempo:[^"]*registros/);
assert.match(html, /El historial empieza el \d/);
const monthsStart = html.indexOf('data-history-months');
assert.ok(monthsStart > 0, 'monthly summary table');
const monthly = html.slice(monthsStart, html.indexOf('</table>', monthsStart));
const monthRow = (label: string) => monthly.split('<tr').find((row) => row.includes(`>${label}<`)) ?? '';
assert.match(monthRow('Ene'), /US\$\s?100[.,]00/);
assert.match(monthRow('Abr'), /US\$\s?90[.,]00/, 'a record with a queued void leaves the statistics');
assert.doesNotMatch(monthRow('Mar'), /US\$/, 'a month without records stays empty');
assert.match(monthRow('Mar'), /(<td><\/td>){4}/, 'empty cells, never filled');
assert.match(html, /3 meses/);
assert.match(html, /6 meses/);
assert.match(html, /12 meses/);
assert.match(html, /Propuesta eliminada/);
assert.match(html, /SP-77 · Hotel Brisa/);
assert.match(html, /pendiente de sincronizar/);
assert.match(html, /DOP\s?6[.,]600/);
assert.match(html, />Anular</);
assert.match(html, /Anulado/);
assert.match(html, /Oferta de proveedor/);
assert.match(html, /Precio genérico/);
assert.doesNotMatch(html, /bg-(amber|red|yellow)-/, 'no coloured warning boxes');

// Variación con datos: julio → octubre (+20 %) a 3 meses.
const change = renderToStaticMarkup(React.createElement(PriceHistoryContent, {
  rows: [record(20, { priceUSD: 100, observedAt: '2026-07-10T12:00:00.000Z' }), record(21, { priceUSD: 120, observedAt: '2026-10-10T12:00:00.000Z' })],
  status: 'ready', hasMore: false, canVoid: false, onVoid: () => {}, onLoadMore: () => {}, now: new Date('2026-11-21T12:00:00.000Z'),
}));
assert.match(change, /3 meses[^<]*<\/span>\s*<strong[^>]*>\+20[.,]0\s?%/);

// LECTOR: solo lectura.
assert.doesNotMatch(render(false), />Anular</, 'readers cannot void');

// Estados sin servidor: una línea gris, y lo pendiente sigue visible.
const offline = render(true, { status: 'offline', rows: rows.filter((row) => row.pendingSync) });
assert.match(offline, /Sin conexión/);
assert.match(offline, /pendiente de sincronizar/);
assert.match(render(true, { status: 'unsupported', rows: [] }), /no está disponible/);
assert.match(render(true, { status: 'ready', rows: [] }), /Aún no hay registros/);
assert.match(render(true, { hasMore: true }), />Cargar más</);

// --- Anular el genérico vigente devuelve en la cabecera el anterior (registro 3), no «sin genérico».
useSimulationStore.setState({ pricePending: { observations: [], voids: [] } });
const fresh = mergePriceHistory(server, useSimulationStore.getState(), panel.id);
assert.equal(previousGenericPrice(fresh, id(7))?.observationId, id(3));
assert.equal(effectiveGenericPrice(useSimulationStore.getState(), panel.id)?.priceUSD, 115);
assert.equal(voidHistoryRecord(panel.id, id(7), fresh), true);
assert.equal(effectiveGenericPrice(useSimulationStore.getState(), panel.id)?.priceUSD, 105, 'the previous generic comes back at once');
assert.deepEqual(useSimulationStore.getState().pricePending.voids.map((entry) => entry.id), [id(7)]);
// Anular un registro que no es el genérico vigente no toca el mapa.
assert.equal(voidHistoryRecord(panel.id, id(1), fresh), true);
assert.equal(effectiveGenericPrice(useSimulationStore.getState(), panel.id)?.priceUSD, 105);
// LECTOR no anula.
useSimulationStore.getState().setSyncSettings(session({ ...editor, role: 'LECTOR' }));
assert.equal(voidHistoryRecord(panel.id, id(6), fresh), false);

// --- Botón «Historial» en la cabecera del modal: con sesión (también LECTOR), nunca sin sesión.
const { SupplierPricesDetailModal } = await import('../components/common/SupplierPricesDetailModal');
useSimulationStore.setState({ supplierPriceModalEquipment: panel });
Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
assert.match(renderToStaticMarkup(React.createElement(SupplierPricesDetailModal)), />Historial</, 'readers can open the history');
useSimulationStore.getState().setSyncSettings({ serverUrl, authToken: null, currentUser: null, autoSyncEnabled: false });
Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
assert.doesNotMatch(renderToStaticMarkup(React.createElement(SupplierPricesDetailModal)), /Historial/, 'hidden without a session');

console.log('Price history view: merge, monthly summary, change, deleted proposals, readers and generic revert passed.');
