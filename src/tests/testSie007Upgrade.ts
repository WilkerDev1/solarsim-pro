import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { migrateLegacySpecs } from '../../shared/equipment';
import { applyProjectEdit } from '../domain/projectEdit';
import {
  LEGACY_REGIME_BADGE_LABEL, canOfferSie007Upgrade, isOpenProposal, planSie007Upgrade, showsLegacyRegimeBadge, sie007UpgradePatch,
} from '../domain/netMeteringUpgrade';
import { DEFAULT_RD_TARIFF_MATRIX, referenceBillingTariff } from '../data/rdTariffs';
import type { LegacyProjectSpecs, ProjectSimulation, UtilityRates } from '../types';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';

/**
 * Fase 7 del plan tarifario: propuestas existentes en el régimen anterior (`legacy_retention`).
 * EDESUR comunicó que desde el 1/11/2026 aplica SIE-007-2026 también a los clientes en medición neta anteriores a
 * octubre de 2021. Postura: conservadora y provisional; nada migra solo, la actualización es una acción explícita con
 * deshacer y el régimen anterior sigue disponible.
 */

// Las tarjetas del listado importan hojas de estilo; node solo necesita que no existan.
registerHooks({ load: (url, context, next) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) });
const { useSimulationStore: store } = await import('../store/useSimulationStore');
const { RatesFields } = await import('../components/simulator/params/sections/rates/RatesFields');
const { LegacyRegimeBadge } = await import('../features/proposals/LegacyRegimeBadge');
const { ProjectDocumentList } = await import('../components/dashboard/ProjectDocumentList');

const h = React.createElement;
const noop = () => {};

const specs = migrateLegacySpecs({
  isDetailed: true, pricePerWattUSD: 1.13, panelPowerW: 600, panelCount: 4, autoCalculatePanels: false, panelBrandModel: 'Panel (600W)',
  inverterPowerKW: 5, inverterCount: 1, inverterBrandModel: 'Inversor (5 kW)', hasBattery: false, batteryCapacityKWh: 0, batteryCount: 0,
  dopExchangeRate: 60, saleMarginMultiplier: 1.25, panelUnitPriceUSD: 100, inverterUnitPriceUSD: 1500, batteryUnitPriceUSD: 2000,
  installationUnitPriceUSD: 170, systemLosses: 14, annualDegradation: 0.5, batteryDOD: 90,
} as LegacyProjectSpecs);

/** Propuesta guardada antes de la fase 2: sin `netMeteringRegime` ni `gridUseChargeDOPPerKWh`. */
const legacyRates = (overrides: Partial<UtilityRates> = {}): UtilityRates => {
  const rates: UtilityRates = {
    energyCostPerKWh: 0.21, distributor: 'EDESUR', targetCoveragePct: 95, tariffCode: 'BTS1', currency: 'USD', usdExchangeRate: 60,
    gridExportFeePct: 25, annualEnergyInflationPct: 3.5, ...overrides,
  };
  for (const key of Object.keys(rates) as (keyof UtilityRates)[]) if (rates[key] === undefined) delete rates[key];
  return rates;
};

const project = (rates: Partial<UtilityRates> = {}, extra: Partial<ProjectSimulation> = {}): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id: 'fase7',
  status: 'Draft',
  client: { ...structuredClone(BENCHMARK_PROJECT.client), name: 'Cliente fase 7', projectId: 'SP-F7', distributor: rates.distributor ?? 'EDESUR', tariffCode: rates.tariffCode ?? 'BTS1' },
  specs: structuredClone(specs),
  rates: legacyRates(rates),
  financials: { ...structuredClone(BENCHMARK_PROJECT.financials), customITBISSavedUSD: 0 },
  monthlyConsumption: Array(12).fill(350),
  ...extra,
});

