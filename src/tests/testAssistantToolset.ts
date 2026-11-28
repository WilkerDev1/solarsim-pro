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
/** Perfil «confirmar» (F3b): los precios vuelven a pedir confirmación en la app; así se prueba el camino de la cola. */
const confirmPrices = () => store.setState({ agentPolicy: { ...DEFAULT_AGENT_POLICY, appAssistantProfile: 'confirm' } });

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
// Invertida en F3b: con la política por defecto (perfil «edición en vivo») un lote con precios se aplica al momento, con
// diff y un paso de deshacer, sin tarjeta de confirmación.
const liveDefault = await run('edit_proposal', { proposalId: base.id, title: 'Ponle baterías', ops: storageOps });
assertCommonShape(liveDefault, 'edit_proposal en vivo');
assert.equal(liveDefault.status, 'applied', JSON.stringify(liveDefault.error ?? liveDefault));
assert.equal(projectOf(base.id).specs.hasBattery, true, 'en vivo: escrito al momento');
assert.equal(s().pendingAgentActions.length, 0, 'sin tarjeta de confirmación');
assert.equal(undoSteps(base.id), stepsBefore + 1, 'un solo paso de deshacer');
s().undo();
assert.equal(projectOf(base.id).specs.hasBattery, false, 'Ctrl+Z deshace el cambio en vivo');
// Con el perfil «confirmar» (lo de antes de F3b: precios ⇒ protegida, «confirm»): queda pendiente con el diff ya calculado.
confirmPrices();
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
// Las rutas editables viajan solo si se piden (ya van resumidas en la descripción de edit_proposal): el contexto vivo es corto.
assert.equal((state.data as { editablePaths?: unknown } | undefined)?.editablePaths, undefined, 'sin includeEditablePaths no se vuelcan las rutas');
assert.ok(JSON.stringify(state).length < 6_000, `get_proposal_state ocupa ${JSON.stringify(state).length} bytes`);
const withPaths = await run('get_proposal_state', { proposalId: unpriced.proposalId!, includeEditablePaths: true });
const editable = (withPaths.data as { editablePaths: { path: string }[] }).editablePaths;
const ratesOnly = await run('get_proposal_state', { proposalId: unpriced.proposalId!, includeEditablePaths: true, section: 'rates' });
assert.ok((ratesOnly.data as { editablePaths: { path: string }[] }).editablePaths.every((p) => p.path.startsWith('rates.')), 'filtro por sección');
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
// Sin puerto conectado (F4), estas dos responden «no disponible»; el resto debe funcionar de verdad, no solo tener la forma.
const expectedError: Record<string, string> = { extract_invoice: 'not_available', open_proposal: 'not_available' };
for (const name of APP_ASSISTANT_TOOLSET) {
  assert.ok(sample[name], `falta un ejemplo para ${name}`);
  const result = await run(name, sample[name]);
  assertCommonShape(result, name);
  if (expectedError[name]) assert.equal(result.error?.code, expectedError[name], `${name}: ${JSON.stringify(result.error)}`);
  else if (name === 'undo_change') assert.ok(result.status !== 'error' || result.error?.code === 'not_found', `${name}: ${JSON.stringify(result.error)}`);
  else assert.notEqual(result.status, 'error', `${name}: ${JSON.stringify(result.error)}`);
}
const unknown = await run('propose_project_update', { id: base.id, edits: [] });
assert.equal(unknown.status, 'error');
assert.equal(unknown.error?.code, 'unknown_tool', 'fuera del conjunto declarado');

// ── 9. Hallazgos de la revisión de F3a ──────────────────────────────────────────────────────────────────────────────────
const patchProject = (id: string, patch: (p: ProjectSimulation) => ProjectSimulation) =>
  store.setState({ projects: s().projects.map((p) => (p.id === id ? patch(p) : p)) });
const errorAt = (result: AssistantToolResponse, path: string, pattern: RegExp) =>
  assert.ok(result.status === 'error' && result.error?.errors?.some((e) => e.path === path && pattern.test(e.message)), `${path}: ${JSON.stringify(result.error ?? result.status)}`);

