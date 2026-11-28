// F2a2: registro de campos editables de una propuesta (`src/domain/projectFields.ts`). Recorre el registro: cada ruta se
// lee y se escribe en un proyecto de ejemplo y respeta su rango; cada control del dock tiene entrada (o motivo para no
// tenerla); y todo lo que escriben los constructores de parche del dock son rutas registradas y escribibles.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import {
  DOCK_NON_FIELD_ANCHORS, PROJECT_FIELDS, UNREGISTERED_SIMULATOR_CONTROLS, concretePath, findProjectField, readProjectField, type ProjectFieldDefinition,
} from '../domain/projectFields';
import { applyProjectEdits, editsFromPatch, type ProjectFieldEdit } from '../domain/projectEditTransaction';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { planApplyReference, planDistributorChange, planTariffChange, loadProfileChange, daytimeSliderChange } from '../components/simulator/params/sections/rates/ratesLogic';
import { gridConnectionFields } from '../../shared/gridConnection';
import { sie007UpgradePatch } from '../domain/netMeteringUpgrade';
import { bestSupplierPricingPatch, manualUnitPricePatch } from '../components/simulator/params/sections/pricing/supplierPricing';
import { kwpPricePatch, wattPricePatch, multiplierFromMarginInput } from '../components/simulator/params/logic/pricingSync';
import { buildCatalogSelectionUpdate } from '../components/simulator/params/logic/catalogSelection';
import { createGroupActions } from '../components/simulator/params/sections/equipment/equipmentGroupModel';
import { fixedChargeTierBasisOptions, settlementPriceOptions } from '../components/simulator/params/sections/rates/tariffPresentation';
import { newCustomDiscount, newCustomItem, itbisPatch, patchById } from '../components/simulator/params/sections/finance/quotationEdits';
import type { ProjectSimulation, SystemSpecs } from '../types';

const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const ctx = { equipmentCatalog: catalog };
const battery = { id: 'bat-1', brandModel: 'Batería X', capacityKWh: 10, count: 1, unitPriceUSD: 2000, dodPct: 90, efficiencyPct: 95 };

/** Propuesta de ejemplo: caso de referencia con baterías, ítems y descuentos, para que toda ruta exista. */
function sampleProject(): ProjectSimulation {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = 'registry-sample';
  p.specs = { ...p.specs, hasBattery: true, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: battery }) };
  p.financials = {
    ...p.financials,
    customItems: [{ id: 'it-1', description: 'Estructura', quantity: 2, unit: 'UD', unitPriceUSD: 50, exonerateITBIS: true, applyMargin: true }],
    customDiscounts: [{ id: 'd-1', description: 'Cierre', type: 'fixed', value: 100, target: 'general' }],
  };
  return p;
}

/**
 * Proyecto que cumple las dependencias que se rechazan (régimen, aislado…) de una definición. Todas en UN lote estricto
 * (revisión de F2a2): fijarlas de una en una ocultaba que la validación leía el lote sin normalizar la conexión.
 */
function projectFor(def: ProjectFieldDefinition): ProjectSimulation {
  const p = sampleProject();
  if (!def.requires?.length) return p;
  const result = applyProjectEdits(p, def.requires.map((requirement) => ({ path: requirement.path, value: requirement.value })), ctx);
  assert.ok(result.ok, `${def.path}: sus dependencias se pueden fijar en un solo lote: ${!result.ok && JSON.stringify(result.errors)}`);
  return result.project;
}

/** Un valor válido distinto del actual, deducido del tipo y del rango (o el `sample` de la definición). */
function validValue(def: ProjectFieldDefinition, current: unknown): unknown {
  if ('sample' in def) return def.sample;
  switch (def.type) {
    case 'boolean': return !current;
    case 'enum': return def.values!.find((value) => value !== current) ?? def.values![0];
    case 'string': return `Valor de prueba ${def.path}`.slice(0, def.maxLength ?? 200);
    case 'date': return '2026-02-03';
    case 'number': {
      const min = def.min ?? 0;
      const max = def.max ?? min + 1000;
      const mid = def.integer ? Math.round((min + max) / 2) : Math.round(((min + max) / 2) * 100) / 100;
      return mid === current ? (def.integer ? mid + 1 : mid + 0.01) : mid;
    }
    case 'numberList': return Array.from({ length: def.length ?? 12 }, (_, i) => Math.min(def.max ?? 1000, (def.min ?? 0) + 1 + i));
    default: throw new Error(`${def.path}: tipo ${def.type} sin valor de prueba; añade \`sample\``);
  }
}

