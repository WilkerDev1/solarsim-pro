// F2a2: transacción de edición de propuestas (ADR 0004, «Transacción»). Abre con la prueba que motivó la fase: el mismo
// lote de ediciones en cualquier orden da el mismo proyecto. Encadenar `applyProjectEdit` ingenuamente no lo cumple: la
// reconciliación con el catálogo y el redimensionado corren en cada paso contra el proyecto intermedio.
import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { applyProjectEdit, type ProjectEdit } from '../domain/projectEdit';
import { applyProjectEdits, editsFromPatch, type ProjectFieldEdit } from '../domain/projectEditTransaction';
import { RD_PROVINCES } from '../data/rdProvinces';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeForAssistant } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import { readEquipment } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { createDockWriters, DOCK_COMMIT_OPTIONS } from '../components/simulator/params/logic/dockEdits';
import { planDistributorChange, planTariffChange } from '../components/simulator/params/sections/rates/ratesLogic';
import { buildCatalogSelectionUpdate } from '../components/simulator/params/logic/catalogSelection';
import { probeStore, settleUndoDebounce } from './support/storeProbe';
import type { ProjectSimulation } from '../types';
import type { EquipmentSupplierPrice, SolarEquipmentItem } from '../types/equipment';

// ── Datos ────────────────────────────────────────────────────────────────────────────────────
const offer = (id: string, supplierName: string, priceUSD: number): EquipmentSupplierPrice => ({ id, supplierName, priceUSD, updatedAt: '2026-01-01' });
const item = (extra: Partial<SolarEquipmentItem> & Pick<SolarEquipmentItem, 'id' | 'type' | 'displayName'>): SolarEquipmentItem =>
  ({ brand: 'B', modelSeries: 'M', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra }) as SolarEquipmentItem;
const CATALOG: SolarEquipmentItem[] = [
  item({ id: 'p-a', type: 'panel', displayName: 'Panel A 550W', powerW: 550, efficiencyPct: 21.5, supplierPrices: [offer('sp-a1', 'Alfa', 100)] }),
  item({ id: 'p-b', type: 'panel', displayName: 'Panel B 700W', powerW: 700, efficiencyPct: 22.4, supplierPrices: [offer('sp-b1', 'Beta', 130)] }),
  item({ id: 'i-a', type: 'inverter', displayName: 'Inversor A 10K', powerKW: 10, supplierPrices: [offer('sp-ia', 'Alfa', 2500)] }),
  item({ id: 'b-a', type: 'battery', displayName: 'Batería A', capacityKWh: 10, dodPct: 90, batteryEfficiencyPct: 95, supplierPrices: [offer('sp-ba', 'Alfa', 2000)] }),
];
const ctx = { equipmentCatalog: CATALOG };

/** Caso de referencia con el panel principal del catálogo (550 W), autodimensionado activo y sin baterías. */
const baseProject = (id = 'tx-perm'): ProjectSimulation => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = id;
  p.specs = { ...p.specs, autoCalculatePanels: true, hasBattery: false };
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { brandModel: 'Panel A 550W', powerW: 550, catalogItemId: 'p-a' } }) };
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { brandModel: 'Inversor A 10K', powerKW: 10, catalogItemId: 'i-a' } }) };
  return p;
};
const otherProvince = RD_PROVINCES.find((province) => province.name !== BENCHMARK_PROJECT.client.province && province.avgHSP !== RD_PROVINCES[0].avgHSP)!.name;
const battery = { id: 'bat-1', catalogItemId: 'b-a', brandModel: 'Batería A', capacityKWh: 10, count: 2, unitPriceUSD: 2000, dodPct: 90, efficiencyPct: 95 };
const months = [1100, 1050, 1200, 1300, 1400, 1500, 1550, 1500, 1400, 1300, 1200, 1100];

/** Equipos, baterías, tarifa, consumo, provincia, cobertura y precio en un solo lote. */
const BATCH: ProjectFieldEdit[] = [
  { path: 'specs.panels[0].powerW', value: 580 }, // potencia a mano sobre un modelo del catálogo (revisión, B2)
  { path: 'specs.batteries', value: [battery] }, // elegir batería exige «Incluir batería» = sí
  { path: 'rates.distributor', value: 'EDENORTE' },
  { path: 'rates.tariffCode', value: 'BTS1' },
  { path: 'monthlyConsumption', value: months },
  { path: 'specs.installationUnitPriceUSD', value: 150 },
  { path: 'specs.panels[0].unitPriceUSD', value: 120 },
  { path: 'rates.targetCoveragePct', value: 80 },
  { path: 'client.province', value: otherProvince },
  { path: 'specs.saleMarginMultiplier', value: 1.3 },
];

