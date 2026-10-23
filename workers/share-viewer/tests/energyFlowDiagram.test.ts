import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { energyFlowScenarios, type EnergyFlowScenarioInput, type ModeScenario } from '../src/energyFlowScenarios';
import { BUILT_IN_APPLICATION_FEATURES, isBuiltInFeatureAvailable } from '../../../shared/applicationFeatures';

// --- Pure scenarios -------------------------------------------------------
// 6 kWp -> 4.5 kW at midday; 9,000 kWh/yr -> 1.03 kW average: day 1.23 kW, night 0.82 kW.
const base: EnergyFlowScenarioInput = { hybrid: false, isZeroExport: false, systemCapacityKWp: 6, annualConsumptionKWh: 9000, totalBESSKWh: 0 };
const hybridBase: EnergyFlowScenarioInput = { ...base, hybrid: true, totalBESSKWh: 10 };
const pick = (input: EnergyFlowScenarioInput, mode: string): ModeScenario => {
  const found = energyFlowScenarios(input).find((s) => s.mode === mode);
  assert.ok(found, `mode ${mode} exists`);
  return found;
};
const active = (s: ModeScenario) => Object.entries(s.lines).filter(([, l]) => l?.active).map(([k]) => k).sort();

assert.deepEqual(energyFlowScenarios(base).map((s) => s.mode), ['day', 'night', 'outage']);
assert.deepEqual(energyFlowScenarios(hybridBase).map((s) => s.mode), ['day', 'night', 'outageDay', 'outageNight']);

// On-grid, day: the house is served first and the surplus is exported.
const gDay = pick(base, 'day');
assert.equal(gDay.productionKW, 4.5);
assert.equal(gDay.houseKW, 1.2);
assert.equal(gDay.gridState, 'export');
assert.equal(gDay.gridKW, 3.3);
assert.equal(gDay.lines.grid.color, 'o');
assert.equal(gDay.lines.grid.reverse, false);
assert.equal(gDay.pill.text, 'En operación');
assert.equal(gDay.batteryState, undefined);

// Zero export: nothing leaves the property and production is trimmed to the load.
const zDay = pick({ ...base, isZeroExport: true }, 'day');
assert.equal(zDay.gridKW, 0);
assert.equal(zDay.gridState, 'idle');
assert.equal(zDay.lines.grid.active, false);
assert.equal(zDay.productionKW, zDay.houseKW);
assert.equal(zDay.pill.text, 'Inyección cero');
// ...and the grid still completes the house when production falls short.
const zShort = pick({ ...base, isZeroExport: true, systemCapacityKWp: 1, annualConsumptionKWh: 40000 }, 'day');
assert.equal(zShort.gridState, 'import');
assert.equal(zShort.lines.grid.color, 'b');
assert.equal(zShort.lines.grid.reverse, true);
assert.equal(zShort.productionKW, 0.8);
assert.ok(zShort.gridKW > 0 && zShort.houseKW > zShort.productionKW);

// On-grid, night: grid -> house only.
const gNight = pick(base, 'night');
assert.equal(gNight.night, true);
assert.equal(gNight.productionKW, 0);
assert.equal(gNight.houseKW, 0.8);
assert.equal(gNight.gridKW, 0.8);
assert.equal(gNight.gridState, 'import');
assert.equal(gNight.inverterState, 'standby');
assert.deepEqual(active(gNight), ['grid', 'house']);

// On-grid, outage: anti-islanding switches the inverter off, so nothing flows and the house is dark.
const gOut = pick(base, 'outage');
assert.deepEqual(active(gOut), []);
assert.equal(gOut.gridState, 'disconnected');
assert.equal(gOut.inverterState, 'off');
assert.equal(gOut.houseKW, 0);
assert.equal(gOut.productionKW, 0);
assert.ok(gOut.note && /normativa/i.test(gOut.note));
assert.equal(gOut.pill.text, 'Inversor apagado por seguridad');

