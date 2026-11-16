import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { migrateLegacySpecs } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import {
  FACTORY_GRID_USE_CHARGES, NEW_PROPOSAL_NET_METERING_REGIME, SAVED_PROPOSAL_NET_METERING_REGIME, gridUseChargeApplies,
  resolveNetMetering, resolveNetMeteringRegime,
} from '../../shared/netMetering';
import { regulatoryNoteDefault } from '../../shared/documentTexts';
import { createDocumentTextContext } from '../../shared/documentTexts/context';
import { applyProjectEdit } from '../domain/projectEdit';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { validateAssistantEdits } from '../features/assistant/validation';
import { AGENT_TOOL_DEFINITIONS } from '../../shared/agentTools/definitions';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { createAIProposalBase, prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { APPLICATION_FEATURES, DEVICE_APPLICATION_FEATURES } from '../../shared/applicationFeatures';
import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import type { LegacyProjectSpecs, ProjectSimulation, UtilityRates } from '../types';

/**
 * Fase 2 del plan tarifario: régimen de medición neta como dato de la propuesta (`rates.netMeteringRegime`)
 * y cargo por uso de la red SIE-007-2026 = kWh inyectados × RD$/kWh, solo en tarifas de un solo precio.
 * Las cifras del régimen anterior las fija `testNetMeteringRegime.ts` (sin cambios).
 */

const specs = (overrides: Partial<LegacyProjectSpecs>) => migrateLegacySpecs({
  isDetailed: true, pricePerWattUSD: 1.13, panelPowerW: 600, panelCount: 10, autoCalculatePanels: false, panelBrandModel: 'Panel (600W)',
  inverterPowerKW: 5, inverterCount: 1, inverterBrandModel: 'Inversor (5 kW)', hasBattery: false, batteryCapacityKWh: 0, batteryCount: 0,
  dopExchangeRate: 60, saleMarginMultiplier: 1.25, panelUnitPriceUSD: 100, inverterUnitPriceUSD: 1500, batteryUnitPriceUSD: 2000,
  installationUnitPriceUSD: 170, systemLosses: 14, annualDegradation: 0.5, batteryDOD: 90, ...overrides,
} as LegacyProjectSpecs);

const project = (rates: Partial<UtilityRates>, monthlyKWh = 250, specOverrides: Partial<LegacyProjectSpecs> = { panelCount: 4 }): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id: 'sie007',
  client: { ...structuredClone(BENCHMARK_PROJECT.client), province: 'Santiago', distributor: rates.distributor ?? 'EDENORTE', tariffCode: rates.tariffCode ?? 'BTS1' },
  specs: specs(specOverrides),
  rates: { energyCostPerKWh: 0.111, distributor: 'EDENORTE', targetCoveragePct: 95, tariffCode: 'BTS1', currency: 'USD', usdExchangeRate: 60, gridExportFeePct: 25, annualEnergyInflationPct: 3.5, ...rates },
  financials: { ...structuredClone(BENCHMARK_PROJECT.financials), customITBISSavedUSD: 0 },
  monthlyConsumption: Array(12).fill(monthlyKWh),
});
const MODES: EnergyCalculationMode[] = ['legacy', 'self_consumption'];
const r2 = (n: number) => Math.round(n * 100) / 100;

// 1. Resolución del régimen: lo que falta o es desconocido es el régimen anterior; las nuevas nacen en SIE-007.
assert.equal(SAVED_PROPOSAL_NET_METERING_REGIME, 'legacy_retention');
assert.equal(NEW_PROPOSAL_NET_METERING_REGIME, 'sie007_2026');
for (const missing of [undefined, null, '', 'sie007', 42]) assert.equal(resolveNetMeteringRegime(missing), 'legacy_retention', String(missing));
assert.equal(resolveAssumptions({}).netMeteringRegime, 'legacy_retention', 'resolveAssumptions: sin dato, régimen anterior');
assert.equal(resolveAssumptions({ rates: { netMeteringRegime: 'sie007_2026', distributor: 'EDESUR' } }).gridUseChargeDOPPerKWh, 3.78);