/** Generador determinista (mulberry32) para muestrear permutaciones de forma reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function permutations<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((head, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [head, ...rest]));
}
const sectionsJson = (p: ProjectSimulation) =>
  JSON.stringify({ client: p.client, specs: p.specs, rates: p.rates, financials: p.financials, monthlyConsumption: p.monthlyConsumption, customization: p.customization, aiSource: p.aiSource });

/** JSON con las claves ordenadas: el orden de inserción de una clave nueva no es comportamiento (el lote se ordena por ruta). */
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));

const ok = (result: ReturnType<typeof applyProjectEdits>) => {
  if (!result.ok) throw new Error(`lote rechazado: ${JSON.stringify(result.errors)}`);
  return result;
};

// ── 1. Independiente del orden ──────────────────────────────────────────────────────────────
{
  // Por qué hace falta: el pliegue ingenuo de applyProjectEdit depende del orden. Potencia a mano y luego consumo vuelve
  // a la del catálogo (la reconciliación ve el valor intermedio como «no fijado por la edición»); al revés la conserva.
  const base = baseProject();
  const manualPower: ProjectEdit = { kind: 'specs', patch: editEquipmentGroup(base.specs, 'panel', { type: 'update', index: 0, patch: { powerW: 580 } }) };
  const consumption: ProjectEdit = { kind: 'consumption', monthlyConsumption: months };
  const fold = (list: ProjectEdit[]) => list.reduce((p, edit) => applyProjectEdit(p, edit, ctx), base);
  assert.equal(readEquipment(fold([manualPower, consumption]).specs).panels[0].powerW, 550, 'pliegue ingenuo: el consumo revierte la potencia fijada en el mismo lote');
  assert.equal(readEquipment(fold([consumption, manualPower]).specs).panels[0].powerW, 580, 'pliegue ingenuo: en el otro orden se conserva');

  const frozen = structuredClone(base);
  const reference = ok(applyProjectEdits(base, BATCH, ctx));
  assert.deepEqual(base, frozen, 'applyProjectEdits no muta la propuesta de entrada');
  const expected = sectionsJson(reference.project);
  const expectedChanges = JSON.stringify(reference.changes);
  const random = rng(20261127);
  const orders = [BATCH, [...BATCH].reverse(), ...BATCH.map((_, i) => [...BATCH.slice(i), ...BATCH.slice(0, i)]), ...Array.from({ length: 300 }, () => shuffled(BATCH, random))];
  for (const order of orders) {
    const result = ok(applyProjectEdits(base, order, ctx));
    assert.equal(sectionsJson(result.project), expected, 'el mismo lote en otro orden da el mismo proyecto');
    assert.equal(JSON.stringify(result.changes), expectedChanges, 'y el mismo diff');
  }
  // Lote más pequeño en TODAS sus permutaciones (5! = 120).
  const small = [BATCH[0], BATCH[1], BATCH[3], BATCH[4], BATCH[6]];
  const smallExpected = sectionsJson(ok(applyProjectEdits(base, small, ctx)).project);
  for (const order of permutations(small)) assert.equal(sectionsJson(ok(applyProjectEdits(base, order, ctx)).project), smallExpected);

  // Qué deja el lote: la potencia fijada se respeta, la batería activa el almacenamiento y la cantidad se redimensiona UNA vez
  // con los insumos finales (consumo, provincia, cobertura y potencia nuevos).
  const next = reference.project;
  const panel = readEquipment(next.specs).panels[0];
  assert.equal(panel.powerW, 580, 'la potencia fijada a mano no se revierte dentro de la misma transacción');
  assert.equal(panel.unitPriceUSD, 120);
  assert.equal(next.specs.hasBattery, true, 'elegir batería activa «Incluir batería»');
  assert.equal(next.specs.autoCalculatePanels, true);
  const recommended = calculateRecommendedPanelCount(otherProvince, months, 580, 80, resolveAssumptions(next).systemLossesPct, next.client.customMonthlyHSP).recommendedPanelCount;
  assert.equal(panel.count, recommended, 'redimensiona contra los insumos finales del lote');
  assert.equal(next.rates.distributor, 'EDENORTE');
  assert.equal(next.rates.tariffCode, 'BTS1');
  assert.deepEqual(next.monthlyConsumption, months);

  // Diff: antes → después, con etiqueta en español; las rutas que no pidió el lote salen como derivadas.
  const change = (path: string) => reference.changes.find((c) => c.path === path);
  assert.deepEqual(change('specs.hasBattery'), { path: 'specs.hasBattery', label: 'Incluir batería', before: false, after: true, derived: true });
  assert.equal(change('specs.panels[0].count')?.derived, true, 'la cantidad la cambió el autodimensionado');
  assert.equal(change('specs.panels[0].powerW')?.derived, false);
  assert.equal(change('rates.targetCoveragePct')?.before, BENCHMARK_PROJECT.rates.targetCoveragePct);
  assert.equal(change('rates.targetCoveragePct')?.after, 80);
  for (const c of reference.changes) assert.ok(c.label && c.label !== c.path, `${c.path} tiene etiqueta del registro`);
  assert.ok(reference.warnings.some((w) => w.includes('Incluir batería')), 'la dependencia resuelta se informa, no en silencio');

  // Resultados del motor antes y después, los que ya muestra la app.
  const metrics = applyProjectEdits(base, BATCH, ctx, { metrics: true });
  assert.ok(metrics.ok && metrics.metrics);
  const summary = (p: ProjectSimulation) => calculateProjectFinancialSummary(p);
  assert.equal(metrics.metrics.before.contractPriceUSD, summary(base).contractPriceUSD);
  assert.equal(metrics.metrics.after.contractPriceUSD, summary(next).contractPriceUSD);
  assert.equal(metrics.metrics.after.systemCapacityKWp, summary(next).systemCapacityKWp);
  assert.equal(metrics.metrics.after.paybackYears, summary(next).paybackYears);
  assert.equal(metrics.metrics.after.year1SavingsUSD, summary(next).year1SavingsUSD);
}

