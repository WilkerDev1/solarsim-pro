import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantResultList } from '../features/assistant/components/AssistantResultList';
import { executeAgentTool, executeForAssistant } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import type { AssistantCard } from '../features/assistant/types';
import type { CatalogAuditCard } from '../../shared/agentCards';

const projects = Array.from({ length: 9 }, (_, i) => ({
  ...structuredClone(BENCHMARK_PROJECT), id: `p${i}`, syncStatus: 'local_only' as const,
  client: { ...structuredClone(BENCHMARK_PROJECT.client), name: `Cliente <${i}>`, projectId: `SP-2026-${i}` },
}));
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
useSimulationStore.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects, equipmentCatalog: catalog, deletedEquipmentIds: [], sessionGeneration: 0,
  syncSettings: { ...useSimulationStore.getState().syncSettings, currentUser: null, authToken: null },
});
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const rows = (html: string) => (html.match(/<li/g) || []).length;
const projectItems: AssistantCard[] = projects.map((p) => ({ kind: 'project', id: p.id, title: p.client.name, detail: p.client.projectId }));

// Listado abierto: título con el total, seis filas compactas con su acción y «Ver 3 más»; el texto se escapa.
const open = render(React.createElement(AssistantResultList, { list: { kind: 'project', items: projectItems, collapsed: false } }));
assert.match(open, /Propuestas \(9\)/);
assert.equal(rows(open), 6);
assert.match(open, /Ver 3 más/);
assert(open.includes('Cliente &lt;0&gt;') && open.includes('SP-2026-0'));
assert.equal((open.match(/>Abrir</g) || []).length, 6, 'every proposal row opens its proposal');
// Plegado: un resumen de una línea que despliega el mismo listado.
const folded = render(React.createElement(AssistantResultList, { list: { kind: 'project', items: projectItems, collapsed: true } }));
assert.match(folded, /<details/);
assert.match(folded, /Ver los 9 resultados/);
// Elementos que ya no se ven en este espacio (papelera, otra sesión) no se listan; sin ninguno, no hay listado.
useSimulationStore.setState({ projects: projects.map((p, i) => (i < 7 ? { ...p, isDeleted: true } : p)) });
assert.match(render(React.createElement(AssistantResultList, { list: { kind: 'project', items: projectItems, collapsed: false } })), /Propuestas \(2\)/);
useSimulationStore.setState({ projects: [] });
assert.equal(render(React.createElement(AssistantResultList, { list: { kind: 'project', items: projectItems, collapsed: false } })), '');
// Equipos: cada fila se despliega en su tarjeta (ficha, inventario) con «Ver».
const equipmentItems: AssistantCard[] = catalog.slice(0, 4).map((e) => ({ kind: 'equipment', id: e.id, title: e.displayName, detail: e.brand }));
const equipment = render(React.createElement(AssistantResultList, { list: { kind: 'equipment', items: equipmentItems, collapsed: false } }));
assert.match(equipment, /Equipos \(4\)/);
assert.equal((equipment.match(/aria-expanded="false"/g) || []).length, 4);

// «Equipos sin precio»: audit_catalog filtra por tipo de hallazgo y la tarjeta trae solo esos.
const ctx = { source: 'app-assistant' as const, owner: assistantOwner() };
const unpriced = { ...structuredClone(catalog[0]), id: 'eq-unpriced', displayName: 'Panel sin oferta', supplierPrices: [] };
useSimulationStore.setState({ equipmentCatalog: [...catalog, unpriced] });
const audit = await executeForAssistant({ name: 'audit_catalog', args: { codes: ['missing_price'] } }, ctx);
const card = audit.agentCards?.[0] as CatalogAuditCard;
assert(card.findings.length > 0);
assert(card.findings.every((f) => f.code === 'missing_price'));
assert(card.findings.some((f) => f.equipmentId === 'eq-unpriced'));
assert((audit.data as { findings: { code: string }[] }).findings.every((f) => f.code === 'missing_price'));
assert.match(card.detail || '', /sin precio/i, 'the card says which filter it shows');
const bad = await executeAgentTool({ name: 'audit_catalog', args: { codes: ['nope'] } }, ctx);
assert.equal(bad.status, 'error', 'unknown finding codes are rejected by the schema');
console.log('Assistant result list: compact rows, fold, visibility, equipment expansion and filtered audit passed.');
