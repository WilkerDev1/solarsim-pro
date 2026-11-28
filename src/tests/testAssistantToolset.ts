// F3a: herramientas nuevas del asistente de la app (get_proposal_state, create_proposal, size_system, edit_proposal,
// undo_change, extract_invoice, open_proposal) sobre la transacción de dominio, y el conjunto ÚNICO de declaraciones que verá
// el asistente (`src/features/agentTools/appAssistant/toolset.ts`). Todavía no las usa el bucle (F4): aquí se ejecutan solas.
//  · «Ponle baterías» en UNA llamada: baterías incluidas, modelo del catálogo y precio resuelto, un solo paso de deshacer.
//  · create_proposal sin argumentos crea con los valores de la fábrica única (la remota/compartida sigue exigiéndolos).
//  · size_system no escribe; undo_change revierte un turno; todas devuelven la forma común; incompleta ⇒ nunca cifras.
//  · Las declaraciones compartidas (las 12 del MCP remoto, el MCP local y las de cada superficie) no cambian.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { DEFAULT_FEATURE_SETTINGS } from '../../shared/applicationFeatures';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import { AGENT_TOOL_DEFINITIONS } from '../../shared/agentTools/definitions';
import type { AgentSource, JsonSchema } from '../../shared/agentTools/types';
import { executeAgentTool, listAgentTools } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { recommendBatteryCount } from '../domain/sizing';
import {
  APP_ASSISTANT_TOOLSET, appAssistantToolDefinitions, executeAssistantToolset, listAssistantToolset, type AssistantToolResponse,
} from '../features/agentTools/appAssistant/toolset';
import { APP_ASSISTANT_OWN_TOOLS } from '../features/agentTools/appAssistant/definitions';
import { resetAssistantToolPorts, setAssistantToolPorts } from '../features/agentTools/appAssistant/ports';
import type { ProjectSimulation } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';

const store = useSimulationStore;
const s = () => store.getState();
const stamp = '2026-10-01T00:00:00.000Z';
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((item) => ({ ...item, supplierPrices: [] as NonNullable<typeof item.supplierPrices> }));
const panel = catalog.find((e) => e.id === 'eq-mod-cs-620')!;
const inverter = catalog.find((e) => e.id === 'eq-inv-luxpower-8k')!;
const battery = catalog.find((e) => e.type === 'battery')!;
panel.supplierPrices = [{ id: 'sp-p', supplierName: 'QA Paneles', priceUSD: 95, stockStatus: 'in_stock', updatedAt: stamp }];
inverter.supplierPrices = [{ id: 'sp-i', supplierName: 'QA Inversores', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: stamp }];
battery.supplierPrices = [{ id: 'sp-b', supplierName: 'QA Baterías', priceUSD: 2100, stockStatus: 'in_stock', updatedAt: stamp }];

/** La propuesta de referencia sin batería: la de Ajustes oculta, sin precio ni equipo del catálogo. */
const base: ProjectSimulation = {
  ...structuredClone(BENCHMARK_PROJECT), id: 'f3a-base', syncStatus: 'local_only',
  specs: { ...structuredClone(BENCHMARK_PROJECT.specs), hasBattery: false, batteries: [{ id: 'b0', brandModel: 'Batería de Ajustes 10 kWh', capacityKWh: 10, count: 1, dodPct: 90 }] },
};
const other: ProjectSimulation = { ...structuredClone(BENCHMARK_PROJECT), id: 'f3a-other', syncStatus: 'local_only' };

const reset = (options: { catalog?: SolarEquipmentItem[] } = {}) => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(base), structuredClone(other)], activeProjectId: '', activeView: 'dashboard',
  equipmentCatalog: structuredClone(options.catalog ?? catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
  defaultSimulationSettings: DEFAULT_SIMULATION_SETTINGS, localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS },
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
let call = 0;
const ctx = (turnId = 'turn-1', callId = String(call++)) => ({ source: 'app-assistant' as AgentSource, owner: assistantOwner(), turnId, callId });
const run = (name: string, args: Record<string, unknown>, context = ctx()) => executeAssistantToolset({ name, args }, context);
const projectOf = (id: string) => s().projects.find((p) => p.id === id)!;
const undoSteps = (id: string) => s().undoHistory.journals[id]?.undo.length ?? 0;
const allowAll = () => store.setState({ agentPolicy: { ...DEFAULT_AGENT_POLICY, internal: { read: 'allow', draft: 'allow', guarded: 'allow' } } });