// ── 2. Validación: rechazo por ruta, todo o nada ────────────────────────────────────────────
{
  const base = baseProject();
  const rejected = applyProjectEdits(base, [
    { path: 'rates.targetCoveragePct', value: 500 },
    { path: 'specs.inventado', value: 1 },
    { path: 'specs.hasBattery', value: 'sí' },
    { path: 'rates.distributor', value: 'EDEOESTE' },
    { path: 'specs.saleMarginMultiplier', value: 1.4 },
  ], ctx);
  assert.equal(rejected.ok, false, 'un solo error rechaza todo el lote');
  if (rejected.ok) throw new Error('unreachable');
  assert.deepEqual(rejected.errors.map((e) => e.path).sort(), ['rates.distributor', 'rates.targetCoveragePct', 'specs.hasBattery', 'specs.inventado'], 'la lista completa de errores, uno por ruta');
  for (const e of rejected.errors) assert.ok(e.message.length > 10, 'mensaje útil');
  assert.match(rejected.errors.find((e) => e.path === 'rates.targetCoveragePct')!.message, /Cobertura objetivo.*300/);
  assert.match(rejected.errors.find((e) => e.path === 'specs.inventado')!.message, /no existe|desconocida/i);

  const overlap = applyProjectEdits(base, [{ path: 'specs.panels', value: base.specs.panels }, { path: 'specs.panels[0].count', value: 3 }], ctx);
  assert.equal(overlap.ok, false, 'dos rutas que se pisan no se aplican en ningún orden');
  const duplicated = applyProjectEdits(base, [{ path: 'rates.targetCoveragePct', value: 80 }, { path: 'rates.targetCoveragePct', value: 90 }], ctx);
  assert.equal(duplicated.ok, false, 'la misma ruta con dos valores es ambigua');
  const readOnly = applyProjectEdits(base, [{ path: 'specs.panels[0].selectedSupplierInfo', value: { supplierName: 'X', priceUSD: 1 } }], ctx);
  assert.equal(readOnly.ok, false, 'lo que solo escriben las reglas no se edita por ruta');
  const missingGroup = applyProjectEdits(base, [{ path: 'specs.panels[4].count', value: 3 }], ctx);
  assert.equal(missingGroup.ok, false, 'un grupo que no existe');
  // Dependencias que no se activan solas: aplicar el cargo de la red exige el régimen SIE-007.
  const legacy = baseProject();
  legacy.rates = { ...legacy.rates, netMeteringRegime: 'legacy_retention' };
  const charge = applyProjectEdits(legacy, [{ path: 'rates.gridUseChargeDOPPerKWh', value: 1.2 }], ctx);
  assert.equal(charge.ok, false);
  assert.ok(applyProjectEdits(legacy, [{ path: 'rates.gridUseChargeDOPPerKWh', value: 1.2 }, { path: 'rates.netMeteringRegime', value: 'sie007_2026' }], ctx).ok, 'en el mismo lote que el régimen, sí');
  const contradiction = applyProjectEdits(base, [{ path: 'specs.batteries', value: [battery] }, { path: 'specs.hasBattery', value: false }], ctx);
  assert.equal(contradiction.ok, false, 'elegir batería y apagar el almacenamiento en el mismo lote es una contradicción');
  // Un lote vacío o sin efecto no es un error y no cambia nada. (Reescribir la cobertura no es «sin efecto»: como siempre,
  // fuerza el autodimensionado, y con la cantidad desfasada del caso de referencia la recalcula.)
  // (Las sobrescrituras manuales del caso auditado sí cambian: en otra propuesta toda edición financiera las suelta, y el
  // diff lo dice como derivado.)
  const stripped = applyProjectEdits(base, [{ path: 'financials.discountRatePct', value: base.financials.discountRatePct }], ctx);
  assert.ok(stripped.ok && stripped.changes.every((c) => c.derived && c.path.startsWith('financials.custom')));
  const noop = applyProjectEdits(stripped.project, [{ path: 'financials.discountRatePct', value: base.financials.discountRatePct }], ctx);
  assert.ok(noop.ok && noop.changes.length === 0);
  const empty = applyProjectEdits(base, [], ctx);
  assert.ok(empty.ok && empty.changes.length === 0 && empty.project === base || (empty.ok && sectionsJson(empty.project) === sectionsJson(base)));
}

