import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { parseSharePayload, RequestValidationError } from '../src/validation';

// Ítems extra marcados «oculto en factura»: se cobran, pero el visor no los lista en el desglose.
const VISIBLE = 'Herrajes de montaje especiales';
const HIDDEN = 'Comision de venta confidencial';
const proposal = (hideInQuotation?: unknown): any => ({
  id: 'hidden-items',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  validityDays: 7,
  project: {
    id: 'p',
    client: { name: 'Cliente', projectId: 'SP-1', quoteNumber: 'C-1', province: 'Santiago' },
    specs: { panelCount: 10, panelPowerW: 600, panelBrandModel: 'Panel', inverterCount: 1, inverterBrandModel: 'Inversor', hasBattery: false, saleMarginMultiplier: 1.5 },
    rates: { distributor: 'EDENORTE', tariffCode: 'BTS1' },
    financials: {
      applyITBISExemption: true,
      applyLey5707: true,
      customItems: [
        { id: 'a', description: VISIBLE, quantity: 2, unit: 'UD', unitPriceUSD: 100, exonerateITBIS: true },
        { id: 'fee', description: HIDDEN, quantity: 1, unit: 'GL', unitPriceUSD: 400, exonerateITBIS: false, ...(hideInQuotation === undefined ? {} : { hideInQuotation }) },
      ],
    },
  },
  // Sin customItemsNonExoneratedITBISUSD: el visor recalcula el ITBIS con TODOS los ítems, ocultos o no.
  summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 9500, energyCoveragePct: 100, grossInvestmentUSD: 10000, itbisSavedUSD: 900, ley5707CreditUSD: 2000, monthlyBreakdown: [] },
});

const visible = renderProposalPage(proposal(false));
const legacy = renderProposalPage(proposal(undefined));
const hidden = renderProposalPage(proposal(true));
assert.ok(visible.includes(HIDDEN) && visible.includes(VISIBLE), 'visible: se listan ambas filas');
assert.ok(legacy.includes(HIDDEN), 'enlaces sin el campo siguen listando el ítem');
assert.ok(!hidden.includes(HIDDEN), 'el HTML no contiene la descripción del ítem oculto');
assert.ok(hidden.includes(VISIBLE), 'las demás filas se siguen listando');

// Los importes (sub-total, total, ITBIS Ley 57-07, precio por watt) no cambian: solo desaparece la fila.
const withoutRows = (html: string) => html.replace(/<tr class="[^"]*">\s*<td[\s\S]*?<\/tr>/g, '').replace(/\s+/g, ' ');
assert.equal(withoutRows(hidden), withoutRows(visible), 'fuera de las filas, el documento es idéntico');
const amounts = (html: string) => [...html.matchAll(/US\$ [\d,]+\.\d{2}/g)].map(m => m[0]);
assert.deepEqual(amounts(hidden), amounts(visible));
assert.ok(amounts(hidden).length >= 3);
// 400 sin exonerar × 1.5 de margen = 600 → 18 % = 108 cobrados → sub-total 10,000 − 108.
assert.ok(hidden.includes('US$ 9,892.00'), 'el ITBIS del ítem oculto se sigue descontando del sub-total');

// El worker acepta el campo booleano y rechaza otros tipos (el resumen de prueba es mínimo: el campo se valida antes).
const rejection = (value: unknown) => { try { parseSharePayload(proposal(value)); return ''; } catch (error) { assert.ok(error instanceof RequestValidationError); return error.message; } };
assert.equal(rejection('si'), 'hideInQuotation debe ser booleano.');
assert.equal(rejection(1), 'hideInQuotation debe ser booleano.');
for (const accepted of [true, false, undefined]) assert.equal(rejection(accepted), 'El resumen debe incluir doce meses.', 'el ítem pasa y la validación sigue con el resumen');
console.log('Hidden quotation items are billed but not listed in the shared proposal.');
