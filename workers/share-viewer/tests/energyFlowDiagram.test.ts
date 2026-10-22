import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { energyFlowBranches } from '../src/energyFlow';
import { BUILT_IN_APPLICATION_FEATURES, isBuiltInFeatureAvailable } from '../../../shared/applicationFeatures';

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
const shares = (branches: { key: string; pct: number }[]) => Object.fromEntries(branches.map((b) => [b.key, b.pct]));

// Percentages are an approximate visual guide: multiples of 5 that add up to 100.
const onGrid = energyFlowBranches({ hybrid: false, isZeroExport: false, annualProductionKWh: 8900, monthly: [month(8900, 4090, 4810)] });
assert.deepEqual(shares(onGrid), { home: 45, grid: 55 }, 'On-grid split follows the simulation, rounded to 5 %');
assert.equal(onGrid.find((b) => b.key === 'home')!.kWh, 4000, 'Branch energy matches the approximate share, rounded to 100 kWh');

const hybrid = energyFlowBranches({ hybrid: true, isZeroExport: false, annualProductionKWh: 8900, monthly: [month(8900, 7920, 980, 3650)] });
assert.deepEqual(shares(hybrid), { home: 50, battery: 40, grid: 10 }, 'Hybrid direct use excludes the battery cycle');

// Legacy calculations never recorded the battery cycle: a typical hybrid split is shown instead of 0 %.
const legacyHybrid = energyFlowBranches({ hybrid: true, isZeroExport: false, annualProductionKWh: 8900, monthly: [month(8900, 8010, 890, 0)] });
assert.deepEqual(shares(legacyHybrid), { home: 50, battery: 35, grid: 15 });

// Publications without monthly data still get a diagram.
assert.deepEqual(shares(energyFlowBranches({ hybrid: false, isZeroExport: false, annualProductionKWh: 0, monthly: [] })), { home: 50, grid: 50 });

// Older summaries lacked gridExportedKWh: the non-self-consumed production is the export.
assert.deepEqual(shares(energyFlowBranches({ hybrid: false, isZeroExport: false, annualProductionKWh: 1000, monthly: [month(1000, 300)] })), { home: 30, grid: 70 });

// Zero-export systems never draw a grid branch.
assert.deepEqual(shares(energyFlowBranches({ hybrid: false, isZeroExport: true, annualProductionKWh: 1000, monthly: [month(1000, 750, 0)] })), { home: 100 });
assert.ok(!energyFlowBranches({ hybrid: true, isZeroExport: true, annualProductionKWh: 1000, monthly: [month(1000, 900, 0, 300)] }).some((b) => b.key === 'grid'));

// A tiny export still shows a visible branch instead of disappearing.
assert.deepEqual(shares(energyFlowBranches({ hybrid: false, isZeroExport: false, annualProductionKWh: 1000, monthly: [month(1000, 990, 10)] })), { home: 95, grid: 5 });

// Zero export curtails the surplus: branch energy is what was used, never the potential production.
const curtailed = energyFlowBranches({ hybrid: false, isZeroExport: true, annualProductionKWh: 10000, monthly: [month(10000, 3000, 0)] });
assert.deepEqual(curtailed.map((b) => [b.key, b.pct, b.kWh]), [['home', 100, 3000]]);
// Without data, a zero-export guide shows shares only.
assert.ok(energyFlowBranches({ hybrid: false, isZeroExport: true, annualProductionKWh: 10000, monthly: [] }).every((b) => b.kWh === 0));

// In the physical model a battery may legitimately stay idle: a measured zero is kept, not replaced by a typical split.
const idleBattery = energyFlowBranches({ hybrid: true, isZeroExport: false, annualProductionKWh: 12000, calculationMode: 'self_consumption', monthly: [month(12000, 12000, 0, 0)] });
assert.deepEqual(shares(idleBattery), { home: 100 });

for (const branches of [onGrid, hybrid, legacyHybrid]) {
  assert.equal(branches.reduce((sum, b) => sum + b.pct, 0), 100);
  assert.ok(branches.every((b) => b.pct % 5 === 0 && b.pct > 0));
}

// The diagram is a registered, always-available built-in capability.
assert.ok(BUILT_IN_APPLICATION_FEATURES.some((f) => f.id === 'proposalEnergyFlowDiagram' && f.defaultEnabled));
assert.equal(isBuiltInFeatureAvailable('proposalEnergyFlowDiagram'), true);

// Exactly one diagram, placed between the quote details and the executive summary.
const onGridHtml = renderProposalPage(proposal({ summary: { monthlyBreakdown: [month(8900, 4090, 4810)] } }));
assert.equal(onGridHtml.match(/data-energy-flow="/g)?.length, 1, 'Only one diagram is rendered');
assert.ok(onGridHtml.includes('data-energy-flow="on-grid"'));
assert.ok(!onGridHtml.includes('Carga de batería'));
const position = onGridHtml.indexOf('data-energy-flow="');
assert.ok(position > onGridHtml.indexOf('Detalles de la Cotización') && position < onGridHtml.indexOf('1. Resumen Ejecutivo'), 'Module sits above section 1');
assert.ok(onGridHtml.includes('≈</tspan>45 %') && onGridHtml.includes('≈</tspan>55 %'), 'Percentages are marked as approximate');

const hybridHtml = renderProposalPage(proposal({
  specs: { hasBattery: true, batteries: [{ brandModel: 'LiFePO4', capacityKWh: 10, count: 1 }] },
  summary: { monthlyBreakdown: [month(8900, 7920, 980, 3650)] },
}));
assert.equal(hybridHtml.match(/data-energy-flow="/g)?.length, 1);
assert.ok(hybridHtml.includes('data-energy-flow="hybrid"') && hybridHtml.includes('Carga de batería'));

// Phones get a compact drawing plus a readable legend; larger screens get the labelled drawing.
assert.ok(onGridHtml.includes('data-energy-flow-legend') && onGridHtml.includes('data-energy-flow-svg="compact"') && onGridHtml.includes('data-energy-flow-svg="full"'));
assert.ok(onGridHtml.includes('prefers-reduced-motion'), 'Animation respects reduced motion');

// Already published links (no monthly data, no battery cycle) render retroactively.
const legacyHtml = renderProposalPage(proposal({ summary: { monthlyBreakdown: undefined } }));
assert.ok(legacyHtml.includes('data-energy-flow="on-grid"'));

console.log('Energy flow diagram renders an approximate, single, responsive guide.');