// 2. Valores de fábrica (SIE-121-2026-TF art. 9 y SIE-147-2026-TF art. 2).
assert.deepEqual(Object.fromEntries(Object.entries(FACTORY_GRID_USE_CHARGES).map(([k, v]) => [k, v.dopPerKWh])), { EDESUR: 3.78, EDENORTE: 4.02, EDEESTE: 3.88, CEPM: 5.73 });
assert.equal(FACTORY_GRID_USE_CHARGES.EDESUR.resolutionCode, 'SIE-121-2026-TF');
assert.equal(FACTORY_GRID_USE_CHARGES.CEPM.resolutionCode, 'SIE-147-2026-TF');

// 3. A quién aplica: tarifas de un precio sí; con potencia e inyección cero no; sin clasificar sí (conservador).
assert.equal(gridUseChargeApplies({ distributor: 'EDESUR', tariffCode: 'BTS-1' }), true);
assert.equal(gridUseChargeApplies({ distributor: 'EDESUR', tariffCode: 'BTS2' }), true);
assert.equal(gridUseChargeApplies({ distributor: 'CEPM', tariffCode: 'RBT-1' }), true);
assert.equal(gridUseChargeApplies({ distributor: 'EDESUR', tariffCode: 'BTD' }), false);
assert.equal(gridUseChargeApplies({ distributor: 'EDESUR', tariffCode: 'MTD1' }), false);
assert.equal(gridUseChargeApplies({ distributor: 'EDESUR', tariffCode: 'BTS1', isZeroExport: true }), false);
assert.equal(gridUseChargeApplies({ distributor: 'EDESUR', tariffCode: 'XYZ' }), true, 'sin clasificar: se cobra (estimación conservadora)');
assert.equal(resolveNetMetering({ distributor: 'EDESUR', tariffCode: 'BTS1' }).appliedGridUseChargeDOPPerKWh, 0, 'régimen anterior: sin cargo por kWh');

// 4. Motor: BTS-1 por distribuidora. Crédito del 100 % de lo inyectado y cargo = kWh inyectados × RD$/kWh ÷ tasa.
for (const [distributor, charge] of [['EDESUR', 3.78], ['EDENORTE', 4.02], ['EDEESTE', 3.88]] as const) {
  for (const mode of MODES) {
    const legacy = calculateProjectFinancialSummary(project({ distributor }), mode);
    const sie = calculateProjectFinancialSummary(project({ distributor, netMeteringRegime: 'sie007_2026' }), mode);
    sie.monthlyBreakdown.forEach((m, i) => {
      const before = legacy.monthlyBreakdown[i];
      assert.equal(m.gridExportedKWh, before.gridExportedKWh, 'la energía inyectada no depende del régimen');
      assert.equal(m.solarSelfConsumedKWh, before.solarSelfConsumedKWh);
      assert.equal(m.netExportCreditKWh, m.gridExportedKWh, `${distributor} ${mode}: se acredita todo lo inyectado`);
      assert.equal(m.retainedExportKWh, 0);
      const chargeUSD = r2(m.gridExportedKWh * charge / 60);
      assert.equal(m.gridUseChargeUSD, chargeUSD, `${distributor} ${mode} ${m.month}: cargo por kWh inyectado`);
      assert.equal(m.savingsUSD, r2(r2((m.solarSelfConsumedKWh + m.gridExportedKWh) * 0.111) - chargeUSD));
    });
    assert.ok(sie.monthlyBreakdown.some((m) => m.gridExportedKWh > 0), 'el caso exporta');
  }
}
// Cifra a mano: EDENORTE, enero (legacy): 4 × 600 W en Santiago.
const january = calculateProjectFinancialSummary(project({ netMeteringRegime: 'sie007_2026' }), 'legacy').monthlyBreakdown[0];
assert.equal(january.gridUseChargeUSD, r2(january.gridExportedKWh * 4.02 / 60));
// La tasa de cambio de la propuesta convierte el cargo.
const fx58 = calculateProjectFinancialSummary({ ...project({ netMeteringRegime: 'sie007_2026', usdExchangeRate: 58 }), specs: { ...project({}).specs, dopExchangeRate: 58 } }, 'legacy').monthlyBreakdown[0];
assert.equal(fx58.gridUseChargeUSD, r2(fx58.gridExportedKWh * 4.02 / 58));

