// F0 (caracterización): con qué valores nace una propuesta por cada camino. Fue la base de la fábrica única de F2b
// (ADR 0009); las aserciones marcadas «invertida en F2b» fijan ahora los valores que decidió el dueño, iguales por todos los
// caminos (la fábrica, `src/domain/newProposal.ts`, tiene su propia suite: `testProposalFactory`).
//   · «Nueva simulación»  → `createNewProject` (parte del caso de referencia del Centro Médico)
//   · asistente de propuestas → `applyExtractedInvoice(draft, true)` (parte de `createAIProposalBase`)
//   · asistente flotante   → `create_proposal` por el registro de herramientas (fuente `app-assistant`)
//   · duplicar             → `duplicateProject` (copia lo que ya tiene la original)
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { executeAssistantToolset } from '../features/agentTools/appAssistant/toolset';
import { assistantOwner } from '../features/assistant/tools';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { buildAITariffContext } from '../utils/aiTariffContext';
import type { ProjectSimulation } from '../types';

const store = useSimulationStore;
const s = () => store.getState();
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
const inverter = catalog.find((e) => e.type === 'inverter')!;
panel.supplierPrices = [{ id: 'sp-p', supplierName: 'QA', priceUSD: 95, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
inverter.supplierPrices = [{ id: 'sp-i', supplierName: 'QA', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: '2026-10-01T00:00:00.000Z' }];
const original = { ...structuredClone(BENCHMARK_PROJECT), id: 'defaults-original', syncStatus: 'local_only' as const };
const reset = (defaults = DEFAULT_SIMULATION_SETTINGS) => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(original)], activeProjectId: original.id, activeView: 'dashboard',
  equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0, defaultSimulationSettings: defaults,
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});

/** Lo que define con qué nace una propuesta (sin identificadores ni fechas, que cambian en cada ejecución). */
const born = (p: ProjectSimulation) => ({
  client: { name: p.client.name, company: p.client.company, province: p.client.province, distributor: p.client.distributor, tariffCode: p.client.tariffCode,
    coordinates: p.client.coordinates, customMonthlyHSP: p.client.customMonthlyHSP, address: p.client.address, contactPhone: p.client.contactPhone, quoteValidityDays: p.client.quoteValidityDays },
  pricing: { laborUSDPerKWp: p.specs.installationUnitPriceUSD, marginFactor: p.specs.saleMarginMultiplier, pricingMode: p.specs.pricingMode, isDetailed: p.specs.isDetailed,
    pricePerWattUSD: p.specs.pricePerWattUSD, pricePerKWpUSD: p.specs.pricePerKWpUSD, financialsPricePerWattUSD: p.financials.pricePerWattUSD, autoSupplierPricing: p.specs.autoSupplierPricing },
  sizing: { autoCalculatePanels: p.specs.autoCalculatePanels, hasBattery: p.specs.hasBattery,
    panels: p.specs.panels?.map((g) => [g.brandModel, g.count, g.powerW, g.unitPriceUSD, g.priceSource, g.catalogItemId]),
    inverters: p.specs.inverters?.map((g) => [g.brandModel, g.count, g.powerKW, g.unitPriceUSD, g.priceSource]),
    batteries: p.specs.batteries?.map((g) => [g.brandModel, g.count, g.capacityKWh, g.dodPct, g.unitPriceUSD, g.priceSource]) },
  consumption: p.monthlyConsumption,
  rates: { energyCostPerKWh: p.rates.energyCostPerKWh, energyRateSource: p.rates.energyRateSource, netMeteringRegime: p.rates.netMeteringRegime, targetCoveragePct: p.rates.targetCoveragePct,
    gridExportFeePct: p.rates.gridExportFeePct, isZeroExport: p.rates.isZeroExport },
  other: { status: p.status, syncStatus: p.syncStatus, aiSource: p.aiSource && JSON.parse(JSON.stringify(p.aiSource)), companyProfileId: p.companyProfileId, applyLey5707: p.financials.applyLey5707, customItems: p.financials.customItems?.length },
});
const flat = (value: number) => Array(12).fill(value) as number[];

