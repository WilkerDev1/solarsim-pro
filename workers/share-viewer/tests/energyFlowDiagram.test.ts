import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { energyFlowScenarios, type EnergyFlowScenarioInput, type ModeScenario } from '../src/energyFlowScenarios';
import { ENERGY_FLOW_TOGGLE_SCRIPT } from '../src/energyFlow';
import vm from 'node:vm';
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
assert.deepEqual(energyFlowScenarios(hybridBase).map((s) => s.mode), ['day', 'batteryFull', 'night', 'outageDay', 'outageNight']);

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

// Hybrid, battery full: the surplus no longer charges the battery, so it covers the house and is exported.
const hFull = pick(hybridBase, 'batteryFull');
assert.equal(hFull.label, 'Batería llena');
assert.equal(hFull.batteryState, 'full');
assert.equal(hFull.batteryKW, 0);
assert.equal(hFull.lines.battery!.active, false);
assert.equal(hFull.houseKW, 1.2);
assert.equal(hFull.gridState, 'export');
assert.equal(hFull.gridKW, 3.3);
assert.ok(/batería está llena/.test(hFull.description) && /inyecta a la red/.test(hFull.description), hFull.description);
// A full battery takes no charge but can still cover a solar shortfall.
const tinyFull: EnergyFlowScenarioInput = { ...hybridBase, systemCapacityKWp: 1, annualConsumptionKWh: 30000 };
assert.equal(pick(tinyFull, 'batteryFull').houseKW, pick(tinyFull, 'day').houseKW);
assert.equal(pick(tinyFull, 'batteryFull').batteryState, 'discharging');
assert.equal(pick(tinyFull, 'batteryFull').gridState, 'idle');
const hFullZero = pick({ ...hybridBase, isZeroExport: true }, 'batteryFull');
assert.equal(hFullZero.gridState, 'idle');
assert.equal(hFullZero.productionKW, hFullZero.houseKW, 'Zero export trims production to the house load');
assert.ok(/inyección cero/.test(hFullZero.description), hFullZero.description);
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

// Hybrid, night: the battery feeds the house through the inverter; hybrid diagrams never draw energy from the grid.
const hNight = pick(hybridBase, 'night');
assert.equal(hNight.batteryState, 'discharging');
assert.equal(hNight.batteryKW, 0.8);
assert.equal(hNight.gridState, 'idle');
assert.equal(hNight.lines.battery!.reverse, true);
assert.equal(hNight.lines.house.color, 'g');
const heavy = { ...small, annualConsumptionKWh: 40000 }; // night load 3.65 kW, battery limited to 1 kW
const hHeavy = pick(heavy, 'night');
assert.equal(hHeavy.batteryKW, 1);
assert.equal(hHeavy.gridKW, 0);
assert.equal(hHeavy.gridState, 'idle');
assert.equal(hHeavy.houseKW, 1);
for (const input of [hybridBase, small, heavy, { ...hybridBase, systemCapacityKWp: 1, annualConsumptionKWh: 30000 }, { ...heavy, isZeroExport: true }]) {
  for (const sc of energyFlowScenarios(input)) assert.notEqual(sc.gridState, 'import', `${sc.mode} never imports in a hybrid diagram`);
}

// Hybrid, outage: island mode. The grid never takes part and the load is capped by what the system can deliver.
// Backup capability is not recorded in the proposal: island modes state it as a condition.
for (const mode of ['outageDay', 'outageNight'] as const) assert.ok(/respaldo/i.test(pick(hybridBase, mode).note ?? ''), `${mode} is conditional on backup output`);
// Copy is derived from the modeled flows, so undersized or panel-less systems never claim flows that do not exist.
const undersized: EnergyFlowScenarioInput = { ...base, systemCapacityKWp: 1, annualConsumptionKWh: 30000 };
const smallDay = pick(undersized, 'day');
assert.ok(smallDay.gridState === 'import' && !/inyecta/.test(smallDay.description) && /la red completa/.test(smallDay.description), smallDay.description);
const smallHybridDay = pick({ ...undersized, hybrid: true, totalBESSKWh: 10 }, 'day');
assert.ok(smallHybridDay.batteryState === 'discharging' && !/carga la batería|inyecta/.test(smallHybridDay.description) && /batería/.test(smallHybridDay.description), smallHybridDay.description);
const noPanels = pick({ ...hybridBase, systemCapacityKWp: 0 }, 'outageDay');
assert.ok(!/paneles/.test(noPanels.description) && /la batería alimenta la casa/.test(noPanels.description), noPanels.description);
for (const input of [base, hybridBase, { ...base, isZeroExport: true }, { ...hybridBase, isZeroExport: true }]) {
  for (const sc of energyFlowScenarios(input)) {
    if (/inyecta a la red/.test(sc.description) && !/no inyecta/.test(sc.description)) assert.equal(sc.gridState, 'export', `${sc.mode}: ${sc.description}`);
    if (/carga la batería|cargan la batería/.test(sc.description)) assert.equal(sc.batteryState, 'charging', `${sc.mode}: ${sc.description}`);
  }
}

