/**
 * Pruebas de caracterización de los valores por defecto del dock de parámetros.
 * Fijan el valor efectivo con dato vacío, `undefined` o `0`; no deben cambiar al mover los
 * literales a `params/logic/dockDefaults.ts` o a su fuente única.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import type { ProjectSimulation, SystemSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { DEFAULT_UNIT_PRICE_USD } from '../utils/equipmentGroups';
import { getProjectBatteries } from '../utils/equipmentSpecsUtils';
import * as dockDefaults from '../components/simulator/params/logic/dockDefaults';
import { computeLoadProfilePreview } from '../components/simulator/params/logic/loadProfilePreview';
import { buildCatalogSelectionUpdate } from '../components/simulator/params/logic/catalogSelection';
import { marginPctFromMultiplier, wholeMarginPctFromMultiplier } from '../components/simulator/params/logic/pricingSync';
import { displayPhone, displayQuoteNumber } from '../components/simulator/params/sections/client/clientLogic';
import { averageMonthlyConsumption, exportFeeValue, referenceRate } from '../components/simulator/params/sections/rates/ratesLogic';
import { displayedUnitPrice } from '../components/simulator/params/sections/pricing/supplierPricing';
import { RatesFields } from '../components/simulator/params/sections/rates/RatesFields';
import { ClientParamsSection } from '../components/simulator/sidebar/ClientParamsSection';
import { EquipmentGroupList } from '../components/simulator/params/sections/equipment/EquipmentGroupList';
import { EquipmentParamsSection } from '../components/simulator/sidebar/EquipmentParamsSection';
import { BatteryEquipmentSection } from '../components/simulator/sidebar/BatteryEquipmentSection';
import { PricingParamsSection } from '../components/simulator/sidebar/PricingParamsSection';
import { FinancialsParamsSection } from '../components/simulator/sidebar/FinancialsParamsSection';
import { DirectPrice } from '../components/simulator/params/sections/pricing/DirectPrice';
import { UnitCosts } from '../components/simulator/params/sections/pricing/UnitCosts';

const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const valueOf = (html: string, id: string): string | undefined => new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(html)?.[1];

const base = structuredClone(BENCHMARK_PROJECT);
const projectOf = (specs: Partial<SystemSpecs> = {}, extra: Partial<ProjectSimulation> = {}): ProjectSimulation =>
  ({ ...base, ...extra, specs: { ...base.specs, ...specs } });
const emptySummary = { batteryUsableKWh: 0, batteryBackupAutonomyHours: 0, systemCapacityKWp: 0 } as never;

// ── Cliente: marcadores de ejemplo y coordenadas ────────────────────────────────────────────
assert.equal(displayQuoteNumber({ quoteNumber: undefined }), 'C-0030');
assert.equal(displayQuoteNumber({ quoteNumber: '' }), 'C-0030');
assert.equal(displayQuoteNumber({ quoteNumber: 'C-7' }), 'C-7');
assert.equal(displayPhone({ contactPhone: '809-555-0199' }), '', 'el teléfono de muestra se oculta');
assert.equal(displayPhone({ contactPhone: '555-0199' }), '');
assert.equal(displayPhone({ contactPhone: '809-111-2222' }), '809-111-2222');
assert.equal(displayPhone({}), '');
// Los marcadores son los del caso de referencia.
assert.equal(displayQuoteNumber({ quoteNumber: '' }), base.client.quoteNumber);
assert.equal(displayPhone({ contactPhone: base.client.contactPhone }), '');
{
  const gps = (coordinates: string | undefined) => render(h(ClientParamsSection, {
    project: projectOf({}, { client: { ...base.client, solarSourceMode: 'gps', coordinates } }), projects: [], isIdUnlocked: false,
    setIsIdUnlocked: noop, isFetchingSolar: false, solarApiStatus: null, onFetchSolarApi: noop, updateClient: noop,
  } as never));
  for (const empty of [undefined, '']) {
    const html = gps(empty);
    assert.match(html, /value="18\.4861, -69\.9312"/);
    assert.match(html, /placeholder="18\.4861, -69\.9312"/);
  }
  assert.match(gps('19.1, -70.2'), /value="19\.1, -70\.2"/);
  assert.equal(base.client.coordinates, '18.4861, -69.9312', 'coincide con el caso de referencia');
}

// ── Tarifas: cobertura, cargo de exportación, consumo y tasa ───────────────────────────────
assert.equal(exportFeeValue({}), 25);
assert.equal(exportFeeValue({ gridExportFeePct: undefined }), 25);
assert.equal(exportFeeValue({ gridExportFeePct: 0 }), 0, '?? conserva el 0 explícito');
assert.equal(exportFeeValue({ gridExportFeePct: 12 }), 12);
assert.equal(exportFeeValue({ isZeroExport: true, gridExportFeePct: 25 }), 0);
assert.equal(averageMonthlyConsumption({ monthlyConsumption: [] }), 900);
assert.equal(averageMonthlyConsumption({ monthlyConsumption: undefined as never }), 900);
assert.equal(averageMonthlyConsumption({ monthlyConsumption: [100, 300] }), 200);
{
  const ref = getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS2', 900, 60);
  const ctx = (dopExchangeRate: number | undefined) => ({ matrix: null, avgMonthlyConsumption: 900, dopExchangeRate });
  assert.equal(referenceRate(ctx(undefined) as never, 'EDESUR', 'BTS2'), ref, 'sin tasa: 60');
  assert.equal(referenceRate(ctx(0) as never, 'EDESUR', 'BTS2'), ref, 'tasa 0: 60 (|| trata 0 como vacío)');
  assert.notEqual(referenceRate(ctx(50) as never, 'EDESUR', 'BTS2'), ref);
}
{
  const ratesHtml = (rates: object) => render(h(RatesFields, {
    project: projectOf({}, { rates: { ...base.rates, isZeroExport: false, gridExportFeePct: undefined, targetCoveragePct: undefined, ...rates } as never }),
    projectionEnabled: false, updateRates: noop, updateSpecs: noop,
  } as never));
  assert.equal(valueOf(ratesHtml({}), 'pd-rates-coverage'), '95');
  assert.equal(valueOf(ratesHtml({ targetCoveragePct: 0 }), 'pd-rates-coverage'), '0', '?? conserva el 0 de cobertura');
  assert.equal(valueOf(ratesHtml({}), 'pd-rates-export'), '25');
  assert.equal(valueOf(ratesHtml({ gridExportFeePct: 0 }), 'pd-rates-export'), '0');
  assert.match(ratesHtml({}), /retención del 25%/);
  assert.match(ratesHtml({ gridExportFeePct: 0 }), /retención del 0%/);
}

// ── Equipamiento: pérdidas y cobertura del texto de auto-calcular, marcas en modo Manual ───
{
  const section = (specs: object, rates: object = {}) => render(h(EquipmentParamsSection, {
    project: { specs: { panelCount: 10, panelPowerW: 500, autoCalculatePanels: true, isDetailed: false, ...specs }, rates } as never,
    summary: emptySummary, updateSpecs: noop,
  }));
  assert.match(section({}), /cubrir el 95% del consumo, con 25% de pérdidas/);
  assert.match(section({ systemLosses: 0 }, { targetCoveragePct: 0 }), /cubrir el 0% del consumo, con 0% de pérdidas/);
  assert.match(section({ systemLosses: 14 }, { targetCoveragePct: 90 }), /cubrir el 90% del consumo, con 14% de pérdidas/);
}
{
  const list = (kind: 'panel' | 'inverter' | 'battery', specs: object) => render(h(EquipmentGroupList, {
    kind, mode: 'manual', specs: { panelCount: 10, panelPowerW: 500, hasBattery: true, ...specs } as SystemSpecs,
    catalog: [], updateSpecs: noop, onOpenScanner: noop, enabled: true,
  } as never));
  assert.match(list('panel', {}), /value="Módulos Canadian Solar CS6\.1-72TB-600 \(600W\)"/);
  assert.match(list('inverter', { inverterCount: 1, inverterPowerKW: 5 }), /value="Inversor Lux Power LXP-LB-US 8K \(8\.0Kw\)"/);
  assert.match(list('battery', { batteryCount: 1, batteryCapacityKWh: 5 }), /value="Batería Hinaess 16 KwH-48 vdc\."/);
  assert.match(list('panel', { panelBrandModel: 'Mi panel' }), /value="Mi panel"/);
  assert.doesNotMatch(list('panel', { panelBrandModel: 'Mi panel' }), /Canadian Solar CS6\.1-72TB-600/);
}

// ── Batería: DOD y eficiencia (0 guardado = default) y selección de catálogo vacía ─────────
{
  const battery = (specs: object) => render(h(BatteryEquipmentSection, {
    project: projectOf({ hasBattery: true, ...specs }), summary: emptySummary, isDetailed: true, updateSpecs: noop,
  }));
  const defaults = battery({ batteryDOD: undefined, batteryEfficiencyPct: undefined, batteryReplacementCostUSD: undefined });
  assert.equal(valueOf(defaults, 'dock-battery-dod'), '90');
  assert.equal(valueOf(defaults, 'dock-battery-efficiency'), '90', 'la eficiencia por defecto es la del motor (90), no 95');
  assert.equal(valueOf(defaults, 'dock-battery-replacement'), '0');
  const zeros = battery({ batteryDOD: 0, batteryEfficiencyPct: 0, batteryReplacementCostUSD: 0 });
  assert.equal(valueOf(zeros, 'dock-battery-dod'), '90', 'un 0 guardado no es válido: se muestra el default, igual que el motor');
  assert.equal(valueOf(zeros, 'dock-battery-efficiency'), '90', 'un 0 guardado se muestra como 90 (antes 95)');
  const set = battery({ batteryDOD: 80, batteryEfficiencyPct: 92, batteryReplacementCostUSD: 3000 });
  assert.equal(valueOf(set, 'dock-battery-dod'), '80');
  assert.equal(valueOf(set, 'dock-battery-efficiency'), '92');
  assert.equal(valueOf(set, 'dock-battery-replacement'), '3000');
}
{
  const empty = (type: SolarEquipmentItem['type']) => ({ id: 'x', type, displayName: 'X', brand: 'B' }) as SolarEquipmentItem;
  const specs = { panelCount: 1, panelPowerW: 500 } as SystemSpecs;
  const bat = buildCatalogSelectionUpdate(specs, 'battery', empty('battery'));
  assert.equal(bat.batteryCapacityKWh, 16.08);
  assert.equal(bat.batteryDOD, 90);
  assert.equal(bat.batteryEfficiencyPct, 90);
  const group = getProjectBatteries({ ...specs, hasBattery: true, ...bat } as SystemSpecs)[0];
  assert.equal(group.capacityKWh, 16.08);
  assert.equal(group.dodPct, 90);
  const zero = buildCatalogSelectionUpdate(specs, 'battery', { ...empty('battery'), capacityKWh: 0, dodPct: 0, batteryEfficiencyPct: 0 });
  assert.deepEqual([zero.batteryCapacityKWh, zero.batteryDOD, zero.batteryEfficiencyPct], [16.08, 90, 90], 'ceros del catálogo: valores por defecto');
  const real = buildCatalogSelectionUpdate(specs, 'battery', { ...empty('battery'), capacityKWh: 10, dodPct: 80, batteryEfficiencyPct: 92 });
  assert.deepEqual([real.batteryCapacityKWh, real.batteryDOD, real.batteryEfficiencyPct], [10, 80, 92]);
  const panel = buildCatalogSelectionUpdate(specs, 'panel', empty('panel'));
  assert.deepEqual([panel.panelPowerW, panel.panelEfficiency, panel.tempCoeff, panel.annualDegradation], [550, 22, -0.29, 0.4]);
  assert.equal(buildCatalogSelectionUpdate(specs, 'inverter', empty('inverter')).inverterPowerKW, 8);
}

// ── Costos y margen ────────────────────────────────────────────────────────────────────────
assert.equal(marginPctFromMultiplier(undefined), 25);
assert.equal(marginPctFromMultiplier(0), 25, 'multiplicador 0: 1.25');
assert.equal(marginPctFromMultiplier(1.3), 30);
assert.equal(wholeMarginPctFromMultiplier(undefined), 25);
assert.equal(wholeMarginPctFromMultiplier(0), 25);
assert.deepEqual((['panel', 'inverter', 'battery'] as const).map((k) => displayedUnitPrice(undefined, undefined, k)), [103.32, 2300, 1990]);
assert.equal(displayedUnitPrice(0, undefined, 'panel'), 0, 'un precio propio de 0 se respeta');
assert.deepEqual(DEFAULT_UNIT_PRICE_USD, { panel: 103.32, inverter: 2300, battery: 1990 });
{
  const bare = { ...base.specs, panels: undefined, inverters: undefined, batteries: undefined, hasBattery: true, autoSupplierPricing: false,
    panelUnitPriceUSD: undefined, inverterUnitPriceUSD: undefined, batteryUnitPriceUSD: undefined, installationUnitPriceUSD: undefined } as SystemSpecs;
  const costs = (specs: SystemSpecs) => render(h(UnitCosts, { specs, equipmentCatalog: [], selected: {}, openSupplierPriceModal: noop, updateSpecs: noop }));
  const html = costs(bare);
  assert.deepEqual(
    [...html.matchAll(/<input[^>]*value="([^"]*)"/g)].map((m) => m[1]).filter((v) => ['103.32', '2300', '1990', '170'].includes(v)),
    ['103.32', '2300', '1990', '170'], 'costos unitarios por defecto sin precio propio',
  );
  assert.doesNotMatch(costs({ ...bare, installationUnitPriceUSD: 0 } as SystemSpecs), /value="170"/, 'mano de obra 0 se respeta');
}
{
  const pricing = (specs: object, summary: unknown = {}) => render(h(PricingParamsSection, {
    project: projectOf({ pricingMode: 'cost_matrix', ...specs }), summary: summary as never, updateSpecs: noop,
  }));
  const html = pricing({ saleMarginMultiplier: undefined, dopExchangeRate: undefined });
  assert.equal(valueOf(html, 'pd-dop-rate'), '60');
  assert.equal(valueOf(html, 'pd-margin'), '25');
  assert.match(html, /1\.25×/);
  for (const label of ['Costo /Wp', 'Ganancia /Wp', 'Venta /Wp', 'Venta /kWp']) {
    assert.match(html, new RegExp(`${label}[\\s\\S]*?—`), `${label} sin matriz: «—», no una cifra inventada (antes 0.86 / 1.08)`);
  }
  assert.equal(valueOf(pricing({ dopExchangeRate: 0 }), 'pd-dop-rate'), '60', 'una tasa 0 no es válida: la vista usa la misma regla que el cálculo (antes mostraba 0)');
  assert.equal(valueOf(pricing({ saleMarginMultiplier: 0 }), 'pd-margin'), '25');
  const withZeros = pricing({}, { costMatrix: { costPerWattUSD: 0, salePricePerWattUSD: 0 } });
  assert.match(withZeros, /Costo \/Wp[\s\S]*?\$0\.00/, 'costo/Wp real 0 se muestra como 0.00 (antes 0.86)');
  assert.match(withZeros, /Venta \/Wp[\s\S]*?\$0\.00/, 'venta/Wp real 0 se muestra como 0.00 (antes 1.08)');
}
{
  const direct = (specs: object, matrix?: object) => render(h(DirectPrice, {
    specs: { ...base.specs, pricingMode: 'direct_watt', ...specs } as SystemSpecs,
    summary: { systemCapacityKWp: 10, costMatrix: matrix } as never, updateSpecs: noop,
  }));
  const html = direct({ pricePerWattUSD: undefined, pricePerKWpUSD: undefined });
  assert.equal(valueOf(html, 'pd-price-w'), '1.13', 'default único con el motor (antes 1.15)');
  assert.equal(valueOf(html, 'pd-price-kwp'), '1130');
  assert.match(html, /1\.25× · \+0\.0%/);
  const zero = direct({ pricePerWattUSD: 0, pricePerKWpUSD: undefined });
  assert.equal(valueOf(zero, 'pd-price-w'), '1.13', '$/W 0 no es válido (el motor lo ignora): default en ambos campos (antes 0)');
  assert.equal(valueOf(zero, 'pd-price-kwp'), '1130', '$/kWp sale del mismo valor que $/W');
  assert.match(direct({}, { saleMarginMultiplier: 0, markupOnCostPct: 0, gananciaUSD: 0 }), /1\.25× · \+0\.0%/);
  assert.match(direct({}, { saleMarginMultiplier: 1.3, markupOnCostPct: 30, gananciaUSD: 100 }), /1\.30× · \+30\.0%/);
}
{
  // El multiplicador por defecto de los ítems extra es el mismo con vacío, 0 o 1.25 explícito.
  const items = [{ id: 'a', description: 'Extra', quantity: 2, unitPriceUSD: 100, exonerateITBIS: false }];
  const fin = (multiplier: number | undefined) => render(h(FinancialsParamsSection, {
    project: { ...projectOf({ saleMarginMultiplier: multiplier }), financials: { ...base.financials, customItems: items, customDiscounts: [] } },
    updateFinancials: noop,
  }));
  assert.equal(fin(undefined), fin(1.25));
  assert.equal(fin(0), fin(1.25));
  assert.notEqual(fin(1.5), fin(1.25));
}

// ── Vista previa de autoconsumo: DOD 90, eficiencia 90 y pérdidas 25 cuando son undefined ──
{
  const preview = (specs: Partial<SystemSpecs>) => computeLoadProfilePreview(projectOf({ hasBattery: true, batteryCapacityKWh: 16, batteryCount: 1, batteries: undefined, ...specs }), 'BTS2', 900);
  const unset = { batteryDOD: undefined, batteryEfficiencyPct: undefined, systemLosses: undefined } as Partial<SystemSpecs>;
  // El proyecto de referencia es detallado: sin pérdidas guardadas el motor (y ahora la vista previa) asume 14 %, no 25 %.
  assert.deepEqual(preview(unset), preview({ batteryDOD: 90, batteryEfficiencyPct: 90, systemLosses: 14 }), 'detallado sin pérdidas: 14 (antes 25)');
  assert.deepEqual(preview({ ...unset, isDetailed: false }), preview({ batteryDOD: 90, batteryEfficiencyPct: 90, systemLosses: 25, isDetailed: false }));
  assert.notDeepEqual(preview(unset), preview({ batteryDOD: 50, batteryEfficiencyPct: 90, systemLosses: 14 }));
  assert.notDeepEqual(preview(unset), preview({ batteryDOD: 90, batteryEfficiencyPct: 95, systemLosses: 14 }), 'la eficiencia de la vista previa es 90, no 95');
}

// ── Fuente única: las constantes coinciden con el caso de referencia y los literales viven solo en dockDefaults ──
{
  assert.equal(dockDefaults.SAMPLE_QUOTE_NUMBER, base.client.quoteNumber);
  assert(base.client.contactPhone?.includes(dockDefaults.SAMPLE_PHONE_MARKER));
  assert.equal(dockDefaults.SAMPLE_GPS_COORDINATES, base.client.coordinates);
  assert.equal(dockDefaults.DEFAULT_DOP_RATE, base.specs.dopExchangeRate);
  assert.equal(dockDefaults.DEFAULT_SALE_MARGIN_MULTIPLIER, base.specs.saleMarginMultiplier);
  assert.equal(dockDefaults.DEFAULT_INSTALLATION_USD_PER_KWP, base.specs.installationUnitPriceUSD);
  assert.equal(dockDefaults.DEFAULT_TARGET_COVERAGE_PCT, base.rates.targetCoveragePct);
  assert.equal(dockDefaults.DEFAULT_GRID_EXPORT_FEE_PCT, base.rates.gridExportFeePct);
  assert.equal(DEFAULT_UNIT_PRICE_USD.panel, base.specs.panelUnitPriceUSD);
  assert.equal(DEFAULT_UNIT_PRICE_USD.inverter, base.specs.inverterUnitPriceUSD);
  assert.equal(DEFAULT_UNIT_PRICE_USD.battery, base.specs.batteryUnitPriceUSD);

  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
  const roots = ['src/components/simulator/sidebar', 'src/components/simulator/params', 'src/components/simulator/SimulatorView.tsx'];
  const sources = roots.flatMap((r) => (statSync(r).isDirectory() ? files(r) : [r])).filter((f) => !f.endsWith('dockDefaults.ts'));
  const literals = ['C-0030', '555-0199', '18.4861', 'Canadian Solar CS6', 'Lux Power LXP', 'Hinaess', '16.08', '103.32'];
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const literal of literals) assert(!text.includes(literal), `${file} repite el literal «${literal}»: usa dockDefaults`);
  }
}

console.log('testParameterDockDefaults: ok');