// 9a. Una confirmación tardía no aplica un cambio distinto del que el usuario vio: si la oferta o el consumo cambiaron, se rechaza.
// (La cola sigue existiendo para el perfil «confirmar» y para los agentes externos: F3b.)
reset();
confirmPrices();
const stalePending = await run('edit_proposal', { proposalId: base.id, title: 'Ponle baterías', ops: storageOps });
assert.equal(stalePending.status, 'pending_confirmation');
store.setState({ equipmentCatalog: s().equipmentCatalog.map((e) => (e.id === battery.id ? { ...e, supplierPrices: [{ ...e.supplierPrices![0], priceUSD: 3900 }] } : e)) });
const userEdit = s().commitProjectEdits(base.id, [{ path: 'monthlyConsumption', value: Array(12).fill(3000) }], { source: 'user' });
assert.equal(userEdit.ok, true);
const staleConfirm = s().confirmAgentAction(stalePending.actionId!);
assert.equal(staleConfirm.success, false, 'los datos cambiaron: no se aplica');
assert.match(staleConfirm.error ?? '', /cambiaron desde la propuesta del cambio/);
assert.equal(projectOf(base.id).specs.hasBattery, false, 'nada aplicado');
// Un cambio ajeno al lote (el nombre del cliente) no invalida la confirmación.
reset();
confirmPrices();
const freshPending = await run('edit_proposal', { proposalId: base.id, title: 'Ponle baterías', ops: storageOps });
s().commitProjectEdits(base.id, [{ path: 'client.name', value: 'Otro nombre' }], { source: 'user' });
assert.equal(s().confirmAgentAction(freshPending.actionId!).success, true, 'un cambio ajeno no bloquea');
assert.equal(projectOf(base.id).specs.batteries?.[0].unitPriceUSD, 2100);

// 9b. Repetir una llamada ya rechazada devuelve el estado real de la acción, no otro «pendiente».
reset();
confirmPrices();
const rejectCtx = ctx('turn-reject', '1');
const toReject = await run('edit_proposal', { proposalId: base.id, ops: storageOps }, rejectCtx);
assert.equal(toReject.status, 'pending_confirmation');
s().rejectAgentAction(toReject.actionId!);
const retried = await run('edit_proposal', { proposalId: base.id, ops: storageOps }, rejectCtx);
assert.equal(retried.duplicate, true);
assert.equal(retried.status, 'error', 'rechazada: no vuelve como pendiente');
assert.equal(retried.error?.code, 'action_rejected');

// 9c. «Ponle baterías» escribe una vez y sincroniza una vez.
reset();
allowAll();
let autoSyncs = 0;
const realAutoSync = s().triggerAutoSync;
store.setState({ triggerAutoSync: () => { autoSyncs += 1; } });
const oneSync = await run('edit_proposal', { proposalId: base.id, ops: storageOps });
assert.equal(oneSync.status, 'applied', JSON.stringify(oneSync.error));
assert.equal(autoSyncs, 1, 'un solo autosync');
store.setState({ triggerAutoSync: realAutoSync });

// 9d. Deshacer un cambio protegido (precios) o la creación de una propuesta pide confirmación con el perfil «confirmar».
// Invertida en F3b solo para los precios: con la política por defecto (edición en vivo) el margen y su deshacer van en vivo;
// mandar a la papelera lo creado sigue confirmándose en ambos perfiles (lo prueba también testAssistantLiveEditProfile).
reset();
const marginLive = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set_margin_pct', pct: 10 }] });
assert.equal(marginLive.status, 'applied', 'invertida en F3b: el margen se aplica en vivo');
assert.equal((await run('undo_change', { proposalId: base.id })).status, 'applied', 'invertida en F3b: y su deshacer también');
reset();
confirmPrices();
const marginPending = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set_margin_pct', pct: 10 }] });
assert.equal(marginPending.status, 'pending_confirmation');
assert.equal(s().confirmAgentAction(marginPending.actionId!).success, true);
const marginApplied = projectOf(base.id).specs.saleMarginMultiplier;
const undoGuarded = await run('undo_change', { proposalId: base.id });
assert.equal(undoGuarded.status, 'pending_confirmation', 'deshacer un precio confirmado también se confirma');
assert.equal(projectOf(base.id).specs.saleMarginMultiplier, marginApplied, 'pendiente: nada revertido');
const createdDraft = await run('create_proposal', { clientName: 'Para deshacer' });
assert.equal(createdDraft.status, 'applied', JSON.stringify(createdDraft.error));
const undoCreate = await run('undo_change', { proposalId: createdDraft.proposalId! });
assert.equal(undoCreate.status, 'pending_confirmation', 'mandar a la papelera lo creado se confirma (como move_proposal_to_trash)');
assert.equal(projectOf(createdDraft.proposalId!).isDeleted ?? false, false);
// Un cambio que no toca precios se sigue deshaciendo sin confirmación.
const coverage = await run('edit_proposal', { proposalId: other.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '85' }] });
assert.equal(coverage.status, 'applied');
assert.equal((await run('undo_change', { proposalId: other.id })).status, 'applied');
// La descripción dice la verdad: se detiene si la propuesta cambió después, no solo «lo mismo».
const undoDefinition = APP_ASSISTANT_OWN_TOOLS.find((d) => d.name === 'undo_change')!;
assert.equal(/cambió lo mismo/.test(undoDefinition.description), false);
assert.match(undoDefinition.description, /si la propuesta cambió después/);