// The inverter's AC rating caps what the system can deliver, also during an outage.
const bigBank: EnergyFlowScenarioInput = { ...hybridBase, totalBESSKWh: 40, annualConsumptionKWh: 87600, inverterPowerKW: 5 };
for (const mode of ['day', 'night', 'outageDay', 'outageNight']) {
  const sc = pick(bigBank, mode);
  assert.ok(sc.houseKW - (sc.gridState === 'import' ? sc.gridKW : 0) <= 5.05, `${mode} inverter output ${sc.houseKW} kW within 5 kW`);
}
assert.ok(/limitada/.test(pick(bigBank, 'outageDay').description) && /limitada/.test(pick(bigBank, 'outageNight').description));
// Unknown inverter rating keeps the previous behaviour.
assert.deepEqual(pick({ ...bigBank, inverterPowerKW: 0 }, 'outageNight').houseKW, pick({ ...bigBank, inverterPowerKW: undefined }, 'outageNight').houseKW);

// Outage copy follows the modeled battery direction: a small array cannot be "charging" the battery.
const weakSun = pick({ ...hybridBase, systemCapacityKWp: 1 }, 'outageDay');
assert.equal(weakSun.batteryState, 'discharging');
assert.ok(!/carga la batería/.test(weakSun.description) && /batería/.test(weakSun.description), weakSun.description);
assert.ok(/carga la batería/.test(pick(hybridBase, 'outageDay').description));
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
modes(hybridHtml, ['day', 'batteryFull', 'night', 'outageDay', 'outageNight']);
assert.ok(/Batería llena/.test(hybridHtml));
assert.ok(hybridHtml.includes('Batería · cargada') && !/Batería · en reposo[^<]*<\/span>\s*<span[^>]*>Llena/.test(hybridHtml), 'A full battery is labelled as charged, not idle');
// Desktop hides the text legend: the labelled SVG's accessible name carries each node's label and kW value.
const fullAria = hybridHtml.match(/data-energy-flow-svg="full"[^>]*aria-label="([^"]*)"/)?.[1] ?? hybridHtml.match(/aria-label="([^"]*)"[^>]*data-energy-flow-svg="full"/)?.[1] ?? '';
assert.ok(/Producción solar ≈[0-9.]+ kW/.test(fullAria) && /Consumo de la casa/.test(fullAria), fullAria);
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


// Mode navigation is discoverable: arrows, position dots, a counter and, on phones, a swipe hint.
const nav = section(hybridHtml);
assert.ok(/data-energy-mode-nav[^>]*hidden/.test(nav), 'Navigation stays hidden until the script runs');
assert.ok(/data-energy-mode-step="-1"[^>]*aria-label="Situación anterior"|aria-label="Situación anterior"[^>]*data-energy-mode-step="-1"/.test(nav));
assert.ok(/data-energy-mode-step="1"[^>]*aria-label="Situación siguiente"|aria-label="Situación siguiente"[^>]*data-energy-mode-step="1"/.test(nav));
assert.equal(nav.match(/data-energy-mode-dot=/g)?.length, 5);
assert.ok(nav.includes('Situación 1 de 5') && /sm:hidden[^>]*>[^<]*Deslice/.test(nav), 'Counter and phone swipe hint');
assert.ok(/data-energy-mode-swipe/.test(nav) && /\.ef-swipe\s*\{[^}]*touch-action:\s*pan-y/.test(hybridHtml), 'Swipe area keeps vertical scrolling');
assert.ok(/class="[^"]*no-print[^"]*"[^>]*data-energy-mode-nav|data-energy-mode-nav[^>]*class="[^"]*no-print/.test(nav), 'Navigation is hidden when printing');
assert.ok(/prefers-reduced-motion[^}]*ef-nudge/.test(hybridHtml) || /prefers-reduced-motion: reduce\) \{[^}]*\.ef-nudge/.test(hybridHtml));

