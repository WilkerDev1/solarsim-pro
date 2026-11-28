// F2b: las reglas del dock viven en el dominio. Para cada gesto de la batería (`support/dockGestures.ts`), el lote mínimo
// equivalente por ruta («cambia la distribuidora a X», «elige este panel del catálogo», «pon el margen en 30 %») da
// EXACTAMENTE el mismo proyecto que el gesto en el dock, con la validación estricta del asistente y de los agentes. Lo que no
// es un campo (añadir o quitar un grupo, el margen en %, «Sugerir de costos») es una intención del dominio
// (`projectIntentEdits`) que se traduce a ese lote.
import assert from 'node:assert/strict';
import { applyProjectEdits, type ProjectFieldEdit } from '../domain/projectEditTransaction';
import { projectIntentEdits, type ProjectIntent } from '../domain/editIntents';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { RD_PROVINCES } from '../data/rdProvinces';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import {
  DOCK_GESTURES, GESTURE_CATALOG, canonicalJson, genericFor, resetGestureStore, runDockGesture, sectionsOf,
} from './support/dockGestures';
import type { ProjectSimulation } from '../types';

const otherProvince = RD_PROVINCES.find((province) => province.name !== BENCHMARK_PROJECT.client.province && province.avgHSP !== RD_PROVINCES[0].avgHSP)!.name;
const NOW = 1767225600000;
type Batch = ProjectFieldEdit[] | { intent: ProjectIntent };
const path = (p: string, value: unknown): ProjectFieldEdit[] => [{ path: p, value }];
const intent = (value: ProjectIntent): Batch => ({ intent: value });

/** El lote mínimo de cada gesto: lo que diría el asistente o un agente. */
const BATCHES: Record<string, Batch> = {
  'distribuidora EDENORTE': path('rates.distributor', 'EDENORTE'),
  'distribuidora CEPM': path('rates.distributor', 'CEPM'),
  'distribuidora con precio a mano': path('rates.distributor', 'EDEESTE'),
  'distribuidora con perfil manual': path('rates.distributor', 'EDESUR'),
  'tarifa BTD': path('rates.tariffCode', 'BTD'),
  'tarifa BTS1': path('rates.tariffCode', 'BTS1'),
  'tarifa con perfil manual': path('rates.tariffCode', 'BTS2'),
  'tarifa oficial': path('rates.energyRateSource', 'reference'),
  'perfil residencial': path('specs.loadProfilePreset', 'residential'),
  'perfil comercial': path('specs.loadProfilePreset', 'commercial'),
  'perfil industrial': path('specs.loadProfilePreset', 'industrial'),
  'perfil manual': path('specs.loadProfilePreset', 'custom'),
  'consumo diurno 60': path('specs.daytimeLoadRatio', 60),
  provincia: path('client.province', otherProvince),
  'margen 30 %': intent({ kind: 'marginPct', pct: 30 }),
  'margen 27,35 %': intent({ kind: 'marginPct', pct: 27.35 }),
  'margen rápido 35 %': intent({ kind: 'marginPct', pct: 35, quick: true }),
  'margen negativo': intent({ kind: 'marginPct', pct: -5 }),
  'modo directo': path('specs.pricingMode', 'direct_watt'),
  'modo matriz': path('specs.pricingMode', 'cost_matrix'),
  '$/W 1,25': path('specs.pricePerWattUSD', 1.25),
  '$/kWp 1330': path('specs.pricePerKWpUSD', 1330),
  'sugerir de costos': intent({ kind: 'suggestDirectPrice' }),
  'mejor proveedor': path('specs.autoSupplierPricing', true),
  'mejor proveedor con batería': path('specs.autoSupplierPricing', true),
  'precio a mano panel': path('specs.panels[0].unitPriceUSD', 120),
  'precio a mano inversor': path('specs.inverters[0].unitPriceUSD', 2100),
  'catálogo: panel B': path('specs.panels[0].catalogItemId', 'p-b'),
  'catálogo: panel C (agotado)': path('specs.panels[0].catalogItemId', 'p-c'),
  'catálogo: inversor B (genérico)': path('specs.inverters[0].catalogItemId', 'i-b'),
  'catálogo: batería A': path('specs.batteries[0].catalogItemId', 'b-a'),
  'catálogo: batería B (genérico)': path('specs.batteries[0].catalogItemId', 'b-b'),
  'catálogo: panel secundario': path('specs.panels[1].catalogItemId', 'p-a'),
  'añadir panel': intent({ kind: 'addGroup', equipment: 'panel', now: NOW }),
  'añadir batería': intent({ kind: 'addGroup', equipment: 'battery', now: NOW }),
  'quitar grupo': intent({ kind: 'removeGroup', equipment: 'panel', index: 1 }),
  'cantidad de paneles': path('specs.panels[0].count', 40),
  'marca a mano': path('specs.panels[0].brandModel', 'Mi panel 600W'),
  'marca del catálogo a mano': path('specs.panels[0].brandModel', 'Panel B 700W'),
  'potencia a mano': path('specs.panels[0].powerW', 600),
  'incluir batería': path('specs.hasBattery', true),
};

