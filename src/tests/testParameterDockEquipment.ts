import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SystemSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { editEquipmentGroup, normalizeEquipmentEdit, resolveGroupCatalogItem, selectCatalogEquipment, type EquipmentKind } from '../utils/equipmentGroups';
import { resolveAnnualDegradationPct } from '../engine/financeEngine';
import { catalogPanelGroupPatch } from '../utils/catalogGroupPatch';
import { buildCatalogSelectionUpdate } from '../components/simulator/params/logic/catalogSelection';
import {
  buildNewItem, createGroupActions, formatDcAcRatio, formatKW, groupViews,
} from '../components/simulator/params/sections/equipment/equipmentGroupModel';
import { EquipmentParamsSection } from '../components/simulator/sidebar/EquipmentParamsSection';
import { SearchableEquipmentSelect } from '../components/simulator/sidebar/SearchableEquipmentSelect';
import { AdvancedDisclosure } from '../components/simulator/params/sections/equipment/AdvancedDisclosure';
import { EquipmentGroupList } from '../components/simulator/params/sections/equipment/EquipmentGroupList';

const h = React.createElement;
const noop = () => {};

const catalogItem = (over: Partial<SolarEquipmentItem> & Pick<SolarEquipmentItem, 'id' | 'type' | 'displayName'>): SolarEquipmentItem =>
  ({ brand: 'Marca', ...over } as SolarEquipmentItem);
const catalog: SolarEquipmentItem[] = [
  catalogItem({ id: 'p1', type: 'panel', displayName: 'Panel A 550', powerW: 550, supplierPrices: [{ id: 's1', supplierName: 'Alfa', priceUSD: 90, updatedAt: '2026-01-01' }] as SolarEquipmentItem['supplierPrices'] }),
  catalogItem({ id: 'p2', type: 'panel', displayName: 'Panel B 600', powerW: 600 }),
  catalogItem({ id: 'i1', type: 'inverter', displayName: 'Inversor 8', powerKW: 8 }),
  catalogItem({ id: 'i2', type: 'inverter', displayName: 'Inversor 5', powerKW: 5 }),
  catalogItem({ id: 'b1', type: 'battery', displayName: 'Bat 10', capacityKWh: 10, dodPct: 80 }),
  catalogItem({ id: 'b2', type: 'battery', displayName: 'Bat 5', capacityKWh: 5 }),
];

/** updateSpecs como el store: aplica el parche con la normalización de equipos y registra cada llamada. */
function harness(initial: Partial<SystemSpecs>) {
  const state = { specs: { panelCount: 10, panelPowerW: 500, ...initial } as SystemSpecs, calls: [] as Array<Partial<SystemSpecs>> };
  const updateSpecs = (patch: Partial<SystemSpecs>) => {
    state.calls.push(patch);
    state.specs = normalizeEquipmentEdit(state.specs, patch);
  };
  const actions = <K extends EquipmentKind>(kind: K) => createGroupActions(kind, state.specs, catalog, updateSpecs);
  return { state, actions };
}

const multi = (): Partial<SystemSpecs> => ({
  hasBattery: true,
  panelBrandModel: 'Panel A 550', panelPowerW: 550, panelCount: 10,
  panels: [
    { id: 'pa', brandModel: 'Panel A 550', powerW: 550, count: 10 },
    { id: 'pb', brandModel: 'Panel B 600', powerW: 600, count: 4 },
  ],
  inverterBrandModel: 'Inversor 8', inverterPowerKW: 8, inverterCount: 1,
  inverters: [{ id: 'ia', brandModel: 'Inversor 8', powerKW: 8, count: 1 }],
  batteryBrandModel: 'Bat 10', batteryCapacityKWh: 10, batteryCount: 2,
  batteries: [{ id: 'ba', brandModel: 'Bat 10', capacityKWh: 10, count: 2 }],
});

