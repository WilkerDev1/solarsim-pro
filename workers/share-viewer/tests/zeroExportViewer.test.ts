import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { energyFlowScenarios } from '../src/energyFlowScenarios';

/*
 * Inyección cero en el visor web: el sistema es de autoconsumo, no envía energía a la red. La tabla mensual no lleva
 * columna de inyección neta y los textos hablan de autoconsumo e independencia; conectado a red no cambia.
 */
const months = Array.from({ length: 12 }, (_, i) => ({ month: `M${i + 1}`, consumptionKWh: 800, productionKWh: 700, solarSelfConsumedKWh: 650, netExportCreditKWh: 0, gridExportedKWh: 0, effectiveSavedKWh: 650, batteryContributionKWh: 0 }));
function proposal(rates: Record<string, unknown>): any {
  return {
    calculationSnapshot: { mode: 'self_consumption' },
    id: 'cero', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(), validityDays: 7,
    project: {
      id: 'p', client: { name: 'Cliente Cero', projectId: 'SP-3', quoteNumber: 'C-3', province: 'Santo Domingo' },
      specs: { panelCount: 10, panelPowerW: 600, hasBattery: false, showSelfConsumptionBreakdown: true },
      rates: { distributor: 'EDESUR', tariffCode: 'BTS1', ...rates }, financials: {},
    },
    summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9600, annualProductionKWh: 8400, energyCoveragePct: 87.5, grossInvestmentUSD: 10000, monthlyBreakdown: months },
  };
}

const zero = renderProposalPage(proposal({ gridConnection: 'zero_export', isZeroExport: true }));
const legacyZero = renderProposalPage(proposal({ isZeroExport: true }));
const grid = renderProposalPage(proposal({ gridConnection: 'grid_export' }));

for (const html of [zero, legacyZero]) {
  assert.ok(!html.includes('Inyección neta (kWh)'), 'inyección cero: sin columna de inyección neta');
  assert.ok(/autoconsumo y reduce la dependencia de la red/.test(html), 'inyección cero: texto de autoconsumo e independencia');
  assert.ok(!/Medición Neta/.test(html), 'inyección cero: sin medición neta en los textos por defecto');
}
assert.ok(grid.includes('Inyección neta (kWh)'), 'conectado a red: la columna se mantiene');

// Columnas alineadas: la cabecera, cada fila y el total tienen la misma cantidad de celdas en cada modo.
const cellCounts = (html: string) => {
  const start = html.lastIndexOf('<table', html.indexOf('Autoconsumo (kWh)'));
  const table = html.slice(start, html.indexOf('</table>', start));
  return [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((row) => (row[0].match(/<t[hd][\s>]/g) || []).length);
};
for (const [html, cells] of [[zero, 6], [legacyZero, 6], [grid, 7]] as const) {
  const counts = cellCounts(html);
  assert.ok(counts.length >= 14, `cabecera, 12 meses y total: ${counts.length}`);
  assert.ok(counts.every((n) => n === cells), `celdas por fila: ${counts.join(',')}`);
}

// Apagón sin baterías: la nota no presenta el sistema como «de inyección».
const outage = energyFlowScenarios({ hybrid: false, isZeroExport: true, gridConnection: 'zero_export', systemCapacityKWp: 6, annualConsumptionKWh: 9000, totalBESSKWh: 0 }).find((s) => s.mode === 'outage');
assert.ok(outage && !/sistema de inyección/.test(outage.note ?? ''), outage?.note);

console.log('Visor: inyección cero sin columna de inyección neta y con textos de autoconsumo.');