// Los cuatro caminos, con los ajustes de fábrica del usuario.
reset();
const draftOf = (clientName: string) => normalizeProposalDraft({ clientName, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', averageMonthlyKWh: 700,
  panels: [{ equipmentId: panel.id, quantity: 12 }], inverters: [{ equipmentId: inverter.id, quantity: 1 }], batteries: [], hasBattery: false,
  commercial: { priceBasis: 'purchase', markupPct: null, marginOnSalePct: null, installationUnitPriceUSD: null, installationTotalUSD: null, customItems: [], customDiscounts: [] } },
catalog, { province: 'Santiago', annualSpecificYieldKWhPerKWp: 1500, tariffReference: buildAITariffContext(s().tariffMatrix) });
const flotante = async (name: string) => {
  const result = await executeAgentTool({ name: 'create_proposal', args: { clientName: name, distributor: 'EDENORTE', tariffCode: 'BTS1', averageMonthlyKWh: 700,
    panels: [{ catalogItemId: panel.id, count: 12 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, { source: 'app-assistant', owner: assistantOwner() });
  assert.equal(result.status, 'applied', JSON.stringify(result));
  return s().projects.find((p) => p.id === (result.data as { proposalId: string }).proposalId)!;
};

s().createNewProject('Solo nombre');
const manual = s().getActiveProject();
s().createNewProject({ name: 'Con objeto', company: 'ACME' });
const manualObject = s().getActiveProject();
s().applyExtractedInvoice(draftOf('Asistente de propuestas'), true);
const proposalAssistant = s().getActiveProject();
const floating = await flotante('Flotante');
const copyId = s().duplicateProject(original.id, { activate: false })!;
const copy = s().projects.find((p) => p.id === copyId)!;

// 1. «Nueva simulación». Invertida en F2b: ya no hereda nada del caso de referencia (ni coordenadas del Centro Médico, ni
// «Cliente Comercial», ni 38 paneles a 103,32, ni 3 baterías, ni 3.279 kWh). Equipos elegidos del catálogo con su oferta y
// dimensionados (paneles con la base del mes pico, inversor por DC/AC 1,20).
assert.deepEqual(born(manual), {
  client: { name: 'Solo nombre', company: '', province: 'Santo Domingo / Distrito Nacional', distributor: 'EDEESTE', tariffCode: 'BTS2',
    coordinates: undefined, customMonthlyHSP: undefined, address: '', contactPhone: '', quoteValidityDays: 7 },
  // invertida en F2b: factor 1,40 (antes 1,25) y la misma mano de obra en todos los caminos (170; antes 0 en los del asistente)
  pricing: { laborUSDPerKWp: 170, marginFactor: 1.4, pricingMode: 'cost_matrix', isDetailed: false, pricePerWattUSD: 1.13, pricePerKWpUSD: 1130, financialsPricePerWattUSD: 1.13, autoSupplierPricing: true },
  sizing: { autoCalculatePanels: false, hasBattery: false,
    panels: [['Módulos Canadian Solar CS6.1-72TB-590 (590W)', 14, 590, 95, 'supplier', 'eq-mod-cs-590']],
    inverters: [['Inversor Lux Power LXP-LB-US 8K (8.0Kw)', 1, 8, 1400, 'supplier']],
    // invertida en F2b: la batería de los ajustes (16,08 kWh, DOD 90, sin precio en este catálogo), no las 3 Hinaess del caso
    // de referencia; oculta mientras «Incluir batería» esté apagado y dimensionada por la regla activa (75 % del día pico).
    batteries: [['Batería 16.08 kWh', 3, 16.08, 90, undefined, undefined]] },
  consumption: flat(1000), // invertida en F2b: consumo genérico de 1000 kWh/mes, marcado como estimado
  // invertida en F2b: la tarifa de referencia de la distribuidora de la propuesta a su consumo (EDEESTE BTS2 a 1.000 kWh)
  rates: { energyCostPerKWh: 0.227, energyRateSource: 'reference', netMeteringRegime: 'sie007_2026', targetCoveragePct: 95, gridExportFeePct: 25, isZeroExport: false },
  other: { status: 'Draft', syncStatus: 'local_only', aiSource: undefined, companyProfileId: 'comp-default-rd', applyLey5707: true, customItems: 0 },
});
assert.deepEqual(manual.consumptionEstimate, { kind: 'factory_default', monthlyKWh: 1000 });
assert.deepEqual(born(manualObject), { ...born(manual), client: { ...born(manual).client, name: 'Con objeto', company: 'ACME' } }, 'el payload de objeto solo cambia nombre y empresa');

// 2. Asistente de propuestas: parte de `createAIProposalBase`, que desde F2b es la fábrica única (sin coordenadas, margen =
// «Margen bruto objetivo» de los ajustes, 40 % de fábrica).
assert.deepEqual(born(proposalAssistant), {
  client: { name: 'Asistente de propuestas', company: '', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1',
    coordinates: undefined, customMonthlyHSP: undefined, address: '', contactPhone: '', quoteValidityDays: 7 },
  // invertida en F2b: factor 1,40 (antes 1,28 = margen objetivo de los ajustes) y la mano de obra unificada con «Nueva simulación»
  pricing: { laborUSDPerKWp: 170, marginFactor: 1.4, pricingMode: 'cost_matrix', isDetailed: false, pricePerWattUSD: 1.13, pricePerKWpUSD: 1130, financialsPricePerWattUSD: 1.13, autoSupplierPricing: true },
  sizing: { autoCalculatePanels: false, hasBattery: false,
    panels: [['Módulos Canadian Solar CS6.1-72TB-590 (590W)', 12, 590, 95, 'supplier', 'eq-mod-cs-590']],
    inverters: [['Inversor Lux Power LXP-LB-US 8K (8.0Kw)', 1, 8, 1400, 'supplier']], batteries: [] },
  consumption: flat(700),
  // invertida en F2b (ya lo era): el precio de la energía es la referencia de la distribuidora y tarifa elegidas a 700 kWh/mes
  rates: { energyCostPerKWh: 0.18, energyRateSource: 'reference', netMeteringRegime: 'sie007_2026', targetCoveragePct: 95, gridExportFeePct: 25, isZeroExport: false },
  other: { status: 'Draft', syncStatus: 'local_only', aiSource: { consumptionSource: 'estimated', energyRateSource: 'reference' }, companyProfileId: 'comp-default-rd', applyLey5707: true, customItems: 0 },
});

// 3. `create_proposal` del asistente flotante: mismo constructor que el asistente de propuestas (mismos valores), pero sin provincia propia usa la de los ajustes.
assert.deepEqual(born(floating), { ...born(proposalAssistant), client: { ...born(proposalAssistant).client, name: 'Flotante', province: 'Santo Domingo / Distrito Nacional' } });
assert.equal(floating.id === proposalAssistant.id, false);
assert.equal(s().activeProjectId, proposalAssistant.id, 'create_proposal no abre la propuesta nueva');

// 4. Duplicar: copia tal cual la original (con su modo de precio indefinido, equipos y consumo), solo cambia nombre, código y estado.
assert.deepEqual(born(copy), {
  client: { name: 'CENTRO MEDICO HISPANICO (Copia)', company: 'CENTRO MEDICO HISPANICO SRL', province: 'Santo Domingo / Distrito Nacional', distributor: 'EDEESTE', tariffCode: 'BTS2',
    coordinates: '18.4861, -69.9312', customMonthlyHSP: undefined, address: 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.', contactPhone: '809-555-0199', quoteValidityDays: 7 },
  pricing: { laborUSDPerKWp: 170, marginFactor: 1.25, pricingMode: undefined, isDetailed: true, pricePerWattUSD: 1.134971, pricePerKWpUSD: undefined, financialsPricePerWattUSD: 1.135, autoSupplierPricing: undefined },
  sizing: { autoCalculatePanels: false, hasBattery: true,
    panels: [['Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)', 38, 620, 103.32, undefined, undefined]],
    inverters: [['Inversor Lux Power LXP-LB-US 8K (8.0Kw)', 2, 8, 2300, undefined]],
    batteries: [['Batería Hinaess 16 KwH-48 vdc.', 3, 48, 80, 1990, undefined]] },
  consumption: flat(3279),
  rates: { energyCostPerKWh: 0.221, energyRateSource: undefined, netMeteringRegime: undefined, targetCoveragePct: 95, gridExportFeePct: 25, isZeroExport: undefined },
  other: { status: 'Draft', syncStatus: 'local_only', aiSource: undefined, companyProfileId: undefined, applyLey5707: true, customItems: undefined },
});
assert.equal(copy.proposalLink?.parentId, original.id);
assert.equal(s().activeProjectId, proposalAssistant.id, 'duplicar con activate:false no cambia la propuesta abierta');

// 5. Lo que F2b unificó (resumen). Invertida en F2b: factor 1,40 y la misma mano de obra en los tres, consumo de 1000 kWh/mes
// cuando no hay datos y sin coordenadas heredadas (decisión del dueño: ni coordenadas ni datos del ejemplo; la radiación
// sale de la provincia).
assert.deepEqual([manual, proposalAssistant, floating].map((p) => [p.specs.installationUnitPriceUSD, p.specs.saleMarginMultiplier, p.client.coordinates === undefined, p.monthlyConsumption[0]]),
  [[170, 1.4, true, 1000], [170, 1.4, true, 700], [170, 1.4, true, 700]]);

// 6. Con ajustes de usuario propios: todos los caminos respetan el margen objetivo (invertida en F2b: «Nueva simulación» lo
// ignoraba y usaba 1,25); «Nueva simulación» respeta el modo directo y los del asistente fuerzan el modo catálogo (política
// automatizada por fuente, ADR 0009).
reset({ ...DEFAULT_SIMULATION_SETTINGS, defaultTargetMarginPct: 40, defaultPricingMode: 'direct', defaultDirectPriceUSDPerWp: 1.5, defaultProvince: 'Santiago',
  defaultDistributor: 'EDENORTE', defaultTariffCode: 'BTS1', defaultHasBattery: true, defaultPanelPowerW: 700, defaultBatteryDOD: 70 });
s().createNewProject('Con ajustes');
const customManual = s().getActiveProject();
s().applyExtractedInvoice(draftOf('Asistente con ajustes'), true);
const customAssistant = s().getActiveProject();
const customFloating = await flotante('Flotante con ajustes');
const pick = (p: ProjectSimulation) => ({ province: p.client.province, distributor: p.client.distributor, tariffCode: p.client.tariffCode, marginFactor: p.specs.saleMarginMultiplier,
  pricingMode: p.specs.pricingMode, pricePerWattUSD: p.specs.pricePerWattUSD, hasBattery: p.specs.hasBattery, laborUSDPerKWp: p.specs.installationUnitPriceUSD });
// invertida en F2b: el factor de «Nueva simulación» es el margen objetivo de los ajustes (40 % ⇒ 1,40), como en los del asistente.
assert.deepEqual(pick(customManual), { province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', marginFactor: 1.4, pricingMode: 'direct_watt', pricePerWattUSD: 1.5, hasBattery: true, laborUSDPerKWp: 170 });
// F2b: el panel sale del catálogo con oferta (el de los ajustes no está en él), así que la potencia es la del modelo; la de los
// ajustes (700 W) solo vale para el modelo de los ajustes sin catálogo. La batería no se hereda: la de los ajustes (DOD 70 %),
// sin precio en el catálogo, dimensionada por la regla activa (75 % del día pico).
assert.equal(customManual.specs.panels?.[0].powerW, 590);
assert.equal(customManual.specs.batteries?.[0].dodPct, 70);
assert.equal(customManual.specs.batteries?.[0].count, 3);
assert.deepEqual(pick(customAssistant), { province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1', marginFactor: 1.4, pricingMode: 'cost_matrix', pricePerWattUSD: 1.5, hasBattery: false, laborUSDPerKWp: 170 });
assert.deepEqual(pick(customFloating), pick(customAssistant));

// 7. Sin datos. «Nueva simulación» crea con el consumo estimado de fábrica (F2b). invertida en F3a: «crea una propuesta» sin
// datos crea en el asistente de la app, con la `create_proposal` propia del cliente (todo opcional, fábrica única;
// `src/features/agentTools/appAssistant/`). La compartida de `shared/agentTools/definitions.ts` (MCP local y agentes
// externos) no cambia en la 2.11.0, que es solo de cliente: sin argumentos sigue siendo un error de argumentos.
reset();
const ctx = () => ({ source: 'app-assistant' as const, owner: assistantOwner() });
store.setState({ agentPolicy: { ...DEFAULT_AGENT_POLICY, internal: { read: 'allow', draft: 'allow', guarded: 'confirm' } } });
const noArgsApp = await executeAssistantToolset({ name: 'create_proposal', args: {} }, { ...ctx(), turnId: 'f3a', callId: '0' });
assert.equal(noArgsApp.status, 'applied', 'invertida en F3a: «crea una propuesta» sin datos crea con los valores de la fábrica');
const noArgsProject = s().projects.find((p) => p.id === noArgsApp.proposalId)!;
assert.deepEqual(noArgsProject.monthlyConsumption, flat(1000));
assert.equal(noArgsProject.specs.saleMarginMultiplier, 1.4);
store.setState({ projects: s().projects.filter((p) => p.id !== noArgsApp.proposalId) });
const noArgs = await executeAgentTool({ name: 'create_proposal', args: {} }, ctx());
assert.equal(noArgs.status, 'error');
assert.equal((noArgs as { code: string }).code, 'invalid_arguments', 'la compartida (MCP local y agentes externos) conserva sus obligatorios');
assert.match((noArgs as { message: string }).message, /clientName: es obligatorio.*distributor: es obligatorio.*tariffCode: es obligatorio.*panels: es obligatorio.*inverters: es obligatorio/);
const noConsumption = await executeAgentTool({ name: 'create_proposal', args: { clientName: 'X', distributor: 'EDESUR', tariffCode: 'BTS1',
  panels: [{ catalogItemId: panel.id, count: 1 }], inverters: [{ catalogItemId: inverter.id, count: 1 }] } }, ctx());
// invertida en F2b: sin consumo nace con 1.000 kWh/mes estimados y lo avisa (antes: «Indica doce consumos mensuales o un consumo promedio.»).
assert.equal(noConsumption.status, 'applied', JSON.stringify(noConsumption));
assert.ok(((noConsumption as { data: { warnings: string[] } }).data.warnings).some((w) => w.startsWith('Consumo estimado: 1,000 kWh/mes')));
assert.deepEqual(s().projects.find((p) => p.id === (noConsumption as { data: { proposalId: string } }).data.proposalId)?.monthlyConsumption, flat(1000));
const countBefore = s().projects.length;
// Un borrador sin equipos ni consumo (ni promedio) no se puede aplicar: el aviso queda en `saveFeedbackMessage`, sin tocar los proyectos.
s().applyExtractedInvoice({ clientName: 'Sin datos', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: [] } as never, true);
assert.equal(s().projects.length, countBefore, 'el asistente de propuestas tampoco crea sin doce consumos');
assert.equal(s().saveFeedbackMessage, 'Completa los doce consumos mensuales antes de aplicar.');
// Sorpresa fijada: con equipos, un borrador con `monthlyConsumptionKWh` vacío SÍ crea, porque el normalizador reestima los doce meses del promedio.
store.setState({ saveFeedbackMessage: null });
s().applyExtractedInvoice({ ...draftOf('Sin doce meses'), monthlyConsumptionKWh: [] }, true);
assert.equal(s().projects.length, countBefore + 1);
assert.deepEqual(s().getActiveProject().monthlyConsumption, flat(700));

console.log('PASS: proposal creation defaults characterization: manual, proposal assistant, floating create_proposal and duplicate.');
