import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { applyProjectEdit, type ProjectEdit } from '../domain/projectEdit';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { EquipmentParamsSection } from '../components/simulator/sidebar/EquipmentParamsSection';
import { PricingParamsSection } from '../components/simulator/sidebar/PricingParamsSection';
import { resolveAssumptions } from '../../shared/assumptions';
import { readEquipment } from '../../shared/equipment';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { useSimulationStore as store } from '../store/useSimulationStore';
import type { ProjectSimulation } from '../types';
import type { EquipmentSupplierPrice, SolarEquipmentItem } from '../types/equipment';

/**
 * Edición de proyecto (ADR 0004). La misma matriz de escenarios corre contra dos adaptadores:
 *  1. el store (`updateSpecs`, `updateRates`…): caracteriza el comportamiento que tenían las porciones antes del refactor;
 *  2. `applyProjectEdit` sin Zustand: la regla vive en un módulo puro.
 * Cada cambio de comportamiento pretendido lleva su expectativa anotada con la decisión que lo autoriza:
 *  (b) el precio de proveedor pasa por la misma ruta que cualquier edición (deshacer, autodimensionado, normalización);
 *  (c) mirar un proyecto nunca escribe: las reglas del catálogo corren en la siguiente edición real.
 */

// ── Datos de prueba ─────────────────────────────────────────────────────────────────────────
type Edit = ProjectEdit;

const offer = (id: string, supplierName: string, priceUSD: number): EquipmentSupplierPrice => ({ id, supplierName, priceUSD, updatedAt: '2026-01-01' });
const item = (extra: Partial<SolarEquipmentItem> & Pick<SolarEquipmentItem, 'id' | 'type' | 'displayName'>): SolarEquipmentItem =>
  ({ brand: 'B', modelSeries: 'M', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra }) as SolarEquipmentItem;

const CATALOG: SolarEquipmentItem[] = [
  item({ id: 'p-a', type: 'panel', displayName: 'Panel A 550W', powerW: 550, efficiencyPct: 21.5, supplierPrices: [offer('sp-a1', 'Alfa', 100)] }),
  item({ id: 'p-b', type: 'panel', displayName: 'Panel B 700W', powerW: 700, efficiencyPct: 22.4, supplierPrices: [offer('sp-b1', 'Beta', 130)] }),
  item({ id: 'p-c', type: 'panel', displayName: 'Panel C 600W', powerW: 600, supplierPrices: [offer('sp-c1', 'alfa ', 110)] }),
  item({ id: 'i-a', type: 'inverter', displayName: 'Inversor A 10K', powerKW: 10, supplierPrices: [offer('sp-ia', 'Alfa', 2500)] }),
  item({ id: 'b-a', type: 'battery', displayName: 'Batería A', capacityKWh: 10, dodPct: 90, batteryEfficiencyPct: 95, supplierPrices: [offer('sp-ba', 'Alfa', 2000)] }),
];

const baseProject = (patch: (p: ProjectSimulation) => void = () => {}): ProjectSimulation => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = 'proj-edit-1';
  p.specs.autoCalculatePanels = true;
  patch(p);
  return p;
};
const withPrimary = (p: ProjectSimulation, kind: 'panel' | 'inverter' | 'battery', patch: Record<string, unknown>) => {
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, kind, { type: 'update', index: 0, patch: patch as never }) };
};
const panelsOf = (p: ProjectSimulation) => readEquipment(p.specs).panels;
const countOf = (p: ProjectSimulation) => panelsOf(p)[0].count;
/** Cantidad que recomienda el motor para el estado del proyecto (la fuente de verdad del autodimensionado). */
const expectedCount = (p: ProjectSimulation, overrides: { province?: string; monthly?: number[]; coverage?: number } = {}) =>
  calculateRecommendedPanelCount(
    overrides.province ?? p.client.province,
    overrides.monthly ?? p.monthlyConsumption,
    panelsOf(p)[0].powerW,
    overrides.coverage ?? resolveAssumptions(p).targetCoveragePct,
    resolveAssumptions(p).systemLossesPct,
    p.client.customMonthlyHSP
  ).recommendedPanelCount;

// ── Adaptadores ─────────────────────────────────────────────────────────────────────────────
type Apply = (project: ProjectSimulation, edit: Edit, catalog?: SolarEquipmentItem[]) => ProjectSimulation;

/** Porciones del store: se instala el proyecto activo, se llama al método público y se lee el resultado. */
const viaStore: Apply = (project, edit, catalog = CATALOG) => {
  const original = store.getState();
  try {
    store.setState({ projects: [structuredClone(project)], activeProjectId: project.id, equipmentCatalog: catalog });
    const s = store.getState();
    if (edit.kind === 'specs') s.updateSpecs(edit.patch);
    else if (edit.kind === 'rates') s.updateRates(edit.patch);
    else if (edit.kind === 'client') s.updateClient(edit.patch);
    else if (edit.kind === 'financials') s.updateFinancials(edit.patch);
    else if (edit.kind === 'supplierPrice') s.applySupplierPriceToProject(edit.equipmentType, edit.supplierPrice, edit.equipmentItem);
    else s.setMonthlyConsumption(edit.monthlyConsumption, edit.lockAutoPanels);
    return store.getState().projects[0];
  } finally {
    store.setState(original, true);
  }
};

