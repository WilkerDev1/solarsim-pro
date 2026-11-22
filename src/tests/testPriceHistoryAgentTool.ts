// Herramienta de agente `get_price_history` (ADR 0006 §6) en la app: lectura por SyncService con transporte sintético,
// registros + resumen, lo pendiente local marcado, sin sesión apagada y equipos fuera del espacio rechazados.
import assert from 'node:assert/strict';
import { findAgentTool } from '../../shared/agentTools/definitions';
import { validateJsonSchema } from '../../shared/agentTools/jsonSchema';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { useSimulationStore } from '../store/useSimulationStore';
import type { SolarEquipmentItem } from '../types/equipment';

const serverUrl = 'https://agent-history.invalid';
const user = { id: 'ana', name: 'Ana', email: 'ana@example.invalid', role: 'LECTOR' as const, organizationId: 'org-a' };
const panel: SolarEquipmentItem = {
  id: 'eq-a', type: 'panel', brand: 'QA', modelSeries: 'A', displayName: 'Panel A', powerW: 600,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', organizationId: 'org-a', syncServerUrl: serverUrl,
};
const id = (n: number) => `po-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const definition = findAgentTool('get_price_history');
assert.ok(definition, 'declared in shared/agentTools/definitions.ts');
assert.equal(definition.kind, 'read');
assert.equal(definition.category, 'pricing');
assert.deepEqual(definition.inputSchema.required, ['equipmentId']);
assert.deepEqual(validateJsonSchema(definition.inputSchema, { equipmentId: 'eq-a', limit: 20 }), []);
assert.ok(validateJsonSchema(definition.inputSchema, { equipmentId: 'eq-a', limit: 1000 }).length, 'limit is bounded');
assert.ok(validateJsonSchema(definition.inputSchema, { equipmentId: 'eq-a', projectName: 'x' }).length, 'strict schema');

const requests: string[] = [];
let mode: 'ok' | 'missing' | 'down' = 'ok';
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  requests.push(url.pathname + url.search);
  if (mode === 'down') throw new TypeError('network down');
  if (mode === 'missing') return new Response('Not Found', { status: 404 });
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic');
  if (url.pathname === '/api/equipment-prices')
    return Response.json({
      success: true,
      nextBefore: 3,
      observations: [
        { id: id(5), seq: 5, equipmentId: 'eq-a', kind: 'generic', priceUSD: 110, source: 'manual', observedAt: '2026-10-20T12:00:00.000Z', createdByName: 'Ana', createdById: 'ana', voidedAt: null },
        { id: id(4), seq: 4, equipmentId: 'eq-a', kind: 'observation', priceUSD: 120, source: 'proposal', projectId: 'p1', projectName: 'Hotel Brisa', projectCode: 'SP-77', observedAt: '2026-10-10T12:00:00.000Z', createdByName: 'Ana', voidedAt: null },
        { id: id(3), seq: 3, equipmentId: 'eq-a', kind: 'observation', priceUSD: 100, source: 'supplier_offer', supplierName: 'Dist QA', originalCurrency: 'DOP', originalPrice: 6000, observedAt: '2026-07-10T12:00:00.000Z', createdByName: 'Luis', voidedAt: null },
      ],
    });
  return Response.json({ success: false }, { status: 500 });
}) as typeof fetch;

const ctx = () => ({ source: 'mcp' as const, owner: assistantOwner() });
const call = (args: Record<string, unknown>) => executeAgentTool({ name: 'get_price_history', args }, ctx());

// Sin sesión: la función está apagada.
useSimulationStore.setState({ equipmentCatalog: [{ ...panel, organizationId: undefined, syncServerUrl: undefined }], deletedEquipmentIds: [], workspaceScope: 'local' });
useSimulationStore.getState().setSyncSettings({ serverUrl, authToken: null, currentUser: null, autoSyncEnabled: false });
const local = await call({ equipmentId: 'eq-a' });
assert.equal(local.status, 'error');
assert.match((local as { message: string }).message, /sesión/);
assert.equal(requests.length, 0, 'no request without a session');

// Con sesión (LECTOR también lee).
useSimulationStore.getState().setSyncSettings({ serverUrl, authToken: 'synthetic', currentUser: user, autoSyncEnabled: false });
const scope = useSimulationStore.getState().workspaceScope;
useSimulationStore.setState({
  equipmentCatalog: [panel], deletedEquipmentIds: [], genericPrices: { 'eq-a': { priceUSD: 110, observedAt: '2026-10-20T12:00:00.000Z', observationId: id(5) } },
  pricePending: { observations: [{ id: id(9), equipmentId: 'eq-a', kind: 'observation', priceUSD: 130, source: 'manual', observedAt: '2026-10-25T12:00:00.000Z', scope, userId: 'ana' }], voids: [] },
});
const result = await call({ equipmentId: 'eq-a', limit: 20 });
assert.equal(result.status, 'ok', JSON.stringify(result));
assert.equal(requests.at(-1), '/api/equipment-prices?equipmentId=eq-a&limit=20');
const data = (result as { data: any }).data;
assert.equal(data.equipmentId, 'eq-a');
assert.equal(data.equipmentName, 'Panel A');
assert.deepEqual(data.genericPrice, { priceUSD: 110, observedAt: '2026-10-20T12:00:00.000Z' });
assert.equal(data.records.length, 4);
assert.equal(data.records[0].pendingSync, true, 'local pending records are marked');
const proposal = data.records.find((r: any) => r.source === 'proposal');
assert.equal(proposal.projectCode, 'SP-77');
assert.equal(proposal.projectName, 'Hotel Brisa', 'same exposure as search_projects/get_project');
assert.equal(proposal.createdById, undefined, 'no internal user ids');
const offer = data.records.find((r: any) => r.source === 'supplier_offer');
assert.equal(offer.originalCurrency, 'DOP');
assert.equal(offer.originalPrice, 6000);
assert.equal(data.stats.change.m3, 25, 'October (120 and the pending 130) against July (100)');
assert.equal(data.stats.change.m12, null, 'no reference month, no invented change');
assert.equal(data.stats.byCalendarMonth.length, 12);
assert.equal(data.stats.byCalendarMonth[2].avg, null, 'empty months stay empty');
assert.equal(data.stats.firstObservedAt, '2026-07-10T12:00:00.000Z');
assert.equal(data.hasMore, true);

// Equipo fuera del espacio: rechazado sin consultar el servidor.
const before = requests.length;
const missing = await call({ equipmentId: 'otro' });
assert.equal(missing.status, 'error');
assert.equal(requests.length, before);

// API sin la función o sin conexión: error claro, nunca datos inventados.
mode = 'missing';
const unsupported = await call({ equipmentId: 'eq-a' });
assert.ok(unsupported.status === 'error' && /no está disponible/.test(unsupported.message));
mode = 'down';
assert.equal((await call({ equipmentId: 'eq-a' })).status, 'error');

console.log('get_price_history desktop executor passed.');