// 9e. Precio automático: el asistente no pasa a precio directo; un lote de precios deja la matriz de costos; los extras ocultos siguen ocultos.
reset();
allowAll();
const toDirect = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set', path: 'specs.pricingMode', valueJson: '"direct_watt"' }, { op: 'set', path: 'specs.pricePerWattUSD', valueJson: '1.1' }] });
errorAt(toDirect, 'ops[0].path', /Simple/);
assert.equal(projectOf(base.id).specs.pricingMode ?? 'cost_matrix', 'cost_matrix');
patchProject(base.id, (p) => ({ ...p, specs: { ...p.specs, pricingMode: 'direct_watt', isDetailed: false } }));
const backToMatrix = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'select_equipment', equipment: 'panel', catalogItemId: panel.id }] });
assert.equal(backToMatrix.status, 'applied', JSON.stringify(backToMatrix.error));
assert.equal(projectOf(base.id).specs.pricingMode, 'cost_matrix', 'AUTOMATED_PRICING en los lotes de precios');
assert.ok(backToMatrix.changes.some((c) => c.path === 'specs.pricingMode'), 'y el cambio de modo se ve en el diff');
patchProject(base.id, (p) => ({ ...p, financials: { ...p.financials, customItems: [{ id: 'h1', description: 'Oculto', quantity: 1, unitPriceUSD: 50, exonerateITBIS: true, hideInQuotation: true }] } }));
const fullList = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set', path: 'financials.customItems', valueJson: JSON.stringify([{ id: 'h1', description: 'Oculto', quantity: 1, unitPriceUSD: 60, exonerateITBIS: true }]) }] });
assert.equal(fullList.status, 'applied', JSON.stringify(fullList.error));
assert.equal(projectOf(base.id).financials.customItems?.[0].unitPriceUSD, 60);
assert.equal(projectOf(base.id).financials.customItems?.[0].hideInQuotation, true, 'preserveHiddenInQuotation');
const noDirectOp = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'suggest_direct_price' }] });
assert.equal(noDirectOp.status, 'error', 'el precio directo no es una operación del asistente');

// 9f. Lotes contradictorios de baterías: error por ruta, nunca lo contrario de la última instrucción.
reset();
allowAll();
const onOff = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set_storage', enabled: true }, { op: 'set_storage', enabled: false }] });
errorAt(onOff, 'ops[1]', /contradice ops\[0\]/);
const selectThenOff = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'select_equipment', equipment: 'battery', catalogItemId: battery.id }, { op: 'set_storage', enabled: false }] });
errorAt(selectThenOff, 'ops[1]', /contradice ops\[0\]/);
const offThenAdd = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set_storage', enabled: false }, { op: 'add_equipment', equipment: 'battery', catalogItemId: battery.id }] });
errorAt(offThenAdd, 'ops[1]', /contradice ops\[0\]/);
assert.equal(projectOf(base.id).specs.hasBattery, false);