// ── 1. ¿Se ofrece? Régimen, conexión y tarifa ────────────────────────────────────────────────
assert.equal(canOfferSie007Upgrade(legacyRates()), true, 'sin campo de régimen (lo guardado) e inyección a red: se ofrece');
assert.equal(canOfferSie007Upgrade(legacyRates({ netMeteringRegime: 'legacy_retention' })), true, 'régimen anterior explícito: se ofrece');
assert.equal(canOfferSie007Upgrade(legacyRates({ netMeteringRegime: 'desconocido' as never })), true, 'régimen desconocido = anterior');
assert.equal(canOfferSie007Upgrade(legacyRates({ gridConnection: 'grid_export', isZeroExport: false })), true, 'conexión a red explícita');
assert.equal(canOfferSie007Upgrade(legacyRates({ netMeteringRegime: 'sie007_2026' })), false, 'ya en SIE-007-2026: no');
assert.equal(canOfferSie007Upgrade(legacyRates({ isZeroExport: true })), false, 'inyección cero (campo heredado): no');
assert.equal(canOfferSie007Upgrade(legacyRates({ gridConnection: 'zero_export', isZeroExport: true })), false, 'inyección cero: no');
assert.equal(canOfferSie007Upgrade(legacyRates({ gridConnection: 'off_grid', isZeroExport: true })), false, 'aislado: no');
for (const code of ['BTD', 'BTH', 'MTD1', 'MTD2', 'MTH']) {
  assert.equal(canOfferSie007Upgrade(legacyRates({ tariffCode: code })), false, `tarifa con cargo de potencia ${code}: no`);
}
assert.equal(canOfferSie007Upgrade(legacyRates({ distributor: 'CEPM', tariffCode: 'RBT-2' })), false, 'CEPM RBT-2 (potencia): no');
assert.equal(canOfferSie007Upgrade(legacyRates({ distributor: 'CEPM', tariffCode: 'RBT-1' })), true, 'CEPM RBT-1 (un solo precio): sí');
assert.equal(canOfferSie007Upgrade(legacyRates({ tariffCode: 'BTS2' })), true, 'BTS-2: sí');
assert.equal(canOfferSie007Upgrade(legacyRates({ tariffCode: 'XYZ' })), true, 'tarifa sin clasificar: sí (mismo criterio conservador que el cargo)');
assert.equal(canOfferSie007Upgrade(null), false, 'sin tarifas: no');
assert.equal(planSie007Upgrade(legacyRates({ netMeteringRegime: 'sie007_2026' })), null, 'sin oferta no hay plan');

// ── 2. El parche: régimen y cargo de fábrica por distribuidora; respeta un cargo válido guardado ──
const FACTORY = { EDESUR: 3.78, EDENORTE: 4.02, EDEESTE: 3.88, CEPM: 5.73 } as const;
for (const [distributor, charge] of Object.entries(FACTORY) as [keyof typeof FACTORY, number][]) {
  const tariffCode = distributor === 'CEPM' ? 'RBT-1' : 'BTS1';
  const rates = legacyRates({ distributor, tariffCode });
  assert.deepEqual(sie007UpgradePatch(rates), { netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: charge }, `${distributor}: siembra el cargo de fábrica`);
  const edited = applyProjectEdit(project({ distributor, tariffCode }), { kind: 'rates', patch: sie007UpgradePatch(rates) }, { equipmentCatalog: [] });
  assert.equal(edited.rates.netMeteringRegime, 'sie007_2026', `${distributor}: régimen nuevo`);
  assert.equal(edited.rates.gridUseChargeDOPPerKWh, charge, `${distributor}: cargo de fábrica tras applyProjectEdit`);
}
assert.deepEqual(sie007UpgradePatch(legacyRates({ gridUseChargeDOPPerKWh: 2.5 })), { netMeteringRegime: 'sie007_2026' }, 'un cargo válido guardado no se pisa');
assert.deepEqual(sie007UpgradePatch(legacyRates({ gridUseChargeDOPPerKWh: 0 })), { netMeteringRegime: 'sie007_2026' }, 'un 0 explícito es válido y se respeta');
assert.deepEqual(sie007UpgradePatch(legacyRates({ gridUseChargeDOPPerKWh: 150 })), { netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 }, 'un cargo fuera de rango se sustituye por el de fábrica');
assert.deepEqual(sie007UpgradePatch(legacyRates({ gridUseChargeDOPPerKWh: Number.NaN })), { netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 }, 'un cargo no numérico, también');
{
  const before = project({ gridUseChargeDOPPerKWh: 2.5 });
  const edited = applyProjectEdit(before, { kind: 'rates', patch: sie007UpgradePatch(before.rates) }, { equipmentCatalog: [] });
  assert.equal(edited.rates.gridUseChargeDOPPerKWh, 2.5, 'applyProjectEdit conserva el cargo guardado');
}
{ // El precio de la energía y su procedencia no cambian: «Aplicar tarifa oficial» sigue siendo una acción aparte.
  const before = project({ energyCostPerKWh: 0.177, energyRateSource: 'manual' });
  const edited = applyProjectEdit(before, { kind: 'rates', patch: sie007UpgradePatch(before.rates) }, { equipmentCatalog: [] });
  assert.equal(edited.rates.energyCostPerKWh, 0.177, 'el precio no cambia');
  assert.equal(edited.rates.energyRateSource, 'manual', 'ni su procedencia');
  assert.equal(edited.rates.billingTariff, undefined, 'ni se guarda una fila de facturación');
  assert.equal(edited.rates.gridExportFeePct, 25, 'la retención guardada queda intacta (volver al régimen anterior la recupera)');
}

