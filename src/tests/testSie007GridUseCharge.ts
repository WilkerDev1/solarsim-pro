import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary, flatSinglePriceTariff } from '../engine/financeEngine';
import { calculateBillingYear, calculateMonthlyBill } from '../../shared/tariffBilling';
import { migrateLegacySpecs } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import {
  FACTORY_GRID_USE_CHARGES, NEW_PROPOSAL_NET_METERING_REGIME, SAVED_PROPOSAL_NET_METERING_REGIME, gridUseChargeApplies,
  chargeRoundsToZero, parseGridUseChargeInput, resolveNetMetering, resolveNetMeteringRegime,
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
import { APPLICATION_FEATURES, DEFAULT_FEATURE_SETTINGS, DEVICE_APPLICATION_FEATURES, isCompatibleFeatureSettings, isFeatureSettings, netMeteringRegimeSelectorVisible, normalizeFeatureSettings } from '../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../features/application/featurePolicy';
import { featureScope } from '../../shared/applicationFeatures';
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

/** Ahorro mensual esperado con precio escalar en SIE-007: la misma facturación neta que el motor (`engineBlockBilling`). */
function assertFlatNetBilling(summary: ReturnType<typeof calculateProjectFinancialSummary>, distributor: string, priceUSD: number, chargeDOP: number, fx: number, label: string) {
  const tariff = flatSinglePriceTariff({ distributor }, priceUSD * fx);
  const months = summary.monthlyBreakdown;
  const year = calculateBillingYear(tariff, months.map((m) => ({ withdrawnKWh: Math.max(0, Math.round((m.consumptionKWh - m.solarSelfConsumedKWh) * 1e9) / 1e9), injectedKWh: m.gridExportedKWh })), { gridUseChargeDOPPerKWh: chargeDOP, settlementDOPPerKWh: 0 });
  months.forEach((m, i) => {
    const before = r2(calculateMonthlyBill({ tariff, withdrawnKWh: m.consumptionKWh }).totalDOP / fx);
    const after = r2(year.months[i].totalDOP / fx);
    assert.equal(m.savingsUSD, r2(before - after), `${label} ${m.month}: factura sin − con sistema a precio único`);
  });
}

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
    });
    // Precio escalar en SIE-007: factura sin sistema − factura con sistema a precio único, con neteo, arrastre del
    // crédito y liquidación anual del remanente (de fábrica 0): el excedente no se paga al precio de venta.
    assertFlatNetBilling(sie, distributor, 0.111, charge, 60, `${distributor} ${mode}`);
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
  }
  assertFlatNetBilling(btd, 'EDESUR', 0.15, 0, 60, `BTD ${mode}`);
  // Sin excedente anual (sistema menor que el consumo) la ausencia de retención favorece a SIE-007.
  const btdFit = calculateProjectFinancialSummary(project({ ...btdRates, netMeteringRegime: 'sie007_2026' }, 3000, { panelCount: 30, inverterPowerKW: 15, inverterCount: 1 }), mode);
  const btdFitLegacy = calculateProjectFinancialSummary(project(btdRates, 3000, { panelCount: 30, inverterPowerKW: 15, inverterCount: 1 }), mode);
  assert.ok(btdFit.year1SavingsUSD > btdFitLegacy.year1SavingsUSD, 'BTD: sin retención del 25 %');
  // Con excedente anual, el remanente se liquida (0 de fábrica): no supera la factura sin sistema.
  assert.ok(btd.year1SavingsUSD <= 3000 * 12 * 0.15 + 0.01, 'BTD sobredimensionado: ahorro ≤ factura sin sistema');
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
  store.getState().createNewProject({ name: 'Nueva', company: 'Cliente', province: 'Santiago', distributor: 'EDESUR', tariffCode: 'BTS1' });
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

