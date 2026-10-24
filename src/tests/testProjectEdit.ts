import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { resolveAssumptions } from '../../shared/assumptions';
import { readEquipment } from '../../shared/equipment';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { useSimulationStore as store } from '../store/useSimulationStore';
import type { ClientInfo, FinancialParams, ProjectSimulation, SystemSpecs, UtilityRates } from '../types';
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
type Edit =
  | { kind: 'specs'; patch: Partial<SystemSpecs> }
  | { kind: 'rates'; patch: Partial<UtilityRates> }
  | { kind: 'client'; patch: Partial<ClientInfo> }
  | { kind: 'consumption'; monthlyConsumption: number[]; lockAutoPanels?: boolean }
  | { kind: 'financials'; patch: Partial<FinancialParams> };

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
    else s.setMonthlyConsumption(edit.monthlyConsumption, edit.lockAutoPanels);
    return store.getState().projects[0];
  } finally {
    store.setState(original, true);
  }
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

// ── Precio de proveedor aplicado desde el catálogo (solo store: hoy rodea `updateActiveProject`) ────
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const UNDO_DEBOUNCE_MS = 700; // recordUndoState agrupa en 600 ms

/** Aplica un precio de proveedor desde el modal del catálogo y devuelve el estado resultante del store. */
async function applySupplierPrice(project: ProjectSimulation, kind: 'panel' | 'inverter' | 'battery', price: EquipmentSupplierPrice, target?: SolarEquipmentItem) {
  await wait(UNDO_DEBOUNCE_MS); // deja correr el temporizador de deshacer que dejó la edición anterior
  const original = store.getState();
  try {
    store.setState({ projects: [structuredClone(project)], activeProjectId: project.id, equipmentCatalog: CATALOG });
    store.getState().setActiveProject(project.id, 'simulator'); // base del historial de deshacer
    const undoBefore = store.getState().undoStack.length;
    store.getState().applySupplierPriceToProject(kind, price, target);
    const immediate = store.getState();
    await wait(UNDO_DEBOUNCE_MS);
    const settled = store.getState();
    return { project: settled.projects[0], feedback: immediate.saveFeedbackMessage, undoGrew: settled.undoStack.length - undoBefore, canUndo: settled.canUndo, undo: settled.undo, getProject: () => store.getState().projects[0] };
  } finally {
    // el llamador usa `getProject` antes de que se restaure el estado: se restaura al terminar `main`
    pendingRestores.push(() => store.setState(original, true));
  }
}
const pendingRestores: Array<() => void> = [];

async function main() {
  { // Batería: el precio activa el almacenamiento y trae la identidad, el DOD y la eficiencia del catálogo.
    const p = baseProject((q) => { q.id = 'proj-edit-battery'; q.specs.hasBattery = false; q.financials = { ...q.financials, customCostUSD: 30 }; });
    const price = CATALOG[4].supplierPrices![0];
    const result = await applySupplierPrice(p, 'battery', price, CATALOG[4]);
    const group = readEquipment(result.project.specs).batteries[0];
    assert.equal(result.project.specs.hasBattery, true, 'el precio de una batería activa el almacenamiento');
    assert.deepEqual(
      [group.catalogItemId, group.brandModel, group.capacityKWh, group.unitPriceUSD, group.dodPct, group.efficiencyPct],
      ['b-a', 'Batería A', 10, 2000, 90, 95],
      'el grupo principal toma identidad, capacidad, precio, DOD y eficiencia del catálogo'
    );
    assert.deepEqual(group.selectedSupplierInfo, { supplierName: 'Alfa', priceUSD: 2000, updatedAt: '2026-01-01', supplierPriceId: 'sp-ba' });
    assert.equal(result.project.financials.customCostUSD, undefined, 'se limpian las sobrescrituras financieras');
    assert.match(result.feedback ?? '', /Precio aplicado: Alfa \(\$2000 USD\)/, 'mensaje de confirmación');
  }

  { // Panel sin `equipmentItem`: el equipo se busca en el catálogo por el id del precio; la eficiencia del equipo se copia.
    const p = baseProject((q) => { q.id = 'proj-edit-panel'; q.specs.autoCalculatePanels = false; });
    const result = await applySupplierPrice(p, 'panel', CATALOG[1].supplierPrices![0]);
    const group = readEquipment(result.project.specs).panels[0];
    assert.deepEqual([group.catalogItemId, group.powerW, group.unitPriceUSD, group.selectedSupplierInfo?.supplierPriceId], ['p-b', 700, 130, 'sp-b1']);
    assert.equal(result.project.specs.panelEfficiency, 22.4, 'la eficiencia del módulo se copia al proyecto');
  }

  { // HOY el precio rodea `updateActiveProject`: no autodimensiona y no registra deshacer.
    const p = baseProject((q) => { q.id = 'proj-edit-auto'; });
    const result = await applySupplierPrice(p, 'panel', CATALOG[1].supplierPrices![0]);
    assert.equal(result.project.specs.autoCalculatePanels, true);
    assert.equal(countOf(result.project), countOf(p), 'HOY: el modelo cambia de potencia y la cantidad no se recalcula');
    assert.equal(result.undoGrew, 0, 'HOY: aplicar un precio no deja entrada de deshacer');
  }

  pendingRestores.reverse().forEach((restore) => restore());
  console.log('PASS: edición de proyecto (caracterización del store).');
}

main().catch((error) => { console.error(error); process.exit(1); });
