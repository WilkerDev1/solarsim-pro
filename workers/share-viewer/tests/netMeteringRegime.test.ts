import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';
import { parseSharePayload, RequestValidationError } from '../src/validation';
import { renderProposalPage } from '../src/template';
import { FACTORY_GRID_USE_CHARGES, publishedNetMeteringRates } from '../../../shared/netMetering';

/**
 * Régimen de medición neta en el visor (fase 2): campo opcional en `rates` y en el `calculationSnapshot`.
 * Los enlaces antiguos (sin el campo) se aceptan y se ven igual; un valor desconocido se rechaza (400).
 */
const project = (rates: Record<string, unknown> = {}) => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.rates = { ...p.rates, distributor: 'EDESUR', tariffCode: 'BTS1', ...rates } as typeof p.rates;
  return p;
};
const payload = (rates: Record<string, unknown> = {}, snapshot: Record<string, unknown> = {}) => {
  const p = project(rates);
  return JSON.parse(JSON.stringify({ project: p, summary: calculateProjectFinancialSummary(p, 'legacy'), validityDays: 7, calculationSnapshot: { mode: 'legacy', capturedAt: new Date().toISOString(), organizationId: 'o', policyVersion: 1, ...snapshot } }));
};

// 1. Sin el campo (enlace o cliente anterior): válido.
assert.doesNotThrow(() => parseSharePayload(payload()), 'sin régimen');
// 2. Con el régimen y el cargo: válido, y el resumen trae el cargo mensual.
const sie = payload({ netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 }, { netMeteringRegime: 'sie007_2026' });
assert.doesNotThrow(() => parseSharePayload(sie));
assert.ok(sie.summary.monthlyBreakdown.every((m: any) => typeof m.gridUseChargeUSD === 'number'));
assert.doesNotThrow(() => parseSharePayload(payload({ netMeteringRegime: 'legacy_retention' }, { netMeteringRegime: 'legacy_retention' })));
// 3. Valores desconocidos o no válidos: 400.
for (const [rates, snapshot] of [
  [{ netMeteringRegime: 'sie007' }, {}],
  [{ netMeteringRegime: 7 }, {}],
  [{}, { netMeteringRegime: 'nuevo' }],
  [{ netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: -1 }, {}],
  [{ netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: '3.78' }, {}],
  [{ netMeteringRegime: 'sie007_2026' }, { netMeteringRegime: 'legacy_retention' }],
] as const) {
  assert.throws(() => parseSharePayload(payload(rates, snapshot)), RequestValidationError, JSON.stringify({ rates, snapshot }));
}
const negativeCharge = payload({ netMeteringRegime: 'sie007_2026' });
negativeCharge.summary.monthlyBreakdown[0].gridUseChargeUSD = -5;
assert.throws(() => parseSharePayload(negativeCharge), RequestValidationError, 'cargo mensual negativo');

// 4. Render: un enlace SIE-007 sin la nota publicada describe el cargo por kWh; uno antiguo conserva su texto.
const stored = (rates: Record<string, unknown>, snapshot?: Record<string, unknown>): any => ({
  id: 'regime', createdAt: '2026-11-16T12:00:00.000Z', expiresAt: new Date(Date.now() + 86400000).toISOString(), validityDays: 7,
  project: {
    id: 'p', client: { name: 'Cliente', projectId: 'SP-1', quoteNumber: 'C-1', province: 'Santiago' },
    specs: { panelCount: 10, panelPowerW: 600, panelBrandModel: 'Panel', inverterCount: 1, inverterBrandModel: 'Inversor', hasBattery: false },
    rates, financials: { applyITBISExemption: true, applyLey5707: true }, customization: {},
  },
  summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 9500, energyCoveragePct: 100, grossInvestmentUSD: 10000, itbisSavedUSD: 900, ley5707CreditUSD: 2000, year1SavingsUSD: 1234.56, monthlyBreakdown: [] },
  ...(snapshot ? { calculationSnapshot: snapshot } : {}),
});
const sieHtml = renderProposalPage(stored({ distributor: 'EDENORTE', tariffCode: 'BTS1', gridExportFeePct: 25, netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 4.02 }, { mode: 'legacy', capturedAt: '2026-11-16T12:00:00.000Z', organizationId: 'o', policyVersion: 1, netMeteringRegime: 'sie007_2026' }));
assert.ok(sieHtml.includes('RD$4.02 por kWh inyectado'), 'nota SIE-007 con el valor');
assert.ok(!sieHtml.includes('equivalente al 25% del valor de la energía excedente exportada'));
const oldHtml = renderProposalPage(stored({ distributor: 'EDENORTE', tariffCode: 'BTS1', gridExportFeePct: 25 }));
assert.ok(oldHtml.includes('equivalente al 25% del valor de la energía excedente exportada'), 'enlace antiguo: texto anterior');
assert.ok(!oldHtml.includes('por kWh inyectado'));