// 14. Selector de régimen: política de la organización (local sin sesión), visible por defecto; ya no es del equipo.
const selector = APPLICATION_FEATURES.find((f) => f.id === 'netMeteringRegimeSelector');
assert.ok(selector && selector.defaultEnabled === true && selector.available && selector.stage === 'beta');
assert.ok(!DEVICE_APPLICATION_FEATURES.some((f) => (f.id as string) === 'netMeteringRegimeSelector'));
assert.deepEqual(DEFAULT_FEATURE_SETTINGS, { selfConsumptionProjection: false, netMeteringRegimeSelector: true, quotations: true });
// Política de una sola clave (API o cliente anteriores): se lee y el selector queda visible.
assert.deepEqual(normalizeFeatureSettings({ selfConsumptionProjection: true }), { selfConsumptionProjection: true, netMeteringRegimeSelector: true, quotations: true });
assert.equal(isCompatibleFeatureSettings({ selfConsumptionProjection: false }), true);
assert.equal(isCompatibleFeatureSettings({ selfConsumptionProjection: false, netMeteringRegimeSelector: false }), true);
assert.equal(isCompatibleFeatureSettings({ selfConsumptionProjection: false, other: true }), false);
// Al guardar solo vale la forma completa (hoy tres claves, con `quotations`): un cliente anterior no puede sobrescribir las claves nuevas.
assert.equal(isFeatureSettings({ selfConsumptionProjection: true }), false);
assert.equal(isFeatureSettings({ selfConsumptionProjection: true, netMeteringRegimeSelector: false }), false);
assert.equal(isFeatureSettings({ selfConsumptionProjection: true, netMeteringRegimeSelector: false, quotations: true }), true);
assert.equal(netMeteringRegimeSelectorVisible(DEFAULT_FEATURE_SETTINGS), true);
assert.equal(netMeteringRegimeSelectorVisible({ selfConsumptionProjection: false, netMeteringRegimeSelector: false, quotations: true }), false);
{
  const snapshot = store.getState();
  try {
    // Sin sesión: preferencia local (por defecto visible).
    store.setState({ syncSettings: { ...snapshot.syncSettings, currentUser: null, authToken: null }, localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS } });
    assert.equal(netMeteringRegimeSelectorVisible(effectiveFeatureSettings(store.getState())), true);
    // Con sesión y sin política consultada: valor por defecto (visible).
    const user = { id: 'u', name: 'QA', email: 'qa@example.invalid', role: 'ADMIN' as const, organizationId: 'org-x' };
    store.setState({ syncSettings: { ...snapshot.syncSettings, serverUrl: 'https://qa.example.invalid', authToken: 't', currentUser: user }, organizationFeaturePolicies: {} });
    assert.equal(netMeteringRegimeSelectorVisible(effectiveFeatureSettings(store.getState())), true);
    // La política de la organización manda.
    store.setState({ organizationFeaturePolicies: { [featureScope('https://qa.example.invalid', 'org-x')]: { organizationId: 'org-x', version: 3, settings: { selfConsumptionProjection: false, netMeteringRegimeSelector: false, quotations: true } } } });
    assert.equal(netMeteringRegimeSelectorVisible(effectiveFeatureSettings(store.getState())), false);
  } finally {
    store.setState(snapshot, true);
  }
}

// 15. (B) Borrador de IA: un nuevo en `legacy_retention` no gana cargo; sobre una propuesta SIE-007 existente, cambiar
// de distribuidora lleva el cargo de fábrica al de la nueva (misma regla que la edición).
const legacyDraft = normalizeProposalDraft({ clientName: 'IA', distributor: 'EDENORTE', tariffCode: 'BTS1', monthlyConsumptionKWh: Array(12).fill(300), consumptionSource: 'observed', netMeteringRegime: 'legacy_retention', panels: [], inverters: [], batteries: [] }, []);
const aiLegacyNew = prepareProposalDraftProject(draftBase, legacyDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: true });
assert.equal(aiLegacyNew.rates.netMeteringRegime, 'legacy_retention');
assert.equal(aiLegacyNew.rates.gridUseChargeDOPPerKWh, undefined, 'régimen anterior explícito: sin cargo sembrado');
const sieExisting = project({ distributor: 'EDESUR', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 });
assert.equal(prepareProposalDraftProject(sieExisting, draft, DEFAULT_RD_TARIFF_MATRIX, { isNew: false }).rates.gridUseChargeDOPPerKWh, 4.02, 'EDESUR → EDENORTE: cargo de fábrica de la nueva');
assert.equal(prepareProposalDraftProject({ ...sieExisting, rates: { ...sieExisting.rates, gridUseChargeDOPPerKWh: 3.3 } }, draft, DEFAULT_RD_TARIFF_MATRIX, { isNew: false }).rates.gridUseChargeDOPPerKWh, 3.3, 'cargo editado se conserva');