/** La forma común de todas las herramientas: cambios, resultados antes y después, avisos y el resumen vivo. */
function assertCommonShape(result: AssistantToolResponse, label: string) {
  assert.ok(['ok', 'applied', 'pending_confirmation', 'error'].includes(result.status), `${label}: estado`);
  assert.ok(Array.isArray(result.changes), `${label}: changes`);
  for (const change of result.changes) {
    assert.equal(typeof change.path, 'string', `${label}: ruta del cambio`);
    assert.equal(typeof change.label, 'string', `${label}: etiqueta del cambio`);
    assert.ok('before' in change && 'after' in change && typeof change.derived === 'boolean', `${label}: antes, después y derivado`);
  }
  assert.ok(result.results && 'before' in result.results && 'after' in result.results, `${label}: resultados antes y después`);
  assert.ok(Array.isArray(result.warnings), `${label}: avisos`);
  assert.ok('proposal' in result, `${label}: resumen vivo de la propuesta`);
  // Una propuesta incompleta nunca lleva cifras: lleva sus motivos.
  for (const side of [result.results.before, result.results.after]) {
    if (!side) continue;
    if (side.complete) assert.equal(typeof side.metrics.contractPriceUSD, 'number', `${label}: métricas`);
    else { assert.ok(side.reasons.length > 0, `${label}: motivos`); assert.equal('metrics' in side, false, `${label}: sin cifras`); }
  }
}

// ── 1. El conjunto de declaraciones: un solo sitio, entre 10 y 20, kinds existentes, sin tocar las compartidas ──────────
reset();
const sharedBefore = JSON.stringify(AGENT_TOOL_DEFINITIONS);
const surfacesBefore = JSON.stringify((['mcp', 'app-assistant', 'proposal-assistant'] as AgentSource[]).map((source) => listAgentTools(source)));
const declared = listAssistantToolset();
assert.ok(declared.length >= 10 && declared.length <= 20, `entre 10 y 20 declaraciones activas; hay ${declared.length}`);
assert.deepEqual(declared.map((d) => d.name), [...APP_ASSISTANT_TOOLSET], 'el orden y la lista salen de APP_ASSISTANT_TOOLSET');
assert.equal(new Set(declared.map((d) => d.name)).size, declared.length, 'nombres únicos');
for (const d of declared) assert.ok(['read', 'draft', 'guarded'].includes(d.kind), `${d.name}: un kind existente (un kind nuevo vacía la lista en electron/mcp)`);
for (const name of ['get_proposal_state', 'create_proposal', 'size_system', 'edit_proposal', 'undo_change', 'extract_invoice', 'open_proposal'])
  assert.ok(declared.some((d) => d.name === name), `${name} declarada`);
assert.equal(JSON.stringify(AGENT_TOOL_DEFINITIONS), sharedBefore, 'construir el conjunto no altera las definiciones compartidas');
assert.equal(JSON.stringify((['mcp', 'app-assistant', 'proposal-assistant'] as AgentSource[]).map((source) => listAgentTools(source))), surfacesBefore,
  'las superficies compartidas (MCP local, asistentes actuales) no ven las herramientas nuevas');
for (const own of APP_ASSISTANT_OWN_TOOLS) assert.deepEqual(own.surfaces, ['app-assistant'], `${own.name}: solo el asistente de la app`);
// La create_proposal compartida (MCP local y remoto) conserva sus obligatorios; la del asistente es otra declaración.
assert.deepEqual(AGENT_TOOL_DEFINITIONS.find((d) => d.name === 'create_proposal')!.inputSchema.required, ['clientName', 'distributor', 'tariffCode', 'panels', 'inverters']);
assert.deepEqual(appAssistantToolDefinitions().find((d) => d.name === 'create_proposal')!.inputSchema.required ?? [], []);