/** `applyProjectEdit` sin Zustand; además comprueba que no muta el proyecto de entrada. */
const viaModule: Apply = (project, edit, catalog = CATALOG) => {
  const frozen = structuredClone(project);
  const next = applyProjectEdit(project, edit, { equipmentCatalog: catalog });
  assert.deepEqual(project, frozen, 'applyProjectEdit no muta el proyecto de entrada');
  return next;
};

// ── Matriz de escenarios ────────────────────────────────────────────────────────────────────
function runMatrix(apply: Apply, label: string) {
  const t = (name: string) => `${label}: ${name}`;

  { // Autodimensionado al editar specs: un parámetro que afecta la producción recalcula la cantidad.
    const p = baseProject();
    withPrimary(p, 'panel', { count: 5 }); // cantidad desfasada a propósito
    const next = apply(p, { kind: 'specs', patch: { systemLosses: 10 } });
    const reference = { ...p, specs: { ...p.specs, systemLosses: 10 } };
    assert.equal(countOf(next), expectedCount(reference), t('specs con autocálculo recalcula la cantidad'));
    assert.notEqual(countOf(next), 5, t('la prueba distingue la cantidad recalculada'));
    assert.equal(next.specs.autoCalculatePanels, true, t('el autocálculo sigue activo'));
  }

  { // Sin autocálculo no se toca la cantidad.
    const p = baseProject((q) => { q.specs.autoCalculatePanels = false; });
    const next = apply(p, { kind: 'specs', patch: { systemLosses: 10 } });
    assert.equal(countOf(next), countOf(p), t('sin autocálculo la cantidad queda'));
    assert.equal(next.specs.autoCalculatePanels, false);
  }

  { // Una cantidad manual (grupo principal) apaga el autocálculo y se respeta.
    const p = baseProject();
    const next = apply(p, { kind: 'specs', patch: editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { count: 33 } }) });
    assert.equal(countOf(next), 33, t('la cantidad manual se respeta'));
    assert.equal(next.specs.autoCalculatePanels, false, t('la cantidad manual apaga el autocálculo'));
  }

  { // Encender el autocálculo explícitamente recalcula; apagarlo explícitamente no toca la cantidad.
    const p = baseProject((q) => { q.specs.autoCalculatePanels = false; });
    withPrimary(p, 'panel', { count: 5 });
    const on = apply(p, { kind: 'specs', patch: { autoCalculatePanels: true } });
    assert.equal(on.specs.autoCalculatePanels, true);
    assert.equal(countOf(on), expectedCount(p), t('encender el autocálculo recalcula'));
    const off = apply(baseProject(), { kind: 'specs', patch: { autoCalculatePanels: false } });
    assert.equal(off.specs.autoCalculatePanels, false);
    assert.equal(countOf(off), countOf(baseProject()), t('apagarlo conserva la cantidad'));
  }

  { // Con varios grupos de paneles el conteo no se autocalcula.
    const p = baseProject();
    p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'add', item: { id: 'extra', brandModel: 'Otro', powerW: 500, count: 4, unitPriceUSD: 90 } as never }) };
    const next = apply(p, { kind: 'specs', patch: { systemLosses: 12 } });
    assert.deepEqual(panelsOf(next).map((g) => g.count), panelsOf(p).map((g) => g.count), t('varios grupos: sin recomendación'));
  }

  { // Tarifas: solo la cobertura objetivo recalcula.
    const p = baseProject();
    withPrimary(p, 'panel', { count: 77 });
    const other = apply(p, { kind: 'rates', patch: { energyCostPerKWh: 0.31 } });
    assert.equal(countOf(other), 77, t('otra tarifa no recalcula'));
    assert.equal(other.rates.energyCostPerKWh, 0.31);
    const coverage = apply(p, { kind: 'rates', patch: { targetCoveragePct: 60 } });
    assert.equal(countOf(coverage), expectedCount(p, { coverage: 60 }), t('la cobertura recalcula'));
    const zero = apply(p, { kind: 'rates', patch: { targetCoveragePct: 0 } });
    assert.equal(countOf(zero), expectedCount(p, { coverage: 95 }), t('cobertura 0 dimensiona con el valor resuelto, no con 1 %'));
  }

  { // Cliente: solo el cambio de provincia recalcula; el contacto se refleja en la personalización.
    const p = baseProject();
    withPrimary(p, 'panel', { count: 77 });
    const name = apply(p, { kind: 'client', patch: { name: 'Otro nombre' } });
    assert.equal(countOf(name), 77, t('otro dato del cliente no recalcula'));
    const province = apply(p, { kind: 'client', patch: { province: 'Santiago' } });
    assert.equal(countOf(province), expectedCount(p, { province: 'Santiago' }), t('la provincia recalcula'));
    assert.notEqual(expectedCount(p, { province: 'Santiago' }), expectedCount(p), 'la prueba distingue provincias');
    const contact = apply(p, { kind: 'client', patch: { contactPhone: '809-555-0100', contactPerson: 'Ana', contactEmail: 'ana@example.com' } });
    assert.deepEqual([contact.customization?.clientPhone, contact.customization?.contactName, contact.customization?.clientEmail], ['809-555-0100', 'Ana', 'ana@example.com'], t('el contacto se refleja en el documento'));
  }

  { // Consumo: recalcula con autocálculo; con `lockAutoPanels` lo apaga y conserva la cantidad.
    const p = baseProject((q) => { q.aiSource = { consumptionSource: 'theoretical' } as never; });
    withPrimary(p, 'panel', { count: 77 });
    const monthly = Array(12).fill(4000);
    const auto = apply(p, { kind: 'consumption', monthlyConsumption: monthly });
    assert.equal(countOf(auto), expectedCount(p, { monthly }), t('el consumo recalcula'));
    assert.deepEqual(auto.monthlyConsumption, monthly);
    assert.equal(auto.aiSource?.consumptionSource, 'estimated', t('un consumo teórico editado pasa a estimado'));
    const locked = apply(p, { kind: 'consumption', monthlyConsumption: monthly, lockAutoPanels: true });
    assert.equal(countOf(locked), 77, t('lockAutoPanels conserva la cantidad'));
    assert.equal(locked.specs.autoCalculatePanels, false, t('lockAutoPanels apaga el autocálculo'));
    const manual = apply(baseProject((q) => { q.specs.autoCalculatePanels = false; }), { kind: 'consumption', monthlyConsumption: monthly });
    assert.equal(countOf(manual), countOf(baseProject()), t('sin autocálculo el consumo no toca la cantidad'));
    const negative = apply(p, { kind: 'consumption', monthlyConsumption: [-5, ...Array(11).fill(100)] });
    assert.equal(negative.monthlyConsumption[0], 0, t('el consumo negativo se lleva a 0'));
  }

  { // Proveedor del modelo principal: se suelta si el modelo nuevo no lo cotiza.
    const p = baseProject();
    withPrimary(p, 'panel', { brandModel: 'Panel A 550W', powerW: 550, catalogItemId: 'p-a', selectedSupplierInfo: { supplierName: 'Alfa', priceUSD: 100, updatedAt: '2026-01-01', supplierPriceId: 'sp-a1' } });
    const toB = apply(p, { kind: 'specs', patch: editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { brandModel: 'Panel B 700W' } }) });
    assert.equal(panelsOf(toB)[0].selectedSupplierInfo, undefined, t('Beta no cotiza el modelo nuevo: se suelta Alfa'));
    const toC = apply(p, { kind: 'specs', patch: editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { brandModel: 'Panel C 600W' } }) });
    assert.equal(panelsOf(toC)[0].selectedSupplierInfo?.supplierName, 'Alfa', t('el nombre del proveedor se compara sin mayúsculas ni espacios'));
    const chosen = apply(p, { kind: 'specs', patch: editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { brandModel: 'Panel B 700W', selectedSupplierInfo: { supplierName: 'Beta', priceUSD: 130, updatedAt: '2026-01-01', supplierPriceId: 'sp-b1' } } }) });
    assert.equal(panelsOf(chosen)[0].selectedSupplierInfo?.supplierName, 'Beta', t('si la edición elige proveedor, se conserva'));
    const same = apply(p, { kind: 'specs', patch: { systemLosses: 11 } });
    assert.equal(panelsOf(same)[0].selectedSupplierInfo?.supplierName, 'Alfa', t('sin cambio de modelo el proveedor queda'));
  }

  { // Sobrescrituras financieras manuales: solo sobreviven en el caso de referencia auditado.
    const stale = { customITBISSavedUSD: 10, customLey5707CreditUSD: 20, customCostUSD: 30 };
    const p = baseProject((q) => { q.financials = { ...q.financials, ...stale }; });
    for (const edit of [{ kind: 'financials', patch: { discountRatePct: 12 } }, { kind: 'specs', patch: { systemLosses: 11 } }] as Edit[]) {
      const next = apply(p, edit);
      assert.deepEqual([next.financials.customITBISSavedUSD, next.financials.customLey5707CreditUSD, next.financials.customCostUSD], [undefined, undefined, undefined], t(`${edit.kind}: se limpian las sobrescrituras`));
    }
    const benchmark = baseProject((q) => { q.id = 'benchmark-centro-medico'; q.financials = { ...q.financials, ...stale }; });
    for (const edit of [{ kind: 'financials', patch: { discountRatePct: 12 } }, { kind: 'specs', patch: { systemLosses: 11 } }] as Edit[]) {
      const next = apply(benchmark, edit);
      assert.deepEqual([next.financials.customITBISSavedUSD, next.financials.customLey5707CreditUSD, next.financials.customCostUSD], [10, 20, 30], t(`${edit.kind}: el caso de referencia las conserva`));
    }
    const rates = apply(p, { kind: 'rates', patch: { energyCostPerKWh: 0.4 } });
    assert.equal(rates.financials.customCostUSD, 30, t('una edición de tarifas no toca las finanzas'));
  }

  { // Baterías: activar el almacenamiento fija una cantidad entera positiva.
    const p = baseProject((q) => { q.specs.hasBattery = false; });
    withPrimary(p, 'battery', { count: 0 });
    const next = apply(p, { kind: 'specs', patch: { hasBattery: true } });
    assert.equal(next.specs.hasBattery, true);
    assert.equal(readEquipment(next.specs).batteries[0].count, 1, t('activar la batería la deja en 1 como mínimo'));
  }
}