// --- Agregar un modelo: siempre editEquipmentGroup, con los efectos de panel y batería ---
{
  const { state, actions } = harness(multi());
  const before = state.specs;
  actions('panel').add();
  assert.equal(state.calls.length, 1);
  const call = state.calls[0];
  assert.equal(call.panels?.length, 3);
  assert.equal(call.autoCalculatePanels, false, 'varios modelos desactivan el auto-cálculo');
  assert.deepEqual(call.panels, editEquipmentGroup(before, 'panel', { type: 'add', item: call.panels![2] }).panels, 'la lista sale de editEquipmentGroup');
  assert.equal(call.panels![2].catalogItemId, 'p2', 'toma el primer equipo del catálogo distinto del principal');
  assert.equal(call.panels![2].count, 10);

  actions('inverter').add();
  assert.equal(state.specs.inverters?.length, 2);
  assert.equal(state.specs.inverters?.[1].catalogItemId, 'i2');
  assert.equal(state.specs.inverters?.[1].count, 1);

  actions('battery').add();
  assert.equal(state.specs.batteries?.length, 2);
  assert.equal(state.specs.hasBattery, true);
  assert.equal(state.specs.batteries?.[1].capacityKWh, 5);

  const empty = buildNewItem('battery', { hasBattery: true, batteryBrandModel: 'x' } as SystemSpecs, [], 7);
  assert.deepEqual([empty.id, empty.brandModel, empty.capacityKWh, empty.unitPriceUSD], ['battery-7', 'Batería Dyness A48100 (5.12 kWh)', 5.12, 850], 'sin catálogo usa el modelo por defecto');
}

// --- Quitar un modelo: editEquipmentGroup; el último nunca se quita ---
{
  const { state, actions } = harness(multi());
  const before = state.specs;
  actions('panel').remove(1);
  assert.deepEqual(state.calls[0], editEquipmentGroup(before, 'panel', { type: 'remove', index: 1 }));
  assert.equal(state.specs.panels?.length, 1);
  actions('panel').remove(0);
  assert.equal(state.calls.length, 1, 'quitar el último modelo no escribe nada');
}

// --- Editar cantidad, nombre y potencia (modo Manual): siempre por editEquipmentGroup, lista y espejo juntos ---
for (const kind of ['panel', 'inverter', 'battery'] as const) {
  const { state, actions } = harness(multi());
  const before = state.specs;
  actions(kind).setCount(0, 7);
  assert.deepEqual(state.calls[0], editEquipmentGroup(before, kind, { type: 'update', index: 0, patch: { count: 7 } }), `${kind}: cantidad por editEquipmentGroup`);
  const list = state.specs[kind === 'panel' ? 'panels' : kind === 'inverter' ? 'inverters' : 'batteries']!;
  assert.equal(list[0].count, 7);
  const mirror = { panel: 'panelCount', inverter: 'inverterCount', battery: 'batteryCount' }[kind] as 'panelCount' | 'inverterCount' | 'batteryCount';
  assert.equal(state.specs[mirror], 7, `${kind}: el espejo sigue a la lista`);
  actions(kind).setBrand(0, 'Otro');
  assert.equal(list.length >= 1 && state.specs[`${kind}BrandModel` as 'panelBrandModel'], 'Otro');
  actions(kind).setMagnitude(0, 12.5);
  const magnitude = { panel: 'panelPowerW', inverter: 'inverterPowerKW', battery: 'batteryCapacityKWh' }[kind] as 'panelPowerW';
  assert.equal(state.specs[magnitude], 12.5);
}

// --- Regresión: cantidad de baterías en modo Manual ya no deja la lista vieja ---
{
  const { state, actions } = harness(multi());
  actions('battery').setCount(0, 9);
  assert.equal(state.specs.batteries?.[0].count, 9, 'batteries[0].count se actualiza');
  assert.equal(state.specs.batteryCount, 9);
  assert.ok(!('batteryCount' in state.calls[0]) || state.calls[0].batteries !== undefined, 'el parche lleva la lista, no solo el campo heredado');
  // Proyecto heredado sin lista: también migra por editEquipmentGroup
  const legacy = harness({ hasBattery: true, batteryBrandModel: 'Bat', batteryCapacityKWh: 5, batteryCount: 2 });
  legacy.actions('battery').setCount(0, 3);
  assert.equal(legacy.state.specs.batteryCount, 3);
  assert.equal(legacy.state.specs.batteries?.[0].count, 3);
  assert.deepEqual(legacy.state.calls[0].batteries?.map(b => b.count), [3]);
}

