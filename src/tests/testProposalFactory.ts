// F2b: fábrica única de propuesta nueva (ADR 0009). Las tres vías de creación («Nueva simulación», asistente de propuestas y
// `create_proposal` del asistente flotante y de los agentes) nacen de `createNewProposal` con los valores que decidió el dueño:
// sin datos, 1.000 kWh/mes marcados como estimados; factor 1,40 (el «Margen bruto objetivo» de Ajustes, cuyo valor de
// fábrica pasa a 40 %); mano de obra 170 USD/kWp; la tarifa de referencia de la distribuidora a ese consumo; y nada del
// caso de referencia (ni coordenadas, ni datos del cliente, ni baterías).
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_SIMULATION_SETTINGS, DEFAULT_TARGET_MARGIN_PCT } from '../store/defaultSimulationSettings';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { buildProjectFromDraft } from '../store/slices/aiSlice';
import { assistantOwner } from '../features/assistant/tools';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { readEquipment } from '../../shared/equipment';
import { createNewProposal, isConsumptionEstimated, NEW_PROPOSAL_DEFAULTS } from '../domain/newProposal';
import { SIZING_ASSUMPTIONS, recommendInverterCount } from '../domain/sizing';
import { proposalCompleteness } from '../domain/proposalCompleteness';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import type { ProjectSimulation } from '../types';

