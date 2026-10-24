import assert from 'node:assert/strict';
import { AUTOMATED_PRICING, enforceAutomatedPricing } from '../../shared/automatedProposalPolicy';
import { normalizeCommercial } from '../../shared/aiProposalCommercial';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { createAIProposalBase, prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateFinancialSummary, resolveAnnualDegradationPct } from '../engine/financeEngine';
import { DEFAULT_SIMULATION_SETTINGS, migrateDefaultSimulationSettings } from '../store/defaultSimulationSettings';
import { useSimulationStore } from '../store/useSimulationStore';
import { ASSISTANT_EDITABLE_FIELDS } from '../features/assistant/validation';
import { catalogPanelGroupPatch } from '../utils/catalogGroupPatch';
import { assistantOwner, executeAssistantTool, applyAssistantAction } from '../features/assistant/tools';

// 1. Policy helper: automation always quotes in Simple (catalog) mode with the cost matrix.
assert.deepEqual(AUTOMATED_PRICING, { isDetailed: false, pricingMode: 'cost_matrix' });
const forced = enforceAutomatedPricing({ ...BENCHMARK_PROJECT.specs, isDetailed: true, pricingMode: 'direct_watt' as const });
assert.equal(forced.isDetailed, false);
assert.equal(forced.pricingMode, 'cost_matrix');

// 2. Factory default and migration of inherited preferences.
assert.equal(DEFAULT_SIMULATION_SETTINGS.defaultPricingMode, 'matrix');
const inherited = migrateDefaultSimulationSettings({ ...DEFAULT_SIMULATION_SETTINGS, defaultPricingMode: 'direct' });
assert.equal(inherited.defaultPricingMode, 'matrix', 'a saved "direct" that was never chosen explicitly migrates');
const chosen = migrateDefaultSimulationSettings({ ...DEFAULT_SIMULATION_SETTINGS, defaultPricingMode: 'direct', pricingModeChosenByUser: true });
assert.equal(chosen.defaultPricingMode, 'direct', 'an explicit choice is preserved');
assert.equal(migrateDefaultSimulationSettings(inherited), inherited, 'migration is idempotent and allocation-free when nothing changes');

// 3. AI proposal base and draft adapter ignore per-W pricing even when preferences say "direct".
const directDefaults = { ...DEFAULT_SIMULATION_SETTINGS, defaultPricingMode: 'direct' as const, pricingModeChosenByUser: true };
const base = createAIProposalBase(BENCHMARK_PROJECT, directDefaults, 'Santiago');
assert.equal(base.specs.isDetailed, false);
assert.equal(base.specs.pricingMode, 'cost_matrix');