// Profundidad y tamaño del esquema declarado (Gemini rechaza la petición entera ante una sola declaración inválida).
const depth = (schema: JsonSchema): number => {
  const container = schema.type === 'object' || schema.type === 'array' || !!schema.properties || !!schema.items;
  const children = [...Object.values(schema.properties ?? {}), ...(schema.items ? [schema.items] : [])];
  return (container ? 1 : 0) + Math.max(0, ...children.map(depth));
};
for (const d of declared) {
  assert.ok(depth(d.inputSchema) <= 3, `${d.name}: profundidad del esquema ${depth(d.inputSchema)} > 3`);
  assert.ok(JSON.stringify(d).length <= 8_000, `${d.name}: declaración de ${JSON.stringify(d).length} bytes (> 8.000)`);
  assert.equal(d.inputSchema.type, 'object', `${d.name}: el esquema raíz es un objeto`);
}
const totalBytes = JSON.stringify(declared).length;
assert.ok(totalBytes <= 30_000, `declaraciones del asistente: ${totalBytes} bytes (> 30.000)`);

// ── 2. «Ponle baterías» en UNA llamada de edit_proposal ─────────────────────────────────────────────────────────────────
reset();
s().setActiveProject(base.id, 'simulator');
const stepsBefore = undoSteps(base.id);
const storageOps = [{ op: 'set_storage', enabled: true }];
// Con los permisos de hoy (precios ⇒ protegida, «confirm»): queda pendiente con el diff ya calculado, sin escribir.
const pending = await run('edit_proposal', { proposalId: base.id, title: 'Ponle baterías', ops: storageOps });
assertCommonShape(pending, 'edit_proposal pendiente');
assert.equal(pending.status, 'pending_confirmation', JSON.stringify(pending.error ?? pending));
assert.equal(projectOf(base.id).specs.hasBattery, false, 'pendiente: nada escrito');
assert.ok(pending.changes.some((c) => c.path === 'specs.hasBattery' && c.after === true), 'el diff previo dice que se incluyen las baterías');
const confirmed = s().confirmAgentAction(pending.actionId!);
assert.equal(confirmed.success, true, confirmed.error);
const withBattery = projectOf(base.id);
assert.equal(withBattery.specs.hasBattery, true, 'baterías incluidas');
assert.equal(withBattery.specs.batteries?.[0].catalogItemId, battery.id, 'modelo elegido del catálogo');
assert.equal(withBattery.specs.batteries?.[0].unitPriceUSD, 2100, 'precio resuelto: la oferta del proveedor');
assert.equal(withBattery.specs.batteries?.[0].priceSource, 'supplier');
assert.equal(withBattery.specs.batteries?.[0].selectedSupplierInfo?.supplierPriceId, 'sp-b');
const expectedCount = recommendBatteryCount({ unit: { capacityKWh: battery.capacityKWh!, dodPct: battery.dodPct, efficiencyPct: battery.batteryEfficiencyPct }, monthlyConsumption: base.monthlyConsumption }).count;
assert.equal(withBattery.specs.batteries?.[0].count, expectedCount, 'cantidad dimensionada con la regla activa');
assert.equal(undoSteps(base.id), stepsBefore + 1, 'un solo paso de deshacer');
s().undo();
assert.equal(projectOf(base.id).specs.hasBattery, false, 'Ctrl+Z deshace la llamada entera');
assert.equal(projectOf(base.id).specs.batteries?.[0].catalogItemId, undefined);