// 16. (C, F) Edición: un cargo no numérico se descarta; fuera de rango se acota a 0–100.
const sieEdit = project({ distributor: 'EDESUR', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.5 });
assert.equal(applyProjectEdit(sieEdit, { kind: 'rates', patch: { gridUseChargeDOPPerKWh: -2 } }, ctx).rates.gridUseChargeDOPPerKWh, 0);
assert.equal(applyProjectEdit(sieEdit, { kind: 'rates', patch: { gridUseChargeDOPPerKWh: 500 } }, ctx).rates.gridUseChargeDOPPerKWh, 100);
assert.equal(applyProjectEdit(sieEdit, { kind: 'rates', patch: { gridUseChargeDOPPerKWh: NaN } }, ctx).rates.gridUseChargeDOPPerKWh, 3.5, 'NaN se descarta');
assert.equal(applyProjectEdit(sieEdit, { kind: 'rates', patch: { gridUseChargeDOPPerKWh: '4' as never } }, ctx).rates.gridUseChargeDOPPerKWh, 3.5, 'texto se descarta');
// SIE-007 (EDESUR, fábrica) → anterior → cambio a EDENORTE → SIE-007: el cargo es el de EDENORTE, no el de EDESUR.
let chain = applyProjectEdit(project({ distributor: 'EDESUR', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 }), { kind: 'rates', patch: { netMeteringRegime: 'legacy_retention' } }, ctx);
chain = applyProjectEdit(chain, { kind: 'rates', patch: { distributor: 'EDENORTE' } }, ctx);
chain = applyProjectEdit(chain, { kind: 'rates', patch: { netMeteringRegime: 'sie007_2026' } }, ctx);
assert.equal(chain.rates.gridUseChargeDOPPerKWh, 4.02);
// Cambiar la distribuidora impresa del cliente (client.distributor) no toca el cargo: el cálculo lee rates.distributor.
assert.equal(applyProjectEdit(sieEdit, { kind: 'client', patch: { distributor: 'EDENORTE' } }, ctx).rates.gridUseChargeDOPPerKWh, 3.5);

// 16b. El régimen anterior no gana el campo (ni con un cargo en el mismo cambio) salvo que ya existiera.
const legacyNoField = applyProjectEdit(project({ distributor: 'EDESUR' }), { kind: 'rates', patch: { netMeteringRegime: 'legacy_retention', gridUseChargeDOPPerKWh: 5 } }, ctx);
assert.equal('gridUseChargeDOPPerKWh' in legacyNoField.rates && legacyNoField.rates.gridUseChargeDOPPerKWh !== undefined, false, 'régimen anterior sin campo: no lo gana');
assert.equal(applyProjectEdit(project({ distributor: 'EDESUR', gridUseChargeDOPPerKWh: 3 }), { kind: 'rates', patch: { gridUseChargeDOPPerKWh: 5 } }, ctx).rates.gridUseChargeDOPPerKWh, 5, 'régimen anterior con campo existente: se edita');
// Un borrador nuevo en el régimen anterior no hereda el cargo de la plantilla base.
const baseWithCharge = { ...draftBase, rates: { ...draftBase.rates, gridUseChargeDOPPerKWh: 3.3 } };
assert.equal(prepareProposalDraftProject(baseWithCharge, legacyDraft, DEFAULT_RD_TARIFF_MATRIX, { isNew: true }).rates.gridUseChargeDOPPerKWh, undefined, 'borrador nuevo anterior: sin cargo heredado');
assert.equal(prepareProposalDraftProject(baseWithCharge, draft, DEFAULT_RD_TARIFF_MATRIX, { isNew: true }).rates.gridUseChargeDOPPerKWh, 4.02, 'borrador nuevo SIE-007: cargo de fábrica, no el de la plantilla');
// 16c. Un `gridUseChargeDOPPerKWh: undefined` explícito es «sin cambio»: no borra un cargo manual ni lo resiembra.
const manual = project({ distributor: 'EDESUR', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.3 });
assert.equal(applyProjectEdit(manual, { kind: 'rates', patch: { distributor: 'EDENORTE', gridUseChargeDOPPerKWh: undefined } }, ctx).rates.gridUseChargeDOPPerKWh, 3.3);
assert.equal(applyProjectEdit(manual, { kind: 'rates', patch: { targetCoveragePct: 90, gridUseChargeDOPPerKWh: undefined } }, ctx).rates.gridUseChargeDOPPerKWh, 3.3);