// ── 3. La edición de la caracterización de F0, como un lote: mismo resultado del motor ───────
const INITIAL_UPDATED_AT = '2026-01-01T00:00:00.000Z';
const charProject = { ...structuredClone(BENCHMARK_PROJECT), id: 'edit-char', syncStatus: 'local_only' as const, updatedAt: INITIAL_UPDATED_AT, createdAt: INITIAL_UPDATED_AT };
const defaultCatalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const reset = (project: ProjectSimulation, policy = DEFAULT_AGENT_POLICY, catalog: SolarEquipmentItem[] = defaultCatalog) => {
  store.setState({
    appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, activeView: 'simulator',
    equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
    agentPolicy: policy, agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
    syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  });
  store.getState().setActiveProject(project.id, 'simulator');
};
const active = () => store.getState().getActiveProject();
const engine = () => {
  const s = store.getState().getFinancialSummary();
  return {
    systemCapacityKWp: s.systemCapacityKWp, annualProductionKWh: Math.round(s.annualProductionKWh * 10) / 10, energyCoveragePct: s.energyCoveragePct,
    contractPriceUSD: s.contractPriceUSD, netInvestmentUSD: s.netInvestmentUSD, year1SavingsUSD: s.year1SavingsUSD, paybackYears: s.paybackYears,
  };
};
const AFTER = { systemCapacityKWp: 5.9, annualProductionKWh: 9783.6, energyCoveragePct: 24.9, contractPriceUSD: 13410.18, netInvestmentUSD: 8637.88, year1SavingsUSD: 2108.17, paybackYears: 3.9 };
{
  // Camino antiguo (sin confirmación) para tener el proyecto de referencia.
  reset(charProject, { ...DEFAULT_AGENT_POLICY, internal: { read: 'allow', draft: 'allow', guarded: 'allow' } });
  const panel = defaultCatalog.find((e) => e.type === 'panel')!;
  const inverter = defaultCatalog.find((e) => e.type === 'inverter')!;
  const legacy = await executeForAssistant({ name: 'propose_project_update', args: { id: charProject.id, title: 'Equipos y tarifa', edits: [
    { section: 'specs', field: 'panels', valueJson: JSON.stringify([{ id: panel.id, count: 10, unitPriceUSD: 100 }]) },
    { section: 'specs', field: 'inverters', valueJson: JSON.stringify([{ id: inverter.id, count: 1, unitPriceUSD: 1500 }]) },
    { section: 'client', field: 'distributor', valueJson: '"EDENORTE"' },
    { section: 'client', field: 'tariffCode', valueJson: '"BTS1"' },
    { section: 'rates', field: 'distributor', valueJson: '"EDENORTE"' },
    { section: 'rates', field: 'tariffCode', valueJson: '"BTS1"' },
  ] } }, { source: 'app-assistant', owner: assistantOwner() });
  assert.ok(legacy.activityId);
  assert.deepEqual(engine(), AFTER);
  const viaLegacy = active();

  // El lote equivalente: los grupos como los arma la herramienta y la política automática de precios.
  const common = (e: SolarEquipmentItem, count: number, unitPriceUSD: number) => ({ id: e.id, count, unitPriceUSD, priceSource: 'manual', brandModel: e.displayName, weightKilos: e.weightKg });
  const batch: ProjectFieldEdit[] = [
    { path: 'specs.panels', value: [{ ...common(panel, 10, 100), powerW: panel.powerW, efficiencyPct: panel.efficiencyPct, tempCoeff: panel.tempCoeff, annualDegradation: panel.annualDegradation }] },
    { path: 'specs.inverters', value: [{ ...common(inverter, 1, 1500), powerKW: inverter.powerKW, efficiencyPct: inverter.maxEfficiencyPct }] },
    { path: 'specs.autoCalculatePanels', value: false },
    { path: 'specs.pricingMode', value: 'cost_matrix' },
    { path: 'specs.isDetailed', value: false },
    { path: 'client.distributor', value: 'EDENORTE' },
    { path: 'client.tariffCode', value: 'BTS1' },
    { path: 'rates.distributor', value: 'EDENORTE' },
    { path: 'rates.tariffCode', value: 'BTS1' },
  ];
  reset(charProject);
  const probe = probeStore(store, charProject.id);
  const outcome = store.getState().commitProjectEdits(charProject.id, batch, { source: 'assistant', turnId: 'turn-1', metrics: true });
  assert.ok(outcome.ok, JSON.stringify(!outcome.ok && outcome.errors));
  assert.deepEqual(engine(), AFTER, 'el mismo resultado del motor que fijó F0');
  for (const section of ['client', 'specs', 'rates', 'financials', 'monthlyConsumption'] as const)
    assert.equal(JSON.stringify(active()[section]), JSON.stringify(viaLegacy[section]), `${section} igual que por el camino del asistente`);
  // Una escritura, un sello, una sincronización y un paso de deshacer (el camino antiguo hacía tres de cada).
  assert.deepEqual(probe.writes, [['projects', 'undoHistory', 'canUndo']]);
  assert.deepEqual(probe.syncCalls, [false]);
  assert.equal(probe.updatedAtStamps.length, 1);
  assert.ok(Date.parse(active().updatedAt) > Date.parse(INITIAL_UPDATED_AT));
  const steps = store.getState().undoHistory.journals[charProject.id].undo;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].source, 'assistant');
  assert.equal(steps[0].turnId, 'turn-1');
  assert.ok(steps[0].fields?.some((f) => f.path === 'rates.tariffCode' && !f.derived && f.after === 'BTS1'), 'el paso guarda las rutas de campo');
  assert.ok(steps[0].fields?.some((f) => f.path === 'financials.customITBISSavedUSD' && f.derived), 'también las derivadas (la edición de equipos suelta las cifras manuales del caso auditado)');
  assert.ok(outcome.changes.some((c) => c.path === 'specs.panels[0].count' && c.after === 10));
  assert.ok(outcome.metrics && Math.round(outcome.metrics.after.contractPriceUSD * 100) / 100 === AFTER.contractPriceUSD);
  probe.reset();
  await settleUndoDebounce();
  assert.deepEqual(probe.writes, [], 'nada diferido');
  probe.stop();
}