// 9g. El código tarifario se valida contra la matriz de tarifas, con los válidos en el mensaje.
reset();
allowAll();
const badTariff = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set_tariff', tariffCode: 'ZZZ' }] });
errorAt(badTariff, 'ops[0].tariffCode', /BTS1/);
const badTariffPath = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set', path: 'rates.tariffCode', valueJson: '"ZZZ"' }] });
errorAt(badTariffPath, 'ops[0].valueJson', /no existe/);
assert.equal(projectOf(base.id).rates.tariffCode, base.rates.tariffCode);
const okTariff = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'set_tariff', distributor: 'EDESUR', tariffCode: 'bts 2' }] });
assert.equal(okTariff.status, 'applied', JSON.stringify(okTariff.error));
const badCreateTariff = await run('create_proposal', { distributor: 'EDESUR', tariffCode: 'ZZZ' });
errorAt(badCreateTariff, 'tariffCode', /BTS1/);

// 9h. Lo que las reglas no hacen no se presenta como «ya estaba así»; select_equipment no crea grupos.
const onlyInverter = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'remove_equipment', equipment: 'inverter', index: 0 }] });
errorAt(onlyInverter, 'ops[0].index', /único inversor/);
const newGroup = await run('edit_proposal', { proposalId: base.id, ops: [{ op: 'select_equipment', equipment: 'panel', index: 1, catalogItemId: panel.id }] });
errorAt(newGroup, 'ops[0].index', /add_equipment/);
assert.equal(projectOf(base.id).specs.panels?.length, 1);

// 9i. «Ponle baterías» con un consumo nuevo en el mismo lote dimensiona con ese consumo, en cualquier orden.
for (const order of ['storage-first', 'consumption-first']) {
  reset();
  allowAll();
  const ops = [{ op: 'set_storage', enabled: true }, { op: 'set_consumption', averageMonthlyKWh: 3000 }];
  const sizedBatch = await run('edit_proposal', { proposalId: base.id, ops: order === 'storage-first' ? ops : [...ops].reverse() });
  assert.equal(sizedBatch.status, 'applied', JSON.stringify(sizedBatch.error));
  const want = recommendBatteryCount({ unit: { capacityKWh: battery.capacityKWh!, dodPct: battery.dodPct, efficiencyPct: battery.batteryEfficiencyPct }, monthlyConsumption: Array(12).fill(3000) }).count;
  assert.equal(projectOf(base.id).specs.batteries?.[0].count, want, `${order}: banco dimensionado con el consumo del lote`);
}

// 9j. La provincia: coincidencia exacta (o un nombre conocido entre paréntesis) o un prefijo único; si no, error con candidatas.
reset();
allowAll();
errorAt(await run('create_proposal', { province: 'a' }), 'province', /provincia/);
errorAt(await run('create_proposal', { province: 'San' }), 'province', /San Cristóbal/);
const dn = await run('create_proposal', { province: 'Distrito Nacional' });
assert.equal(projectOf(dn.proposalId!).client.province, 'Santo Domingo / Distrito Nacional');
const bonao = await run('create_proposal', { province: 'bonao' });
assert.equal(projectOf(bonao.proposalId!).client.province, 'Monseñor Nouel (Bonao)');
const santiago = await run('create_proposal', { province: 'Santiago' });
assert.equal(projectOf(santiago.proposalId!).client.province, 'Santiago', 'exacta antes que prefijo');

// 9k. Baterías en el catálogo pero sin oferta ni genérico: lo dice tal cual y elige un modelo del catálogo sin precio.
reset({ catalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG) });
allowAll();
const unpricedStorage = await run('edit_proposal', { proposalId: base.id, ops: storageOps });
assert.equal(unpricedStorage.status, 'applied', JSON.stringify(unpricedStorage.error));
assert.equal(unpricedStorage.warnings.some((w) => /Sin baterías en el catálogo/.test(w)), false, JSON.stringify(unpricedStorage.warnings));
assert.ok(unpricedStorage.warnings.some((w) => /no tiene oferta de proveedor ni precio genérico/.test(w)), JSON.stringify(unpricedStorage.warnings));
const chosenUnpriced = projectOf(base.id).specs.batteries?.[0];
assert.ok(chosenUnpriced?.catalogItemId && DEFAULT_EQUIPMENT_CATALOG.some((e) => e.id === chosenUnpriced.catalogItemId && e.type === 'battery'), 'modelo del catálogo');
assert.equal(unpricedStorage.results.after?.complete, false, 'sin precio: incompleta');

console.log('PASS: assistant toolset: declarations, edit_proposal (batteries in one call), create_proposal, size_system, undo_change and common shape.');
