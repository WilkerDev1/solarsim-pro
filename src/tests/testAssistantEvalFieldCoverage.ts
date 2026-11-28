// F7a: cobertura de TODAS las rutas del registro de campos (`src/domain/projectFields.ts`) por `edit_proposal` del asistente de la
// app. «Todo lo que el simulador permite editar» es una promesa del dueño: por cada ruta que no es de solo lectura (controles,
// acciones, datos ocultos del documento) se ejecuta la herramienta REAL (`executeAssistantToolset`, con el store real y el perfil
// de edición en vivo) con `set` sobre esa ruta, y se exige que el valor quede escrito (aplicado al momento o, para un costo de
// equipo a mano, confirmado) o que la ruta tenga un MOTIVO declarado aquí (`DECLARED_EXCLUSIONS`) y que la herramienta la
// rechace con ese motivo. Una ruta nueva en el registro sin ninguna de las dos cosas hace fallar la prueba.
//
// No sustituye a `testProjectFieldRegistry` (que prueba el dominio: lectura, escritura y rango de cada ruta, sin la herramienta):
// aquí se prueba que la herramienta del asistente llega a cada una, con su esquema, sus permisos y sus reglas.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { PROJECT_FIELDS, concretePath, readProjectField, type ProjectFieldDefinition } from '../domain/projectFields';
import { DIRECT_PRICING_PATHS } from '../domain/proposalOperations';
import { applyProjectEdits } from '../domain/projectEditTransaction';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { assistantOwner } from '../features/assistant/tools';
import { executeAssistantToolset } from '../features/agentTools/appAssistant/toolset';
import type { ProjectSimulation } from '../types';
import { offerCatalog, resetEvalStore } from './support/assistantHarness';

const store = useSimulationStore;
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const ctx = { equipmentCatalog: catalog };
const battery = { id: 'bat-1', brandModel: 'Batería X', capacityKWh: 10, count: 1, unitPriceUSD: 2000, dodPct: 90, efficiencyPct: 95 };

/** Propuesta de ejemplo (caso de referencia con baterías, un extra y un descuento): que toda ruta del registro exista. */
function sampleProject(): ProjectSimulation {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = 'eval-fields';
  p.syncStatus = 'local_only';
  p.specs = { ...p.specs, hasBattery: true, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: battery }) };
  p.financials = {
    ...p.financials,
    customItems: [{ id: 'it-1', description: 'Estructura', quantity: 2, unit: 'UD', unitPriceUSD: 50, exonerateITBIS: true, applyMargin: true }],
    customDiscounts: [{ id: 'd-1', description: 'Cierre', type: 'fixed', value: 100, target: 'general' }],
  };
  return p;
}

/** Rutas cuyo valor válido no se deduce del tipo: el código de tarifa debe existir en la matriz y la fila de la tarifa tiene forma propia. */
const SAMPLES: Readonly<Record<string, (current: unknown) => unknown>> = {
  'rates.tariffCode': (current) => (current === 'BTS1' ? 'BTD' : 'BTS1'),
  'rates.billingTariff': () => ({ distributor: 'EDESUR', tariffCode: 'BTS1', energyBlocks: [{ fromKWh: 0, toKWh: null, rateDOP: 8.5 }], fixedChargeDOP: 100 }),
};