// ── 4. Deshacer una transacción restaura también las rutas derivadas ───────────────────────────
{
  const project = baseProject('tx-undo');
  reset(project, DEFAULT_AGENT_POLICY, CATALOG);
  const before = active();
  const outcome = store.getState().commitProjectEdits(project.id, [{ path: 'specs.batteries', value: [battery] }, { path: 'rates.targetCoveragePct', value: 70 }], { source: 'assistant' });
  assert.ok(outcome.ok);
  const derived = outcome.changes.filter((c) => c.derived).map((c) => c.path);
  assert.ok(derived.includes('specs.hasBattery') && derived.includes('specs.panels[0].count'), `derivadas: ${derived.join(', ')}`);
  const entry = store.getState().undoHistory.journals[project.id].undo.at(-1)!;
  assert.deepEqual(entry.fields?.filter((f) => f.derived).map((f) => f.path).sort(), [...derived].sort(), 'el diario guarda las derivadas');
  store.getState().undo();
  const undone = active();
  assert.equal(undone.specs.hasBattery, false, 'deshacer apaga otra vez el almacenamiento');
  assert.equal(readEquipment(undone.specs).panels[0].count, readEquipment(before.specs).panels[0].count, 'y devuelve la cantidad redimensionada');
  assert.equal(undone.rates.targetCoveragePct, before.rates.targetCoveragePct);
  assert.equal(JSON.stringify(undone.specs), JSON.stringify(before.specs));
  store.getState().redo();
  assert.equal(active().specs.hasBattery, true);
}

