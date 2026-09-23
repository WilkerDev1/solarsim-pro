import { renderProposalPage } from '../../workers/share-viewer/src/template';

console.log('=====================================================');
console.log('🧪 RUNNING WEB PROPOSAL DISCOUNT TEST SUITE');
console.log('=====================================================\n');

const mockStoredProposal: any = {
  id: 'test-disc-123',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
  validityDays: 7,
  project: {
    id: 'proj-test',
    client: {
      name: 'Cliente Prueba Descuento',
      projectId: 'SP-2026-TEST',
      quoteNumber: 'C-9999',
      province: 'Santo Domingo',
    },
    specs: {
      panelCount: 20,
      panelPowerW: 600,
      panelBrandModel: 'Canadian Solar 600W',
      inverterCount: 1,
      inverterCapacityKW: 10,
      inverterBrandModel: 'Luxpower 10k',
      hasBattery: false,
    },
    rates: {
      distributor: 'EDEESTE',
      tariffCode: 'BTS1',
    },
    financials: {
      applyITBISExemption: true,
      applyLey5707: true,
      customDiscounts: [
        {
          id: 'disc-1',
          description: 'Cierre especial aniversario',
          type: 'fixed',
          value: 1500,
          target: 'general',
        },
      ],
    },
  },
  summary: {
    systemCapacityKWp: 12,
    annualConsumptionKWh: 15000,
    annualProductionKWh: 18000,
    energyCoveragePct: 120,
    listGrossInvestmentUSD: 14000,
    totalDiscountUSD: 1500,
    equipmentDiscountUSD: 0,
    grossInvestmentUSD: 12500,
    itbisSavedUSD: 1800,
    ley5707CreditUSD: 4000,
    commercialPreTaxSubtotalUSD: 12500,
    monthlyBreakdown: [],
  },
};

const html = renderProposalPage(mockStoredProposal);

// TEST 1: Contains DESCUENTO label (and NOT "DESCUENTO COMERCIAL")
if (!html.includes('DESCUENTO:')) {
  throw new Error('❌ Expected html to contain "DESCUENTO:"');
}
if (html.includes('DESCUENTO COMERCIAL')) {
  throw new Error('❌ Expected html NOT to contain "DESCUENTO COMERCIAL"');
}
console.log(' ✅ PASS: Contiene "DESCUENTO:" y no "DESCUENTO COMERCIAL"');

// TEST 2: Discount amount is formatted
if (!html.includes('- US$ 1,500.00')) {
  throw new Error('❌ Expected html to contain "- US$ 1,500.00"');
}
console.log(' ✅ PASS: Monto de descuento formateado correctamente (- US$ 1,500.00)');

// TEST 3: List Gross Investment with ITBIS is shown
// listGrossInvestmentUSD (14000) + itbisSavedUSD (1800) = 15800.00
if (!html.includes('US$ 15,800.00')) {
  throw new Error('❌ Expected list total with ITBIS "US$ 15,800.00"');
}
console.log(' ✅ PASS: TOTAL GENERAL (USD) muestra precio de lista con ITBIS (US$ 15,800.00)');

// TEST 4: Net Gross Investment with Ley 57-07 is 12500.00
if (!html.includes('US$ 12,500.00')) {
  throw new Error('❌ Expected net total with Ley 57-07 "US$ 12,500.00"');
}
console.log(' ✅ PASS: TOTAL GENERAL (CON LEY 57-07) muestra inversión neta (US$ 12,500.00)');

// TEST 5: When totalDiscountUSD is 0, discount row should NOT appear
const mockNoDiscountProposal = {
  ...mockStoredProposal,
  summary: {
    ...mockStoredProposal.summary,
    totalDiscountUSD: 0,
    listGrossInvestmentUSD: 12500,
  },
};
const htmlNoDisc = renderProposalPage(mockNoDiscountProposal);
if (htmlNoDisc.includes('DESCUENTO:')) {
  throw new Error('❌ Expected htmlNoDisc NOT to contain "DESCUENTO:" when discount is 0');
}
console.log(' ✅ PASS: Sin descuentos, la fila DESCUENTO no se renderiza');

console.log('\n=====================================================');
console.log('🎉 ALL WEB PROPOSAL DISCOUNT TESTS PASSED (100% SUCCESS)');
console.log('=====================================================\n');
