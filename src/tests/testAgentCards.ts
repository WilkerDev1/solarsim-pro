import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentCardView } from '../features/assistant/cards/registry';
import { executeForAssistant } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import type { AgentCard } from '../../shared/agentCards';

const audit: AgentCard = { type: 'catalog-audit', id: 'a1', title: 'Auditoría del inventario', detail: '2 hallazgos',
  findings: [{ code: 'missing_price', severity: 'warning', equipmentId: 'x', message: '<b>Panel</b> sin precio' }, { code: 'missing_nominal', severity: 'error', message: 'Sin potencia' }] };
const html = renderToStaticMarkup(React.createElement(AgentCardView, { card: audit }));
assert(html.includes('Auditoría del inventario'));
assert(html.includes('&lt;b&gt;Panel&lt;/b&gt; sin precio'), 'finding text is escaped');
assert(html.includes('data-severity="error"'));
assert.equal(renderToStaticMarkup(React.createElement(AgentCardView, { card: { type: 'client', id: 'c', title: 'Cliente' } })), '', 'unknown card types render nothing yet');

useSimulationStore.setState({ appAssistantEnabled: true, workspaceScope: 'local', projects: [], equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG), deletedEquipmentIds: [], sessionGeneration: 0,
  syncSettings: { ...useSimulationStore.getState().syncSettings, currentUser: null, authToken: null } });
const result = await executeForAssistant({ name: 'audit_catalog', args: {} }, { source: 'app-assistant', owner: assistantOwner() });
assert.equal(result.agentCards?.[0].type, 'catalog-audit', 'rich cards reach the chat');
assert.equal(result.cards?.length ?? 0, 0);
console.log('PASS: agent card registry renders escaped audit cards; rich cards flow from the registry to the chat.');