const store = useSimulationStore;
const s = () => store.getState();
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.supplierPrices = [{ id: 'sp-p', supplierName: 'QA', priceUSD: 95, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
inverter.supplierPrices = [{ id: 'sp-i', supplierName: 'QA', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
const original = { ...structuredClone(BENCHMARK_PROJECT), id: 'factory-original', syncStatus: 'local_only' as const };
const reset = (defaults = DEFAULT_SIMULATION_SETTINGS, equipment = catalog) => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(original)], activeProjectId: original.id, activeView: 'dashboard',
  equipmentCatalog: structuredClone(equipment), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0, defaultSimulationSettings: defaults,
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const flat = (value: number) => Array(12).fill(value) as number[];
const reference = (distributor: string, tariffCode: string, monthly: number) =>
  getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, distributor, tariffCode, monthly, 60);

// 1. Valores decididos, declarados en un solo sitio.
assert.equal(NEW_PROPOSAL_DEFAULTS.monthlyConsumptionKWh, 1000);
assert.equal(NEW_PROPOSAL_DEFAULTS.laborUSDPerKWp, 170);
assert.equal(DEFAULT_TARGET_MARGIN_PCT, 40, 'el valor de fábrica del margen objetivo equivale al factor 1,40');
assert.equal(DEFAULT_SIMULATION_SETTINGS.defaultTargetMarginPct, 40);

// 2. La fábrica pura: sin datos nace con el consumo estimado, marcado como tal, y sin nada del caso de referencia.
const pure = createNewProposal({
  source: 'menu', defaults: DEFAULT_SIMULATION_SETTINGS, tariffMatrix: DEFAULT_RD_TARIFF_MATRIX, catalog,
  identity: { id: 'p-new', now: '2026-11-28T12:00:00.000Z', sequence: { projectId: 'SP-2026-001', quoteNumber: 'C-0001' } },
});
assert.equal(pure.id, 'p-new');
assert.equal(pure.createdAt, '2026-11-28T12:00:00.000Z');
assert.deepEqual(pure.monthlyConsumption, flat(1000));
assert.deepEqual(pure.consumptionEstimate, { kind: 'factory_default', monthlyKWh: 1000 }, 'la marca de estimado vive en la propuesta');
assert.equal(pure.specs.saleMarginMultiplier, 1.4);
assert.equal(pure.specs.installationUnitPriceUSD, 170);
assert.equal(pure.client.coordinates, undefined);
assert.equal(pure.client.name, 'Nuevo Proyecto Solar');
for (const field of ['company', 'address', 'contactPhone', 'contactEmail', 'contactPerson'] as const) assert.equal(pure.client[field], '', `sin ${field} del ejemplo`);
for (const field of ['nic', 'nis', 'rnc', 'contractNumber', 'meterNumber', 'circuit'] as const) assert.equal(pure.client[field], undefined, `sin ${field} del ejemplo`);
assert.equal(pure.specs.hasBattery, false);
assert.deepEqual(readEquipment(pure.specs).batteries, [], 'sin batería en uso');
// La batería de Ajustes (no la del caso de referencia) queda en su grupo, oculta y sin precio: encenderla no inventa uno.
assert.deepEqual(pure.specs.batteries?.map((g) => [g.brandModel, g.capacityKWh, g.dodPct, g.unitPriceUSD]), [['Batería 16.08 kWh', 16.08, 90, undefined]], 'sin baterías heredadas');
assert.equal(pure.specs.sizingBasis, 'peak_month', 'las propuestas nuevas se dimensionan con el mes pico');
assert.equal(pure.rates.energyRateSource, 'reference');
assert.equal(pure.rates.energyCostPerKWh, reference('EDEESTE', 'BTS2', 1000), 'tarifa de referencia de la distribuidora a 1.000 kWh/mes');
assert.ok(pure.rates.billingTariff, 'con la fila de la tarifa (factura por bloques)');
assert.equal(pure.rates.netMeteringRegime, 'sie007_2026');
assert.equal(pure.financials.customCostUSD, undefined);
assert.equal(pure.financials.customITBISSavedUSD, undefined);
// Equipos: el panel de los ajustes no está en el catálogo, así que se elige el que tiene oferta; el inversor de los ajustes sí está.
const { panels, inverters } = readEquipment(pure.specs);
assert.equal(panels.length, 1);
assert.equal(panels[0].catalogItemId, panel.id);
assert.equal(panels[0].unitPriceUSD, 95);
assert.equal(panels[0].priceSource, 'supplier');
assert.equal(inverters[0].catalogItemId, inverter.id);
assert.equal(inverters[0].unitPriceUSD, 1400);
// Dimensionado: paneles con la base «mes pico» (12 × 1000) e inversor por relación DC/AC 1,20.
const dcKWp = panels[0].count * panels[0].powerW / 1000;
assert.equal(inverters[0].count, recommendInverterCount({ dcKWp, unitPowerKW: inverters[0].powerKW }).count);
assert.equal(SIZING_ASSUMPTIONS.targetDcAcRatio, 1.2);
assert.deepEqual(proposalCompleteness(pure), { incomplete: false, reasons: [] }, 'con precios en el catálogo nace completa');

// 3. Sin precio en el catálogo: nunca se inventa; la propuesta nace incompleta, con el motivo.
const unpriced = createNewProposal({
  source: 'menu', defaults: DEFAULT_SIMULATION_SETTINGS, tariffMatrix: DEFAULT_RD_TARIFF_MATRIX, catalog: DEFAULT_EQUIPMENT_CATALOG,
  identity: { id: 'p-unpriced', now: '2026-11-28T12:00:00.000Z', sequence: { projectId: 'SP-2026-002', quoteNumber: 'C-0002' } },
});
assert.ok(readEquipment(unpriced.specs).panels.every((g) => g.unitPriceUSD === undefined));
const gap = proposalCompleteness(unpriced);
assert.equal(gap.incomplete, true);
assert.ok(gap.reasons.some((r) => r.code === 'missing_equipment_price'), JSON.stringify(gap));

// 4. Las tres vías dan los mismos valores por defecto.
reset();
s().createNewProject('Solo nombre');
const manual = s().getActiveProject();
const draft = normalizeProposalDraft({ clientName: 'Asistente de propuestas', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', averageMonthlyKWh: 700,
  panels: [{ equipmentId: panel.id, quantity: 12 }], inverters: [{ equipmentId: inverter.id, quantity: 1 }], batteries: [], hasBattery: false,
  commercial: { priceBasis: 'purchase', markupPct: null, marginOnSalePct: null, installationUnitPriceUSD: null, installationTotalUSD: null, customItems: [], customDiscounts: [] } },
catalog, { province: 'Santiago', annualSpecificYieldKWhPerKWp: 1500, tariffReference: buildAITariffContext(s().tariffMatrix) });
// El asistente de propuestas construye con buildProjectFromDraft (lo que aplica su «Aplicar»; F6 retira el modal).
const fromDraft = () => { const built = buildProjectFromDraft(s(), draft, true); if ('error' in built) throw new Error(built.error); return built.project; };
const proposalAssistant = fromDraft();
const created = await executeAgentTool({ name: 'create_proposal', args: { clientName: 'Flotante', distributor: 'EDENORTE', tariffCode: 'BTS1', averageMonthlyKWh: 700,
  panels: [{ catalogItemId: panel.id, count: 12 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, { source: 'app-assistant', owner: assistantOwner() });
assert.equal(created.status, 'applied', JSON.stringify(created));
const floating = s().projects.find((p) => p.id === (created.data as { proposalId: string }).proposalId)!;

const defaults = (p: ProjectSimulation) => ({ factor: p.specs.saleMarginMultiplier, labor: p.specs.installationUnitPriceUSD, coordinates: p.client.coordinates,
  hasBattery: p.specs.hasBattery, regime: p.rates.netMeteringRegime, source: p.rates.energyRateSource, coverage: p.rates.targetCoveragePct, sizingBasis: p.specs.sizingBasis });
const decided = { factor: 1.4, labor: 170, coordinates: undefined, hasBattery: false, regime: 'sie007_2026', source: 'reference', coverage: 95, sizingBasis: 'peak_month' };
for (const [label, p] of [['Nueva simulación', manual], ['asistente de propuestas', proposalAssistant], ['create_proposal', floating]] as const)
  assert.deepEqual(defaults(p), decided, `${label}: valores por defecto decididos`);
assert.deepEqual(manual.monthlyConsumption, flat(1000));
assert.ok(isConsumptionEstimated(manual), '«Nueva simulación» sin datos: consumo estimado');
assert.equal(proposalAssistant.consumptionEstimate, undefined, 'con consumo indicado no hay marca de estimado de fábrica');
assert.equal(isConsumptionEstimated(proposalAssistant), false);
assert.equal(manual.rates.energyCostPerKWh, reference('EDEESTE', 'BTS2', 1000));
assert.equal(proposalAssistant.rates.energyCostPerKWh, reference('EDENORTE', 'BTS1', 700), 'la tarifa de la distribuidora elegida al consumo de la propuesta');
assert.equal(floating.rates.energyCostPerKWh, proposalAssistant.rates.energyCostPerKWh);
// Mismo contrato por el asistente de propuestas y por create_proposal (mismos equipos, mismo consumo, misma fábrica).
assert.equal(calculateProjectFinancialSummary(floating).contractPriceUSD, calculateProjectFinancialSummary(proposalAssistant).contractPriceUSD);

// 5. Con ajustes propios: el margen objetivo de Ajustes manda en todas las vías (antes «Nueva simulación» lo ignoraba).
reset({ ...DEFAULT_SIMULATION_SETTINGS, defaultTargetMarginPct: 33 });
s().createNewProject({ name: 'Con ajustes', company: 'ACME' });
const customManual = s().getActiveProject();
assert.equal(customManual.specs.saleMarginMultiplier, 1.33);
assert.equal(customManual.client.company, 'ACME');
assert.equal(fromDraft().specs.saleMarginMultiplier, 1.33);

// 6. «Crea una propuesta» sin consumo: ya no es un error; nace con el consumo estimado y lo avisa.
reset();
const noConsumption = await executeAgentTool({ name: 'create_proposal', args: { clientName: 'X', distributor: 'EDESUR', tariffCode: 'BTS1',
  panels: [{ catalogItemId: panel.id, count: 4 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, { source: 'app-assistant', owner: assistantOwner() });
assert.equal(noConsumption.status, 'applied', JSON.stringify(noConsumption));
const estimated = s().projects.find((p) => p.id === (noConsumption.data as { proposalId: string }).proposalId)!;
assert.deepEqual(estimated.monthlyConsumption, flat(1000));
assert.ok(isConsumptionEstimated(estimated));
assert.ok((noConsumption.data as { warnings: string[] }).warnings.some((w) => /estimado/i.test(w)), 'el resultado avisa del consumo estimado');

// 7. La marca es derivada: con un consumo real deja de ser estimado, y deshacer lo vuelve a mostrar (sin escribir la marca).
reset();
s().createNewProject('Marca');
const marked = s().getActiveProject();
assert.equal(isConsumptionEstimated(marked), true);
s().commitProjectEdits(marked.id, [{ path: 'monthlyConsumption[2]', value: 850 }], { source: 'user' });
assert.equal(isConsumptionEstimated(s().getActiveProject()), false, 'un mes real basta');
s().undo();
assert.equal(isConsumptionEstimated(s().getActiveProject()), true, 'deshacer vuelve al consumo estimado');

console.log('PASS: fábrica única: las tres vías nacen con 1.000 kWh/mes estimados, factor 1,40, 170 USD/kWp, tarifa de la distribuidora y sin datos del ejemplo.');
