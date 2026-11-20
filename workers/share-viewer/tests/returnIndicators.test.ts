import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { PAYBACK_NOT_REACHED_LABEL, IRR_NOT_APPLICABLE_LABEL } from '../../../shared/returnIndicators';

// Sistema que no recupera la inversión en su vida útil: el visor dice «No se recupera» / «No aplica», nunca un
// payback de 25 años ni una TIR sin converger. Un resumen publicado antes de las marcas se ve como siempre.
const cashFlow = Array.from({ length: 25 }, (_, i) => ({ year: i + 1, productionKWh: 1000, savingsUSD: -100, taxCreditUSD: 0, netCashFlowUSD: -100, cumulativeCashFlowUSD: -10000 - 100 * (i + 1) }));
const proposal = (flags: Record<string, unknown>): any => ({
  id: 'return-indicators',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  validityDays: 7,
  project: {
    id: 'p',
    client: { name: 'Cliente', projectId: 'SP-1', quoteNumber: 'C-1', province: 'Santiago' },
    specs: { panelCount: 10, panelPowerW: 600, panelBrandModel: 'Panel', inverterCount: 1, inverterBrandModel: 'Inversor', hasBattery: false, saleMarginMultiplier: 1.5 },
    rates: { distributor: 'EDENORTE', tariffCode: 'BTS1' },
    financials: { applyITBISExemption: true, applyLey5707: true },
  },
  summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 9500, energyCoveragePct: 100, grossInvestmentUSD: 10000, itbisSavedUSD: 900, ley5707CreditUSD: 2000, paybackYears: 25, irrPct: 12206.6, cashFlow25Years: cashFlow, monthlyBreakdown: [], ...flags },
});

const never = renderProposalPage(proposal({ paybackReached: false, irrDefined: false }));
assert.ok(never.includes(PAYBACK_NOT_REACHED_LABEL), 'payback: no se recupera');
assert.ok(never.includes(IRR_NOT_APPLICABLE_LABEL), 'TIR: no aplica');
assert.ok(!never.includes('12206.6'), 'nunca la TIR sin converger');
assert.ok(!never.includes('Retorno: 25.0 años'), 'sin fila de retorno');

const legacy = renderProposalPage(proposal({}));
assert.ok(legacy.includes('12206.6%') && legacy.includes('Retorno: 25.0 años'), 'resumen sin marcas: como hasta ahora');
assert.ok(!legacy.includes(PAYBACK_NOT_REACHED_LABEL));

console.log('Return indicators in the web viewer passed.');