// ── 1. Forma del registro ──────────────────────────────────────────────────────────────────
const paths = PROJECT_FIELDS.map((def) => def.path);
assert.equal(new Set(paths).size, paths.length, 'cada ruta aparece una vez');
for (const def of PROJECT_FIELDS) {
  assert.ok(def.label.trim().length > 2, `${def.path}: etiqueta en español`);
  assert.ok(/^(client|specs|rates|financials|monthlyConsumption|customization|aiSource)\b/.test(def.path), `${def.path}: ruta bajo una sección del proyecto`);
  assert.ok(['client', 'rates', 'equipment', 'costs', 'financials', 'energy', 'document'].includes(def.section), `${def.path}: sección conocida`);
  for (const requirement of def.requires ?? []) assert.ok(findProjectField(requirement.path), `${def.path}: depende de una ruta registrada (${requirement.path})`);
  if (def.origin === 'control') assert.ok(def.anchor || def.anchorNote, `${def.path}: un control del dock lleva su ancla o el motivo de no tenerla`);
  assert.equal(findProjectField(concretePath(def.path)), def, `${def.path}: la ruta concreta encuentra su definición`);
}
assert.ok(PROJECT_FIELDS.filter((def) => def.origin === 'control').length >= 50, 'el registro cubre los controles del simulador');
for (const entry of UNREGISTERED_SIMULATOR_CONTROLS) assert.ok(entry.control && entry.reason.length > 10, 'lo que queda fuera lleva su motivo');

// ── 2. Cada ruta se lee y se escribe, y respeta su rango ─────────────────────────────────────
for (const def of PROJECT_FIELDS) {
  const project = projectFor(def);
  const concrete = concretePath(def.path);
  const current = readProjectField(project, concrete);
  if (def.readOnly) {
    const result = applyProjectEdits(project, [{ path: concrete, value: current }], ctx);
    assert.equal(result.ok, false, `${def.path}: solo lectura por ruta`);
    continue;
  }
  if (def.type === 'list' || def.type === 'object') {
    // Listas y objetos: reescribir el valor actual se acepta y no cambia nada.
    const result = applyProjectEdits(project, [{ path: concrete, value: current }], ctx);
    assert.ok(result.ok, `${def.path}: reescribir su valor actual es válido (${JSON.stringify(!result.ok && result.errors)})`);
    continue;
  }
  const value = validValue(def, current);
  const result = applyProjectEdits(project, [{ path: concrete, value }], ctx);
  assert.ok(result.ok, `${def.path}: ${JSON.stringify(value)} es válido (${JSON.stringify(!result.ok && result.errors)})`);
  assert.deepEqual(readProjectField(result.project, concrete), value, `${def.path}: se lee lo que se escribió`);
  const rejects = (bad: unknown, why: string) => {
    const rejected = applyProjectEdits(project, [{ path: concrete, value: bad }], ctx);
    assert.equal(rejected.ok, false, `${def.path}: rechaza ${why}`);
    if (!rejected.ok) assert.ok(rejected.errors[0].message.includes(def.label), `${def.path}: el mensaje nombra el campo`);
  };
  if (def.type === 'number') {
    rejects('7', 'un texto');
    rejects(Number.NaN, 'un número no finito');
    if (def.min !== undefined) rejects(def.min - 1, 'un valor bajo el mínimo');
    if (def.max !== undefined) rejects(def.max + 1, 'un valor sobre el máximo');
    if (def.integer) rejects((def.min ?? 0) + 1.5, 'un no entero');
  }
  if (def.type === 'enum') rejects('valor-inventado', 'un valor fuera de la lista');
  if (def.type === 'boolean') rejects('sí', 'un texto');
  if (def.type === 'string' && def.maxLength) rejects('x'.repeat(def.maxLength + 1), 'un texto demasiado largo');
  if (def.type === 'numberList') rejects([1, 2, 3], 'una lista de otro largo');
  if (!def.optional && def.type !== 'string') rejects(undefined, 'quedar vacío');
}

// ── 3. Cada control del dock está en el registro (o tiene motivo para no estar) ──────────────
const root = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}
const dockSources = [...walk(path.join(root, 'src/components/simulator/sidebar')), ...walk(path.join(root, 'src/components/simulator/params/sections'))];
const found = new Set<string>();
for (const file of dockSources) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\b(?:id|htmlFor|labelId)=["']((?:pd|dock)-[a-z0-9-]+)["']/g)) found.add(match[1]);
  for (const match of source.matchAll(/\bid=\{`(pd-cost)-\$\{kind\}-\$\{idx\}`\}/g)) for (const kind of ['panel', 'inverter', 'battery']) found.add(`${match[1]}-${kind}-{i}`);
}
const anchors = new Map(PROJECT_FIELDS.filter((def) => def.anchor).map((def) => [def.anchor!, def.path]));
const missing = [...found].filter((anchor) => !anchors.has(anchor) && !(anchor in DOCK_NON_FIELD_ANCHORS));
assert.deepEqual(missing, [], `controles del dock sin entrada en el registro (añádelos o explica por qué no son un campo):\n${missing.join('\n')}`);
// Las secciones del dock (`dock-${key}`, ParameterDockPanel) son el ancla de los campos sin control propio con id.
const SECTION_ANCHORS = ['dock-client', 'dock-rates', 'dock-equipment', 'dock-costs', 'dock-financials'];
assert.ok(readFileSync(path.join(root, 'src/components/simulator/sidebar/ParameterDockPanel.tsx'), 'utf8').includes('id={`dock-${key}`}'), 'las secciones del dock siguen con id dock-<sección>');
const stale = [...anchors.keys()].filter((anchor) => !found.has(anchor) && !SECTION_ANCHORS.includes(anchor));
assert.deepEqual(stale, [], `anclas del registro que ya no existen en el dock:\n${stale.join('\n')}`);
for (const anchor of Object.keys(DOCK_NON_FIELD_ANCHORS)) assert.ok(found.has(anchor), `${anchor} ya no existe en el dock: quítalo de DOCK_NON_FIELD_ANCHORS`);