runMatrix(viaStore, 'store');
runMatrix(viaModule, 'módulo');

// ── Precio de proveedor aplicado desde el catálogo ──────────────────────────────────────────
function runSupplierPriceMatrix(apply: Apply, label: string) {
  const t = (name: string) => `${label}: ${name}`;
  const priceEdit = (equipmentType: 'panel' | 'inverter' | 'battery', equipmentItem: SolarEquipmentItem): Edit =>
    ({ kind: 'supplierPrice', equipmentType, supplierPrice: equipmentItem.supplierPrices![0], equipmentItem });

  { // Batería: el precio activa el almacenamiento y trae la identidad, el DOD y la eficiencia del catálogo.
    const p = baseProject((q) => { q.specs.hasBattery = false; q.financials = { ...q.financials, customCostUSD: 30 }; });
    const next = apply(p, priceEdit('battery', CATALOG[4]));
    const group = readEquipment(next.specs).batteries[0];
    assert.equal(next.specs.hasBattery, true, t('el precio de una batería activa el almacenamiento'));
    assert.deepEqual(
      [group.catalogItemId, group.brandModel, group.capacityKWh, group.unitPriceUSD, group.dodPct, group.efficiencyPct],
      ['b-a', 'Batería A', 10, 2000, 90, 95],
      t('el grupo principal toma identidad, capacidad, precio, DOD y eficiencia del catálogo')
    );
    assert.deepEqual(group.selectedSupplierInfo, { supplierName: 'Alfa', priceUSD: 2000, updatedAt: '2026-01-01', supplierPriceId: 'sp-ba' });
    assert.equal(next.financials.customCostUSD, undefined, t('se limpian las sobrescrituras financieras'));
  }

  { // Panel sin `equipmentItem`: el equipo se busca en el catálogo por el id del precio; la eficiencia del equipo se copia.
    const p = baseProject((q) => { q.specs.autoCalculatePanels = false; });
    const next = apply(p, { kind: 'supplierPrice', equipmentType: 'panel', supplierPrice: CATALOG[1].supplierPrices![0] });
    const group = readEquipment(next.specs).panels[0];
    assert.deepEqual([group.catalogItemId, group.powerW, group.unitPriceUSD, group.selectedSupplierInfo?.supplierPriceId], ['p-b', 700, 130, 'sp-b1'], t('equipo hallado por el id del precio'));
    assert.equal(next.specs.panelEfficiency, 22.4, t('la eficiencia del módulo se copia al proyecto'));
    assert.equal(countOf(next), countOf(p), t('sin autocálculo la cantidad no cambia'));
  }

  { // Decisión (b): el precio es una edición más. Con autocálculo y un modelo de otra potencia, la cantidad se recalcula.
    // (Antes rodeaba `updateActiveProject`: el modelo pasaba de 620 W a 700 W y la cantidad se quedaba en 38.)
    const p = baseProject();
    const next = apply(p, priceEdit('panel', CATALOG[1]));
    assert.equal(panelsOf(next)[0].powerW, 700);
    assert.equal(next.specs.autoCalculatePanels, true);
    const withNewPower = { ...p, specs: { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { powerW: 700 } }) } };
    assert.equal(countOf(next), expectedCount(withNewPower), t('(b) la cantidad se recalcula con la potencia del modelo nuevo'));
    assert.notEqual(countOf(next), countOf(p), t('la prueba distingue la cantidad previa'));
  }

  { // Decisión (b): con autocálculo, el precio de otro tipo de equipo deja la cantidad en el valor que recomienda el motor.
    const p = baseProject();
    const next = apply(p, priceEdit('inverter', CATALOG[3]));
    assert.equal(readEquipment(next.specs).inverters[0].unitPriceUSD, 2500);
    assert.equal(countOf(next), expectedCount(p), t('(b) la cantidad sigue siendo la recomendada'));
  }
}
runSupplierPriceMatrix(viaStore, 'store');
runSupplierPriceMatrix(viaModule, 'módulo');

