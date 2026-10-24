import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';

/**
 * ADR 0003 (supuestos resueltos): el visor resuelve vigencia, retención de exportación y margen con las mismas
 * reglas que la aplicación (`shared/assumptions.ts`). Caracterización escrita antes del refactor.
 */
const proposal = (client: object, rates: object, validityDays?: number, specs: object = {}): any => ({
  id: 'x', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), validityDays,
  project: {
    id: 'p',
    client: { name: 'C', projectId: 'SP', quoteNumber: 'C-1', province: 'Santiago', ...client },
    specs: { hasBattery: false, ...specs },
    rates: { distributor: 'EDENORTE', tariffCode: 'BTS1', ...rates },
    financials: { customItems: [{ id: 'a', description: 'H', quantity: 1, unitPriceUSD: 100, applyITBIS: false }] },
  },
  summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 9500, energyCoveragePct: 100, grossInvestmentUSD: 10000, itbisSavedUSD: 900, ley5707CreditUSD: 2000, monthlyBreakdown: [] },
});
const validity = (html: string) => html.match(/Válido por (\d+) Días/)?.[1];
const fee = (html: string) => html.match(/equivalente al (\d+(?:\.\d+)?)%/)?.[1];
const subtotal = (html: string) => html.match(/US\$ [\d,]+\.\d\d/)?.[0];

const none = renderProposalPage(proposal({}, {}));
assert.equal(validity(none), '7', 'sin vigencia: 7 días');
assert.equal(fee(none), '25', 'sin retención: 25 %');
assert.equal(validity(renderProposalPage(proposal({}, {}, 9))), '9', 'la vigencia guardada en el enlace gana al default');
assert.equal(validity(renderProposalPage(proposal({ quoteValidityDays: 0 }, {}, 9))), '9', 'vigencia 0 del proyecto = sin dato');
assert.equal(validity(renderProposalPage(proposal({ quoteValidityDays: 14 }, {}, 9))), '14', 'la vigencia del proyecto gana');
assert.equal(fee(renderProposalPage(proposal({}, { gridExportFeePct: 30 }))), '30');
assert.equal(subtotal(renderProposalPage(proposal({}, {}, undefined, { saleMarginMultiplier: 0 }))), subtotal(none), 'margen 0 = sin dato (1.25)');
assert.notEqual(subtotal(renderProposalPage(proposal({}, {}, undefined, { saleMarginMultiplier: 2 }))), subtotal(none), 'un margen propio se respeta');
console.log('Visor: vigencia, retención y margen usan los supuestos resueltos.');