// 5. Tarifa con potencia (BTD) e inyección cero: cargo 0 en SIE-007; con BTD el ahorro sube frente a la retención.
for (const mode of MODES) {
  const btdRates = { distributor: 'EDESUR' as const, tariffCode: 'BTD', energyCostPerKWh: 0.15 };
  const btd = calculateProjectFinancialSummary(project({ ...btdRates, netMeteringRegime: 'sie007_2026' }, 3000, { panelCount: 60, inverterPowerKW: 15, inverterCount: 2 }), mode);
  const btdLegacy = calculateProjectFinancialSummary(project(btdRates, 3000, { panelCount: 60, inverterPowerKW: 15, inverterCount: 2 }), mode);
  for (const m of btd.monthlyBreakdown) {
    assert.equal(m.gridUseChargeUSD, 0, `BTD ${mode}: sin cargo`);
    assert.equal(m.retainedExportKWh, 0);
    assert.equal(m.savingsUSD, r2((m.solarSelfConsumedKWh + m.gridExportedKWh) * 0.15));
  }
  assert.ok(btd.year1SavingsUSD > btdLegacy.year1SavingsUSD, 'BTD: sin retención del 25 %');
  const zero = calculateProjectFinancialSummary(project({ distributor: 'EDEESTE', tariffCode: 'BTS2', isZeroExport: true, netMeteringRegime: 'sie007_2026' }, 800, { panelCount: 10 }), mode);
  const zeroLegacy = calculateProjectFinancialSummary(project({ distributor: 'EDEESTE', tariffCode: 'BTS2', isZeroExport: true }, 800, { panelCount: 10 }), mode);
  for (const m of zero.monthlyBreakdown) { assert.equal(m.gridExportedKWh, 0); assert.equal(m.gridUseChargeUSD, 0); }
  assert.equal(zero.year1SavingsUSD, zeroLegacy.year1SavingsUSD, 'inyección cero: mismas cifras en ambos regímenes');
}

// 6. Valor editado por propuesta (incluido 0 explícito).
const edited = calculateProjectFinancialSummary(project({ netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 5 }), 'legacy').monthlyBreakdown[0];
assert.equal(edited.gridUseChargeUSD, r2(edited.gridExportedKWh * 5 / 60));
const free = calculateProjectFinancialSummary(project({ netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 0 }), 'legacy').monthlyBreakdown[0];
assert.equal(free.gridUseChargeUSD, 0, '0 explícito se respeta');
const invalid = calculateProjectFinancialSummary(project({ netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: -3 }), 'legacy').monthlyBreakdown[0];
assert.equal(invalid.gridUseChargeUSD, r2(invalid.gridExportedKWh * 4.02 / 60), 'un valor no válido usa el de fábrica');

// 7. El régimen anterior no cambia: mismo resultado con el campo explícito o ausente, y sin `gridUseChargeUSD`.
for (const mode of MODES) {
  const absent = calculateProjectFinancialSummary(project({}), mode);
  assert.deepEqual(calculateProjectFinancialSummary(project({ netMeteringRegime: 'legacy_retention', gridUseChargeDOPPerKWh: 9 }), mode), absent);
  assert.ok(absent.monthlyBreakdown.every((m) => !('gridUseChargeUSD' in m)), 'el desglose anterior no gana campos');
}

// 8. Serialización ida y vuelta: el régimen y el cargo sobreviven a JSON y dan las mismas cifras.
const sieProject = project({ distributor: 'EDESUR', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.5 });
const roundTrip = JSON.parse(JSON.stringify(sieProject)) as ProjectSimulation;
assert.equal(roundTrip.rates.netMeteringRegime, 'sie007_2026');
assert.equal(roundTrip.rates.gridUseChargeDOPPerKWh, 3.5);
assert.deepEqual(calculateProjectFinancialSummary(roundTrip, 'legacy'), calculateProjectFinancialSummary(sieProject, 'legacy'));

