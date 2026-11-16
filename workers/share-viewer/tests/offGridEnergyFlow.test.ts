import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { energyFlowScenarios, type EnergyFlowScenarioInput, type ModeScenario } from '../src/energyFlowScenarios';
import { parseSharePayload, RequestValidationError } from '../src/validation';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';

/*
 * Sistema aislado («modo isla» permanente): sin acometida, nunca importa ni exporta. El excedente se recorta y lo que no
 * cubren el sol ni la batería queda sin servir. Los enlaces anteriores (solo `isZeroExport`) se ven igual que siempre.
 */

// 6 kWp -> 4.5 kW al mediodía; 9,000 kWh/año -> carga diurna 1.23 kW y nocturna 0.82 kW.
const island: EnergyFlowScenarioInput = { hybrid: true, isZeroExport: true, gridConnection: 'off_grid', systemCapacityKWp: 6, annualConsumptionKWh: 9000, totalBESSKWh: 10 };
const islandNoBattery: EnergyFlowScenarioInput = { ...island, hybrid: false, totalBESSKWh: 0 };
const pick = (input: EnergyFlowScenarioInput, mode: string): ModeScenario => {
  const found = energyFlowScenarios(input).find((s) => s.mode === mode);
  assert.ok(found, `mode ${mode} exists`);
  return found;
};

// ── Escenarios ──────────────────────────────────────────────────────────────────────────────
assert.deepEqual(energyFlowScenarios(island).map((s) => s.mode), ['day', 'batteryFull', 'night', 'depleted']);
assert.deepEqual(energyFlowScenarios(islandNoBattery).map((s) => s.mode), ['day', 'night']);

const small = { ...island, totalBESSKWh: 2 }; // batería limitada a 1 kW: sobra producción
const heavy = { ...small, annualConsumptionKWh: 40000 }; // carga nocturna 3.65 kW frente a 1 kW de batería
for (const input of [island, small, heavy, islandNoBattery, { ...island, systemCapacityKWp: 1, annualConsumptionKWh: 30000 }]) {
  for (const sc of energyFlowScenarios(input)) {
    assert.equal(sc.gridState, 'none', `${sc.mode}: la red se muestra «sin conexión»`);
    assert.equal(sc.gridKW, 0, `${sc.mode}: nunca intercambia con la red`);
    assert.equal(sc.lines.grid.active, false);
    assert.ok(!/la red (completa|alimenta)|inyecta|apagón/i.test(sc.description), `${sc.mode}: ${sc.description}`);
    assert.ok(sc.productionKW <= 0.75 * input.systemCapacityKWp + 0.05);
    assert.ok([sc.productionKW, sc.houseKW, sc.gridKW, sc.batteryKW].every(Number.isFinite));
    if (/carga la batería/.test(sc.description)) assert.equal(sc.batteryState, 'charging', sc.description);
  }
}

// De día: la casa primero, luego la batería; lo que no cabe se recorta (no va a ninguna parte).
const day = pick(island, 'day');
assert.equal(day.batteryState, 'charging');
assert.equal(day.houseKW, 1.2);
assert.equal(day.batteryKW, 3.3);
assert.equal(day.pill.text, 'Cargando batería');
const smallDay = pick(small, 'day');
assert.equal(smallDay.productionKW, 2.2, 'producción recortada a casa + batería');
assert.ok(/recorta/.test(smallDay.description), smallDay.description);
// Batería llena: la producción baja a la carga de la casa.
const full = pick(island, 'batteryFull');
assert.equal(full.batteryState, 'full');
assert.equal(full.productionKW, full.houseKW);
assert.ok(/recorta/.test(full.description) && /batería está llena/.test(full.description), full.description);
// De noche: la batería alimenta la casa hasta su potencia; el resto queda sin servir.
const night = pick(island, 'night');
assert.equal(night.batteryState, 'discharging');
assert.equal(night.houseKW, 0.8);
assert.equal(night.pill.text, 'Batería descargando');
const heavyNight = pick(heavy, 'night');
assert.equal(heavyNight.houseKW, 1);
assert.ok(/limitada/.test(heavyNight.description), heavyNight.description);
// Batería agotada: sin red, la casa se queda sin energía.
const depleted = pick(island, 'depleted');
assert.equal(depleted.houseKW, 0);
assert.equal(depleted.batteryState, 'empty');
assert.equal(depleted.pill.text, 'Carga sin servir');
assert.equal(depleted.pill.tone, 'amber');
assert.ok(/respaldo/.test(depleted.note ?? '') && /sin energía/.test(depleted.description));

// Aislado sin baterías: solo funciona con sol y se advierte.
const nbDay = pick(islandNoBattery, 'day');
assert.equal(nbDay.batteryState, undefined);
assert.equal(nbDay.productionKW, nbDay.houseKW, 'sin batería ni red, la producción se ajusta a la carga');
assert.ok(/sin baterías/i.test(nbDay.note ?? '') && /off-grid/.test(nbDay.note ?? ''), nbDay.note);
const nbNight = pick(islandNoBattery, 'night');
assert.equal(nbNight.houseKW, 0);
assert.equal(nbNight.pill.text, 'Carga sin servir');
assert.deepEqual(Object.values(nbNight.lines).filter((l) => l?.active), []);