// ── Reconciliación con el catálogo (decisión c): corre en la siguiente edición, nunca al mirar ─────
{
  const stale = () => baseProject((q) => {
    q.specs.autoCalculatePanels = false;
    withPrimary(q, 'panel', { brandModel: 'Panel A 550W', powerW: 600, selectedSupplierInfo: { supplierName: 'Ghost', priceUSD: 1, updatedAt: '2026-01-01' } });
    withPrimary(q, 'inverter', { brandModel: 'Inversor A 10K', powerKW: 8 });
  });
  const primary = (p: ProjectSimulation) => ({ panel: panelsOf(p)[0], inverter: readEquipment(p.specs).inverters[0] });

  for (const [label, edit] of [
    ['specs', { kind: 'specs', patch: { systemLosses: 11 } }],
    ['rates', { kind: 'rates', patch: { energyCostPerKWh: 0.3 } }],
    ['client', { kind: 'client', patch: { name: 'Otro' } }],
    ['consumption', { kind: 'consumption', monthlyConsumption: Array(12).fill(900) }],
  ] as [string, Edit][]) {
    const next = viaModule(stale(), edit);
    assert.equal(primary(next).panel.powerW, 550, `(c) ${label}: el panel toma la potencia del catálogo en la siguiente edición`);
    assert.equal(primary(next).inverter.powerKW, 10, `(c) ${label}: el inversor toma la potencia del catálogo`);
    assert.equal(primary(next).panel.selectedSupplierInfo, undefined, `(c) ${label}: se suelta el proveedor que ningún panel del catálogo cotiza`);
    assert.deepEqual(viaStore(stale(), edit).specs, next.specs, `(c) ${label}: el store aplica la misma reconciliación`);
  }

  { // Las finanzas no tocan las specs: la reconciliación no corre.
    const next = viaModule(stale(), { kind: 'financials', patch: { discountRatePct: 12 } });
    assert.equal(primary(next).panel.powerW, 600);
  }

  { // Lo que la propia edición fijó se respeta: una potencia manual o un proveedor elegido no se revierten en el acto.
    const manual = viaModule(stale(), { kind: 'specs', patch: editEquipmentGroup(stale().specs, 'panel', { type: 'update', index: 0, patch: { powerW: 580 } }) });
    assert.equal(primary(manual).panel.powerW, 580, '(c) la potencia escrita por la edición no se revierte');
    const chosen = viaModule(stale(), { kind: 'specs', patch: editEquipmentGroup(stale().specs, 'panel', { type: 'update', index: 0, patch: { selectedSupplierInfo: { supplierName: 'Nuevo', priceUSD: 5, updatedAt: '2026-01-01' } } }) });
    assert.equal(primary(chosen).panel.selectedSupplierInfo?.supplierName, 'Nuevo', '(c) el proveedor elegido por la edición se conserva');
  }

  { // Un proveedor cotizado por algún equipo del tipo se conserva; modelos fuera del catálogo no se tocan.
    const quoted = baseProject((q) => withPrimary(q, 'panel', { selectedSupplierInfo: { supplierName: ' ALFA', priceUSD: 1, updatedAt: '2026-01-01' } }));
    assert.equal(primary(viaModule(quoted, { kind: 'rates', patch: { energyCostPerKWh: 0.3 } })).panel.selectedSupplierInfo?.supplierName, ' ALFA', '(c) el proveedor sigue cotizado por un panel del catálogo');
    const unknown = baseProject((q) => withPrimary(q, 'panel', { brandModel: 'Modelo ajeno', powerW: 480 }));
    assert.equal(primary(viaModule(unknown, { kind: 'rates', patch: { energyCostPerKWh: 0.3 } })).panel.powerW, 480, '(c) un modelo fuera del catálogo no se toca');
  }

  { // El proveedor se busca entre los equipos del mismo tipo: «Alfa» cotiza un inversor y una batería, no un panel ajeno.
    const ghosts = baseProject((q) => {
      withPrimary(q, 'panel', { selectedSupplierInfo: { supplierName: 'Ghost', priceUSD: 1, updatedAt: '2026-01-01' } });
      withPrimary(q, 'inverter', { selectedSupplierInfo: { supplierName: 'Ghost2', priceUSD: 2, updatedAt: '2026-01-01' } });
      withPrimary(q, 'battery', { selectedSupplierInfo: { supplierName: 'Alfa', priceUSD: 3, updatedAt: '2026-01-01' } });
    });
    const next = viaModule(ghosts, { kind: 'rates', patch: { energyCostPerKWh: 0.3 } });
    assert.deepEqual(
      [primary(next).panel.selectedSupplierInfo, primary(next).inverter.selectedSupplierInfo, readEquipment(next.specs).batteries[0].selectedSupplierInfo?.supplierName],
      [undefined, undefined, 'Alfa'],
      '(c) los proveedores sin oferta en el catálogo salen; el que una batería del catálogo cotiza se queda'
    );
    const onlyPanelAlfa = [CATALOG[0]];
    const kept = viaModule(baseProject((q) => withPrimary(q, 'battery', { selectedSupplierInfo: { supplierName: 'Alfa', priceUSD: 3, updatedAt: '2026-01-01' } })), { kind: 'rates', patch: { energyCostPerKWh: 0.3 } }, onlyPanelAlfa);
    assert.equal(readEquipment(kept.specs).batteries[0].selectedSupplierInfo, undefined, '(c) «Alfa» solo cotiza un panel: no basta para una batería');
  }

  { // Catálogo sin cargar (vacío): no hay con qué reconciliar; nada se toca.
    const next = viaModule(stale(), { kind: 'rates', patch: { energyCostPerKWh: 0.3 } }, []);
    assert.equal(primary(next).panel.powerW, 600);
    assert.equal(primary(next).panel.selectedSupplierInfo?.supplierName, 'Ghost');
  }

  { // La potencia corregida entra al autodimensionado de la misma edición.
    const auto = stale();
    auto.specs.autoCalculatePanels = true;
    const next = viaModule(auto, { kind: 'rates', patch: { targetCoveragePct: 80 } });
    const corrected = { ...auto, rates: { ...auto.rates, targetCoveragePct: 80 }, specs: { ...auto.specs, ...editEquipmentGroup(auto.specs, 'panel', { type: 'update', index: 0, patch: { powerW: 550 } }) } };
    assert.equal(countOf(next), expectedCount(corrected), '(c) el conteo se calcula con la potencia ya corregida');
  }

  { // Regla general (revisión de PR #101): con autocálculo, si la reconciliación cambió la potencia del panel principal en
    // CUALQUIER tipo de edición, la cantidad se recalcula; producción y finanzas no se mueven sin sostener la cobertura.
    const auto = () => { const p = stale(); p.specs.autoCalculatePanels = true; withPrimary(p, 'panel', { count: 5 }); return p; };
    const corrected = (patch: (p: ProjectSimulation) => void = () => {}) => {
      const p = auto();
      patch(p);
      p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { powerW: 550 } }) };
      return p;
    };
    for (const apply of [viaModule, viaStore]) {
      const label = apply === viaModule ? 'módulo' : 'store';
      const rates = apply(auto(), { kind: 'rates', patch: { energyCostPerKWh: 0.3 } });
      assert.equal(panelsOf(rates)[0].powerW, 550);
      assert.equal(countOf(rates), expectedCount(corrected()), `${label}: tarifa distinta de la cobertura: la potencia corregida recalcula`);
      assert.notEqual(countOf(rates), 5, 'la prueba distingue la cantidad desfasada');
      const client = apply(auto(), { kind: 'client', patch: { name: 'Otro' } });
      assert.equal(countOf(client), expectedCount(corrected()), `${label}: dato del cliente distinto de la provincia: recalcula`);
      const consumption = apply(auto(), { kind: 'consumption', monthlyConsumption: Array(12).fill(900) });
      assert.equal(countOf(consumption), expectedCount(corrected(), { monthly: Array(12).fill(900) }), `${label}: consumo con la potencia corregida`);
      // Financieras: no tocan las specs ni reconcilian; la potencia desfasada y la cantidad se quedan como estaban.
      const financials = apply(auto(), { kind: 'financials', patch: { discountRatePct: 12 } });
      assert.deepEqual([panelsOf(financials)[0].powerW, countOf(financials)], [600, 5], `${label}: finanzas no reconcilia ni recalcula`);
      // Sin autocálculo la potencia se corrige y la cantidad manual se respeta.
      const manual = auto();
      manual.specs.autoCalculatePanels = false;
      const kept = apply(manual, { kind: 'rates', patch: { energyCostPerKWh: 0.3 } });
      assert.deepEqual([panelsOf(kept)[0].powerW, countOf(kept)], [550, 5], `${label}: sin autocálculo la cantidad manual se respeta`);
      // Otras entradas del dimensionamiento: HSP propio del cliente (el de los meses) recalcula; sin cambio de entradas, no.
      const hsp = apply(baseProject((q) => withPrimary(q, 'panel', { count: 77 })), { kind: 'client', patch: { customMonthlyHSP: Array(12).fill(3) } });
      assert.equal(countOf(hsp), expectedCount({ ...baseProject(), client: { ...baseProject().client, customMonthlyHSP: Array(12).fill(3) } }), `${label}: un HSP propio recalcula`);
      const same = apply(baseProject((q) => withPrimary(q, 'panel', { count: 77 })), { kind: 'rates', patch: { energyCostPerKWh: 0.3 } });
      assert.equal(countOf(same), 77, `${label}: sin cambio de entradas de dimensionamiento no se recalcula`);
    }
  }
}

