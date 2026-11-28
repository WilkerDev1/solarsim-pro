// F5a: resaltado en vivo de lo que cambia el asistente en el dock de parámetros. Tres capas, todas sin DOM:
//  1. lógica pura (`src/domain/dockHighlight.ts`): qué rutas dan qué anclas, agrupación, caducidad, secciones plegadas, controles
//     que no están en pantalla (los oculta la organización o el modo) y pestaña no visible;
//  2. el store fuera de React (`src/store/dockHighlightStore.ts`) enganchado a `commitProjectEdits`: solo un lote cuyo origen
//     es el asistente destaca algo; un lote del usuario, del dock o de un agente externo no, ni uno repetido o rechazado;
//  3. el contrato con la interfaz: atributos, estilo y `prefers-reduced-motion` (el cableado de React se comprueba contra su fuente).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import {
  EMPTY_HIGHLIGHTS, HIGHLIGHT_TTL_MS, activeMarks, addHighlights, dockHighlightView, nextExpiry, pruneExpired,
} from '../domain/dockHighlight';
import { dockHighlightStore } from '../store/dockHighlightStore';
import { assistantEditForQa } from '../features/assistantFeedback/devActions';
import { syncChangedMarks, presentInDock, collapsedInDock, type MarkRoot } from '../components/simulator/sidebar/dockHighlightDom';
import { anchorForPath, type DockSectionKey } from '../domain/fieldAnchors';
/** Resultado de la herramienta tal como lo leen estas suites (la unión del registro se estrecha por `status`; aquí ya se comprueba `activityId`). */
const applyTool = (call: Parameters<typeof executeAgentTool>[0], ctx: Parameters<typeof executeAgentTool>[1]) => executeAgentTool(call, ctx) as Promise<{ status: string; activityId?: string; data?: any }>;

const ALL_OPEN: Record<DockSectionKey, boolean> = { client: true, rates: true, equipment: true, costs: true, financials: true };
const T0 = 1_000_000;

// ── 1. Lógica pura ──────────────────────────────────────────────────────────────────────────────────────────────────────
const batch = [
  { path: 'rates.targetCoveragePct', label: 'Cobertura objetivo' },
  { path: 'specs.panels[1].count', label: 'Cantidad de paneles (#2)' },
  { path: 'specs.panels[1].priceSource', label: 'Procedencia del precio (panel)' }, // derivada sin ancla: no destaca nada
  { path: 'financials.customItems[0].unitPriceUSD', label: 'Precio unitario del ítem (#1)' },
  { path: 'monthlyConsumption[3]', label: 'Consumo de abril (kWh)' },
  { path: 'client.rnc', label: 'RNC' },
  { path: 'rates.gridUseChargeDOPPerKWh', label: 'Cargo uso de red (RD$/kWh)' },
  { path: 'noExiste.campo', label: 'Un campo inexistente' },
];
let state = addHighlights(EMPTY_HIGHLIGHTS, { projectId: 'p1', changes: batch, now: T0 });
assert.equal(state.projectId, 'p1');
assert.deepEqual(activeMarks(state, T0).map((mark) => mark.key).sort(),
  ['dock-equipment-panel-1', 'dock-financials-item-0', 'dock:client', 'pd-rates-coverage', 'pd-rates-grid-charge', 'tab:energia'],
  'una marca por ancla: controles, filas, la sección de lo que no tiene control y la pestaña; lo derivado y lo desconocido no destacan');
assert.equal(addHighlights(EMPTY_HIGHLIGHTS, { projectId: 'p1', changes: [], now: T0 }), EMPTY_HIGHLIGHTS, 'un lote sin anclas no cambia nada');

const present = new Set(['pd-rates-coverage', 'dock-equipment-panel-1', 'dock-financials-item-0']); // el cargo de uso de red no está en pantalla
const view = (open = ALL_OPEN, now = T0, projectId = 'p1', activeTab: 'energia' | 'cotizacion' = 'cotizacion') =>
  dockHighlightView(state, now, { projectId, open, isPresent: (target) => present.has(target), activeTab });
