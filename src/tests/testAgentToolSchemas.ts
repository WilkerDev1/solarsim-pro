import assert from 'node:assert/strict';
import { AGENT_TOOL_DEFINITIONS, findAgentTool } from '../../shared/agentTools/definitions';
import { toGeminiFunctionDeclarations, toGeminiSchema, validateJsonSchema } from '../../shared/agentTools/jsonSchema';
import { AGENT_RULES_ES } from '../../shared/agentTools/rules';
import { executeAgentTool, executeForAssistant, getPendingAgentAction, listAgentTools } from '../features/agentTools/registry';
import { runAssistant } from '../features/assistant/service';
import { assistantOwner } from '../features/assistant/tools';
import { validateAssistantEdits } from '../features/assistant/validation';
import { MAX_GRID_USE_CHARGE_DOP_PER_KWH, NET_METERING_REGIMES, isValidGridUseCharge } from '../../shared/netMetering';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';

// 1. Every definition is a strict object schema with consistent required fields and unique names.
const names = new Set<string>();
for (const def of AGENT_TOOL_DEFINITIONS) {
  assert(!names.has(def.name), `duplicate tool ${def.name}`);
  names.add(def.name);
  assert.match(def.name, /^[a-z][a-z0-9_]{2,63}$/);
  assert.equal(def.inputSchema.type, 'object');
  assert.equal(def.inputSchema.additionalProperties, false, `${def.name} rejects unknown arguments`);
  for (const key of def.inputSchema.required || []) assert(def.inputSchema.properties?.[key], `${def.name}.${key} declared`);
  assert(def.surfaces.length > 0);
  assert(['read', 'draft', 'guarded'].includes(def.kind));
}
assert.equal(findAgentTool('propose_equipment_update')?.kind, 'guarded', 'catalog edits require confirmation');
assert.match(AGENT_RULES_ES, /Catálogo IA/);

// 2. Validator subset.
const schema = findAgentTool('search_equipment')!.inputSchema;
assert.deepEqual(validateJsonSchema(schema, { query: 'ja', unavailableOnly: true }), []);
assert.match(validateJsonSchema(schema, { query: 'ja', extra: 1 })[0], /no permitido/);
assert.match(validateJsonSchema(schema, { unavailableOnly: 'yes' })[0], /boolean/);
assert.match(validateJsonSchema(findAgentTool('get_equipment')!.inputSchema, {})[0], /obligatorio/);
assert.match(validateJsonSchema({ type: 'number', maximum: 3 }, 4)[0], /máximo 3/);
assert.deepEqual(validateJsonSchema({ type: 'number' }, 4), []);
assert.match(validateJsonSchema({ type: 'integer' }, 4.5)[0], /integer/);

// 3. Gemini conversion is pinned.
assert.deepEqual(toGeminiSchema(schema), {
  type: 'OBJECT',
  properties: {
    query: { type: 'STRING', description: 'Texto a buscar; vacío lista los primeros resultados.' },
    unavailableOnly: { type: 'BOOLEAN' },
  },
});
const declarations = toGeminiFunctionDeclarations(AGENT_TOOL_DEFINITIONS);
assert.equal(declarations.find((d) => d.name === 'get_tariffs')!.parameters, undefined, 'argument-less tools omit parameters');
assert.deepEqual((declarations.find((d) => d.name === 'get_equipment')!.parameters as any).required, ['id']);