// Hybrid, day: house first, then battery charge, then export of what the battery cannot take.
const hDay = pick(hybridBase, 'day');
assert.equal(hDay.batteryState, 'charging');
assert.equal(hDay.batteryKW, 3.3);
assert.equal(hDay.gridState, 'idle');
assert.equal(hDay.pill.text, 'Cargando batería');
assert.equal(hDay.lines.battery!.reverse, false);
// A 2 kWh bank limits power to 1 kW; the rest is exported (or trimmed under zero export).
const small = { ...hybridBase, totalBESSKWh: 2 };
const hSmall = pick(small, 'day');
assert.equal(hSmall.batteryKW, 1);
assert.equal(hSmall.gridKW, 2.3);
assert.equal(hSmall.gridState, 'export');
const hSmallZero = pick({ ...small, isZeroExport: true }, 'day');
assert.equal(hSmallZero.gridKW, 0);
assert.equal(hSmallZero.productionKW, 2.2);
assert.equal(pick({ ...hybridBase, totalBESSKWh: 0.5 }, 'day').batteryKW, 1, 'Power limit never drops below 1 kW');

// Hybrid, night: battery feeds the house through the inverter; the grid only completes the rest.
const hNight = pick(hybridBase, 'night');
assert.equal(hNight.batteryState, 'discharging');
assert.equal(hNight.batteryKW, 0.8);
assert.equal(hNight.gridState, 'idle');
assert.equal(hNight.lines.battery!.reverse, true);
assert.equal(hNight.lines.house.color, 'g');
const heavy = { ...small, annualConsumptionKWh: 40000 }; // night load 3.65 kW, battery limited to 1 kW
const hHeavy = pick(heavy, 'night');
assert.equal(hHeavy.batteryKW, 1);
assert.equal(hHeavy.gridKW, 2.7);
assert.equal(hHeavy.gridState, 'import');
assert.equal(hHeavy.houseKW, 3.7);

// Hybrid, outage: island mode. The grid never takes part and the load is capped by what the system can deliver.
const oDay = pick(hybridBase, 'outageDay');
assert.equal(oDay.gridState, 'disconnected');
assert.equal(oDay.lines.grid.active, false);
assert.equal(oDay.houseKW, 1.2);
assert.equal(oDay.batteryState, 'charging');
assert.equal(oDay.pill.text, 'Modo isla');
const oNight = pick(hybridBase, 'outageNight');
assert.equal(oNight.productionKW, 0);
assert.equal(oNight.houseKW, 0.8);
assert.equal(oNight.batteryState, 'discharging');
assert.equal(oNight.gridState, 'disconnected');
const oCapped = pick(heavy, 'outageNight');
assert.equal(oCapped.houseKW, 1, 'House load is capped to the battery power');
assert.equal(oCapped.gridKW, 0);

// Missing data: no consumption falls back to 40 % of production by day and 0.5 kW at night.
const noConsumption = { ...base, annualConsumptionKWh: 0 };
assert.equal(pick(noConsumption, 'day').houseKW, 1.8);
assert.equal(pick(noConsumption, 'night').houseKW, 0.5);
// Tiny consumption never goes below 0.3 kW.
assert.equal(pick({ ...base, annualConsumptionKWh: 100 }, 'night').houseKW, 0.3);
// Empty systems still produce complete, finite scenarios.
for (const input of [{ ...base, systemCapacityKWp: 0, annualConsumptionKWh: 0 }, { ...hybridBase, systemCapacityKWp: NaN, annualConsumptionKWh: NaN, totalBESSKWh: NaN }]) {
  for (const s of energyFlowScenarios(input)) {
    assert.ok([s.productionKW, s.houseKW, s.gridKW, s.batteryKW].every(Number.isFinite), `finite values in ${s.mode}`);
  }
}
// Line speed follows the relative flow.
assert.ok(['s1', 's2', 's3'].includes(hDay.lines.sun.speed));
assert.equal(hNight.lines.grid.active, false);