assert.deepEqual(Object.keys(BATCHES).sort(), DOCK_GESTURES.map((g) => g.label).sort(), 'cada gesto del dock tiene su lote equivalente');

const context = () => ({ equipmentCatalog: GESTURE_CATALOG, tariffMatrix: store.getState().tariffMatrix, genericPriceFor: genericFor, calculationMode: 'legacy' as const });
const editsOf = (project: ProjectSimulation, batch: Batch): ProjectFieldEdit[] =>
  (Array.isArray(batch) ? batch : projectIntentEdits(project, batch.intent, context()));

let compared = 0;
for (const gesture of DOCK_GESTURES) {
  const viaDock = sectionsOf(runDockGesture(gesture));
  const base = gesture.base();
  const edits = editsOf(base, BATCHES[gesture.label]);
  const result = applyProjectEdits(base, edits, context(), { validation: 'strict' });
  assert.ok(result.ok, `${gesture.label}: el lote ${JSON.stringify(edits)} se rechazó: ${JSON.stringify(!result.ok && result.errors)}`);
  const viaPath = sectionsOf(result.project);
  for (const section of Object.keys(viaDock)) {
    assert.equal(canonicalJson(viaPath[section]), canonicalJson(viaDock[section]), `${gesture.label}: «${section}» por ruta = gesto del dock\nlote: ${JSON.stringify(edits)}`);
  }
  compared++;
}

// El mismo lote por el store (commitProjectEdits, fuente asistente): una escritura con el mismo resultado. Sin sesión no hay
// precio genérico, así que aquí van los gestos que no lo usan.
for (const label of ['distribuidora EDENORTE', 'tarifa BTD', 'perfil residencial', 'provincia', 'modo directo', 'mejor proveedor', 'catálogo: panel B', 'precio a mano panel']) {
  const gesture = DOCK_GESTURES.find((g) => g.label === label)!;
  const viaDock = canonicalJson(sectionsOf(runDockGesture(gesture)));
  const base = gesture.base();
  resetGestureStore(base);
  const committed = store.getState().commitProjectEdits(base.id, editsOf(base, BATCHES[label]), { source: 'assistant' });
  assert.ok(committed.ok, `${label}: ${JSON.stringify(!committed.ok && committed.errors)}`);
  assert.equal(canonicalJson(sectionsOf(store.getState().getActiveProject())), viaDock, `${label}: commitProjectEdits = gesto del dock`);
}

// Lo que el lote ya trae manda: una tarifa con su precio a mano no se reescribe con la de referencia.
{
  const base = gestureBase();
  const result = applyProjectEdits(base, [{ path: 'rates.tariffCode', value: 'BTS1' }, { path: 'rates.energyCostPerKWh', value: 0.3 }], context());
  assert.ok(result.ok);
  assert.equal(result.project.rates.energyCostPerKWh, 0.3);
  assert.equal(result.project.rates.billingTariff, undefined, 'la fila de la tarifa anterior se suelta');
  // Elegir el equipo del catálogo y otro campo del mismo grupo a la vez es ambiguo: se pide en dos lotes.
  const mixed = applyProjectEdits(base, [{ path: 'specs.panels[0].catalogItemId', value: 'p-b' }, { path: 'specs.panels[0].count', value: 20 }], context());
  assert.equal(mixed.ok, false);
  const unknown = applyProjectEdits(base, [{ path: 'specs.panels[0].catalogItemId', value: 'no-existe' }], context());
  assert.equal(unknown.ok, false, 'un equipo que no está en el catálogo se rechaza');
  const wrongKind = applyProjectEdits(base, [{ path: 'specs.panels[0].catalogItemId', value: 'i-a' }], context());
  assert.equal(wrongKind.ok, false, 'un inversor no se elige como panel');
}

console.log(`PASS: ${compared} gestos del dock ≡ su lote por ruta (validación estricta) y por commitProjectEdits: las reglas viven en el dominio.`);

function gestureBase(): ProjectSimulation {
  return DOCK_GESTURES[0].base();
}