// ── 5. Idempotencia y papelera ──────────────────────────────────────────────────────────────
{
  const project = baseProject('tx-idem');
  reset(project, DEFAULT_AGENT_POLICY, CATALOG);
  const options = { source: 'assistant' as const, idempotencyKey: 'turn-7:call-2' };
  const first = store.getState().commitProjectEdits(project.id, [{ path: 'rates.targetCoveragePct', value: 70 }], options);
  assert.ok(first.ok && first.written);
  // El usuario cambia la cobertura después; repetir la misma llamada no vuelve a aplicar ni a escribir.
  store.getState().commitProjectEdits(project.id, [{ path: 'rates.targetCoveragePct', value: 85 }], { source: 'dock' });
  const probe = probeStore(store, project.id);
  const again = store.getState().commitProjectEdits(project.id, [{ path: 'rates.targetCoveragePct', value: 70 }], options);
  assert.ok(again.ok && again.duplicate, 'la misma clave devuelve el resultado anterior marcado como repetido');
  assert.equal(active().rates.targetCoveragePct, 85, 'no se reaplica');
  assert.deepEqual(probe.writes, []);
  assert.deepEqual(probe.syncCalls, []);
  const reused = store.getState().commitProjectEdits(project.id, [{ path: 'rates.targetCoveragePct', value: 60 }], options);
  assert.equal(reused.ok, false, 'la misma clave con otro lote es un error, no una aplicación');
  probe.stop();

  // Revisión de F2a2: la huella del lote es la del lote canónico. Un reintento con las ediciones en otro orden, o con un
  // `value: undefined` omitido, es el mismo lote: repetido, no «otro lote».
  const batch: ProjectFieldEdit[] = [{ path: 'specs.saleMarginMultiplier', value: 1.3 }, { path: 'rates.targetCoveragePct', value: 75 }, { path: 'client.quoteDate', value: undefined }];
  const retry = { source: 'assistant' as const, idempotencyKey: 'turn-8:call-1' };
  const original = store.getState().commitProjectEdits(project.id, batch, retry);
  assert.ok(original.ok && original.written, JSON.stringify(!original.ok && original.errors));
  const reordered = store.getState().commitProjectEdits(project.id, [...batch].reverse(), retry);
  assert.ok(reordered.ok && reordered.duplicate, `el mismo lote en otro orden es un reintento: ${JSON.stringify(!reordered.ok && reordered.errors)}`);
  const omitted = store.getState().commitProjectEdits(project.id, [batch[1], { path: 'client.quoteDate' } as ProjectFieldEdit, batch[0]], retry);
  assert.ok(omitted.ok && omitted.duplicate, 'undefined explícito u omitido dan la misma huella');
  const nested = store.getState().commitProjectEdits(project.id, [{ path: 'specs.saleMarginMultiplier', value: 1.31 }, batch[1], batch[2]], retry);
  assert.equal(nested.ok, false, 'un valor distinto sigue siendo otro lote');

  store.getState().moveToTrash(project.id);
  const trashed = store.getState().commitProjectEdits(project.id, [{ path: 'rates.targetCoveragePct', value: 50 }], { source: 'assistant' });
  assert.equal(trashed.ok, false, 'la papelera es de solo lectura');
}

// ── 6. El dock escribe por la transacción: 1 escritura, 1 autosync, 1 entrada; mismos valores ─────
{
  /** Ejecuta `run` con el camino antiguo (porciones del store) y con los escritores del dock, desde el mismo estado. */
  const parity = (label: string, project: ProjectSimulation, run: (writers: ReturnType<typeof createDockWriters>) => void) => {
    reset(project, DEFAULT_AGENT_POLICY, CATALOG);
    const s = store.getState();
    run({ updateClient: s.updateClient, updateSpecs: s.updateSpecs, updateRates: s.updateRates, updateFinancials: s.updateFinancials,
      updateRatesAndSpecs: (rates, specs) => { s.updateRates(rates); if (specs) s.updateSpecs(specs); } });
    const legacy = active();
    reset(project, DEFAULT_AGENT_POLICY, CATALOG);
    run(createDockWriters((edits) => store.getState().commitProjectEdits(project.id, edits, DOCK_COMMIT_OPTIONS)));
    const viaDock = active();
    for (const section of ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization'] as const)
      assert.equal(canonical(viaDock[section]), canonical(legacy[section]), `${label}: ${section} igual por el dock nuevo`);
  };
  const p = baseProject('tx-dock');
  const ratesCtx = (q: ProjectSimulation) => ({ matrix: undefined, avgMonthlyConsumption: 1000, dopExchangeRate: 60, rates: q.rates, loadProfilePreset: q.specs.loadProfilePreset, canWriteSpecs: true });
  parity('cobertura', p, (w) => w.updateRates({ targetCoveragePct: 80 }));
  parity('distribuidora', p, (w) => { const plan = planDistributorChange(ratesCtx(p), 'EDENORTE'); w.updateRatesAndSpecs(plan.rates, plan.specs); });
  parity('tarifa', p, (w) => { const plan = planTariffChange(ratesCtx(p), 'BTD'); w.updateRatesAndSpecs(plan.rates, plan.specs); });
  parity('provincia', p, (w) => w.updateClient({ province: otherProvince, customMonthlyHSP: undefined }));
  parity('teléfono', p, (w) => w.updateClient({ contactPhone: '809-555-0101' }));
  parity('cantidad de paneles', p, (w) => w.updateSpecs(editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { count: 33 } })));
  parity('modelo del catálogo', p, (w) => w.updateSpecs(buildCatalogSelectionUpdate(p.specs, 'panel', CATALOG[1])));
  parity('añadir batería', p, (w) => w.updateSpecs({ ...editEquipmentGroup(p.specs, 'battery', { type: 'add', item: battery }), hasBattery: true }));
  parity('margen', p, (w) => w.updateSpecs({ saleMarginMultiplier: 1.35 }));
  parity('pérdidas en 0 (el dock confirma por tecla)', p, (w) => w.updateSpecs({ systemLosses: 0 }));
  parity('cobertura vacía (0 = sin dato)', p, (w) => w.updateRates({ targetCoveragePct: 0 }));
  parity('ítem extra', p, (w) => w.updateFinancials({ customItems: [{ id: 'it-1', description: '', quantity: 1, unit: 'UD', unitPriceUSD: 0, exonerateITBIS: true, applyITBIS: true, applyMargin: true }] }));
  parity('fecha «Hoy»', { ...p, client: { ...p.client, quoteDate: '2026-01-15' } }, (w) => w.updateClient({ quoteDate: undefined }));

  reset(p, DEFAULT_AGENT_POLICY, CATALOG);
  const writers = createDockWriters((edits) => store.getState().commitProjectEdits(p.id, edits, DOCK_COMMIT_OPTIONS));
  const probe = probeStore(store, p.id);
  const plan = planDistributorChange(ratesCtx(p), 'EDENORTE');
  writers.updateRatesAndSpecs(plan.rates, plan.specs);
  assert.deepEqual(probe.writes, [['projects', 'undoHistory', 'canUndo']], 'cambiar de distribuidora (tarifas y perfil) es UNA escritura');
  assert.deepEqual(probe.syncCalls, [false], 'y una sincronización diferida, como antes');
  // Una ráfaga del dock sigue siendo un paso de Ctrl+Z.
  writers.updateRates({ targetCoveragePct: 81 });
  writers.updateRates({ targetCoveragePct: 82 });
  const journal = store.getState().undoHistory.journals[p.id];
  assert.equal(journal.undo.length, 1, 'la ráfaga se agrupa en un paso');
  assert.equal(journal.undo[0].source, 'dock');
  assert.ok(journal.undo[0].fields?.some((f) => f.path === 'rates.targetCoveragePct' && f.after === 82));
  assert.ok(journal.undo[0].fields?.some((f) => f.path === 'rates.distributor'));
  // Una edición sin efecto no escribe ni sincroniza.
  probe.reset();
  writers.updateRates({ targetCoveragePct: 82 });
  assert.deepEqual(probe.writes, []);
  assert.deepEqual(probe.syncCalls, []);
  probe.stop();
  store.getState().undo();
  assert.equal(active().rates.distributor, p.rates.distributor, 'deshacer revierte la ráfaga completa');

  // editsFromPatch: un parche de sección es una lista de ediciones por ruta, sin perder las claves que valen undefined.
  assert.deepEqual(editsFromPatch('client', { province: 'X', customMonthlyHSP: undefined }), [{ path: 'client.province', value: 'X' }, { path: 'client.customMonthlyHSP', value: undefined }]);
}