// Con «sin confirmación» (bypass ya existente): aplicada en la misma llamada, con la forma común y la propuesta SIN abrir.
reset();
allowAll();
const live = await run('edit_proposal', { proposalId: other.id, ops: [{ op: 'set_storage', enabled: false }] });
assertCommonShape(live, 'edit_proposal aplicada');
assert.equal(live.status, 'applied', JSON.stringify(live.error));
const direct = await run('edit_proposal', { proposalId: base.id, title: 'Ponle baterías', ops: storageOps });
assert.equal(direct.status, 'applied', JSON.stringify(direct.error));
assert.equal(s().activeProjectId, '', 'no exige tener la propuesta abierta ni navega');
assert.equal(projectOf(base.id).specs.batteries?.[0].unitPriceUSD, 2100);
assert.ok(direct.results.before?.complete && direct.results.after?.complete);
assert.notEqual(direct.results.before.metrics.contractPriceUSD, direct.results.after.metrics.contractPriceUSD, 'resultados del motor antes y después');
assert.equal(direct.proposal?.id, base.id, 'el resumen vivo viaja dentro del resultado');
assert.equal(direct.proposal?.hasBattery, true);
assert.ok(direct.activityId, 'queda en la actividad, con su deshacer');

// Idempotencia: el mismo turno y la misma llamada no vuelven a aplicar.
const again = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, title: 'Ponle baterías', ops: storageOps } }, { ...ctx('turn-idem', '7') });
const repeated = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, title: 'Ponle baterías', ops: storageOps } }, { ...ctx('turn-idem', '7') });
assert.equal(repeated.duplicate, true, 'repetido: duplicate');
assert.equal(s().agentActivity.filter((a) => a.turnId === 'turn-idem').length, again.status === 'applied' ? 1 : 0);

// ── 3. Errores por ruta, en español y accionables; validación estricta ──────────────────────────────────────────────────
reset();
allowAll();
store.setState({ projects: s().projects.map((p) => (p.id === base.id ? { ...p, rates: { ...p.rates, netMeteringRegime: 'legacy_retention' } } : p)) });
const badCharge = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set', path: 'rates.gridUseChargeDOPPerKWh', valueJson: '1.2' }] });
assertCommonShape(badCharge, 'edit_proposal con error');
assert.equal(badCharge.status, 'error');
assert.ok(badCharge.error?.errors?.some((e) => e.path === 'rates.gridUseChargeDOPPerKWh' && /inclúyelo en el mismo lote/.test(e.message)), JSON.stringify(badCharge.error));
const outOfRange = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '9999' }, { op: 'set', path: 'nope.field', valueJson: '1' }] });
assert.equal(outOfRange.status, 'error');
assert.ok(outOfRange.error?.errors?.some((e) => e.path === 'rates.targetCoveragePct' && /fuera de rango/.test(e.message)));
assert.ok(outOfRange.error?.errors?.some((e) => e.path === 'nope.field' && /no existe/.test(e.message)));
assert.equal(projectOf(base.id).rates.targetCoveragePct, base.rates.targetCoveragePct, 'todo o nada');
const badJson = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct' }] });
assert.equal(badJson.status, 'error');
assert.ok(badJson.error?.errors?.some((e) => e.path === 'ops[0].valueJson'), JSON.stringify(badJson.error));

// Varias operaciones tipadas en UN lote: equipo del catálogo con su precio, extra, descuento, tarifa y consumo.
reset();
allowAll();
const multi = await run('edit_proposal', { proposalId: base.id, ops: [
  { op: 'select_equipment', equipment: 'panel', catalogItemId: panel.id, count: 20 },
  { op: 'upsert_item', description: 'Transporte', quantity: 1, unitPriceUSD: 150 },
  { op: 'upsert_discount', description: 'Cortesía', value: 5, discountType: 'percentage' },
  { op: 'set_tariff', distributor: 'EDESUR' },
  { op: 'set_consumption', averageMonthlyKWh: 1500 },
] });
assert.equal(multi.status, 'applied', JSON.stringify(multi.error));
const multiProject = projectOf(base.id);
assert.equal(multiProject.specs.panels?.[0].catalogItemId, panel.id);
assert.equal(multiProject.specs.panels?.[0].count, 20);
assert.equal(multiProject.specs.panels?.[0].unitPriceUSD, 95, 'precio de la oferta, no inventado');
assert.ok(multiProject.financials.customItems?.some((item) => item.description === 'Transporte' && item.unitPriceUSD === 150));
assert.ok(multiProject.financials.customDiscounts?.some((d) => d.description === 'Cortesía' && d.type === 'percentage' && d.value === 5));
assert.equal(multiProject.rates.distributor, 'EDESUR');
assert.deepEqual(multiProject.monthlyConsumption, Array(12).fill(1500));
assert.equal(s().agentActivity.filter((a) => a.targetId === base.id && a.tool === 'edit_proposal').length, 1, 'un solo cambio en la actividad');
const itemId = multiProject.financials.customItems!.find((item) => item.description === 'Transporte')!.id;
const removed = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'remove_item', id: itemId }] });
assert.equal(removed.status, 'applied', JSON.stringify(removed.error));
assert.equal(projectOf(base.id).financials.customItems?.some((item) => item.id === itemId), false);
const noPrice = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'upsert_item', description: 'Sin precio', quantity: 1 }] });
assert.equal(noPrice.status, 'error');
assert.ok(noPrice.error?.errors?.some((e) => e.path === 'ops[0].unitPriceUSD' && /no lo inventes/.test(e.message)), 'un extra nuevo nunca nace con un precio inventado');
const wrongType = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'select_equipment', equipment: 'inverter', catalogItemId: panel.id }] });
assert.equal(wrongType.status, 'error');
assert.ok(wrongType.error?.errors?.some((e) => e.path === 'ops[0].catalogItemId'));
store.setState({ projects: s().projects.map((p) => (p.id === base.id ? { ...p, rates: { ...p.rates, netMeteringRegime: 'legacy_retention' } } : p)) });

