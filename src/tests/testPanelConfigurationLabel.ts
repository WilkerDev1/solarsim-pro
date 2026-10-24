import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describePanelConfiguration, uniformPanelWatts, type Equipment } from '../../shared/equipment';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { PDFCoverPage } from '../components/pdf/pages/PDFCoverPage';
import { EnergyAnalysisTab } from '../components/simulator/tabs/EnergyAnalysisTab';
import type { PanelItemSpec } from '../types';

/** Etiqueta de configuración de paneles: nunca atribuye la potencia del modelo principal a todos los módulos. */
const panel = (id: string, powerW: number, count: number): PanelItemSpec => ({ id, brandModel: `P${id}`, powerW, count, unitPriceUSD: 1 });
const eq = (...panels: PanelItemSpec[]): Equipment => ({ panels, inverters: [], batteries: [] });

assert.equal(describePanelConfiguration(eq(panel('a', 600, 14))), '14 × 600W', 'un modelo');
assert.equal(uniformPanelWatts(eq(panel('a', 600, 14))), 600);
assert.equal(describePanelConfiguration(eq(panel('a', 600, 10), panel('b', 600, 4))), '14 × 600W', 'varios grupos con la misma potencia');
assert.equal(uniformPanelWatts(eq(panel('a', 600, 10), panel('b', 600, 4))), 600);
assert.equal(describePanelConfiguration(eq(panel('a', 600, 10), panel('b', 500, 4))), '10 × 600W + 4 × 500W', 'potencias distintas: todas');
assert.equal(uniformPanelWatts(eq(panel('a', 600, 10), panel('b', 500, 4))), undefined);
assert.equal(describePanelConfiguration(eq(panel('a', 600, 10), panel('b', 500, 4), panel('c', 550, 2), panel('d', 400, 1))), '17 módulos · 9.5 kWp', 'más de 3 grupos distintos: resumen');
assert.equal(describePanelConfiguration(eq()), '0 × 0W');

// Documento y pestaña: con potencias mixtas se ve la configuración real (8 kWp), no «14 × 600W».
const project = structuredClone(BENCHMARK_PROJECT);
project.specs = { ...project.specs, panels: [panel('a', 600, 10), panel('b', 500, 4)] };
const summary = calculateProjectFinancialSummary(project);
assert.equal(summary.systemCapacityKWp, 8);
const theme = { id: 't', name: 'T', primary: '#123456', secondary: '#345678', accent: '#123456', accentDark: '#123456', accentLightBg: '#fff', accentBorder: '#123456', barColor: '#123456' };
const strip = (html: string) => html.replace(/data:[^"]*/g, '');
const cover = strip(renderToStaticMarkup(React.createElement(PDFCoverPage, { project, summary, activeTheme: theme as never, currentDateStr: '7 octubre 2026' })));
assert.match(cover, /10 × 600W \+ 4 × 500W/);
assert.doesNotMatch(cover, /14 Módulos Tier-1 \(600W\)/);
const energy = strip(renderToStaticMarkup(React.createElement(EnergyAnalysisTab, { project, summary, openAIInvoiceModal: () => {}, updateMonthlyConsumption: () => {} })));
assert.match(energy, /10 × 600W \+ 4 × 500W/);
assert.doesNotMatch(energy, /14 módulos × 600W/);

console.log('Panel configuration label: uniform, same wattage, mixed and summary.');