// 9. Edición (ADR 0004): cambiar de distribuidora vuelve a sembrar el cargo de fábrica salvo que se editara a mano.
const ctx = { equipmentCatalog: [] };
const seeded = project({ distributor: 'EDESUR', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 });
assert.equal(applyProjectEdit(seeded, { kind: 'rates', patch: { distributor: 'EDENORTE' } }, ctx).rates.gridUseChargeDOPPerKWh, 4.02);
assert.equal(applyProjectEdit({ ...seeded, rates: { ...seeded.rates, gridUseChargeDOPPerKWh: 3 } }, { kind: 'rates', patch: { distributor: 'EDENORTE' } }, ctx).rates.gridUseChargeDOPPerKWh, 3, 'valor manual se conserva');
const legacyProject = project({ distributor: 'EDESUR' });
const legacyEdited = applyProjectEdit(legacyProject, { kind: 'rates', patch: { distributor: 'EDENORTE' } }, ctx);
assert.equal(legacyEdited.rates.gridUseChargeDOPPerKWh, undefined, 'el régimen anterior no gana el campo');
assert.equal(legacyEdited.rates.netMeteringRegime, undefined);
const switched = applyProjectEdit(legacyProject, { kind: 'rates', patch: { netMeteringRegime: 'sie007_2026' } }, ctx);
assert.equal(switched.rates.gridUseChargeDOPPerKWh, 3.78, 'pasar a SIE-007 siembra el cargo de fábrica de la distribuidora');

// 10. Propuestas nuevas nacen en SIE-007; importadas sin el campo quedan en el régimen anterior.
const original = store.getState();
try {
  store.setState({ projects: [], activeProjectId: '', defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS } });
  store.getState().createNewProject({ name: 'Nueva', distributor: 'EDESUR', tariffCode: 'BTS1' } as never);
  const created = store.getState().projects[0];
  assert.equal(created.rates.netMeteringRegime, 'sie007_2026', 'propuesta nueva: régimen SIE-007');
  assert.equal(created.rates.gridUseChargeDOPPerKWh, 3.78, 'propuesta nueva: cargo de fábrica de su distribuidora');
  store.setState({ projects: [] });
  assert.equal(store.getState().importProjectsFromJSON({ client: { name: 'Antigua' }, specs: {}, rates: { distributor: 'EDESUR' } }).success, true);
  const imported = store.getState().projects[0];
  assert.equal(resolveAssumptions(imported).netMeteringRegime, 'legacy_retention', 'importada sin campo: régimen anterior');
  store.setState({ projects: [] });
  store.getState().importProjectsFromJSON({ client: { name: 'Con régimen' }, specs: {}, rates: { distributor: 'EDESUR', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.1 } });
  assert.equal(store.getState().projects[0].rates.netMeteringRegime, 'sie007_2026', 'importada con campo: lo conserva');
  assert.equal(store.getState().projects[0].rates.gridUseChargeDOPPerKWh, 3.1);
} finally {
  store.setState(original, true);
}