// Lo que la organización oculta (régimen de medición neta) se rechaza y se explica.
store.setState({ localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS, netMeteringRegimeSelector: false } });
const hidden = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set_net_metering', regime: 'sie007_2026' }] });
assert.equal(hidden.status, 'error');
assert.ok(hidden.error?.errors?.some((e) => e.path === 'rates.netMeteringRegime' && /organización/.test(e.message)), JSON.stringify(hidden.error));
assert.equal(projectOf(base.id).rates.netMeteringRegime, 'legacy_retention');

// ── 4. create_proposal sin argumentos: la fábrica única, sin navegar; con el resultado que pide abrir el simulador ─────
reset();
allowAll();
const created = await run('create_proposal', {});
assertCommonShape(created, 'create_proposal');
assert.equal(created.status, 'applied', JSON.stringify(created.error));
const born = projectOf(created.proposalId!);
assert.deepEqual(born.monthlyConsumption, Array(12).fill(1000), 'consumo estimado de fábrica');
assert.equal(born.consumptionEstimate?.kind, 'factory_default');
assert.equal(born.specs.saleMarginMultiplier, 1.4, 'margen objetivo de Ajustes (40 % de fábrica)');
assert.equal(born.specs.installationUnitPriceUSD, 170);
assert.equal(born.specs.pricingMode, 'cost_matrix');
assert.equal(born.specs.panels?.[0].catalogItemId, panel.id, 'equipos del catálogo con precio');
assert.equal(s().activeProjectId, '', 'no navega: abrirla es de open_proposal (F4)');
assert.equal((created.data as { openSimulator?: boolean }).openSimulator, true, 'el resultado indica que hay que abrir el simulador');
assert.ok(created.warnings.some((w) => /Consumo estimado/.test(w)));
// El mismo turno y la misma llamada no crean dos propuestas.
const createCtx = ctx('turn-create', '1');
const first = await run('create_proposal', { clientName: 'Idempotente' }, createCtx);
const second = await run('create_proposal', { clientName: 'Idempotente' }, createCtx);
assert.equal(second.proposalId, first.proposalId);
assert.equal(s().projects.filter((p) => p.client.name === 'Idempotente').length, 1);
// Con una extracción de factura por referencia.
setAssistantToolPorts({ extractInvoice: async () => ({ clientName: 'Factura QA', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: [500, 520, 540, 560, 580, 600, 620, 640, 660, 680, 700, 720] }) });
const extraction = await run('extract_invoice', { fileId: 'file-1' });
assertCommonShape(extraction, 'extract_invoice');
assert.equal(extraction.status, 'ok', JSON.stringify(extraction.error));
const extractionId = (extraction.data as { extractionId: string }).extractionId;
const fromInvoice = await run('create_proposal', { extractionId });
assert.equal(fromInvoice.status, 'applied', JSON.stringify(fromInvoice.error));
assert.equal(projectOf(fromInvoice.proposalId!).client.name, 'Factura QA');
assert.equal(projectOf(fromInvoice.proposalId!).rates.distributor, 'EDESUR');
assert.equal(projectOf(fromInvoice.proposalId!).monthlyConsumption[11], 720);
resetAssistantToolPorts();
const noPort = await run('extract_invoice', { fileId: 'file-1' });
assert.equal(noPort.status, 'error');
assert.equal(noPort.error?.code, 'not_available');
const noNavigation = await run('open_proposal', { proposalId: base.id });
assert.equal(noNavigation.status, 'error', 'la navegación es un puerto que conecta F4');
assert.equal(noNavigation.error?.code, 'not_available');
assert.equal(s().activeProjectId, '');
// La create_proposal compartida (agentes externos, MCP local) sigue exigiendo sus campos: no cambia.
const external = await executeAgentTool({ name: 'create_proposal', args: {} }, { source: 'mcp', owner: assistantOwner() });
assert.equal(external.status, 'error');