// --- Rendered page -----------------------------------------------------------
const month = (productionKWh: number, solarSelfConsumedKWh: number, gridExportedKWh?: number, batteryContributionKWh?: number) =>
  ({ month: 'Ene', productionKWh, solarSelfConsumedKWh, gridExportedKWh, batteryContributionKWh, consumptionKWh: 400 });

function proposal(overrides: { specs?: any; rates?: any; summary?: any } = {}): any {
  return {
    id: 'flow',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
    validityDays: 7,
    project: {
      id: 'p',
      client: { name: 'Cliente Flujo', projectId: 'SP-1', quoteNumber: 'C-1', province: 'Santiago' },
      specs: { panelCount: 10, panelPowerW: 600, hasBattery: false, ...overrides.specs },
      rates: { distributor: 'EDENORTE', tariffCode: 'BTS1', ...overrides.rates },
      financials: {},
    },
    summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 8900, energyCoveragePct: 99, grossInvestmentUSD: 10000, monthlyBreakdown: [], ...overrides.summary },
  };
}
const hybridSpecs = { hasBattery: true, batteries: [{ brandModel: 'LiFePO4', capacityKWh: 10, count: 1 }] };
const panelTag = (html: string, mode: string) => html.match(new RegExp(`<div[^>]*data-energy-mode-panel="${mode}"[^>]*>`))?.[0] ?? '';
const panelHtml = (html: string, mode: string) => {
  const start = html.indexOf(panelTag(html, mode));
  assert.ok(start >= 0, `panel ${mode} rendered`);
  const next = html.indexOf('data-energy-mode-panel="', start + 10);
  return html.slice(start, next > 0 ? next : html.indexOf('</section>', start));
};
const section = (html: string) => html.slice(html.indexOf('<section data-energy-flow='), html.indexOf('</section>', html.indexOf('<section data-energy-flow=')) + 10);

// The diagram is a registered, always-available built-in capability.
assert.ok(BUILT_IN_APPLICATION_FEATURES.some((f) => f.id === 'proposalEnergyFlowDiagram' && f.defaultEnabled));
assert.equal(isBuiltInFeatureAvailable('proposalEnergyFlowDiagram'), true);

const onGridHtml = renderProposalPage(proposal({ summary: { monthlyBreakdown: [month(8900, 4090, 4810)] } }));
const hybridHtml = renderProposalPage(proposal({ specs: hybridSpecs, summary: { monthlyBreakdown: [month(8900, 7920, 980, 3650)] } }));

