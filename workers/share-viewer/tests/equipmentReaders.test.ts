import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { proposalMetadata } from '../src/proposalRepository';
import { parseSharePayload, RequestValidationError } from '../src/validation';
import { LEGACY_MIRROR_FIELDS, EQUIPMENT_FALLBACK_NAME } from '../../../shared/equipment';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';

/*
 * Oleada 3 (ADR 0001): el visor lee equipos solo con `shared/equipment`. Un enlace publicado antiguo (solo
 * espejo), uno nuevo (solo grupos) y uno con varios modelos muestran los mismos nombres, cantidades y potencias.
 */
const summary = { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 9500, energyCoveragePct: 100, grossInvestmentUSD: 10000, itbisSavedUSD: 900, ley5707CreditUSD: 2000, monthlyBreakdown: [] };
const stored = (specs: Record<string, unknown>, extraSummary: Record<string, unknown> = {}): any => ({
  id: 'equip-readers',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  validityDays: 7,
  project: {
    id: 'p',
    client: { name: 'Cliente Prueba', projectId: 'SP-1', quoteNumber: 'C-1', province: 'Santiago', distributor: 'EDENORTE' },
    specs,
    rates: { distributor: 'EDENORTE', tariffCode: 'BTS1' },
    financials: { applyITBISExemption: true, applyLey5707: true },
    customization: {},
  },
  summary: { ...summary, ...extraSummary },
});
const oldSpecs = (extra: Record<string, unknown> = {}) => ({
  panelBrandModel: 'Panel Alfa', panelPowerW: 600, panelCount: 10,
  inverterBrandModel: 'Inversor Beta', inverterPowerKW: 5, inverterCount: 1,
  batteryBrandModel: 'Batería Gamma', batteryCapacityKWh: 5, batteryCount: 2, hasBattery: true, ...extra,
});
const groupSpecs = (extra: Record<string, unknown> = {}) => ({
  panels: [{ id: 'p1', brandModel: 'Panel Alfa', powerW: 600, count: 10, unitPriceUSD: 100 }],
  inverters: [{ id: 'i1', brandModel: 'Inversor Beta', powerKW: 5, count: 1, unitPriceUSD: 1000 }],
  batteries: [{ id: 'b1', brandModel: 'Batería Gamma', capacityKWh: 5, count: 2, unitPriceUSD: 800 }],
  hasBattery: true, ...extra,
});
const html = (specs: Record<string, unknown>, extraSummary?: Record<string, unknown>) => renderProposalPage(stored(specs, extraSummary));

// 1. Enlace antiguo (solo espejo): caracterización del texto visible.
const old = html(oldSpecs());
assert.ok(old.includes('10 Módulos Panel Alfa (600W)'), 'frase de paneles');
assert.ok(old.includes('1 Inversor Inversor Beta (5 kW)') || old.includes('1 Inversor Beta (5 kW)'), 'frase de inversor');
assert.ok(old.includes('2 Baterías Gamma (5 kWh)'), 'frase de baterías');
assert.ok(old.includes('10.0 kWh'), 'capacidad total del banco en la tarjeta');
assert.ok(old.includes('Panel Alfa') && old.includes('Batería Gamma (5 kWh)'), 'tabla de equipos');

// 2. Enlace nuevo (solo grupos, sin espejo): mismo resultado visible.
const newer = html(groupSpecs());
assert.deepEqual(LEGACY_MIRROR_FIELDS.filter((key) => key in groupSpecs()), []);
assert.ok(newer.includes('10 Módulos Panel Alfa (600W)'), 'frase de paneles sin espejo');
assert.ok(newer.includes('1 Inversor Inversor Beta (5 kW)') || newer.includes('1 Inversor Beta (5 kW)'), 'frase de inversor sin espejo');
assert.ok(newer.includes('2 Baterías Gamma (5 kWh)'), 'frase de baterías sin espejo');
assert.ok(newer.includes('10.0 kWh') && newer.includes('Batería Gamma (5 kWh)'));
assert.ok(newer.includes('6.00 kWp'), 'kWp del resumen');
// Sin resumen de kWp (enlaces muy antiguos) la potencia sale de los grupos.
assert.ok(html(groupSpecs(), { systemCapacityKWp: 0 }).includes('6.00 kWp'), 'kWp derivado de los grupos');
assert.ok(html(oldSpecs(), { systemCapacityKWp: 0 }).includes('6.00 kWp'), 'kWp derivado del espejo antiguo');
assert.equal(proposalMetadata(stored(groupSpecs(), { systemCapacityKWp: undefined }), 'https://x.invalid').systemKWp, 6);
assert.equal(proposalMetadata(stored(oldSpecs(), { systemCapacityKWp: undefined }), 'https://x.invalid').systemKWp, 6);