// ── 7. Hallazgos de la revisión de F2a2 ─────────────────────────────────────────────────────
{
  // (a) Las dependencias que se rechazan se comprueban contra el estado ya normalizado: pasar a aislado y elegir el
  // generador y su costo en UN lote estricto es válido en cualquier orden (antes, el lote se leía sin derivar
  // `isZeroExport` y «Conexión a la red» seguía resolviéndose como conectada).
  const base = baseProject('tx-offgrid');
  const offGrid: ProjectFieldEdit[] = [
    { path: 'rates.gridConnection', value: 'off_grid' },
    { path: 'rates.supplyAlternative', value: 'generator' },
    { path: 'rates.generatorCostPerKWh', value: 0.35 },
  ];
  let expected: string | undefined;
  for (const order of permutations(offGrid)) {
    const result = applyProjectEdits(base, order, ctx);
    assert.ok(result.ok, `aislado + generador + costo en un lote: ${JSON.stringify(!result.ok && result.errors)}`);
    assert.equal(result.project.rates.gridConnection, 'off_grid');
    assert.equal(result.project.rates.isZeroExport, true);
    assert.equal(result.project.rates.supplyAlternative, 'generator');
    assert.equal(result.project.rates.generatorCostPerKWh, 0.35);
    expected ??= sectionsJson(result.project);
    assert.equal(sectionsJson(result.project), expected, 'en cualquier orden');
  }
  // Sin aislado, el generador sigue rechazándose; el mensaje dice qué hacer según lo que trae el lote.
  const missing = applyProjectEdits(base, [{ path: 'rates.supplyAlternative', value: 'generator' }], ctx);
  assert.ok(!missing.ok && /inclúyelo en el mismo lote/.test(missing.errors[0].message), JSON.stringify(!missing.ok && missing.errors));
  const contradicted = applyProjectEdits(base, [{ path: 'rates.supplyAlternative', value: 'generator' }, { path: 'rates.gridConnection', value: 'zero_export' }], ctx);
  assert.ok(!contradicted.ok && /el lote lo deja en/.test(contradicted.errors[0].message) && !/mismo lote/.test(contradicted.errors[0].message), JSON.stringify(!contradicted.ok && contradicted.errors));

  // (b) Añadir o quitar un grupo: el diff informa el elemento con la etiqueta de su lista, no con la ruta cruda.
  const panel0 = readEquipment(base.specs).panels[0];
  const added = ok(applyProjectEdits(base, [{ path: 'specs.panels', value: [panel0, { ...panel0, id: 'pan-2', count: 4 }] }], ctx));
  const addedGroup = added.changes.find((c) => c.path === 'specs.panels[1]');
  assert.equal(addedGroup?.label, 'Paneles (#2)', JSON.stringify(added.changes.map((c) => [c.path, c.label])));
  const removed = ok(applyProjectEdits(added.project, [{ path: 'specs.panels', value: [readEquipment(added.project.specs).panels[0]] }], ctx));
  assert.equal(removed.changes.find((c) => c.path === 'specs.panels[1]')?.label, 'Paneles (#2)');
  const extra = ok(applyProjectEdits(base, [{ path: 'financials.customItems', value: [{ id: 'it-9', description: 'Estructura', quantity: 1, unitPriceUSD: 50, exonerateITBIS: false }] }], ctx));
  for (const c of [...added.changes, ...removed.changes, ...extra.changes]) assert.notEqual(c.label, c.path, `${c.path} tiene etiqueta en español`);

  // (c) Borrar un dato opcional no activa su dependencia: vaciar las coordenadas no pasa a GPS; borrar el costo o la
  // profundidad de descarga de una batería no enciende «Incluir batería».
  const cleared = ok(applyProjectEdits(base, [{ path: 'client.coordinates', value: '' }], ctx));
  assert.equal(cleared.project.client.solarSourceMode, base.client.solarSourceMode, 'vaciar las coordenadas no cambia la fuente de radiación');
  assert.deepEqual(cleared.derivedEdits, []);
  const undefinedCoords = ok(applyProjectEdits(base, [{ path: 'client.coordinates', value: undefined }], ctx));
  assert.deepEqual(undefinedCoords.derivedEdits, []);
  const gps = ok(applyProjectEdits(base, [{ path: 'client.coordinates', value: '18.5, -69.9' }], ctx));
  assert.equal(gps.project.client.solarSourceMode, 'gps', 'unas coordenadas escritas sí activan GPS');
  const storedBattery = { ...base, specs: { ...base.specs, ...editEquipmentGroup(base.specs, 'battery', { type: 'add', item: battery }), hasBattery: false } };
  const offBattery = ok(applyProjectEdits(storedBattery, [{ path: 'specs.batteries[0].unitPriceUSD', value: undefined }, { path: 'specs.batteries[0].dodPct', value: undefined }], ctx));
  assert.equal(offBattery.project.specs.hasBattery, false, 'borrar un dato opcional de la batería no la incluye');
  assert.deepEqual(offBattery.derivedEdits, []);
  const priced = ok(applyProjectEdits(storedBattery, [{ path: 'specs.batteries[0].unitPriceUSD', value: 1800 }], ctx));
  assert.equal(priced.project.specs.hasBattery, true, 'darle precio a la batería sí la incluye');

  // (d) Un lote que no es una lista es un error que dice qué esperaba, no un lote vacío.
  for (const bad of [{}, null, 'specs.count', { path: 'rates.targetCoveragePct', value: 80 }]) {
    const result = applyProjectEdits(base, bad as never, ctx);
    assert.ok(!result.ok && /lista de \{path, value\}/.test(result.errors[0].message), `${JSON.stringify(bad)}: ${JSON.stringify(result)}`.slice(0, 200));
  }

  // (e) El diff no serializa la personalización entera cuando cambia el cliente (puede llevar logos en base64 y el dock
  // confirma por tecla): compara clave por clave y lo que no cambió se descarta por referencia.
  let serialized = 0;
  const heavy = { toJSON: () => { serialized++; return 'logo'; } };
  const withLogo = { ...base, customization: { ...(base.customization ?? {}), companyLogo: heavy } } as unknown as ProjectSimulation;
  const named = ok(applyProjectEdits(withLogo, [{ path: 'client.name', value: 'Cliente nuevo' }], ctx));
  assert.equal(serialized, 0, 'la personalización sin cambios no se serializa');
  assert.deepEqual(named.changes.map((c) => c.path), ['client.name']);
  const phoned = ok(applyProjectEdits(withLogo, [{ path: 'client.contactPhone', value: '809-555-0142' }], ctx));
  assert.equal(serialized, 0);
  assert.deepEqual(phoned.changes.map((c) => [c.path, c.derived]).sort(), [['client.contactPhone', false], ['customization.clientPhone', true]]);
}

console.log('PASS: transacción de edición: independiente del orden, validación todo o nada, motor igual a F0, deshacer con derivadas, idempotencia y dock por la transacción.');