// Behaviour of the real toggle script on a minimal DOM.
type Listener = (e: any) => void;
class El {
  attrs: Record<string, string>; hidden = false; disabled = false; textContent = ''; listeners: Record<string, Listener[]> = {};
  classes = new Set<string>();
  classList = { add: (c: string) => this.classes.add(c), remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)), contains: (c: string) => this.classes.has(c),
    toggle: (c: string, on?: boolean) => { const v = on ?? !this.classes.has(c); if (v) this.classes.add(c); else this.classes.delete(c); return v; } };
  constructor(attrs: Record<string, string> = {}) { this.attrs = attrs; }
  getAttribute(n: string) { return this.attrs[n] ?? null; }
  setAttribute(n: string, v: string) { this.attrs[n] = v; }
  removeAttribute(n: string) { delete this.attrs[n]; }
  addEventListener(t: string, fn: Listener) { (this.listeners[t] ??= []).push(fn); }
  fire(t: string, e: any = {}) { for (const fn of this.listeners[t] ?? []) fn({ currentTarget: this, ...e }); }
}
const modeIds = ['day', 'batteryFull', 'night', 'outageDay', 'outageNight'];
const btns = modeIds.map((m, i) => new El({ 'data-energy-mode-button': m, 'aria-pressed': String(i === 0) }));
const pnls = modeIds.map((m, i) => Object.assign(new El({ 'data-energy-mode-panel': m }), { hidden: i !== 0 }));
const dots = modeIds.map(() => new El({ 'data-energy-mode-dot': '' }));
const prev = new El({ 'data-energy-mode-step': '-1' }); const next = new El({ 'data-energy-mode-step': '1' });
const counter = new El(); const swipeArea = new El(); const navEl = new El({ hidden: '' }); navEl.hidden = true;
next.classes.add('ef-nudge');
const root = new El();
const lists: Record<string, El[]> = { '[data-energy-mode-button]': btns, '[data-energy-mode-panel]': pnls, '[data-energy-mode-dot]': dots };
const single: Record<string, El> = { '[data-energy-mode-step="-1"]': prev, '[data-energy-mode-step="1"]': next, '[data-energy-mode-counter]': counter, '[data-energy-mode-swipe]': swipeArea, '[data-energy-mode-nav]': navEl };
Object.assign(root, { querySelectorAll: (q: string) => lists[q] ?? [], querySelector: (q: string) => single[q] ?? null });
vm.runInNewContext(ENERGY_FLOW_TOGGLE_SCRIPT, { document: { querySelector: (q: string) => (q === '[data-energy-flow]' ? root : null) }, Math });
const shown = () => pnls.findIndex((p) => !p.hidden);
const swipeBy = (dx: number, dy = 0) => { swipeArea.fire('touchstart', { changedTouches: [{ clientX: 200, clientY: 300 }] }); swipeArea.fire('touchend', { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] }); };
assert.equal(navEl.hidden, false, 'Script reveals the navigation');
assert.equal(prev.disabled, true);
swipeBy(-80); assert.equal(shown(), 1, 'Right-to-left swipe shows the next situation');
assert.equal(btns[1].attrs['aria-pressed'], 'true'); assert.equal(btns[0].attrs['aria-pressed'], 'false');
assert.ok(dots[1].classes.has('ef-pos-on') && !dots[0].classes.has('ef-pos-on'));
assert.equal(counter.textContent, 'Situación 2 de 5');
assert.ok(!next.classes.has('ef-nudge'), 'The nudge stops after the first interaction');
assert.ok(pnls[1].classes.has('ef-from-right'));
swipeBy(80); assert.equal(shown(), 0, 'Left-to-right swipe goes back'); assert.ok(pnls[0].classes.has('ef-from-left'));
swipeBy(80); assert.equal(shown(), 0, 'No wrap before the first situation');
swipeBy(-20); assert.equal(shown(), 0, 'Short drags are ignored');
swipeBy(-60, 120); assert.equal(shown(), 0, 'Mostly vertical gestures keep scrolling the page');
next.fire('click'); next.fire('click'); assert.equal(shown(), 2, 'Next arrow advances');
prev.fire('click'); assert.equal(shown(), 1, 'Previous arrow goes back');
btns[4].fire('click'); assert.equal(shown(), 4); assert.equal(next.disabled, true);
swipeBy(-80); assert.equal(shown(), 4, 'No wrap after the last situation');

// Already published links (no summary, no monthly data) still render, and the gate removes the section when off.
const legacy = proposal({ summary: { monthlyBreakdown: undefined } });
legacy.summary = undefined;
assert.ok(renderProposalPage(legacy).includes('data-energy-flow="on-grid"'));
assert.ok(renderProposalPage(proposal({ specs: { panelCount: 0, panelPowerW: 0 }, summary: { systemCapacityKWp: 0, annualConsumptionKWh: 0 } })).includes('data-energy-flow="on-grid"'));

console.log('Energy flow diagram renders interactive, approximate, single and responsive modes.');