// 17. (E) Nota SIE-007 con inyección cero o con cargo 0: sin «RD$0.00 por kWh… estimado».
const zeroExportNote = regulatoryNoteDefault(createDocumentTextContext({ distributor: 'EDESUR', tariffCode: 'BTS1', isZeroExport: true, netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 })).split('\n\n')[3];
assert.ok(/antivertido/.test(zeroExportNote) && /autoconsumo/.test(zeroExportNote) && !zeroExportNote.includes('por kWh inyectado'), zeroExportNote);
const zeroChargeNote = regulatoryNoteDefault(createDocumentTextContext({ distributor: 'EDESUR', tariffCode: 'BTS1', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 0 })).split('\n\n')[3];
assert.ok(!zeroChargeNote.includes('RD$0.00') && !zeroChargeNote.includes('estimado'), zeroChargeNote);
assert.ok(zeroChargeNote.includes('no considera'), zeroChargeNote);

// 17b. Un cargo positivo que redondea a 0.00 se trata como 0 (mismo umbral en la nota y en el dock).
const tinyNote = regulatoryNoteDefault(createDocumentTextContext({ distributor: 'EDESUR', tariffCode: 'BTS1', netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 0.004 })).split('\n\n')[3];
assert.ok(!tinyNote.includes('RD$0.00') && tinyNote.includes('no considera'), tinyNote);
assert.equal(chargeRoundsToZero(0.004), true);
assert.equal(chargeRoundsToZero(0.005), false);
assert.equal(chargeRoundsToZero(0), true);
// (9) Texto del campo del dock: vacío o a medio escribir no se guarda (no se convierte en 0 en silencio).
for (const text of ['', ' ', '.', '-', 'abc']) assert.equal(parseGridUseChargeInput(text), undefined, JSON.stringify(text));
assert.equal(parseGridUseChargeInput('3.'), 3);
assert.equal(parseGridUseChargeInput('0'), 0);
assert.equal(parseGridUseChargeInput('-4'), 0);
assert.equal(parseGridUseChargeInput('250'), 100);

// 18. (K) Las herramientas de catálogo no pueden editar el régimen ni el cargo.
assert.throws(() => validateAssistantEdits([{ section: 'equipment', field: 'netMeteringRegime', value: 'sie007_2026' }], 'equipment'));
assert.throws(() => validateAssistantEdits([{ section: 'equipment', field: 'gridUseChargeDOPPerKWh', value: 3 }], 'equipment'));
assert.throws(() => validateAssistantEdits([{ section: 'rates', field: 'netMeteringRegime', value: 'sie007_2026' }], 'equipment'));
assert.throws(() => validateAssistantEdits([{ section: 'client', field: 'netMeteringRegime', value: 'sie007_2026' }], 'project'));

console.log('SIE-007-2026: régimen por propuesta, cargo por kWh inyectado en tarifas de un precio y régimen anterior intacto.');
