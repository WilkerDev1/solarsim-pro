import assert from 'node:assert/strict';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { proposalDatasheets } from '../utils/proposalDatasheets';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { useSimulationStore } from '../store/useSimulationStore';

// AI proposals keep the catalog identity of each group, so their datasheets are found even if the name is edited.
const state = useSimulationStore.getState();
const catalog = structuredClone(state.equipmentCatalog);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.datasheetAssetId = 'panel-sheet';
const context = { province: 'Santiago', annualSpecificYieldKWhPerKWp: 1500, tariffReference: buildAITariffContext(state.tariffMatrix) };
const draft = normalizeProposalDraft({
  clientName: 'QA catálogo', province: 'Santiago', distributor: 'EDESUR', tariffCode: 'BTS2', averageMonthlyKWh: 500,
  panels: [{ equipmentId: panel.id, quantity: 10 }], inverters: [{ equipmentId: inverter.id, quantity: 1 }], batteries: [], hasBattery: false,
}, catalog, context);
assert.equal(draft.panels?.[0].catalogItemId, panel.id);
assert.equal(draft.inverters?.[0].catalogItemId, inverter.id);

const project = structuredClone(BENCHMARK_PROJECT);
project.specs.panels = draft.panels!.map((group) => ({ ...group, brandModel: 'Nombre cambiado en el simulador' }));
project.specs.inverters = draft.inverters;
project.specs.hasBattery = false;
assert.deepEqual(proposalDatasheets(project, catalog).map((source) => source.item.id), [panel.id]);
console.log('AI proposal groups carry catalogItemId and resolve their datasheets.');