// ── Mirar no escribe (decisión c) y deshacer (decisión b): contra el store ───────────────────
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const UNDO_DEBOUNCE_MS = 700; // recordUndoState agrupa en 600 ms

/** Instala `project` como activo con el historial de deshacer vacío, ejecuta `body` y restaura el store. */
async function inStore<T>(project: ProjectSimulation, body: () => Promise<T>): Promise<T> {
  await wait(UNDO_DEBOUNCE_MS); // deja correr el temporizador de deshacer de la prueba anterior
  const original = store.getState();
  try {
    store.setState({ projects: [structuredClone(project)], activeProjectId: project.id, equipmentCatalog: CATALOG, undoStack: [], redoStack: [], canUndo: false, canRedo: false });
    store.getState().setActiveProject(project.id, 'simulator'); // abrir la propuesta: inicia la base del historial
    return await body();
  } finally {
    store.setState(original, true);
  }
}

/** Ejecuta los efectos que registran los componentes al renderizarse (el render estático no los corre). */
function renderAndRunEffects(render: () => void): number {
  const patched = React as unknown as Record<'useEffect' | 'useLayoutEffect', unknown>;
  const originals = { useEffect: patched.useEffect, useLayoutEffect: patched.useLayoutEffect };
  const effects: Array<() => unknown> = [];
  patched.useEffect = patched.useLayoutEffect = (fn: () => unknown) => { effects.push(fn); };
  try { render(); } finally { Object.assign(patched, originals); }
  effects.forEach((run) => run());
  return effects.length;
}