// ── 3. El plan: cargo resultante y mención de «Aplicar tarifa oficial» ──────────────────────────
const officialRow = referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS1');
assert.ok(officialRow, 'la matriz de fábrica tiene la fila EDESUR BTS-1');
const referencePatch: Partial<UtilityRates> = { energyCostPerKWh: 0.2, energyRateSource: 'reference', billingTariff: officialRow };
{
  const plan = planSie007Upgrade(legacyRates({ energyRateSource: 'manual' }), referencePatch)!;
  assert.ok(plan);
  assert.deepEqual(plan.patch, { netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 });
  assert.equal(plan.chargeDOPPerKWh, 3.78);
  assert.equal(plan.seedsFactoryCharge, true);
  assert.equal(plan.factory.resolutionCode, 'SIE-121-2026-TF');
  assert.equal(plan.valuesByBlocks, false, 'precio tecleado: tras actualizar se sigue valorando con el escalar');
  assert.equal(plan.suggestOfficialTariff, true, 'la tarifa oficial permitiría bloques: se menciona, sin aplicarla');
}
{
  const plan = planSie007Upgrade(legacyRates({ gridUseChargeDOPPerKWh: 2.5 }), referencePatch)!;
  assert.equal(plan.seedsFactoryCharge, false);
  assert.equal(plan.chargeDOPPerKWh, 2.5, 'cargo guardado');
}
{
  const plan = planSie007Upgrade(legacyRates({ energyRateSource: 'reference', billingTariff: officialRow }), referencePatch)!;
  assert.equal(plan.valuesByBlocks, true, 'con la tarifa oficial ya guardada, la energía pasa a valorarse por bloques');
  assert.equal(plan.suggestOfficialTariff, false, 'y no hace falta mencionar «Aplicar tarifa oficial»');
}
{
  assert.equal(planSie007Upgrade(legacyRates({ energyRateSource: 'manual' }))!.suggestOfficialTariff, false, 'sin parche de referencia no se menciona');
  const noRow = planSie007Upgrade(legacyRates({ tariffCode: 'XYZ' }), { energyCostPerKWh: 0.2, energyRateSource: 'reference', billingTariff: undefined })!;
  assert.equal(noRow.suggestOfficialTariff, false, 'sin fila oficial exacta no hay bloques que sugerir');
}

// ── 4. Insignia «Régimen anterior» en el listado: solo propuestas abiertas ─────────────────────
assert.equal(isOpenProposal(project()), true, 'borrador en espera: abierta');
assert.equal(isOpenProposal(project({}, { status: 'Final' })), true, 'Final sin decisión: abierta');
assert.equal(isOpenProposal(project({}, { commercial: { status: 'test', note: '' } })), true, 'de prueba: abierta');
assert.equal(isOpenProposal(project({}, { status: 'Archived' })), false, 'archivada: cerrada');
assert.equal(isOpenProposal(project({}, { commercial: { status: 'approved', note: '' } })), false, 'aprobada: cerrada');
assert.equal(isOpenProposal(project({}, { commercial: { status: 'rejected', note: '' } })), false, 'rechazada: cerrada');
assert.equal(isOpenProposal(project({}, { isDeleted: true })), false, 'en papelera: no');

assert.equal(showsLegacyRegimeBadge(project()), true, 'abierta, régimen anterior e inyección a red');
assert.equal(showsLegacyRegimeBadge(project({ netMeteringRegime: 'sie007_2026' })), false, 'SIE-007-2026: sin insignia');
assert.equal(showsLegacyRegimeBadge(project({ gridConnection: 'zero_export', isZeroExport: true })), false, 'inyección cero: sin insignia');
assert.equal(showsLegacyRegimeBadge(project({ gridConnection: 'off_grid', isZeroExport: true })), false, 'aislado: sin insignia');
assert.equal(showsLegacyRegimeBadge(project({ tariffCode: 'BTD' })), false, 'tarifa con potencia: sin insignia');
assert.equal(showsLegacyRegimeBadge(project({}, { commercial: { status: 'approved', note: '' } })), false, 'aprobada: sin insignia');

{
  const html = renderToStaticMarkup(h(LegacyRegimeBadge, { project: project() }));
  assert.match(html, /data-legacy-regime-badge/);
  assert.ok(html.includes(LEGACY_REGIME_BADGE_LABEL), 'texto «Régimen anterior»');
  assert.equal(LEGACY_REGIME_BADGE_LABEL, 'Régimen anterior');
  assert.match(html, /title="[^"]*SIE-007-2026[^"]*"/, 'tooltip explicativo');
  assert.match(html, /title="[^"]*no cambian[^"]*"/, 'el tooltip dice que lo guardado no cambia solo');
  assert.equal(renderToStaticMarkup(h(LegacyRegimeBadge, { project: project({ netMeteringRegime: 'sie007_2026' }) })), '', 'sin insignia no se pinta nada');
}