// 11. Borrador de IA: el nuevo nace en SIE-007; el campo del esquema se valida.
const draftBase = createAIProposalBase(BENCHMARK_PROJECT, DEFAULT_SIMULATION_SETTINGS, 'Santiago');
const draft = normalizeProposalDraft({ clientName: 'IA', distributor: 'EDENORTE', tariffCode: 'BTS-1', monthlyConsumptionKWh: Array(12).fill(300), consumptionSource: 'observed', panels: [], inverters: [], batteries: [] }, []);
const aiNew = prepareProposalDraftProject(draftBase, draft, DEFAULT_RD_TARIFF_MATRIX, { isNew: true });
assert.equal(aiNew.rates.netMeteringRegime, 'sie007_2026');
assert.equal(aiNew.rates.gridUseChargeDOPPerKWh, 4.02);
const aiExisting = prepareProposalDraftProject(project({ distributor: 'EDENORTE' }), draft, DEFAULT_RD_TARIFF_MATRIX, { isNew: false });
assert.equal(aiExisting.rates.netMeteringRegime, undefined, 'un borrador sobre una propuesta existente no cambia su régimen');
const explicitDraft = normalizeProposalDraft({ clientName: 'IA', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: Array(12).fill(300), consumptionSource: 'observed', netMeteringRegime: 'legacy_retention', gridUseChargeDOPPerKWh: 3.5, panels: [], inverters: [], batteries: [] }, []);
assert.equal(explicitDraft.netMeteringRegime, 'legacy_retention');
assert.equal(explicitDraft.gridUseChargeDOPPerKWh, 3.5);
const badDraft = normalizeProposalDraft({ clientName: 'IA', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: Array(12).fill(300), consumptionSource: 'observed', netMeteringRegime: 'nuevo', gridUseChargeDOPPerKWh: -1, panels: [], inverters: [], batteries: [] }, []);
assert.equal(badDraft.netMeteringRegime, undefined);
assert.equal(badDraft.gridUseChargeDOPPerKWh, undefined);
assert.ok(badDraft.validationIssues?.some((i) => i.code === 'invalid_net_metering_regime'));
assert.ok(badDraft.validationIssues?.some((i) => i.code === 'invalid_grid_use_charge'));

// 12. Herramientas de agentes: el campo existe y se valida.
assert.deepEqual(validateAssistantEdits([{ section: 'rates', field: 'netMeteringRegime', value: 'sie007_2026' }], 'project'), [{ section: 'rates', field: 'netMeteringRegime', value: 'sie007_2026' }]);
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'netMeteringRegime', value: 'sie007' }], 'project'));
assert.deepEqual(validateAssistantEdits([{ section: 'rates', field: 'gridUseChargeDOPPerKWh', value: 4.5 }], 'project'), [{ section: 'rates', field: 'gridUseChargeDOPPerKWh', value: 4.5 }]);
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'gridUseChargeDOPPerKWh', value: 500 }], 'project'));
const createTool = AGENT_TOOL_DEFINITIONS.find((t) => t.name === 'create_proposal');
assert.deepEqual((createTool?.inputSchema as any).properties.netMeteringRegime.enum, ['legacy_retention', 'sie007_2026']);

// 13. Nota regulatoria: en SIE-007 describe el cargo por kWh inyectado con su valor; el régimen anterior no cambia.
const sieNote = regulatoryNoteDefault(createDocumentTextContext({ distributor: 'EDESUR', tariffCode: 'BTS1', gridExportFeePct: 25, netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 }));
const p4 = sieNote.split('\n\n')[3];
assert.ok(p4.includes('RD$3.78 por kWh inyectado'), p4);
assert.ok(p4.includes('SIE-007-2026-REG'));
assert.ok(!p4.includes('25%'), p4);
assert.ok(sieNote.includes('estimado'), 'la nota advierte que el cargo es estimado');
const btdSieNote = regulatoryNoteDefault(createDocumentTextContext({ distributor: 'EDESUR', tariffCode: 'BTD', gridExportFeePct: 25, netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 })).split('\n\n')[3];
assert.ok(btdSieNote.includes('no aplica el cargo por derecho de uso de la red') && !btdSieNote.includes('descuenta un 25%'), btdSieNote);
const legacyNote = regulatoryNoteDefault(createDocumentTextContext({ distributor: 'EDESUR', tariffCode: 'BTS1', gridExportFeePct: 25 }));
assert.ok(legacyNote.includes('equivalente al 25% del valor de la energía excedente exportada'));

// 14. Selector de régimen: función de este equipo, visible por defecto; no toca la política de la organización.
const selector = DEVICE_APPLICATION_FEATURES.find((f) => f.id === 'netMeteringRegimeSelector');
assert.ok(selector && selector.defaultEnabled === true && selector.available);
assert.ok(!APPLICATION_FEATURES.some((f) => (f.id as string) === 'netMeteringRegimeSelector'));

console.log('SIE-007-2026: régimen por propuesta, cargo por kWh inyectado en tarifas de un precio y régimen anterior intacto.');