// ── 5. size_system calcula sin escribir; su resultado se aplica con edit_proposal ────────────────────────────────────────
reset();
allowAll();
const frozen = JSON.stringify(s().projects);
const sized = await run('size_system', { proposalId: base.id, includeBatteries: true });
assertCommonShape(sized, 'size_system');
assert.equal(sized.status, 'ok', JSON.stringify(sized.error));
assert.equal(JSON.stringify(s().projects), frozen, 'size_system no escribe');
const sizing = sized.data as { panels: { count: number }; inverters: { count: number }; batteries: { count: number }; ops: unknown[] };
assert.ok(sizing.panels.count > 0 && sizing.inverters.count > 0 && sizing.batteries.count > 0);
assert.ok(sized.changes.length > 0 && sized.results.after, 'vista previa: diff y resultados tras aplicar, sin escribir');
const appliedSizing = await run('edit_proposal', { proposalId: base.id, ops: sizing.ops });
assert.equal(appliedSizing.status, 'applied', JSON.stringify(appliedSizing.error));
assert.equal(projectOf(base.id).specs.panels?.[0].count, sizing.panels.count);
assert.equal(projectOf(base.id).specs.hasBattery, true);

// ── 6. undo_change revierte un turno entero (abierta: diario de deshacer; cerrada: actividad) ───────────────────────────
reset();
allowAll();
s().setActiveProject(base.id, 'simulator');
const coverageBefore = projectOf(base.id).rates.targetCoveragePct;
const marginBefore = projectOf(base.id).specs.saleMarginMultiplier;
await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '80' }] }, ctx('turn-undo', '1'));
await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set_margin_pct', pct: 35 }] }, ctx('turn-undo', '2'));
assert.equal(projectOf(base.id).rates.targetCoveragePct, 80);
assert.notEqual(projectOf(base.id).specs.saleMarginMultiplier, marginBefore);
const undone = await run('undo_change', { proposalId: base.id, turnId: 'turn-undo' }, ctx('turn-after', '1'));
assertCommonShape(undone, 'undo_change');
assert.equal(undone.status, 'applied', JSON.stringify(undone.error));
assert.equal(projectOf(base.id).rates.targetCoveragePct, coverageBefore, 'turno revertido: cobertura');
assert.equal(projectOf(base.id).specs.saleMarginMultiplier, marginBefore, 'turno revertido: margen');
assert.equal(s().undoHistory.journals[base.id]?.redo.length, 2, 'por el diario de deshacer: los dos pasos pasan a rehacer');
assert.ok(s().agentActivity.filter((a) => a.turnId === 'turn-undo').every((a) => a.status === 'undone'));
// Una propuesta que no está abierta: por la actividad.
await run('edit_proposal', { proposalId: other.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '70' }] }, ctx('turn-closed', '1'));
assert.equal(projectOf(other.id).rates.targetCoveragePct, 70);
const undoneClosed = await run('undo_change', { proposalId: other.id, turnId: 'turn-closed' });
assert.equal(undoneClosed.status, 'applied', JSON.stringify(undoneClosed.error));
assert.equal(projectOf(other.id).rates.targetCoveragePct, other.rates.targetCoveragePct);
const nothing = await run('undo_change', { proposalId: other.id, turnId: 'turn-missing' });
assert.equal(nothing.status, 'error');