{ // El listado la muestra y mostrarla no escribe nada.
  const legacy = project();
  const current = { ...project({ netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 }), id: 'fase7-b', client: { ...legacy.client, name: 'Cliente vigente' } };
  const before = store.getState().projects;
  const html = renderToStaticMarkup(h(ProjectDocumentList, { projects: [legacy, current] }));
  assert.equal((html.match(/data-legacy-regime-badge/g) ?? []).length, 1, 'una sola insignia: la propuesta del régimen anterior');
  assert.equal(store.getState().projects, before, 'pintar el listado no escribe en el store');
  assert.equal('netMeteringRegime' in legacy.rates, false, 'ni toca la propuesta');
}

// ── 5. El aviso del dock ────────────────────────────────────────────────────────────────────
const renderRates = (p: ProjectSimulation, showRegimeSelector = true) =>
  renderToStaticMarkup(h(RatesFields, { project: p, projectionEnabled: false, updateRates: noop, updateSpecs: noop, showRegimeSelector } as never));
{
  const html = renderRates(project({ energyRateSource: 'manual' }));
  assert.match(html, /data-sie007-upgrade/, 'régimen anterior con red: aviso visible');
  assert.match(html, /Actualizar a SIE-007-2026/, 'con el botón');
  assert.match(html, /RD\$3\.78/, 'menciona el cargo de fábrica que se sembrará');
  assert.match(html, /Aplicar tarifa oficial/, 'menciona que «Aplicar tarifa oficial» existe');
  assert.match(html, /EDESUR/, 'cita el comunicado de EDESUR (en el tooltip)');
  assert.match(html, /data-sie007-upgrade[^>]*>.{0,400}Actualizar a SIE-007-2026/s, 'botón en una línea compacta');
  assert.doesNotMatch(html, /data-sie007-upgrade[^>]*(border|rounded-md border|space-y)/, 'sin recuadro grande');
}
assert.doesNotMatch(renderRates(project({ netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: 3.78 })), /data-sie007-upgrade/, 'SIE-007-2026: sin aviso');
assert.doesNotMatch(renderRates(project({ gridConnection: 'zero_export', isZeroExport: true })), /data-sie007-upgrade/, 'inyección cero: sin aviso');
assert.doesNotMatch(renderRates(project({ gridConnection: 'off_grid', isZeroExport: true })), /data-sie007-upgrade/, 'aislado: sin aviso');
assert.doesNotMatch(renderRates(project({ tariffCode: 'BTD' })), /data-sie007-upgrade/, 'tarifa con potencia: sin aviso');
assert.doesNotMatch(renderRates(project(), false), /data-sie007-upgrade/, 'la organización oculta el selector de régimen: sin aviso');

// ── 6. Pulsar «Actualizar» pasa por el store (applyProjectEdit) y deshacer devuelve el estado previo exacto ──
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const UNDO_DEBOUNCE_MS = 700; // el diario agrupa las ediciones seguidas en una ventana de 600 ms
{
  const original = store.getState();
  const saved = project({ energyRateSource: 'manual' }, { id: 'fase7-undo' });
  const savedRates = structuredClone(saved.rates);
  try {
    store.setState({ projects: [structuredClone(saved)], activeProjectId: saved.id, equipmentCatalog: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false, triggerAutoSync: noop });
    store.getState().setActiveProject(saved.id, 'simulator');
    const plan = planSie007Upgrade(store.getState().projects[0].rates)!;
    store.getState().updateRates(plan.patch);
    await wait(UNDO_DEBOUNCE_MS);
    const upgraded = store.getState().projects[0];
    assert.equal(upgraded.rates.netMeteringRegime, 'sie007_2026');
    assert.equal(upgraded.rates.gridUseChargeDOPPerKWh, 3.78);
    assert.equal(store.getState().canUndo, true, 'la actualización deja una entrada de deshacer');
    store.getState().undo();
    const restored = store.getState().projects[0];
    assert.deepEqual(restored.rates, savedRates, 'deshacer devuelve las tarifas exactas');
    assert.equal('netMeteringRegime' in restored.rates, false, 'sin el campo de régimen');
    assert.equal('gridUseChargeDOPPerKWh' in restored.rates, false, 'ni el cargo');
    // Deshacer solo restaura las rutas del paso (aquí, las tarifas): el resto queda tal cual estaba, sin pasar por JSON.
    const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    assert.deepEqual(asJson(restored.specs), asJson(saved.specs), 'specs intactas');
    assert.deepEqual(restored.specs, upgraded.specs, 'deshacer no toca las specs');
    assert.deepEqual(asJson(restored.financials), asJson(saved.financials), 'finanzas intactas');
    assert.deepEqual(restored.financials, upgraded.financials, 'ni las finanzas');
    assert.deepEqual(restored.monthlyConsumption, saved.monthlyConsumption, 'consumo intacto');
  } finally {
    store.setState(original, true);
  }
}

console.log('testSie007Upgrade: OK');