// --- Elegir del catálogo: el principal conserva la lógica de proveedor; los demás usan selectCatalogEquipment ---
{
  const { state, actions } = harness({ ...multi(), autoSupplierPricing: true });
  const before = state.specs;
  actions('panel').select(0, catalog[0]);
  assert.deepEqual(state.calls[0], buildCatalogSelectionUpdate(before, 'panel', catalog[0]), 'principal: buildCatalogSelectionUpdate');
  assert.equal(state.calls[0].selectedSupplierInfo?.panel?.supplierName, 'Alfa', 'conserva la info de proveedor');

  const second = harness(multi());
  const base = second.state.specs;
  second.actions('panel').select(1, catalog[0]);
  const expected = selectCatalogEquipment(base, 'panel', 1, catalog[0], { ...catalogPanelGroupPatch(catalog[0]), unitPriceUSD: catalog[0].supplierPrices?.[0]?.priceUSD || base.panels![1].unitPriceUSD });
  assert.deepEqual(second.state.calls[0].panels, expected.panels, 'secundario: selectCatalogEquipment');
  assert.equal(second.state.specs.panels?.[1].brandModel, 'Panel A 550');
  assert.equal(second.state.specs.panels?.[1].unitPriceUSD, 90);
  assert.equal(second.state.specs.panels?.[0].brandModel, 'Panel A 550', 'el principal no cambia');

  second.actions('inverter').select(0, catalog[3]);
  assert.equal(second.state.specs.inverterBrandModel, 'Inversor 5');
  assert.equal(second.state.specs.inverters?.[0].powerKW, 5);
}
// --- Vista del grupo y formatos ---
{
  const views = groupViews(multi() as SystemSpecs, 'panel');
  assert.deepEqual(views.map(v => [v.brandModel, v.magnitude, v.count]), [['Panel A 550', 550, 10], ['Panel B 600', 600, 4]]);
  const legacy = groupViews({ panelPowerW: 500, panelCount: 3 } as SystemSpecs, 'panel');
  assert.equal(legacy[0].brandModel, '', 'sin nombre heredado queda el marcador');
  assert.equal(legacy[0].count, 3);
  assert.deepEqual(groupViews({ hasBattery: false } as SystemSpecs, 'battery'), []);
  assert.equal(formatKW(8), '8.0');
  assert.equal(formatKW(7.68), '7.68');
  assert.equal(formatDcAcRatio(8.82, 8), '1.10');
  assert.equal(formatDcAcRatio(5, 0), '—');
}