// ── 4. Todo lo que escriben los constructores de parche del dock es una ruta registrada y escribible ──
const p = sampleProject();
const rates = { matrix: undefined, avgMonthlyConsumption: 1000, dopExchangeRate: 60, rates: p.rates, loadProfilePreset: p.specs.loadProfilePreset, canWriteSpecs: true };
const specsPatches: Array<[string, Partial<SystemSpecs>]> = [
  ['perfil comercial', loadProfileChange('commercial')],
  ['perfil manual', loadProfileChange('custom')],
  ['consumo diurno', daytimeSliderChange(60)],
  ['perfil por distribuidora', planDistributorChange(rates, 'EDENORTE').specs!],
  ['mejor proveedor', bestSupplierPricingPatch(p.specs, { panel: catalog.find((e) => e.type === 'panel'), inverter: catalog.find((e) => e.type === 'inverter'), battery: catalog.find((e) => e.type === 'battery') })],
  ['precio a mano', manualUnitPricePatch(p.specs, 'panel', 0, 99)],
  ['$/W', { pricingMode: 'direct_watt', ...wattPricePatch(1.2) }],
  ['$/kWp', { pricingMode: 'direct_watt', ...kwpPricePatch(1200) }],
  ['margen', { saleMarginMultiplier: multiplierFromMarginInput(30) }],
  ['modelo de panel', buildCatalogSelectionUpdate(p.specs, 'panel', catalog.find((e) => e.type === 'panel')!)],
  ['modelo de batería', buildCatalogSelectionUpdate(p.specs, 'battery', catalog.find((e) => e.type === 'battery')!)],
];
const collected: Partial<SystemSpecs>[] = [];
for (const kind of ['panel', 'inverter', 'battery'] as const) {
  const actions = createGroupActions(kind, p.specs, catalog, (patch) => collected.push(patch));
  actions.add();
  actions.setCount(0, 4);
  actions.setBrand(0, 'Marca escrita a mano');
  actions.setMagnitude(0, 5);
  actions.select(0, catalog.find((e) => e.type === kind)!);
}
collected.forEach((patch, i) => specsPatches.push([`grupo de equipos ${i}`, patch]));
const ratesPatches = [
  ['distribuidora', planDistributorChange(rates, 'EDENORTE').rates],
  ['tarifa', planTariffChange(rates, 'BTD').rates],
  ['tarifa oficial', planApplyReference(rates)],
  ['aislado', gridConnectionFields('off_grid')],
  ['SIE-007', sie007UpgradePatch({ ...p.rates, netMeteringRegime: 'legacy_retention', gridUseChargeDOPPerKWh: undefined })],
  ...settlementPriceOptions(0).map((option) => ['liquidación', option.patch] as const),
  ...fixedChargeTierBasisOptions().map((option) => ['rango del cargo fijo', option.patch] as const),
] as const;
const item = newCustomItem();
const discount = newCustomDiscount();
const financialPatches = [
  ['ítem nuevo', { customItems: [item] }],
  ['ITBIS del ítem', { customItems: patchById([item], item.id, itbisPatch(false)) }],
  ['descuento nuevo', { customDiscounts: [discount] }],
] as const;
const all: Array<[string, ProjectFieldEdit[]]> = [
  ...specsPatches.map(([label, patch]) => [label, editsFromPatch('specs', patch)] as [string, ProjectFieldEdit[]]),
  ...ratesPatches.map(([label, patch]) => [label, editsFromPatch('rates', patch)] as [string, ProjectFieldEdit[]]),
  ...financialPatches.map(([label, patch]) => [label, editsFromPatch('financials', patch)] as [string, ProjectFieldEdit[]]),
];
for (const [label, edits] of all) {
  for (const edit of edits) {
    const def = findProjectField(edit.path);
    assert.ok(def && !def.readOnly, `${label}: ${edit.path} es una ruta registrada y escribible`);
  }
  const result = applyProjectEdits(p, edits, ctx, { validation: 'dock' });
  assert.ok(result.ok, `${label}: el dock puede escribir su parche por la transacción (${JSON.stringify(!result.ok && result.errors)})`);
}

console.log(`PASS: registro de campos (${PROJECT_FIELDS.length} rutas; ${PROJECT_FIELDS.filter((d) => d.origin === 'control').length} controles; ${UNREGISTERED_SIMULATOR_CONTROLS.length} controles fuera con motivo).`);