const state = useSimulationStore.getState();
const catalog = structuredClone(state.equipmentCatalog);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.supplierPrices = [{ id: 'sp-qa-panel', supplierName: 'Proveedor QA', priceUSD: 95, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
inverter.supplierPrices = [{ id: 'sp-qa-inv', supplierName: 'Proveedor QA', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
const context = { province: 'Santiago', annualSpecificYieldKWhPerKWp: 1500, tariffReference: buildAITariffContext(state.tariffMatrix) };
const raw = { clientName: 'QA catálogo', province: 'Santiago', distributor: 'EDESUR', tariffCode: 'BTS2', averageMonthlyKWh: 600,
  panels: [{ equipmentId: panel.id, quantity: 12 }], inverters: [{ equipmentId: inverter.id, quantity: 1 }], batteries: [], hasBattery: false,
  commercial: { pricingMode: 'direct_watt', pricePerWattUSD: 1.2, markupPct: 30 } };
const draft = normalizeProposalDraft(raw, catalog, context);
assert.equal(draft.commercial?.pricingMode, 'cost_matrix', 'AI cannot select per-W pricing');
assert(draft.validationIssues?.some((i) => i.code === 'automated_pricing_forced' && i.severity === 'warning'));
const prepared = prepareProposalDraftProject(base, { ...draft, pricingMode: 'direct_watt' }, state.tariffMatrix, { isNew: true });
assert.equal(prepared.specs.pricingMode, 'cost_matrix');
assert.equal(prepared.specs.isDetailed, false);
assert.equal(prepared.specs.panels?.[0].id, panel.id, 'equipment comes from real catalog ids');

// 4. Commercial normalization: per-W becomes the cost matrix with a warning, never an error.
const issues: string[] = [];
const normalized = normalizeCommercial({ pricingMode: 'direct_watt', pricePerWattUSD: 0 }, undefined, (code) => issues.push(code));
assert.equal(normalized.pricingMode, 'cost_matrix');
assert.deepEqual(issues.filter((c) => c === 'invalid_direct_price'), [], 'per-W price is irrelevant once forced to the matrix');

// 5. The engine prices the forced specs through the cost matrix, not price-per-W.
const summary = calculateFinancialSummary(prepared.client.province, prepared.specs, prepared.rates, prepared.financials, prepared.monthlyConsumption);
const dcKWp = (prepared.specs.panels || []).reduce((sum, g) => sum + g.powerW * g.count / 1000, 0);
const perW = Math.round(dcKWp * 1000 * (prepared.specs.pricePerWattUSD || 1.13) * 100) / 100;
assert.notEqual(summary.grossInvestmentUSD, perW, 'gross investment is not the price-per-W total');

// 6. Degradation in Simple mode follows the catalog panels, then the configured value, then the shared default (0.4 %, ADR 0003; before it was a 0.5 % literal).
const groupSpecs = { ...BENCHMARK_PROJECT.specs, isDetailed: false, annualDegradation: 0.4,
  panels: [{ id: 'a', brandModel: 'A', powerW: 600, count: 10, annualDegradation: 0.3 }, { id: 'b', brandModel: 'B', powerW: 400, count: 10, annualDegradation: 0.55 }] };
assert(Math.abs(resolveAnnualDegradationPct(groupSpecs) - 0.4) < 1e-9, 'DC-weighted average of catalog panel degradation');
assert.equal(resolveAnnualDegradationPct({ ...groupSpecs, panels: undefined }), 0.4, 'falls back to the configured degradation');
assert.equal(resolveAnnualDegradationPct({ ...groupSpecs, panels: undefined, annualDegradation: undefined as unknown as number }), 0.4); // ADR 0003: el default de degradación es uno solo (0.4 %), el de los ajustes de fábrica; antes el motor usaba 0.5 %
assert.equal(resolveAnnualDegradationPct({ ...groupSpecs, isDetailed: true, annualDegradation: 0.7 }), 0.7, 'detailed mode is unchanged');

// 7. Agents cannot switch a proposal to per-W pricing.
for (const field of ['isDetailed', 'pricingMode', 'pricePerWattUSD', 'pricePerKWpUSD', 'directPriceSurplusTarget']) {
  assert(!ASSISTANT_EDITABLE_FIELDS.specs.includes(field), `${field} is not agent-editable`);
}

// 8. Selecting another catalog panel replaces model-specific values (no stale degradation in Simple mode).
const fast = { ...panel, id: 'p-fast', displayName: 'Panel rápido', powerW: 600, annualDegradation: 0.8, efficiencyPct: 21 };
const slow = { ...panel, id: 'p-slow', displayName: 'Panel lento', powerW: 600, annualDegradation: 0.25, efficiencyPct: undefined };
const group = { id: 'g', count: 10, ...catalogPanelGroupPatch(fast) };
const switched = { ...group, ...catalogPanelGroupPatch(slow) };
assert.equal(switched.annualDegradation, 0.25);
assert.equal(switched.efficiencyPct, undefined, 'missing catalog values do not inherit the previous model');
assert.equal(resolveAnnualDegradationPct({ ...BENCHMARK_PROJECT.specs, isDetailed: false, panels: [switched] }), 0.25);

// 9. General-assistant pricing edits on a per-W proposal also move it to the cost matrix, visibly in the plan.
const perWProject = { ...structuredClone(BENCHMARK_PROJECT), id: 'perw', syncStatus: 'local_only' as const,
  specs: { ...structuredClone(BENCHMARK_PROJECT.specs), isDetailed: true, pricingMode: 'direct_watt' as const } };
useSimulationStore.setState({ appAssistantEnabled: true, workspaceScope: 'local', projects: [perWProject], activeProjectId: perWProject.id,
  activeView: 'simulator', syncSettings: { ...state.syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false }, sessionGeneration: 0 });
const owner = assistantOwner();
const plan = executeAssistantTool({ name: 'propose_project_update', args: { id: perWProject.id, edits: [{ section: 'specs', field: 'saleMarginMultiplier', value: 1.3 }] } }, owner).action!;
assert(plan.edits.some((e) => e.field === 'pricingMode' && e.value === 'cost_matrix'), 'the confirmation shows the pricing change');
applyAssistantAction(plan);
const updated = useSimulationStore.getState().getActiveProject();
assert.equal(updated.specs.pricingMode, 'cost_matrix');
assert.equal(updated.specs.isDetailed, false);
const clientOnly = executeAssistantTool({ name: 'propose_project_update', args: { id: perWProject.id, edits: [{ section: 'client', field: 'contactPhone', value: '809-000-0000' }] } }, owner).action!;
assert(!clientOnly.edits.some((e) => e.field === 'pricingMode'), 'non-pricing edits leave the mode untouched');

console.log('PASS: automated proposals quote in catalog mode with the cost matrix; defaults migrate; degradation follows the catalog.');