// Estado del inversor y píldoras salen de los flujos: sin producción ni descarga no hay inversor «encendido» ni
// batería «descargando».
const noPv = { ...island, systemCapacityKWp: 0 };
assert.equal(pick(noPv, 'day').batteryState, 'discharging', 'sin paneles la batería cubre el día');
assert.equal(pick(noPv, 'batteryFull').inverterState === 'on', pick(noPv, 'batteryFull').batteryState === 'discharging');
for (const input of [island, small, heavy, islandNoBattery, noPv, { ...island, inverterPowerKW: 0.5 }]) {
  for (const sc of energyFlowScenarios(input)) {
    const flowing = sc.productionKW > 0 || sc.batteryState === 'discharging';
    if (sc.inverterState === 'on') assert.ok(flowing, `${sc.mode}: inversor encendido sin flujo`);
    if (flowing) assert.equal(sc.inverterState, 'on', `${sc.mode}: inversor ${sc.inverterState} con flujo`);
    if (sc.pill.text === 'Batería descargando') assert.equal(sc.batteryState, 'discharging', sc.mode);
    if (sc.pill.text === 'Cargando batería') assert.equal(sc.batteryState, 'charging', sc.mode);
    // Balance (sin red): lo producido va a la casa o a la batería, y la demanda es casa + no servida.
    const unserved = sc.unservedKW ?? -1;
    assert.ok(unserved >= 0, `${sc.mode}: informa la carga no servida`);
    if (sc.batteryState === 'charging') assert.ok(Math.abs(sc.productionKW - (sc.houseKW + sc.batteryKW)) <= 0.11, `${sc.mode}: producción = casa + batería`);
    else {
      const fromBattery = sc.batteryState === 'discharging' ? sc.batteryKW : 0;
      assert.ok(Math.abs(sc.houseKW - (sc.productionKW + fromBattery)) <= 0.11, `${sc.mode}: casa = solar + batería`);
    }
    assert.ok(Math.abs((sc.demandKW ?? -1) - (sc.houseKW + unserved)) <= 0.11, `${sc.mode}: demanda = casa + no servida`);
  }
}
assert.ok((pick(heavy, 'night').unservedKW ?? 0) > 2, 'la noche pesada deja carga sin servir');
assert.equal(pick(island, 'depleted').unservedKW, pick(island, 'depleted').demandKW);

// Enlaces anteriores: sin `gridConnection` nada cambia.
assert.deepEqual(energyFlowScenarios({ ...island, gridConnection: undefined }).map((s) => s.mode), ['day', 'batteryFull', 'night', 'outageDay', 'outageNight']);

// ── Página publicada ────────────────────────────────────────────────────────────────────────
function proposal(rates: Record<string, unknown>, specs: Record<string, unknown> = {}, summary: Record<string, unknown> = {}): any {
  return {
    id: 'isla',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
    validityDays: 7,
    project: {
      id: 'p',
      client: { name: 'Cliente Isla', projectId: 'SP-2', quoteNumber: 'C-2', province: 'Santiago' },
      specs: { panelCount: 10, panelPowerW: 600, hasBattery: false, ...specs },
      rates: { distributor: 'EDENORTE', tariffCode: 'BTS1', ...rates },
      financials: {},
    },
    summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 8900, energyCoveragePct: 99, grossInvestmentUSD: 10000, monthlyBreakdown: [], ...summary },
  };
}
const battery = { hasBattery: true, batteries: [{ brandModel: 'LiFePO4', capacityKWh: 10, count: 1 }] };
const section = (html: string) => html.slice(html.indexOf('<section data-energy-flow='), html.indexOf('</section>', html.indexOf('<section data-energy-flow=')) + 10);