// 3. Varios modelos: frases con el principal y «y N modelo(s) más»; la tabla lista todos.
const two = html(groupSpecs({ panels: [{ id: 'p1', brandModel: 'Panel Alfa', powerW: 600, count: 10 }, { id: 'p2', brandModel: 'Panel Delta', powerW: 500, count: 2 }] }));
assert.ok(two.includes('12 Módulos Panel Alfa (600W) y 1 modelo más'), 'dos modelos');
assert.ok(two.includes('Panel Delta'), 'la tabla lista el segundo modelo');
const three = html(groupSpecs({
  panels: [{ id: 'p1', brandModel: 'Panel Alfa', powerW: 600, count: 10 }, { id: 'p2', brandModel: 'Panel Delta', powerW: 500, count: 2 }, { id: 'p3', brandModel: 'Panel Épsilon', powerW: 400, count: 1 }],
  inverters: [{ id: 'i1', brandModel: 'Inversor Beta', powerKW: 5, count: 1 }, { id: 'i2', brandModel: 'Inversor Zeta', powerKW: 3, count: 1 }],
}));
assert.ok(three.includes('13 Módulos Panel Alfa (600W) y 2 modelos más'), 'tres modelos');
assert.ok(three.includes('Panel Épsilon') && three.includes('Inversor Zeta'), 'la tabla lista todos los modelos');
assert.ok(three.includes('2 Inversores Beta (5 kW) y 1 modelo más') || three.includes('2 Inversores Inversor Beta (5 kW) y 1 modelo más'), 'inversores');

// 4. Nombres de reserva unificados con el módulo; el inversor sin potencia conserva 0.9 × kWp.
const unnamed = html({ panels: [{ id: 'p', brandModel: '', powerW: 600, count: 10 }], inverters: [{ id: 'i', brandModel: '', powerKW: 0, count: 1 }], batteries: [{ id: 'b', brandModel: '', capacityKWh: 5, count: 1 }], hasBattery: true });
assert.ok(unnamed.includes(`10 Módulos ${EQUIPMENT_FALLBACK_NAME.panel.replace(/^M[oó]dulos\s+/i, '')} (600W)`), 'nombre de reserva de paneles');
assert.ok(unnamed.includes(EQUIPMENT_FALLBACK_NAME.inverter.replace(/^Inversor\s+/i, '')), 'nombre de reserva de inversor');
assert.ok(unnamed.includes(EQUIPMENT_FALLBACK_NAME.battery.replace(/^Banco de Bater[ií]as\s+/i, '')), 'nombre de reserva de batería');

// 5. Sin batería no se muestra el banco, haya o no grupos guardados.
const noBattery = html(groupSpecs({ hasBattery: false }));
assert.ok(!noBattery.includes('Batería Gamma'), 'sin batería activa no hay banco');

// 6. Validación: los grupos nuevos validan sus números; el espejo antiguo sigue aceptándose.
const payload = (specs: Record<string, unknown>) => ({ project: { ...structuredClone(BENCHMARK_PROJECT), specs }, summary: calculateProjectFinancialSummary(BENCHMARK_PROJECT, 'legacy'), validityDays: 7, calculationSnapshot: { mode: 'legacy', capturedAt: new Date().toISOString(), organizationId: 'o', policyVersion: 1 } });
assert.doesNotThrow(() => parseSharePayload(payload(groupSpecs())), 'grupos sin espejo');
assert.doesNotThrow(() => parseSharePayload(payload(oldSpecs())), 'espejo antiguo');
for (const bad of [{ count: -1 }, { powerW: 'x' }, { unitPriceUSD: Number.NaN }, { count: Infinity }]) {
  const specs: any = groupSpecs();
  specs.panels = [{ ...specs.panels[0], ...bad }];
  assert.throws(() => parseSharePayload(payload(specs)), RequestValidationError, `grupo inválido ${JSON.stringify(bad)}`);
}

console.log('Visor: enlaces antiguos (espejo), nuevos (grupos) y varios modelos muestran los mismos equipos.');