/** Un valor válido distinto del actual, deducido del tipo y del rango (o el `sample` de la definición). */
function validValue(def: ProjectFieldDefinition, current: unknown): unknown {
  if (SAMPLES[def.path]) return SAMPLES[def.path](current);
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

/** Una lista distinta de la actual: su primera fila con la cantidad (o el valor) un punto mayor. */
function changedCollection(path: string, current: unknown): unknown {
  const rows = structuredClone(current) as Array<Record<string, unknown>>;
  const key = path === 'financials.customItems' ? 'quantity' : path === 'financials.customDiscounts' ? 'value' : 'count';
  rows[0] = { ...rows[0], [key]: Number(rows[0][key] ?? 0) + 1 };
  return rows;
}

/**
 * Rutas que `edit_proposal` NO escribe, cada una con su motivo (y la prueba exige que la herramienta la rechace con él). El
 * precio directo $/W y el modo manual son del dock: el asistente cotiza siempre en modo Simple con la matriz de costos.
 */
const DIRECT_PRICING_REASON = /modo Simple \(Catálogo IA\)/;
const DECLARED_EXCLUSIONS: Readonly<Record<string, { reason: string; message: RegExp }>> = Object.fromEntries(
  [...DIRECT_PRICING_PATHS].map((path) => [path, { reason: 'Precio directo $/W y modo manual: son del dock (las propuestas del asistente cotizan con la matriz de costos, AUTOMATED_PRICING).', message: DIRECT_PRICING_REASON }]),
);

type Outcome = 'written' | 'confirmed' | 'excluded';
const outcomes = new Map<string, Outcome>();
const failures: string[] = [];
let seq = 0;

for (const def of PROJECT_FIELDS) {
  if (def.readOnly) continue;
  const concrete = concretePath(def.path);
  const project = sampleProject();
  // Sus dependencias, en el MISMO lote (como las fija el dock): las `activate` las pondría la transacción sola, las `reject` no.
  const requirements = (def.requires ?? []).map((requirement) => ({ path: requirement.path, value: requirement.value }));
  const required = applyProjectEdits(project, requirements, ctx);
  if (!required.ok) { failures.push(`${def.path}: sus dependencias no se pueden fijar (${JSON.stringify(required.errors)})`); continue; }
  const current = readProjectField(required.project, concrete);
  const isCollection = (def.type === 'list' || def.type === 'object') && !SAMPLES[def.path];
  const value = isCollection ? changedCollection(def.path, current) : validValue(def, current);
  // Toda escritura debe cambiar algo: escribir el mismo valor no detectaría que la herramienta ignora la ruta.
  if (JSON.stringify(value) === JSON.stringify(current)) { failures.push(`${def.path}: el valor de prueba es igual al actual`); continue; }

  resetEvalStore({ catalog: offerCatalog(), projects: [project], view: 'simulator' });
  store.setState({ activeProjectId: project.id });
  const ops = [...requirements.map((r) => ({ op: 'set', path: r.path, valueJson: JSON.stringify(r.value) })), { op: 'set', path: concrete, valueJson: JSON.stringify(value) }];
  // Una ruta repetida entre dependencia y campo (el campo es su propia dependencia): una sola operación.
  const unique = ops.filter((op, i) => ops.findIndex((other) => other.path === op.path) === i);
  const response = await executeAssistantToolset(
    { name: 'edit_proposal', args: { proposalId: project.id, title: `Eval ${def.path}`, ops: unique } },
    { source: 'app-assistant', owner: assistantOwner(), turnId: 'eval-fields', callId: `eval-field-${++seq}` },
  );
  const excluded = DECLARED_EXCLUSIONS[def.path];
  if (excluded) {
    if (response.status !== 'error' || !excluded.message.test(response.error?.message ?? '')) failures.push(`${def.path}: debía rechazarse con su motivo declarado y fue ${response.status}: ${response.error?.message}`);
    else if (JSON.stringify(readProjectField(store.getState().projects[0], concrete)) !== JSON.stringify(readProjectField(project, concrete))) failures.push(`${def.path}: excluida pero la propuesta cambió`);
    else outcomes.set(def.path, 'excluded');
    continue;
  }
  let status: Outcome = 'written';
  let result = response;
  if (response.status === 'pending_confirmation') {
    // Un costo de equipo escrito a mano se confirma en la app: es una escritura, con su confirmación humana.
    const confirmed = store.getState().confirmAgentAction(response.actionId!);
    if (!confirmed.success) { failures.push(`${def.path}: la confirmación falló: ${confirmed.error}`); continue; }
    status = 'confirmed';
    result = { ...response, status: 'applied' };
  }
  if (result.status !== 'applied') { failures.push(`${def.path}: ${response.status}${response.error ? ` (${response.error.message})` : ''}`); continue; }
  const written = readProjectField(store.getState().projects[0], concrete);
  if (JSON.stringify(written) !== JSON.stringify(value)) { failures.push(`${def.path}: se escribió ${JSON.stringify(written)} y se pedía ${JSON.stringify(value)}`); continue; }
  outcomes.set(def.path, status);
}

assert.deepEqual(failures, [], `rutas del registro que edit_proposal no escribe y no tienen motivo declarado:\n${failures.join('\n')}`);
const writable = PROJECT_FIELDS.filter((def) => !def.readOnly);
assert.equal(outcomes.size, writable.length, 'cada ruta escribible tiene resultado');
const count = (kind: Outcome) => [...outcomes.values()].filter((v) => v === kind).length;
for (const path of Object.keys(DECLARED_EXCLUSIONS)) assert.ok(PROJECT_FIELDS.some((def) => def.path === path), `exclusión declarada de una ruta que ya no existe: ${path}`);
assert.ok(count('written') + count('confirmed') >= 100, 'el registro tiene más de cien rutas escribibles');
assert.equal(count('excluded'), Object.keys(DECLARED_EXCLUSIONS).length, 'cada exclusión declarada se probó (y la herramienta la rechazó con su motivo)');
assert.ok(count('confirmed') > 0, 'al menos un costo de equipo a mano pasó por la confirmación');

console.log(`PASS: edit_proposal reaches every field of the registry (${writable.length} routes: ${count('written')} written, ${count('confirmed')} confirmed, ${count('excluded')} declared exclusions).`);