// Exactly one diagram, placed between the quote details and the executive summary.
for (const html of [onGridHtml, hybridHtml]) assert.equal(html.match(/data-energy-flow="/g)?.length, 1, 'Only one diagram is rendered');
assert.ok(onGridHtml.includes('data-energy-flow="on-grid"') && hybridHtml.includes('data-energy-flow="hybrid"'));
const position = onGridHtml.indexOf('data-energy-flow="');
assert.ok(position > onGridHtml.indexOf('Detalles de la Cotización') && position < onGridHtml.indexOf('1. Resumen Ejecutivo'), 'Diagram sits above section 1');

// One button and one panel per mode; only the day panel is visible without JavaScript.
const modes = (html: string, expected: string[]) => {
  const s = section(html);
  assert.deepEqual([...s.matchAll(/data-energy-mode-button="(\w+)"/g)].map((m) => m[1]), expected);
  assert.deepEqual([...s.matchAll(/<div[^>]*data-energy-mode-panel="(\w+)"/g)].map((m) => m[1]), expected);
  assert.ok(s.includes('role="group"') && (s.match(/<button type="button"/g)?.length ?? 0) === expected.length);
  assert.equal(s.match(/aria-pressed="true"/g)?.length, 1);
  assert.ok(/data-energy-mode-button="day"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-energy-mode-button="day"/.test(s), 'Day starts pressed');
  assert.ok(!/\shidden[\s>]/.test(panelTag(html, 'day')), 'Day panel is visible by default');
  for (const mode of expected.slice(1)) assert.ok(/\shidden[\s>]/.test(panelTag(html, mode)), `${mode} panel starts hidden`);
};
modes(onGridHtml, ['day', 'night', 'outage']);
modes(hybridHtml, ['day', 'night', 'outageDay', 'outageNight']);
assert.ok(onGridHtml.includes('De noche') && onGridHtml.includes('Apagón') && !onGridHtml.includes('Apagón de día'));
assert.ok(hybridHtml.includes('Apagón de día') && hybridHtml.includes('Apagón de noche'));
assert.ok(hybridHtml.includes('Batería · cargando') && hybridHtml.includes('Batería · descargando'));
assert.ok(!onGridHtml.includes('Batería · '), 'On-grid systems have no battery node');

// Each panel explains itself; approximate kW values carry the ≈ prefix and no state of charge is invented.
assert.ok(panelHtml(onGridHtml, 'day').includes('el excedente se inyecta a la red'));
assert.ok(/≈\d+\.\d kW/.test(section(onGridHtml)) && /≈\d+\.\d kW/.test(section(hybridHtml)));
for (const html of [onGridHtml, hybridHtml]) assert.ok(!/\d\s?%/.test(section(html)), 'No percentages (state of charge) in the diagram');
assert.ok(panelHtml(onGridHtml, 'outage').includes('INVERSOR · APAGADO') && panelHtml(onGridHtml, 'outage').includes('Sin energía'));
assert.ok(/se desconecta cuando falla la red/.test(panelHtml(onGridHtml, 'outage')));
assert.ok(panelHtml(hybridHtml, 'outageNight').includes('Modo isla') && panelHtml(hybridHtml, 'outageNight').includes('Desconectada'));

// Zero export says so and draws no export in the day panel.
const zeroHtml = renderProposalPage(proposal({ rates: { isZeroExport: true }, summary: { monthlyBreakdown: [month(8900, 4090, 0)] } }));
assert.ok(panelHtml(zeroHtml, 'day').includes('Inyección cero') && !panelHtml(zeroHtml, 'day').includes('Excedente a la red'));

// Phones get a compact drawing without small labels plus a readable legend; larger screens get the labelled drawing.
for (const mode of ['day', 'night', 'outage']) {
  const p = panelHtml(onGridHtml, mode);
  assert.ok(p.includes('data-energy-flow-legend') && p.includes('data-energy-flow-svg="compact"') && p.includes('data-energy-flow-svg="full"'));
  const compact = p.slice(p.indexOf('data-energy-flow-svg="compact"'), p.indexOf('data-energy-flow-legend'));
  assert.ok(!compact.includes('<text'), 'Compact drawing has no text labels');
  assert.ok(p.slice(p.indexOf('data-energy-flow-svg="full"')).includes('<text'));
}
assert.ok(onGridHtml.includes('prefers-reduced-motion'), 'Animation respects reduced motion');
assert.ok(onGridHtml.includes('@media print') && /data-energy-mode-panel="day"\]/.test(onGridHtml.slice(onGridHtml.indexOf('<style>'), onGridHtml.indexOf('</style>'))), 'Print shows only the day mode');
assert.ok(/class="[^"]*no-print[^"]*"[^>]*role="group"|role="group"[^>]*class="[^"]*no-print/.test(section(onGridHtml)), 'Buttons are hidden when printing');
assert.ok(section(onGridHtml).includes('<script>'), 'A small script toggles the modes');

// Already published links (no summary, no monthly data) still render, and the gate removes the section when off.
const legacy = proposal({ summary: { monthlyBreakdown: undefined } });
legacy.summary = undefined;
assert.ok(renderProposalPage(legacy).includes('data-energy-flow="on-grid"'));
assert.ok(renderProposalPage(proposal({ specs: { panelCount: 0, panelPowerW: 0 }, summary: { systemCapacityKWp: 0, annualConsumptionKWh: 0 } })).includes('data-energy-flow="on-grid"'));

console.log('Energy flow diagram renders interactive, approximate, single and responsive modes.');