// ── 7. Una propuesta incompleta nunca devuelve cifras (las nuevas y get_project) ────────────────────────────────────────
reset({ catalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG) });
allowAll();
const unpriced = await run('create_proposal', { clientName: 'Sin precios' });
assert.equal(unpriced.status, 'applied', JSON.stringify(unpriced.error));
const state = await run('get_proposal_state', { proposalId: unpriced.proposalId! });
assertCommonShape(state, 'get_proposal_state');
assert.equal(state.status, 'ok');
assert.equal(state.results.after?.complete, false, 'incompleta');
assert.ok(!state.results.after?.complete && state.results.after.reasons.some((r) => r.code === 'missing_equipment_price'));
assert.equal(state.proposal?.completeness.incomplete, true);
assert.equal(/contractPriceUSD|paybackYears|year1SavingsUSD/.test(JSON.stringify(state)), false, 'ninguna cifra del motor en el resultado');
const editable = (state.data as { editablePaths: { path: string }[] }).editablePaths;
assert.ok(editable.some((p) => p.path === 'rates.targetCoveragePct') && !editable.some((p) => p.path === 'specs.panels[].priceSource'), 'rutas editables desde el registro de campos');
const legacyGet = await executeAgentTool({ name: 'get_project', args: { id: unpriced.proposalId! } }, { source: 'app-assistant', owner: assistantOwner() });
assert.equal(legacyGet.status, 'ok');
const legacyData = (legacyGet as { data: { summary: unknown; energy: unknown; incomplete?: { reasons: unknown[] } } }).data;
assert.equal(legacyData.summary, null, 'get_project: sin métricas para una incompleta');
assert.equal(legacyData.energy, null);
assert.ok(legacyData.incomplete?.reasons.length, 'get_project: con los motivos');
// Una completa sigue devolviendo su resumen.
const completeGet = await executeAgentTool({ name: 'get_project', args: { id: base.id } }, { source: 'app-assistant', owner: assistantOwner() });
assert.ok((completeGet as { data: { summary: { contractPriceUSD: number } } }).data.summary.contractPriceUSD > 0);

// ── 8. Cada herramienta del conjunto devuelve la forma común (también las compartidas que reutiliza) ────────────────────
reset();
allowAll();
const sample: Record<string, Record<string, unknown>> = {
  get_proposal_state: { proposalId: base.id }, size_system: { proposalId: base.id }, undo_change: { proposalId: base.id },
  edit_proposal: { proposalId: base.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '95' }] }, create_proposal: {},
  extract_invoice: { fileId: 'x' }, open_proposal: { proposalId: base.id },
  search_projects: { query: '' }, search_equipment: { query: '' }, get_tariffs: {}, list_supplier_offers: {}, list_document_texts: { proposalId: base.id },
  set_document_texts: { proposalId: base.id, texts: [{ key: 'quote.validityDays', text: '20' }] }, set_document_layout: { proposalId: base.id, showHeadersFooters: true },
  list_proposal_attachments: { proposalId: base.id }, search_clients: { query: '' }, link_proposal_to_client: { proposalId: base.id, clientId: null },
  set_proposal_status: { id: base.id, status: 'Final' }, set_commercial_status: { id: base.id, status: 'approved' },
};
for (const name of APP_ASSISTANT_TOOLSET) {
  assert.ok(sample[name], `falta un ejemplo para ${name}`);
  const result = await run(name, sample[name]);
  assertCommonShape(result, name);
}
const unknown = await run('propose_project_update', { id: base.id, edits: [] });
assert.equal(unknown.status, 'error');
assert.equal(unknown.error?.code, 'unknown_tool', 'fuera del conjunto declarado');

console.log('PASS: assistant toolset: declarations, edit_proposal (batteries in one call), create_proposal, size_system, undo_change and common shape.');