let shown = view();
assert.deepEqual(shown.controls.sort(), ['dock-equipment-panel-1', 'dock-financials-item-0', 'pd-rates-coverage'], 'los controles que sí están: se destacan ellos');
assert.deepEqual(Object.keys(shown.sections).sort(), ['client', 'rates'], 'solo las secciones con algo que no se ve en un control llevan indicador');
assert.match(shown.sections.client!, /^Cambió aquí: RNC\b/, 'lo que ningún control edita: la sección lo dice');
assert.match(shown.sections.rates!, /Cargo uso de red/, 'el control que no está en pantalla cae en su sección');
assert.match(shown.sections.rates!, /sin control visible/i, 'y dice por qué: lo oculta la organización o el modo');
assert.doesNotMatch(shown.sections.rates!, /Cobertura/, 'con la sección abierta, lo que sí se ve no se repite en el indicador');
assert.match(shown.tabs.energia!, /Consumo de abril/, 'la pestaña no visible lleva su indicador');
assert.deepEqual(view(ALL_OPEN, T0, 'p1', 'energia').tabs, {}, 'la pestaña a la vista no necesita indicador');
// Sección plegada: el indicador es lo único que se ve; lista todo lo que cambió en ella.
shown = view({ ...ALL_OPEN, rates: false, equipment: false });
assert.match(shown.sections.rates!, /Cobertura objetivo/);
assert.match(shown.sections.rates!, /Cargo uso de red/);
assert.match(shown.sections.equipment!, /Cantidad de paneles \(#2\)/);
assert.deepEqual(shown.sections.financials, undefined, 'una sección abierta con su control a la vista no lleva indicador');
// Control dentro de «Avanzado» plegado: está en el DOM pero no se ve; la sección abierta lleva el indicador, con la nota.
const adv = addHighlights(EMPTY_HIGHLIGHTS, { projectId: 'p1', now: T0, changes: [{ path: 'specs.batteries[0].dodPct', label: 'Profundidad de descarga' }] });
const advTarget = adv.marks[0].target!;
const advView = dockHighlightView(adv, T0, { projectId: 'p1', open: ALL_OPEN, isPresent: () => false, isCollapsed: (t) => t === advTarget, activeTab: 'cotizacion' });
assert.deepEqual(advView.controls, [], 'un control plegado no se marca');
assert.match(advView.sections.equipment ?? '', /Profundidad de descarga.*Avanzado/, 'la sección abierta indica que cambió dentro de Avanzado');
assert.doesNotMatch(advView.sections.equipment ?? '', /organización/, 'y no culpa a la organización');
// Caso mixto: la nota va con cada etiqueta, no con todo el indicador, y «oculto por la organización» no tapa «Avanzado».
const mixed = addHighlights(EMPTY_HIGHLIGHTS, { projectId: 'p1', now: T0, changes: [
  { path: 'specs.panels[0].count', label: 'Cantidad de paneles' },
  { path: 'specs.batteries[0].dodPct', label: 'Profundidad de descarga' },
] });
const mixedView = dockHighlightView(mixed, T0, { projectId: 'p1', open: { ...ALL_OPEN, equipment: false }, isPresent: (t) => t !== advTarget, isCollapsed: (t) => t === advTarget, activeTab: 'cotizacion' });
assert.match(mixedView.sections.equipment ?? '', /Cantidad de paneles(?! \()/, 'la cantidad de paneles no se atribuye a Avanzado');
assert.match(mixedView.sections.equipment ?? '', /Profundidad de descarga \(en Avanzado, plegado\)/, 'cada etiqueta lleva su nota');
const mixedHidden = dockHighlightView(mixed, T0, { projectId: 'p1', open: ALL_OPEN, isPresent: () => false, isCollapsed: (t) => t === advTarget, activeTab: 'cotizacion' });
assert.match(mixedHidden.sections.equipment ?? '', /Profundidad de descarga \(en Avanzado, plegado\)/, 'lo oculto no tapa la nota de Avanzado');
assert.match(mixedHidden.sections.equipment ?? '', /Cantidad de paneles \(sin control visible/, 'lo oculto lleva su propia nota');
// Un indicador largo se acorta con «y N más».
const many = addHighlights(EMPTY_HIGHLIGHTS, { projectId: 'p1', now: T0, changes: ['client.name', 'client.location', 'client.address', 'client.contactPhone', 'client.contactPerson'].map((path) => ({ path, label: `Campo ${path}` })) });
const folded = dockHighlightView(many, T0, { projectId: 'p1', open: { ...ALL_OPEN, client: false }, isPresent: () => true, activeTab: 'cotizacion' });
assert.match(folded.sections.client!, /y 2 más/, 'más de tres etiquetas: «y N más»');
// Otra propuesta: nada.
assert.deepEqual(view(ALL_OPEN, T0, 'otra'), { controls: [], sections: {}, tabs: {} }, 'solo se destaca en la propuesta del lote');

// Caducidad: las marcas duran un tiempo y luego se van; un lote nuevo las renueva sin duplicar.
assert.equal(activeMarks(state, T0 + HIGHLIGHT_TTL_MS - 1).length, 6);
assert.equal(activeMarks(state, T0 + HIGHLIGHT_TTL_MS).length, 0, 'caduca al cumplirse el plazo');
assert.equal(nextExpiry(state, T0), T0 + HIGHLIGHT_TTL_MS);
assert.equal(nextExpiry(state, T0 + HIGHLIGHT_TTL_MS), null, 'sin marcas vivas no hay nada que esperar');
assert.deepEqual(view(ALL_OPEN, T0 + HIGHLIGHT_TTL_MS), { controls: [], sections: {}, tabs: {} });
const later = addHighlights(state, { projectId: 'p1', now: T0 + 4000, changes: [{ path: 'rates.targetCoveragePct', label: 'Cobertura objetivo' }, { path: 'client.name', label: 'Nombre del cliente' }] });
assert.equal(activeMarks(later, T0 + 4000).filter((mark) => mark.target === 'pd-rates-coverage').length, 1, 'la misma ancla no se duplica');
assert.equal(activeMarks(later, T0 + 4000 + HIGHLIGHT_TTL_MS - 1).filter((mark) => mark.target === 'pd-rates-coverage').length, 1, 'se renueva');
assert.equal(activeMarks(later, T0 + HIGHLIGHT_TTL_MS + 1).length, 2, 'las que no se renovaron caducaron: queda la renovada y la nueva');
assert.equal(pruneExpired(later, T0 + HIGHLIGHT_TTL_MS + 1).marks.length, 2, 'pruneExpired las quita del estado');
assert.equal(pruneExpired(EMPTY_HIGHLIGHTS, T0), EMPTY_HIGHLIGHTS);
// Cambiar de propuesta empieza de cero; no arrastra las marcas de la anterior.
const other = addHighlights(later, { projectId: 'p2', now: T0 + 4000, changes: [{ path: 'client.name', label: 'Nombre del cliente' }] });
assert.equal(other.projectId, 'p2');
assert.deepEqual(activeMarks(other, T0 + 4000).map((mark) => mark.target), ['pd-cli-name']);

// ── 2. Marcas en el DOM, sin DOM simulado: la raíz es un objeto de tres métodos ─────────────────────────────────────────
interface FakeEl { anchor: string; attrs: Map<string, string>; getAttribute(n: string): string | null; setAttribute(n: string, v: string): void; removeAttribute(n: string): void }
const el = (anchor: string): FakeEl => {
  const attrs = new Map<string, string>([['data-dock-anchor', anchor]]);
  return { anchor, attrs, getAttribute: (n) => attrs.get(n) ?? null, setAttribute: (n, v) => void attrs.set(n, v), removeAttribute: (n) => void attrs.delete(n) };
};
const els = ['pd-rates-coverage', 'pd-rates-kwh', 'dock-equipment-panel-1', 'dock-rates'].map(el);
/** Un selector de atributo `[nombre]` o `[nombre="valor"]`: lo único que usa el dock. */
const matches = (e: FakeEl, selector: string) => {
  const parsed = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector);
  assert.ok(parsed, `selector no soportado por la raíz de prueba: ${selector}`);
  const value = e.attrs.get(parsed[1]);
  return parsed[2] === undefined ? value !== undefined : value === parsed[2];
};
const root: MarkRoot = {
  querySelectorAll: (selector) => els.filter((e) => matches(e, selector)),
  // Selector descendiente de «Avanzado» plegado: ningún elemento de esta raíz lo está.
  querySelector: (selector) => selector.startsWith('[data-dock-collapsed') ? null : els.find((e) => matches(e, selector)) ?? null,
};
assert.equal(presentInDock(root, 'pd-rates-kwh'), true);
assert.equal(presentInDock(root, 'pd-no-esta'), false);
// «Avanzado» plegado: la raíz de prueba sabe de los ancestros marcados (`data-dock-collapsed`).
const hiddenRoot: MarkRoot = {
  querySelectorAll: () => [],
  querySelector: (selector) => selector.startsWith('[data-dock-collapsed="true"] ') ? (selector.includes('"pd-folded"') ? {} : null) : (selector.includes('"pd-folded"') || selector.includes('"pd-open"') ? {} : null),
};
assert.equal(collapsedInDock(hiddenRoot, 'pd-folded'), true);
assert.equal(presentInDock(hiddenRoot, 'pd-folded'), false, 'en el DOM pero plegado: no se ve');
assert.equal(presentInDock(hiddenRoot, 'pd-open'), true);
syncChangedMarks(root, ['pd-rates-coverage', 'dock-equipment-panel-1']);
assert.deepEqual(els.map((e) => e.attrs.get('data-assistant-changed') ?? null), ['control', null, 'control', null], 'destaca los controles pedidos y nada más');
syncChangedMarks(root, ['pd-rates-kwh']);
assert.deepEqual(els.map((e) => e.attrs.get('data-assistant-changed') ?? null), [null, 'control', null, null], 'al caducar o cambiar, quita las marcas que ya no tocan');
syncChangedMarks(root, []);
assert.ok(els.every((e) => !e.attrs.has('data-assistant-changed')), 'sin marcas vivas no queda ninguna');

// ── 3. El store fuera de React, enganchado a commitProjectEdits ────────────────────────────────────────────────────────
const store = useSimulationStore;
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'hl-1', syncStatus: 'local_only' as const };
const open = () => {
  dockHighlightStore.clear();
  store.setState({
    appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, activeView: 'simulator',
    equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
    agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
    syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  });
  store.getState().setActiveProject(project.id, 'simulator');
};
const live = () => activeMarks(dockHighlightStore.getState(), Date.now()).map((mark) => mark.target).filter(Boolean).sort();
const commit = (source: 'assistant' | 'dock' | 'user' | 'external_agent' | 'system', edits: { path: string; value: unknown }[], extra: object = {}) =>
  store.getState().commitProjectEdits(project.id, edits, { source, coalesceKey: `hl-${source}`, ...extra });

open();
let notified = 0;
const unsubscribe = dockHighlightStore.subscribe(() => { notified += 1; });
const asked = commit('assistant', [{ path: 'rates.targetCoveragePct', value: 82 }, { path: 'financials.discountRatePct', value: 11 }], { turnId: 'turno-1' });
assert.ok(asked.ok && asked.written, JSON.stringify(asked));
assert.deepEqual(live(), ['pd-discount-rate', 'pd-rates-coverage'], 'un lote del asistente destaca los controles que tocó');
assert.equal(dockHighlightStore.getState().projectId, project.id);
assert.equal(notified, 1, 'un lote, una notificación');
// Lo derivado por una regla también se destaca: el cambio de distribuidora trae su tarifa, su precio y su perfil.
open();
const tariff = commit('assistant', [{ path: 'rates.distributor', value: 'EDENORTE' }]);
assert.ok(tariff.ok && tariff.written && tariff.changes.some((change) => change.derived), 'el cambio de distribuidora deja cambios derivados');
const expectedTargets = tariff.ok ? [...new Set(tariff.changes.flatMap((change) => anchorForPath(change.path)?.target ?? []))].sort() : [];
assert.ok(expectedTargets.length >= 2 && expectedTargets.includes('pd-rates-distributor'), `el pedido y lo derivado tienen control: ${expectedTargets.join(', ')}`);
assert.deepEqual(live(), expectedTargets, 'las anclas destacadas son exactamente las de los cambios de la transacción, derivados incluidos');

// Nada de esto destaca un lote que no es del asistente.
for (const source of ['dock', 'user', 'external_agent', 'system'] as const) {
  open();
  const result = commit(source, [{ path: 'rates.targetCoveragePct', value: 77 }]);
  assert.ok(result.ok && result.written, `${source}: se escribió`);
  assert.deepEqual(live(), [], `un lote de origen «${source}» no destaca nada`);
}
// Ni lo repetido (idempotencia), ni lo que no cambia, ni lo rechazado.
open();
const first = commit('assistant', [{ path: 'rates.targetCoveragePct', value: 83 }], { idempotencyKey: 'k1' });
assert.ok(first.ok && first.written);
dockHighlightStore.clear();
const repeated = commit('assistant', [{ path: 'rates.targetCoveragePct', value: 83 }], { idempotencyKey: 'k1' });
assert.ok(repeated.ok && repeated.duplicate, 'el reintento no se aplica de nuevo');
assert.deepEqual(live(), [], 'un reintento idempotente no vuelve a destacar');
const same = commit('assistant', [{ path: 'rates.targetCoveragePct', value: 83 }]);
assert.ok(same.ok && !same.written, 'sin cambios');
assert.deepEqual(live(), [], 'un lote sin cambios no destaca');
const rejected = commit('assistant', [{ path: 'rates.targetCoveragePct', value: 'mucho' }]);
assert.equal(rejected.ok, false);
assert.deepEqual(live(), [], 'un lote rechazado no destaca');
unsubscribe();

// Camino actual: el asistente flotante (propose_project_update confirmado) escribe con origen «asistente»; un agente externo no.
open();
const ctxApp = { source: 'app-assistant' as const, owner: assistantOwner() };
const coverage = (value: number) => ({ name: 'propose_project_update', args: { id: project.id, title: `Cobertura ${value}`, edits: [{ section: 'rates', field: 'targetCoveragePct', valueJson: String(value) }] } });
const viaApp = await applyTool(coverage(85), ctxApp);
assert.ok(viaApp.activityId, 'el borrador del asistente se aplica en vivo');
assert.deepEqual(live(), ['pd-rates-coverage'], 'por el camino actual del asistente flotante también se destaca');
assert.equal(store.getState().undoHistory.journals[project.id].undo.at(-1)?.source, 'assistant', 'y el paso de deshacer queda con origen «asistente»');
// Cuando la fachada se queda en el camino antiguo (la tarifa por ruta traería otro precio y perfil), también se destaca.
open();
const tariffEdits = [
  { section: 'rates', field: 'distributor', valueJson: '"EDENORTE"' },
  { section: 'rates', field: 'tariffCode', valueJson: '"BTS1"' },
];
const viaLegacy = await applyTool({ name: 'propose_project_update', args: { id: project.id, title: 'Tarifa', edits: tariffEdits } }, ctxApp);
assert.ok(viaLegacy.activityId);
assert.equal(store.getState().getActiveProject().rates.energyCostPerKWh, project.rates.energyCostPerKWh, 'camino antiguo: conserva el precio de energía (no pasó por la transacción)');
assert.deepEqual(live(), ['pd-rates-distributor', 'pd-rates-tariff'], 'el camino antiguo del asistente también destaca lo que cambió');
open();
const viaMcp = await executeAgentTool(coverage(86), { source: 'mcp', owner: assistantOwner(), clientLabel: 'Claude Code' });
assert.equal(viaMcp.status, 'applied', JSON.stringify(viaMcp));
assert.deepEqual(live(), [], 'un agente externo no mueve el dock del usuario');
assert.equal(store.getState().undoHistory.journals[project.id].undo.at(-1)?.source, 'user', 'su paso de deshacer sigue como siempre');

// Gancho de prueba manual (docs/QA.md): aplica un lote con origen asistente por la transacción real y arma la tarjeta.
open();
const qa = assistantEditForQa([{ path: 'rates.targetCoveragePct', value: 81 }], 'Prueba');
assert.ok(qa.result.ok && qa.result.written);
assert.deepEqual(live(), ['pd-rates-coverage'], 'el gancho destaca por el camino real');
assert.equal(qa.input?.status, 'applied');
assert.equal(qa.input?.results?.before?.complete, true);
assert.equal(qa.input?.results?.after?.complete, true);
assert.deepEqual(qa.input?.changes.map((c) => c.path), ['rates.targetCoveragePct']);
assert.equal(store.getState().undoHistory.journals[project.id].undo.at(-1)?.source, 'assistant');
const qaBad = assistantEditForQa([{ path: 'rates.targetCoveragePct', value: 'mucho' }]);
assert.equal(qaBad.input?.status, 'error', 'un lote rechazado da una tarjeta de error, sin destacar');
assert.equal(assistantEditForQa([{ path: 'rates.targetCoveragePct', value: 81 }]).input, null, 'sin cambios no hay tarjeta');
const mainSource = readFileSync('src/main.tsx', 'utf8');
assert.match(mainSource, /import\.meta\.env\.DEV[\s\S]{0,200}assistantFeedback\/devHook/, 'el gancho solo se instala en desarrollo');

// ── 4. Contrato con la interfaz ─────────────────────────────────────────────────────────────────────────────────────────
const css = readFileSync('src/index.css', 'utf8');
const controlRule = /\[data-assistant-changed='control'\]\s*\{[^}]*\}/.exec(css);
assert.ok(controlRule, 'el estilo del control destacado');
assert.match(controlRule[0], /outline:/, 'el contorno queda fijo mientras dura el destacado');
assert.doesNotMatch(controlRule[0], /animation/, 'la regla base no se anima');
assert.match(css, /\[data-assistant-changed='section'\] > h2 > button\s*\{/, 'el estilo del indicador de sección');
// El pulso de entrada solo corre con movimiento permitido: con prefers-reduced-motion queda el contorno fijo.
assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\[data-assistant-changed='control'\] \{ animation: assistant-changed-in/, 'la animación solo bajo prefers-reduced-motion: no-preference');
assert.equal((css.match(/assistant-changed-in/g) ?? []).length, 2, 'una definición del pulso y un único uso, dentro de la consulta de movimiento');
const hook = readFileSync('src/components/simulator/sidebar/useDockHighlight.ts', 'utf8');
assert.doesNotMatch(hook, /\.focus\(|scrollIntoView|scrollTo|setActiveView|setActiveProject/, 'el resaltado no roba el foco, no desplaza y no navega');
assert.match(hook, /dockHighlightStore/, 'se alimenta del store, no del panel del asistente');
assert.match(readFileSync('src/components/simulator/sidebar/ParameterSidebar.tsx', 'utf8'), /useDockHighlight\(/, 'el dock lo usa');
assert.match(readFileSync('src/components/simulator/SimulatorView.tsx', 'utf8'), /data-assistant-changed/, 'la pestaña de Energía lleva su indicador');

console.log('PASS: resaltado del dock: anclas por lote del asistente, caducidad, secciones plegadas, controles ocultos, pestaña, solo origen asistente y reduced-motion.');
assert.match(hook, /MutationObserver[\s\S]*COLLAPSED_ATTR|COLLAPSED_ATTR[\s\S]*MutationObserver/, 'recalcula al plegar o desplegar Avanzado');