// 5. (G) Proyección de autoconsumo + SIE-007: la frase del cargo solo cuando aplica (BTS-1 sí; BTD e inyección cero no).
const snapshotSC = { mode: 'self_consumption', capturedAt: '2026-11-16T12:00:00.000Z', organizationId: 'o', policyVersion: 1, netMeteringRegime: 'sie007_2026' };
const discount = 'el cargo por uso de la red se descuenta del ahorro';
const withBreakdown = (rates: Record<string, unknown>) => { const s = stored(rates, snapshotSC); s.project.specs.showSelfConsumptionBreakdown = true; return renderProposalPage(s); };
assert.ok(withBreakdown({ distributor: 'EDESUR', tariffCode: 'BTS1', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 }).includes(discount), 'BTS-1: se descuenta');
const btdSC = withBreakdown({ distributor: 'EDESUR', tariffCode: 'BTD', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 });
assert.ok(btdSC.includes('data-energy-mode="self_consumption"') && !btdSC.includes(discount), 'BTD: sin cargo');
assert.ok(!btdSC.includes('después de retención'), 'BTD en SIE-007: sin retención');
assert.ok(!withBreakdown({ distributor: 'EDESUR', tariffCode: 'BTS1', isZeroExport: true, netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 }).includes(discount), 'inyección cero: sin cargo');

// 6. (H) Inmutabilidad: al publicar se materializan el régimen y el cargo efectivo en las tarifas del enlace, así un
// cambio futuro del valor de fábrica no cambia la nota de un enlace publicado.
assert.deepEqual(publishedNetMeteringRates({ distributor: 'EDESUR', tariffCode: 'BTS1', netMeteringRegime: 'sie007_2026' }), { distributor: 'EDESUR', tariffCode: 'BTS1', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 });
assert.deepEqual(publishedNetMeteringRates({ distributor: 'EDESUR', tariffCode: 'BTS1' }), { distributor: 'EDESUR', tariffCode: 'BTS1' }, 'régimen anterior: sin campos nuevos');
const published = stored(publishedNetMeteringRates({ distributor: 'EDESUR', tariffCode: 'BTS1', gridExportFeePct: 25, netMeteringRegime: 'sie007_2026' }));
const factory = FACTORY_GRID_USE_CHARGES.EDESUR as { dopPerKWh: number };
const originalCharge = factory.dopPerKWh;
try {
  factory.dopPerKWh = 9.99; // nuevo trimestre
  assert.ok(renderProposalPage(published).includes('RD$3.78 por kWh inyectado'), 'el enlace conserva el cargo con el que se publicó');
} finally {
  factory.dopPerKWh = originalCharge;
}

// 7. (I) Régimen solo en el snapshot (sin campo en rates): visor coherente con ese régimen, también en los supuestos.
const snapshotOnly = renderProposalPage(stored({ distributor: 'EDENORTE', tariffCode: 'BTS1', gridExportFeePct: 25 }, { mode: 'legacy', capturedAt: '2026-11-16T12:00:00.000Z', organizationId: 'o', policyVersion: 1, netMeteringRegime: 'sie007_2026' }));
assert.ok(snapshotOnly.includes('RD$4.02 por kWh inyectado'), 'régimen del snapshot y cargo de fábrica de su distribuidora');

console.log('Visor: régimen de medición neta opcional, enlaces antiguos intactos y valores desconocidos rechazados.');