const hybridHtml = renderProposalPage(proposal({ gridConnection: 'off_grid', isZeroExport: true }, battery, { annualUnservedKWh: 1234.5 }));
const flow = section(hybridHtml);
assert.ok(flow.includes('data-energy-flow="off-grid-hybrid"'));
assert.ok(flow.includes('Sistema híbrido aislado') && flow.includes('modo isla'));
assert.deepEqual([...flow.matchAll(/data-energy-mode-button="(\w+)"/g)].map((m) => m[1]), ['day', 'batteryFull', 'night', 'depleted']);
assert.ok(flow.includes('Sin conexión a la red') && flow.includes('Aislado'), 'la red se rotula «sin conexión»');
assert.ok(!flow.includes('Desconectada') && !flow.includes('Excedente a la red') && !flow.includes('Apagón'));
assert.ok(flow.includes('Batería · agotada') && flow.includes('Carga sin servir'));
const fullAria = flow.match(/data-energy-flow-svg="full"[^>]*aria-label="([^"]*)"/)?.[1] ?? flow.match(/aria-label="([^"]*)"[^>]*data-energy-flow-svg="full"/)?.[1] ?? '';
assert.ok(/Sistema híbrido aislado/.test(fullAria) && /Sin conexión a la red Aislado/.test(fullAria), fullAria);
assert.ok(flow.includes('Situación 1 de 4'));
// Cada panel describe los estados nuevos en el nombre accesible del dibujo.
const panelAria = (mode: string) => flow.slice(flow.indexOf(`data-energy-mode-panel="${mode}"`)).match(/data-energy-flow-svg="full"[^>]*aria-label="([^"]*)"/)?.[1] ?? '';
assert.ok(/batería agotada/.test(panelAria('depleted')) && /Batería · agotada Agotada/.test(panelAria('depleted')) && /Sin conexión a la red Aislado/.test(panelAria('depleted')), panelAria('depleted'));
assert.ok(/Sin conexión a la red Aislado/.test(panelAria('night')) && /Batería · descargando/.test(panelAria('night')), panelAria('night'));
// Balance de energía: la energía no servida se informa como tal, nunca como importación.
assert.ok(/data-grid-connection="off_grid"[^>]*>[^<]*<strong>1,235 kWh\/año<\/strong>/.test(hybridHtml), 'nota de energía no servida');
// Documento: el marco regulatorio no promete medición neta ni inyección.
const regulatory = hybridHtml.slice(hybridHtml.indexOf('modo isla), sin acometida'), hybridHtml.indexOf('modo isla), sin acometida') + 1500);
assert.ok(regulatory.length > 0 && hybridHtml.includes('modo isla), sin acometida'), 'nota regulatoria de sistema aislado');
assert.ok(!/Medición Neta|derecho de uso de la red/.test(regulatory.split('</div>')[0]));

const noBatteryHtml = renderProposalPage(proposal({ gridConnection: 'off_grid', isZeroExport: true }));
assert.ok(section(noBatteryHtml).includes('data-energy-flow="off-grid"') && section(noBatteryHtml).includes('Sistema aislado'));
assert.ok(section(noBatteryHtml).includes('off-grid'), 'aviso del inversor sin red');
assert.ok(noBatteryHtml.includes('data-grid-connection="off_grid"') && /respaldo externo/.test(noBatteryHtml), 'sin dato de energía no servida (enlace sin snapshot nuevo) se explica igual');
// Un dato no numérico (null, '', false, texto) no se lee como «0 kWh no servidos».
const unservedNote = (html: string) => html.match(/data-grid-connection="off_grid">([^<]*)/)?.[1] ?? '';
for (const missing of [null, '', false, '0', Number.NaN, -5]) {
  const note = unservedNote(renderProposalPage(proposal({ gridConnection: 'off_grid', isZeroExport: true }, battery, { annualUnservedKWh: missing })));
  assert.ok(/respaldo externo/.test(note) && !/cubren el consumo estimado/.test(note), `${JSON.stringify(missing)}: ${note}`);
}
assert.ok(/cubren el consumo estimado/.test(unservedNote(renderProposalPage(proposal({ gridConnection: 'off_grid', isZeroExport: true }, battery, { annualUnservedKWh: 0 })))), 'un 0 real sí indica cobertura total');

// Compatibilidad: un enlace con solo `isZeroExport` o con `gridConnection` desfasado no se lee como aislado.
for (const rates of [{ isZeroExport: true }, { gridConnection: 'off_grid', isZeroExport: false }]) {
  const html = renderProposalPage(proposal(rates, battery));
  assert.ok(section(html).includes('data-energy-flow="hybrid"') && !html.includes('data-grid-connection="off_grid"'), JSON.stringify(rates));
}

// ── Validación de la publicación ────────────────────────────────────────────────────────────
const payload = (rates: Record<string, unknown>) => JSON.parse(JSON.stringify({ project: { ...structuredClone(BENCHMARK_PROJECT), rates: { ...BENCHMARK_PROJECT.rates, ...rates } }, summary: calculateProjectFinancialSummary(BENCHMARK_PROJECT, "legacy"), validityDays: 7, calculationSnapshot: { mode: "legacy", capturedAt: new Date().toISOString(), organizationId: "o", policyVersion: 1 } }));
assert.doesNotThrow(() => parseSharePayload(payload({ gridConnection: 'off_grid', isZeroExport: true })));
assert.doesNotThrow(() => parseSharePayload(payload({})), 'enlaces sin tipo de conexión');
assert.throws(() => parseSharePayload(payload({ gridConnection: 'isla' })), RequestValidationError);
assert.throws(() => parseSharePayload(payload({ gridConnection: 3 })), RequestValidationError);

console.log('Sistema aislado: escenarios propios, red «sin conexión», energía no servida y compatibilidad.');
