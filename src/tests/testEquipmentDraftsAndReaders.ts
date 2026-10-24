import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { createAIProposalBase, prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { LEGACY_MIRROR_FIELDS, equipmentTotals, readEquipment } from '../../shared/equipment';
import { PDFCoverPage } from '../components/pdf/pages/PDFCoverPage';
import { EnergyAnalysisTab } from '../components/simulator/tabs/EnergyAnalysisTab';
import type { ProjectSimulation } from '../types';

/**
 * Oleada 2: los borradores de IA terminan solo en grupos (sin espejo) y los lectores visibles (portada del PDF y
 * pestaña de energía) muestran la potencia y las cantidades de los grupos, no de campos sueltos.
 */
const mirror = (specs: object) => [...LEGACY_MIRROR_FIELDS, 'selectedSupplierInfo'].filter((key) => key in specs);
const tariff = DEFAULT_RD_TARIFF_MATRIX as never;
const data = {
  monthlyConsumptionKWh: Array(12).fill(1000), averageMonthlyKWh: 1000, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1',
  panels: [{ id: 'p1', brandModel: 'Panel A', powerW: 600, count: 10, unitPriceUSD: 100 }, { id: 'p2', brandModel: 'Panel B', powerW: 500, count: 4, unitPriceUSD: 90 }],
  inverters: [{ id: 'i', brandModel: 'I', powerKW: 5, count: 1, unitPriceUSD: 900 }],
  batteries: [{ id: 'b', brandModel: 'B', capacityKWh: 10, count: 1, unitPriceUSD: 1500, dodPct: 80, efficiencyPct: 90 }],
};

// 1. Borradores de IA: base, grupos de catálogo y selección única terminan sin espejo.
const base = createAIProposalBase(BENCHMARK_PROJECT, { defaultBatteryDOD: 85 } as never, 'Santiago');
assert.deepEqual(mirror(base.specs), [], 'la base de IA no trae espejo');
const drafts: Record<string, ProjectSimulation> = {
  grupos: prepareProposalDraftProject(base, data as never, tariff, { isNew: true }),
  existente: prepareProposalDraftProject(base, data as never, tariff, { isNew: false }),
  seleccionUnica: prepareProposalDraftProject(base, { ...data, panels: undefined, inverters: undefined, batteries: undefined, recommendedPanelCount: 12, selectedPanelWatts: 550,
    selectedPanelModel: 'Longi 550', selectedPanelUnitPriceUSD: 90, selectedInverterModel: 'Growatt 8K', selectedInverterPowerKW: 8, selectedInverterCount: 2, selectedInverterUnitPriceUSD: 1200,
    hasBattery: true, selectedBatteryModel: 'Dyness 10', selectedBatteryCapacityKWh: 10, selectedBatteryCount: 2, selectedBatteryUnitPriceUSD: 1400 } as never, tariff, { isNew: true }),
};
for (const [name, draft] of Object.entries(drafts)) {
  assert.deepEqual(mirror(draft.specs), [], `${name}: el borrador no escribe el espejo`);
  assert.ok(draft.specs.panels?.length && draft.specs.inverters?.length, `${name}: trae grupos`);
}
assert.equal(equipmentTotals(readEquipment(drafts.grupos.specs)).panelCount, 14);
assert.equal(equipmentTotals(readEquipment(drafts.seleccionUnica.specs)).panelCount, 12);

// 1b. Selección escalar solo con el modelo: conserva cantidad, potencia y capacidad del grupo existente.
{
  const model = prepareProposalDraftProject(BENCHMARK_PROJECT, { ...data, panels: undefined, inverters: undefined, batteries: undefined, selectedInverterModel: 'Otro inversor', selectedBatteryModel: 'Otra batería' } as never, tariff, { isNew: false });
  assert.equal(model.specs.inverters![0].brandModel, 'Otro inversor');
  assert.equal(model.specs.inverters![0].count, BENCHMARK_PROJECT.specs.inverters![0].count, 'la cantidad de inversores no se reinicia');
  assert.equal(model.specs.batteries![0].count, BENCHMARK_PROJECT.specs.batteries![0].count);
  assert.equal(model.specs.batteries![0].capacityKWh, BENCHMARK_PROJECT.specs.batteries![0].capacityKWh);
  assert.deepEqual(mirror(model.specs), []);
}

// 1c. El proveedor elegido en el borrador llega al grupo principal (y no queda a nivel de specs).
{
  const supplier = { supplierName: 'Dist QA', priceUSD: 95, supplierPriceId: 'sp-q' };
  const withSupplier = prepareProposalDraftProject(BENCHMARK_PROJECT, { ...data, panels: undefined, inverters: undefined, batteries: undefined, selectedPanelModel: 'Panel Q', selectedSupplierInfo: { panel: supplier } } as never, tariff, { isNew: false });
  assert.deepEqual(withSupplier.specs.panels![0].selectedSupplierInfo, supplier);
  assert.deepEqual(mirror(withSupplier.specs), []);
}

// 2. Portada del PDF y pestaña de energía: kWp y cantidades salen de los grupos.
const theme = { id: 'test', name: 'Test', primary: '#123456', secondary: '#345678', accent: '#123456', accentDark: '#123456', accentLightBg: '#fff', accentBorder: '#123456', barColor: '#123456' };
const project = drafts.grupos;
const summary = calculateProjectFinancialSummary(project);
assert.equal(summary.systemCapacityKWp, 8, '10×600 + 4×500 W');
const cover = renderToStaticMarkup(React.createElement(PDFCoverPage, { project, summary, activeTheme: theme as never, currentDateStr: '7 octubre 2026' }));
assert.match(cover, /10 × 600W \+ 4 × 500W/, 'la portada describe la configuración real');
assert.doesNotMatch(cover.replace(/data:[^"]*/g, ''), /undefined|NaN/);

const energy = renderToStaticMarkup(React.createElement(EnergyAnalysisTab, { project, summary, openAIInvoiceModal: () => {}, updateMonthlyConsumption: () => {} }));
assert.match(energy, /10 × 600W \+ 4 × 500W/);
assert.match(energy, />8</, 'kWp del resumen');
assert.doesNotMatch(energy.replace(/data:[^"]*/g, ''), /undefined|NaN/);

console.log('AI drafts write groups only; cover and energy tab read groups.');
