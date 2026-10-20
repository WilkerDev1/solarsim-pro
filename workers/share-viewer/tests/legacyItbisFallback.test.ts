import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';

// Links published before summaries carried customItemsNonExoneratedITBISUSD recompute it with the engine's rules.
const legacy: any = {
  id: 'legacy-itbis',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  validityDays: 7,
  project: {
    id: 'p',
    client: { name: 'Cliente antiguo', projectId: 'SP-OLD', quoteNumber: 'C-1', province: 'Santiago' },
    specs: { panelCount: 10, panelPowerW: 600, panelBrandModel: 'Panel', inverterCount: 1, inverterBrandModel: 'Inversor', hasBattery: false, saleMarginMultiplier: 1.5 },
    rates: { distributor: 'EDENORTE', tariffCode: 'BTS1' },
    financials: {
      applyITBISExemption: true,
      applyLey5707: true,
      // Legacy flag: applyITBIS=false meant ITBIS is charged; the item keeps the default margin.
      customItems: [{ id: 'x', description: 'Herrajes', quantity: 2, unit: 'UD', unitPriceUSD: 100, applyITBIS: false }],
    },
  },
  summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 9500, energyCoveragePct: 100, grossInvestmentUSD: 10000, itbisSavedUSD: 900, ley5707CreditUSD: 2000, monthlyBreakdown: [] },
};
const html = renderProposalPage(legacy);
// 2 × 100 × 1.5 = 300 sale price → 18% ITBIS = 54 charged → pre-tax subtotal 10,000 − 54.
assert.ok(html.includes('US$ 9,946.00'), 'Legacy fallback charges ITBIS on the non-exempt item at its sale price');
console.log('Legacy ITBIS fallback matches the engine rules.');