// 4. Registry: surface filter, validation, outcomes and pending actions.
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'agent-project', syncStatus: 'local_only' as const };
useSimulationStore.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [project], activeProjectId: project.id, activeView: 'simulator',
  equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG), deletedEquipmentIds: [], sessionGeneration: 0,
  syncSettings: { ...useSimulationStore.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
assert.equal(listAgentTools('app-assistant').length, AGENT_TOOL_DEFINITIONS.filter((d) => d.surfaces.includes('app-assistant')).length);
assert(!listAgentTools('app-assistant').some((d) => d.name === 'apply_proposal_draft'), 'surface-specific tools stay on their surface');
useSimulationStore.getState().setAgentPolicy({ external: { read: 'deny', draft: 'deny', guarded: 'deny' } });
assert.equal(listAgentTools('mcp').length, 0, 'denied kinds are not even listed');
const ctx = { source: 'app-assistant' as const, owner: assistantOwner() };
const unknown = await executeAgentTool({ name: 'drop_database', args: {} }, ctx);
assert.equal(unknown.status, 'error');
const extra = await executeAgentTool({ name: 'search_projects', args: { query: '', sql: '1' } }, ctx);
assert(extra.status === 'error' && /no permitido/.test(extra.message));
const found = await executeAgentTool({ name: 'search_projects', args: { query: project.client.name } }, ctx);
assert(found.status === 'ok');
assert.equal(found.cards?.[0].type, 'proposal');
assert.equal(found.cards?.[0].id, project.id);
const badJson = await executeAgentTool({ name: 'propose_project_update', args: { id: project.id, edits: [{ section: 'rates', field: 'targetCoveragePct', valueJson: '{' }] } }, ctx);
assert(badJson.status === 'error' && /JSON/.test(badJson.message));
// With drafts set to "confirm" the plan waits; the default "allow" path is covered by testAgentPermissions.
useSimulationStore.getState().setAgentPolicy({ internal: { read: 'allow', draft: 'confirm', guarded: 'confirm' } });
const pending = await executeAgentTool({ name: 'propose_project_update', args: { id: project.id, title: 'Cobertura', edits: [{ section: 'rates', field: 'targetCoveragePct', valueJson: '90' }] } }, ctx);
assert(pending.status === 'pending_confirmation');
assert.equal(getPendingAgentAction(pending.actionId)?.edits[0].value, 90);
assert.notEqual(useSimulationStore.getState().getActiveProject().rates.targetCoveragePct, 90, 'planning never mutates');
const stale = await executeAgentTool({ name: 'search_projects', args: {} }, { ...ctx, owner: 'other-owner' });
assert(stale.status === 'error' && /sesión cambió/.test(stale.message));

// 5. The 64 KB cap is uniform in the registry: read results (assistant and native handlers) never reach the model whole.
const huge = 'X'.repeat(3000);
const bloated = { ...structuredClone(DEFAULT_EQUIPMENT_CATALOG[0]), id: 'bloated', displayName: 'Bloated QA',
  supplierPrices: Array.from({ length: 50 }, (_, i) => ({ id: `o${i}`, supplierName: `${huge}${i}`, priceUSD: 1, updatedAt: '2026-01-01' })) };
useSimulationStore.setState({ equipmentCatalog: [...structuredClone(DEFAULT_EQUIPMENT_CATALOG), bloated as any] });
useSimulationStore.getState().setAgentPolicy({ internal: { read: 'allow', draft: 'confirm', guarded: 'confirm' } });
const bigRead = await executeAgentTool({ name: 'search_equipment', args: { query: 'Bloated QA' } }, ctx);
assert(bigRead.status === 'error' && bigRead.code === 'result_too_large', 'assistant read tools are capped');
const bigNative = await executeAgentTool({ name: 'list_supplier_offers', args: { equipmentId: 'bloated' } }, ctx);
assert(bigNative.status === 'error' && bigNative.code === 'result_too_large', 'native read tools are capped');
const sentBodies: string[] = [];
await runAssistant({
  apiKey: 'synthetic', model: 'gemini-4-hydrogen', prompt: 'Ofertas', history: [], signal: new AbortController().signal,
  execute: (call) => executeForAssistant(call, ctx),
  transport: async (_url, body) => {
    sentBodies.push(JSON.stringify(body));
    return sentBodies.length === 1
      ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'list_supplier_offers', args: { equipmentId: 'bloated' } } }] } }] }
      : { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Filtra más.' }] } }] };
  },
});
assert(!sentBodies[1].includes(huge), 'an oversized result is answered with an error, never appended to contents');
assert.match(sentBodies[1], /demasiado grande/);


// Fase 5: régimen y cargo por uso de la red se declaran y validan con las reglas de shared/netMetering.
{
  const update = findAgentTool('propose_project_update')!;
  assert.match(update.description, /rates\.netMeteringRegime/, 'la descripción de la edición explica el régimen');
  assert.match(update.description, /rates\.gridUseChargeDOPPerKWh/, 'y el cargo por uso de la red');
  assert.match(findAgentTool('get_tariffs')!.description, /rango/, 'get_tariffs anuncia el cargo fijo por rango');
  const create = findAgentTool('create_proposal')!.inputSchema.properties as Record<string, any>;
  assert.deepEqual(create.netMeteringRegime.enum, [...NET_METERING_REGIMES]);
  assert.equal(create.gridUseChargeDOPPerKWh.maximum, MAX_GRID_USE_CHARGE_DOP_PER_KWH);
  // Mismos límites que `isValidGridUseCharge`: lo que la regla compartida rechaza, la validación lo rechaza.
  for (const value of [-0.01, MAX_GRID_USE_CHARGE_DOP_PER_KWH + 0.01, Number.NaN, '3.78' as never]) {
    assert.equal(isValidGridUseCharge(value), false);
    assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'gridUseChargeDOPPerKWh', value }], 'project'), Error, String(value));
  }
  for (const value of [0, 3.78, MAX_GRID_USE_CHARGE_DOP_PER_KWH]) {
    assert.equal(isValidGridUseCharge(value), true);
    assert.equal(validateAssistantEdits([{ section: 'rates', field: 'gridUseChargeDOPPerKWh', value }], 'project')[0].value, value);
  }
  // La herramienta de lectura devuelve rangos del cargo fijo y cargos por uso con su procedencia.
  const tariffs = await executeAgentTool({ name: 'get_tariffs', args: {} }, ctx);
  const data = (tariffs as any).data;
  const edesurBts1 = data.schedules.find((s: any) => s.distributor === 'EDESUR').tariffs.find((t: any) => t.code === 'BTS1');
  assert.deepEqual(edesurBts1.fixedChargeTiersDOP.map((t: any) => t.minKWh), [0, 101]);
  assert.deepEqual(data.gridUseCharges.map((g: any) => g.distributor).sort(), ['CEPM', 'EDEESTE', 'EDENORTE', 'EDESUR']);
}
console.log('PASS: agent tool definitions, JSON Schema subset, Gemini adapter and registry outcomes.');