async function main() {
  { // Decisión (c): abrir una propuesta con datos desfasados del catálogo y montar el dock no escribe nada.
    const stale = baseProject((q) => {
      q.id = 'proj-edit-view';
      q.specs.autoCalculatePanels = false;
      withPrimary(q, 'panel', { brandModel: 'Panel A 550W', powerW: 600, selectedSupplierInfo: { supplierName: 'Ghost', priceUSD: 1, updatedAt: '2026-01-01' } });
      withPrimary(q, 'inverter', { brandModel: 'Inversor A 10K', powerKW: 8 });
    });
    await inStore(stale, async () => {
      let autoSyncCalls = 0;
      store.setState({ triggerAutoSync: () => { autoSyncCalls += 1; } });
      const before = store.getState();
      const project = before.projects[0];
      const summary = calculateProjectFinancialSummary(project);
      const effectCount = renderAndRunEffects(() => {
        const { updateSpecs } = store.getState();
        renderToStaticMarkup(React.createElement(EquipmentParamsSection, { project, summary, updateSpecs } as never));
        renderToStaticMarkup(React.createElement(PricingParamsSection, { project, summary, updateSpecs } as never));
      });
      assert.ok(effectCount >= 0);
      await wait(UNDO_DEBOUNCE_MS);
      const after = store.getState();
      assert.equal(after.projects, before.projects, '(c) ver el proyecto no escribe: el arreglo de proyectos es el mismo');
      assert.equal(after.projects[0], project, '(c) ni reemplaza la propuesta');
      assert.equal(autoSyncCalls, 0, '(c) ni dispara sincronización');
      assert.equal(after.undoStack, before.undoStack, '(c) ni registra deshacer');
      assert.equal(after.undoStack.length, 1, 'solo la base que inicia al abrir la propuesta');
      after.setActiveProject(project.id, 'simulator'); // reabrir la misma propuesta
      await wait(UNDO_DEBOUNCE_MS);
      assert.equal(store.getState().undoStack.length, 1, '(c) reabrir la misma propuesta tampoco agrega entradas de deshacer');
      assert.equal(store.getState().canUndo, false);
      // La siguiente edición real sí reconcilia con el catálogo.
      after.updateRates({ energyCostPerKWh: 0.3 });
      const edited = store.getState().projects[0];
      assert.equal(panelsOf(edited)[0].powerW, 550, '(c) la siguiente edición real corrige la potencia');
      assert.equal(panelsOf(edited)[0].selectedSupplierInfo, undefined, '(c) y suelta el proveedor huérfano');
    });
  }

  { // Decisión (b): aplicar un precio deja una entrada de deshacer y deshacer lo revierte.
    // (Antes: «aplicar un precio no deja entrada de deshacer».)
    const p = baseProject((q) => { q.id = 'proj-edit-undo'; });
    await inStore(p, async () => {
      assert.equal(store.getState().undoStack.length, 1);
      store.getState().applySupplierPriceToProject('panel', CATALOG[1].supplierPrices![0], CATALOG[1]);
      assert.match(store.getState().saveFeedbackMessage ?? '', /Precio aplicado: Beta \(\$130 USD\)/, 'el mensaje de confirmación se conserva');
      await wait(UNDO_DEBOUNCE_MS);
      const applied = store.getState();
      assert.equal(applied.undoStack.length, 2, '(b) el precio deja una entrada de deshacer');
      assert.equal(applied.canUndo, true);
      assert.equal(panelsOf(applied.projects[0])[0].selectedSupplierInfo?.supplierName, 'Beta');
      applied.undo();
      const restored = store.getState().projects[0];
      assert.equal(panelsOf(restored)[0].selectedSupplierInfo, undefined, '(b) deshacer quita el proveedor');
      assert.equal(panelsOf(restored)[0].powerW, 620);
      assert.equal(countOf(restored), 38, '(b) y devuelve la cantidad de paneles anterior');
      await wait(3100); // el mensaje de confirmación se limpia solo
      assert.equal(store.getState().saveFeedbackMessage, null, 'el mensaje se borra tras unos segundos');
    });
  }

  { // Revisión de PR #101 (ronda 2): el editor del documento y las herramientas de agente escriben los espejos del cliente
    // por la misma ruta que `updateClient`: reconcilian con el catálogo y autodimensionan; el texto y la personalización quedan intactos.
    const staleAuto = (id: string) => baseProject((q) => {
      q.id = id;
      withPrimary(q, 'panel', { brandModel: 'Panel A 550W', powerW: 600, count: 5, selectedSupplierInfo: { supplierName: 'Ghost', priceUSD: 1, updatedAt: '2026-01-01' } });
    });
    const reference = (id: string, patch: Partial<ProjectSimulation['client']>) => viaModule(staleAuto(id), { kind: 'client', patch });
    const run = async (id: string, action: (s: ReturnType<typeof store.getState>) => void) => inStore(staleAuto(id), async () => {
      action(store.getState());
      return store.getState().projects[0];
    });

    const phone = await run('doc-phone', (s) => s.setDocumentTexts({ 'client.phone': '809-555-0101', 'quotation.warranty.panel': '30 años' }));
    const expected = reference('doc-phone', { contactPhone: '809-555-0101' });
    assert.equal(panelsOf(phone)[0].powerW, 550, 'setDocumentTexts con un espejo del cliente reconcilia la potencia');
    assert.equal(panelsOf(phone)[0].selectedSupplierInfo, undefined, 'y suelta el proveedor huérfano');
    assert.equal(countOf(phone), countOf(expected), 'y recalcula la cantidad igual que updateClient');
    assert.notEqual(countOf(phone), 5);
    assert.equal(phone.client.contactPhone, '809-555-0101');
    assert.equal(phone.customization?.clientPhone, '809-555-0101', 'el espejo del documento queda intacto');
    assert.equal(phone.customization?.panelWarrantyText, '30 años', 'el texto del documento queda intacto');

    const custom = await run('doc-custom', (s) => s.updateDocumentCustomization({ clientEmail: 'a@b.com', contactName: 'Ana' }));
    assert.deepEqual([custom.client.contactEmail, custom.client.contactPerson, custom.customization?.clientEmail, custom.customization?.contactName], ['a@b.com', 'Ana', 'a@b.com', 'Ana']);
    assert.equal(panelsOf(custom)[0].powerW, 550, 'updateDocumentCustomization con un espejo del cliente reconcilia');
    assert.equal(countOf(custom), countOf(reference('doc-custom', { contactEmail: 'a@b.com', contactPerson: 'Ana' })), 'y recalcula como updateClient');

    // Una edición del documento que no toca el cliente (garantía, diseño, anexos) no es una edición de specs: no reconcilia.
    const textOnly = await run('doc-text', (s) => s.setDocumentTexts({ 'quotation.warranty.panel': '30 años' }));
    assert.deepEqual([panelsOf(textOnly)[0].powerW, countOf(textOnly)], [600, 5], 'solo texto: ni reconciliación ni autodimensionado');
    const customOnly = await run('doc-custom-only', (s) => s.updateDocumentCustomization({ themeId: 'x' } as never));
    assert.deepEqual([panelsOf(customOnly)[0].powerW, countOf(customOnly)], [600, 5], 'personalización sin espejos del cliente: no reconcilia');

    // Herramienta de agente sobre una propuesta que no está abierta: misma ruta, y deshacer devuelve también las specs.
    await wait(UNDO_DEBOUNCE_MS);
    const original = store.getState();
    try {
      const target = staleAuto('doc-tool');
      store.setState({ workspaceScope: 'local', projects: [baseProject((q) => { q.id = 'doc-open'; }), structuredClone(target)], activeProjectId: 'doc-open', equipmentCatalog: CATALOG, sessionGeneration: 0,
        agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
        syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
      const ctx = { source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'claude-code' };
      const applied = await executeAgentTool({ name: 'set_document_text', args: { proposalId: 'doc-tool', key: 'client.phone', text: '809-555-0202' } }, ctx);
      assert.equal(applied.status, 'applied', JSON.stringify(applied));
      const after = store.getState().projects.find((q) => q.id === 'doc-tool')!;
      assert.equal(panelsOf(after)[0].powerW, 550, 'set_document_text con un espejo del cliente reconcilia');
      assert.equal(countOf(after), countOf(reference('doc-tool', { contactPhone: '809-555-0202' })), 'y recalcula la cantidad');
      assert.equal(store.getState().undoAgentActivity(applied.activityId).success, true);
      const undone = store.getState().projects.find((q) => q.id === 'doc-tool')!;
      assert.deepEqual([panelsOf(undone)[0].powerW, countOf(undone), undone.client.contactPhone], [600, 5, target.client.contactPhone], 'deshacer devuelve cliente, personalización y specs');
      const warranty = await executeAgentTool({ name: 'set_document_text', args: { proposalId: 'doc-tool', key: 'quotation.warranty.panel', text: 'x' } }, ctx);
      assert.equal(warranty.status, 'applied');
      const textOnlyTool = store.getState().projects.find((q) => q.id === 'doc-tool')!;
      assert.deepEqual([panelsOf(textOnlyTool)[0].powerW, countOf(textOnlyTool)], [600, 5], 'texto sin espejo: la herramienta no toca las specs');
    } finally {
      store.setState(original, true);
    }
  }

  console.log('PASS: edición de proyecto (caracterización del store, módulo puro, precio de proveedor, reconciliación y vista sin escrituras).');
}

main().catch((error) => { console.error(error); process.exit(1); });