// --- Marcado ---
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const listProps = (kind: EquipmentKind, mode: 'catalog' | 'manual', specs: Partial<SystemSpecs>) => ({
  kind, mode, specs: specs as SystemSpecs, catalog, updateSpecs: noop, onOpenScanner: noop,
});
{
  const panelsCatalog = render(h(EquipmentGroupList, { ...listProps('panel', 'catalog', multi()), autoCalculate: { checked: true, onChange: noop, info: 'Calculando para cubrir el 95%' } }));
  assert.match(panelsCatalog, /Paneles/);
  assert.match(panelsCatalog, /aria-label="Agregar modelo de panel"/, 'el «+» del subencabezado');
  assert.match(panelsCatalog, /role="switch"[^>]*aria-checked="true"[^>]*aria-label="Auto-calcular paneles"|aria-label="Auto-calcular paneles"[^>]*role="switch"|role="switch"[^>]*aria-label="Auto-calcular paneles"/);
  assert.match(panelsCatalog, /role="group"[^>]*aria-label="Cantidad de paneles"|aria-label="Cantidad de paneles"[^>]*role="group"/);
  assert.match(panelsCatalog, /aria-label="Calculando para cubrir el 95%"/, 'la explicación va en un InfoTip');
  assert.match(panelsCatalog, /aria-label="Eliminar panel #2"/, 'el modelo #2 lleva papelera');
  assert.ok(!/aria-label="Eliminar panel #1"/.test(panelsCatalog), 'el principal no se elimina');
  assert.match(panelsCatalog, /Modelo #2/);
  assert.match(panelsCatalog, /Panel A 550/);
  assert.match(panelsCatalog, /550 W/, 'potencia en mono dentro del selector');
  assert.ok(/<button[^>]*disabled=""[^>]*aria-label="Más"|aria-label="Más"[^>]*disabled=""/.test(panelsCatalog), 'auto-calcular deshabilita el contador del principal');

  const invertersCatalog = render(h(EquipmentGroupList, listProps('inverter', 'catalog', multi())));
  assert.match(invertersCatalog, /aria-label="Agregar modelo de inversor"/);
  assert.ok(!/role="switch"/.test(invertersCatalog), 'los inversores no tienen auto-calcular');
  assert.match(invertersCatalog, /aria-label="Cantidad de inversores"/);

  const panelsManual = render(h(EquipmentGroupList, listProps('panel', 'manual', multi())));
  assert.match(panelsManual, /Marca y modelo/);
  assert.match(panelsManual, /Potencia \(W\)/);
  assert.match(panelsManual, /value="Panel B 600"/);
  assert.match(panelsManual, /aria-label="Eliminar panel #2"/);

  const batteryOff = render(h(EquipmentGroupList, { ...listProps('battery', 'catalog', { hasBattery: false }), enabled: false }));
  assert.ok(!/Agregar modelo de batería/.test(batteryOff), 'sin batería no hay «+» ni lista');
  const batteryOn = render(h(EquipmentGroupList, listProps('battery', 'catalog', multi())));
  assert.match(batteryOn, /aria-label="Agregar modelo de batería"/);
  assert.match(batteryOn, /aria-label="Cantidad de baterías"/);
}

// --- Sección completa: modo, pérdidas, grupos, batería y franja DC / AC / DC-AC ---
{
  const project = { specs: { ...multi(), isDetailed: false, autoCalculatePanels: false, systemLosses: 25 }, rates: { targetCoveragePct: 95 } } as never;
  const summary = { batteryUsableKWh: 16, batteryBackupAutonomyHours: 5.5 } as never;
  const section = (p: unknown) => render(h(EquipmentParamsSection, { project: p as never, summary, updateSpecs: noop }));
  const catalogMarkup = section(project);
  assert.match(catalogMarkup, /role="radiogroup"[^>]*aria-label="Modo de equipamiento"/);
  assert.match(catalogMarkup, /Catálogo/);
  assert.match(catalogMarkup, /Pérdidas del sistema/);
  assert.match(catalogMarkup, /Paneles/);
  assert.match(catalogMarkup, /Inversores/);
  assert.match(catalogMarkup, /Baterías/);
  assert.match(catalogMarkup, /aria-label="Incluir batería"/);
  assert.match(catalogMarkup, /Energía útil/);
  assert.match(catalogMarkup, /Autonomía/);
  assert.match(catalogMarkup, /~5\.5 h/);
  assert.match(catalogMarkup, /DC\/AC/);
  assert.match(catalogMarkup, /7\.90 kWp/);
  assert.match(catalogMarkup, /8\.0 kW/);
  assert.match(catalogMarkup, /0\.99/, 'relación DC/AC');
  assert.match(catalogMarkup, /aria-expanded="false"[^>]*aria-controls="[^"]*"[^>]*>(?:<svg[^>]*>.*?<\/svg>)Avanzado/, 'Avanzado empieza plegado');
  assert.ok(!/Eficiencia del panel/.test(catalogMarkup), 'los parámetros del panel son solo del modo Manual');

  const manualMarkup = section({ ...(project as object), specs: { ...(project as { specs: object }).specs, isDetailed: true } });
  assert.match(manualMarkup, /Marca y modelo/);
  assert.match(manualMarkup, /Eficiencia del panel/);
  assert.match(manualMarkup, /Coef\. de temperatura/);
  assert.match(manualMarkup, /Degradación anual/);

  const noBattery = section({ ...(project as object), specs: { ...(project as { specs: object }).specs, hasBattery: false } });
  assert.ok(!/Energía útil/.test(noBattery), 'sin batería no hay energía útil ni autonomía');
  assert.ok(!/Agregar modelo de batería/.test(noBattery));
}

// --- Avanzado plegado: `hidden` no puede convivir con `flex` (Tailwind le gana a [hidden]) ---
{
  const closed = render(h(AdvancedDisclosure, null, h('p', null, 'cuerpo')));
  const body = closed.match(/<div[^>]*id="[^"]*"[^>]*>/)?.[0] ?? '';
  assert.match(body, /hidden=""/);
  assert.ok(!/\bflex\b/.test(body), 'plegado no lleva flex');
  const open = render(h(AdvancedDisclosure, { defaultOpen: true }, h('p', null, 'cuerpo')));
  const openBody = open.match(/<div[^>]*id="[^"]*"[^>]*>/)?.[0] ?? '';
  assert.ok(!/hidden=""/.test(openBody) && /\bflex\b/.test(openBody), 'abierto es flex y visible');
}

// --- Cantidades enteras: 1.5 o 0 nunca llegan a la lista ---
for (const kind of ['panel', 'inverter', 'battery'] as const) {
  const { state, actions } = harness(multi());
  actions(kind).setCount(0, 1.5);
  const list = state.specs[kind === 'panel' ? 'panels' : kind === 'inverter' ? 'inverters' : 'batteries']!;
  assert.equal(list[0].count, 1, `${kind}: 1.5 se guarda como entero`);
  actions(kind).setCount(0, 4.9);
  assert.equal((state.specs[kind === 'panel' ? 'panels' : kind === 'inverter' ? 'inverters' : 'batteries']!)[0].count, 4);
  actions(kind).setCount(0, 0);
  assert.equal((state.specs[kind === 'panel' ? 'panels' : kind === 'inverter' ? 'inverters' : 'batteries']!)[0].count, 1, 'mínimo 1');
}

// --- Menú abierto del selector: ocupa todo el ancho de la tarjeta, no el del disparador junto al contador ---
{
  const open = render(h(EquipmentGroupList, listProps('inverter', 'catalog', multi()))) ;
  assert.match(open, /aria-label="Cantidad de inversores"/);
  const markup = render(h(SearchableEquipmentSelect, {
    type: 'inverter', items: catalog, selectedValue: 'Inversor 8', selectedPower: 8, onSelect: noop, onOpenScanner: noop, label: 'Modelo', defaultOpen: true,
    trailing: h('span', { 'data-trailing': '' }, '+'),
  } as never));
  const trailingAt = markup.indexOf('data-trailing');
  const menuAt = markup.indexOf('role="listbox"');
  assert.ok(trailingAt > 0 && menuAt > trailingAt, 'el contador va junto al disparador y el menú después');
  assert.ok(/data-trailing[^>]*>\+<\/span><\/div><div class="mt-1\.5 w-full/.test(markup), 'el menú queda fuera de la fila del disparador');
}

// --- «+» en un panel copia también los campos propios del modelo (degradación), como la selección del catálogo ---
{
  const degradingCatalog: SolarEquipmentItem[] = [
    catalogItem({ id: 'dp1', type: 'panel', displayName: 'Panel Lento', powerW: 550, annualDegradation: 0.3, efficiencyPct: 21.5, tempCoeff: -0.29, weightKg: 28 }),
    catalogItem({ id: 'dp2', type: 'panel', displayName: 'Panel Rapido', powerW: 600, annualDegradation: 0.8, efficiencyPct: 20.1, tempCoeff: -0.35, weightKg: 31 }),
  ];
  const state = { specs: { panelCount: 10, panelPowerW: 550, panelBrandModel: 'Panel Lento', panels: [{ id: 'pa', catalogItemId: 'dp1', brandModel: 'Panel Lento', powerW: 550, count: 10, annualDegradation: 0.3 }] } as unknown as SystemSpecs };
  const updateSpecs = (patch: Partial<SystemSpecs>) => { state.specs = normalizeEquipmentEdit(state.specs, patch); };
  createGroupActions('panel', state.specs, degradingCatalog, updateSpecs).add();
  const added = state.specs.panels![1];
  assert.equal(added.catalogItemId, 'dp2');
  assert.equal(added.annualDegradation, 0.8, '«+» conserva la degradación del modelo agregado');
  assert.deepEqual(
    [added.efficiencyPct, added.tempCoeff, added.weightKilos],
    [20.1, -0.35, 31],
    'eficiencia, coeficiente térmico y peso también salen del catálogo'
  );
  assert.ok(Math.abs(resolveAnnualDegradationPct(state.specs) - (0.3 * 5500 + 0.8 * 6000) / 11500) < 1e-9, 'la proyección a 25 años pondera por potencia DC, no queda toda en 0.3');
}

// --- Editar a mano la marca/modelo de un grupo del catálogo rompe el vínculo con la ficha técnica ---
{
  const linkedCatalog: SolarEquipmentItem[] = [
    catalogItem({ id: 'k1', type: 'panel', displayName: 'Panel K 550', powerW: 550 }),
    catalogItem({ id: 'k2', type: 'panel', displayName: 'Panel K 600', powerW: 600 }),
    catalogItem({ id: 'ki', type: 'inverter', displayName: 'Inversor K 8', powerKW: 8 }),
  ];
  const run = (kind: EquipmentKind, group: Record<string, unknown>, name: string) => {
    const key = kind === 'panel' ? 'panels' : kind === 'inverter' ? 'inverters' : 'batteries';
    const state = { specs: { [key]: [group] } as unknown as SystemSpecs };
    createGroupActions(kind, state.specs, linkedCatalog, patch => { state.specs = normalizeEquipmentEdit(state.specs, patch); }).setBrand(0, name);
    return (state.specs[key] as Array<{ id: string; catalogItemId?: string; brandModel: string }>)[0];
  };
  const linked = { id: 'panel-k1', catalogItemId: 'k1', brandModel: 'Panel K 550', powerW: 550, count: 4 };

  const other = run('panel', linked, 'Panel K 600');
  assert.equal(other.catalogItemId, undefined, 'otro modelo: se olvida el catalogItemId anterior');
  assert.equal(resolveGroupCatalogItem(other, 'panel', linkedCatalog)?.id, 'k2', 'resuelve por el nombre nuevo, no por el id anterior');
  assert.equal(resolveGroupCatalogItem(run('panel', linked, 'Panel Propio X'), 'panel', linkedCatalog), null, 'un modelo a mano no adjunta ninguna ficha');

  const idIsCatalogId = run('panel', { ...linked, id: 'k1' }, 'Panel Propio X');
  assert.notEqual(idIsCatalogId.id, 'k1', 'si el id del grupo es un id del catálogo, también se renueva');
  assert.equal(resolveGroupCatalogItem(idIsCatalogId, 'panel', linkedCatalog), null);
  assert.equal(run('inverter', { id: 'ki', catalogItemId: 'ki', brandModel: 'Inversor K 8', powerKW: 8, count: 1 }, 'Inversor Z').catalogItemId, undefined, 'inversores igual');

  // Mayúsculas y espacios no cambian de modelo: se conserva el vínculo.
  for (const same of ['  Panel K 550 ', 'panel k 550', 'Panel  K   550']) {
    assert.equal(run('panel', linked, same).catalogItemId, 'k1', `«${same}» sigue siendo el mismo modelo`);
  }
  // Un cambio de un carácter puede ser otro modelo (550 → 560): el vínculo se rompe.
  assert.equal(run('panel', linked, 'Panel K 560').catalogItemId, undefined);
  // Un grupo escrito a mano (sin catálogo) no se toca.
  assert.equal(run('panel', { id: 'm', brandModel: 'Mio', powerW: 400, count: 2 }, 'Mio 2').id, 'm');
}

// --- Las secciones usan solo tokens pd-*, sin isDark ni colores sueltos, y la cantidad de batería no salta editEquipmentGroup ---
{
  const files = [
    'src/components/simulator/sidebar/EquipmentParamsSection.tsx',
    'src/components/simulator/sidebar/BatteryEquipmentSection.tsx',
    'src/components/simulator/sidebar/SearchableEquipmentSelect.tsx',
    'src/components/simulator/params/sections/equipment/EquipmentGroupList.tsx',
    'src/components/simulator/params/sections/equipment/equipmentGroupModel.ts',
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.ok(source.split('\n').length <= 1000, `${file} dentro del presupuesto`);
    assert.ok(!/\b(emerald|amber|cyan|purple|indigo|slate|zinc|rose)-\d/.test(source), `${file} sin colores sueltos de Tailwind`);
    assert.ok(!/isDark\s*(\?(?!:)|&&|\|\|)/.test(source), `${file} sin ramas isDark`);
    assert.ok(!/manualBatteryCountPatch|updateSpecs\(\{\s*(batteryCount|panelCount|inverterCount)/.test(source), `${file} no escribe cantidades por fuera de editEquipmentGroup`);
  }
}

console.log('testParameterDockEquipment: OK');
