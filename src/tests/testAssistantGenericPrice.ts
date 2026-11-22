import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { assistantOwner, executeAssistantTool } from '../features/assistant/tools';
import { featureScope } from '../../shared/applicationFeatures';

// El asistente de la app expone el precio genérico (ADR 0006 §5) separado de las ofertas, igual que el MCP remoto.
const server = 'https://generic.invalid';
const user = { id: 'u-1', name: 'Editor', email: 'e@x.invalid', role: 'EDITOR', organizationId: 'org-a' } as const;
const scope = featureScope(server, user.organizationId);
const [priced, plain] = structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((item) => ({
  ...item,
  organizationId: user.organizationId,
  syncServerUrl: server,
}));
const state = useSimulationStore;
state.setState({
  appAssistantEnabled: true,
  workspaceScope: scope,
  projects: [],
  activeProjectId: undefined,
  equipmentCatalog: [priced, plain],
  deletedEquipmentIds: [],
  genericPrices: {
    [priced.id]: { priceUSD: 123.45, observedAt: '2026-11-01T12:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-000000000001' },
  },
  pricePending: { observations: [], voids: [] },
  syncSettings: {
    ...state.getState().syncSettings,
    serverUrl: server,
    currentUser: user as never,
    authToken: 'synthetic',
    autoSyncEnabled: false,
  },
});

const detail = executeAssistantTool({ name: 'get_equipment', args: { id: priced.id } }, assistantOwner()).data as Record<string, unknown>;
assert.equal(detail.genericPriceUSD, 123.45, 'get_equipment incluye el precio genérico');
assert.equal(detail.genericPriceObservedAt, '2026-11-01T12:00:00.000Z');
const none = executeAssistantTool({ name: 'get_equipment', args: { id: plain.id } }, assistantOwner()).data as Record<string, unknown>;
assert.equal(none.genericPriceUSD, null, 'sin genérico: null, nunca un valor inventado');

const found = executeAssistantTool({ name: 'search_equipment', args: { query: '' } }, assistantOwner()).data as {
  equipment: { id: string; genericPriceUSD: number | null }[];
};
assert.equal(found.equipment.find((e) => e.id === priced.id)?.genericPriceUSD, 123.45);
assert.equal(found.equipment.find((e) => e.id === plain.id)?.genericPriceUSD, null);

console.log('Assistant generic price: get_equipment and search_equipment expose genericPriceUSD separately from offers (synthetic only).');
