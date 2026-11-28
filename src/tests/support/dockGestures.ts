// F2b: batería de gestos del dock de parámetros, compartida por la copia dorada (`testDockGesturesGolden`: el proyecto que
// deja cada gesto no cambia al mudar las reglas al dominio) y por la equivalencia gesto ≡ lote por ruta
// (`testDockRulesInDomain`). Cada gesto arma su parche con las MISMAS funciones que llaman los componentes del dock (sus
// rutas de importación de siempre) y lo escribe con `createDockWriters`, como `SimulatorView`.
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { RD_PROVINCES } from '../../data/rdProvinces';
import { DEFAULT_AGENT_POLICY } from '../../store/slices/agentSlice';
import { EMPTY_UNDO_HISTORY } from '../../store/undo/projectUndoJournal';
import { useSimulationStore as store } from '../../store/useSimulationStore';
import { createDockWriters, DOCK_COMMIT_OPTIONS, type DockWriters } from '../../components/simulator/params/logic/dockEdits';
import {
  averageMonthlyConsumption, daytimeSliderChange, loadProfileChange, planApplyReference, planDistributorChange, planTariffChange,
  type ChangeContext,
} from '../../components/simulator/params/sections/rates/ratesLogic';
import { kwpPricePatch, multiplierFromMarginInput, multiplierFromQuickMargin, roundedWattPrice, wattPricePatch } from '../../components/simulator/params/logic/pricingSync';
import { bestSupplierPricingPatch, manualUnitPricePatch } from '../../components/simulator/params/sections/pricing/supplierPricing';
import { createGroupActions } from '../../components/simulator/params/sections/equipment/equipmentGroupModel';
import { resolveAssumptions } from '../../../shared/assumptions';
import { readEquipment } from '../../../shared/equipment';
import { resolvePricePerWattUSD } from '../../../shared/projectDefaults';
import { resolveProjectEquipment } from '../../utils/equipmentMatchingUtils';
import { editEquipmentGroup } from '../../utils/equipmentGroups';
import type { GenericPriceInfo } from '../../../shared/equipmentPrices';
import type { FinancialSummaryResult, ProjectSimulation } from '../../types';
import type { EquipmentSupplierPrice, SolarEquipmentItem } from '../../types/equipment';

const offer = (id: string, supplierName: string, priceUSD: number, extra: Partial<EquipmentSupplierPrice> = {}): EquipmentSupplierPrice =>
  ({ id, supplierName, priceUSD, updatedAt: '2026-01-01', ...extra });
const item = (extra: Partial<SolarEquipmentItem> & Pick<SolarEquipmentItem, 'id' | 'type' | 'displayName'>): SolarEquipmentItem =>
  ({ brand: 'B', modelSeries: 'M', createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra }) as SolarEquipmentItem;

export const GESTURE_CATALOG: SolarEquipmentItem[] = [
  item({ id: 'p-a', type: 'panel', displayName: 'Panel A 550W', powerW: 550, efficiencyPct: 21.5, supplierPrices: [offer('sp-a1', 'Alfa', 100), offer('sp-a2', 'Gama', 92)] }),
  item({ id: 'p-b', type: 'panel', displayName: 'Panel B 700W', powerW: 700, efficiencyPct: 22.4, tempCoeff: -0.3, annualDegradation: 0.35,
    preferredSupplierId: 'sp-b2', supplierPrices: [offer('sp-b1', 'Beta', 130), offer('sp-b2', 'Delta', 138)] }),
  item({ id: 'p-c', type: 'panel', displayName: 'Panel C 610W', powerW: 610, supplierPrices: [offer('sp-c1', 'Beta', 90, { stockStatus: 'out_of_stock' })] }),
  item({ id: 'i-a', type: 'inverter', displayName: 'Inversor A 10K', powerKW: 10, supplierPrices: [offer('sp-ia', 'Alfa', 2500), offer('sp-ib', 'Beta', 2400)] }),
  item({ id: 'i-b', type: 'inverter', displayName: 'Inversor B 5K', powerKW: 5, supplierPrices: [] }),
  item({ id: 'b-a', type: 'battery', displayName: 'Batería A', capacityKWh: 10, dodPct: 90, batteryEfficiencyPct: 95, supplierPrices: [offer('sp-ba', 'Alfa', 2000)] }),
  item({ id: 'b-b', type: 'battery', displayName: 'Batería B', capacityKWh: 5, supplierPrices: [] }),
];

/** Precio genérico de ejemplo (solo para «Inversor B 5K» y «Batería B», que no tienen ofertas). */
export const genericFor = (id: string): GenericPriceInfo | null =>
  id === 'i-b' ? { priceUSD: 1180, observationId: 'obs-ib', observedAt: '2026-02-01T00:00:00.000Z', source: 'manual' } as unknown as GenericPriceInfo
    : id === 'b-b' ? { priceUSD: 900, observationId: 'obs-bb', observedAt: '2026-02-01T00:00:00.000Z', source: 'manual' } as unknown as GenericPriceInfo
      : null;

const otherProvince = RD_PROVINCES.find((province) => province.name !== BENCHMARK_PROJECT.client.province && province.avgHSP !== RD_PROVINCES[0].avgHSP)!.name;

/** Caso de referencia con el panel y el inversor principales del catálogo, autodimensionado activo y sin baterías. */
export function gestureBase(id = 'gesture-base'): ProjectSimulation {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = id;
  p.specs = { ...p.specs, autoCalculatePanels: true, hasBattery: false };
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { brandModel: 'Panel A 550W', powerW: 550, catalogItemId: 'p-a' } }) };
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { brandModel: 'Inversor A 10K', powerKW: 10, catalogItemId: 'i-a' } }) };
  p.client = { ...p.client, customMonthlyHSP: [5, 5.2, 5.4, 5.6, 5.5, 5.3, 5.4, 5.5, 5.2, 5, 4.8, 4.7] };
  return p;
}

/** Variante: perfil de carga manual, SIE-007 con precio de referencia y fila, batería incluida. */
export function gestureVariant(id = 'gesture-variant'): ProjectSimulation {
  const p = gestureBase(id);
  p.specs = { ...p.specs, loadProfilePreset: 'custom', daytimeLoadRatio: 55, daytimeSelfConsumptionRatio: 55, hasBattery: true, autoCalculatePanels: false };
  p.rates = { ...p.rates, netMeteringRegime: 'sie007_2026', distributor: 'EDENORTE', tariffCode: 'BTS1' };
  return p;
}

export interface GestureContext {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  catalog: SolarEquipmentItem[];
}

export interface DockGesture {
  label: string;
  base: () => ProjectSimulation;
  /** El gesto tal como lo hace el componente del dock. */
  dock: (writers: DockWriters, ctx: GestureContext) => void;
}

/** Contexto que arma `RatesFields` para sus planes. */
const ratesContext = (p: ProjectSimulation): ChangeContext => ({
  matrix: store.getState().tariffMatrix,
  avgMonthlyConsumption: averageMonthlyConsumption(p),
  dopExchangeRate: resolveAssumptions(p).dopExchangeRate,
  rates: p.rates,
  loadProfilePreset: p.specs?.loadProfilePreset,
  canWriteSpecs: true,
});
const applyPlan = (w: DockWriters, plan: { rates: ProjectSimulation['rates'] | Partial<ProjectSimulation['rates']>; specs: Partial<ProjectSimulation['specs']> | null }) =>
  w.updateRatesAndSpecs(plan.rates, plan.specs);
/** Equipos que `PricingParamsSection` resuelve para «Mejor proveedor». */
const selectedItems = (p: ProjectSimulation, catalog: SolarEquipmentItem[]) => {
  const { panels, inverters, batteries } = readEquipment(p.specs);
  return {
    panel: resolveProjectEquipment(catalog, 'panel', panels[0]?.brandModel, panels[0]?.powerW, panels[0]?.selectedSupplierInfo?.supplierPriceId),
    inverter: resolveProjectEquipment(catalog, 'inverter', inverters[0]?.brandModel, inverters[0]?.powerKW, inverters[0]?.selectedSupplierInfo?.supplierPriceId),
    battery: resolveProjectEquipment(catalog, 'battery', batteries[0]?.brandModel, batteries[0]?.capacityKWh, batteries[0]?.selectedSupplierInfo?.supplierPriceId),
  };
};
const groups = (kind: 'panel' | 'inverter' | 'battery', c: GestureContext, w: DockWriters) => createGroupActions(kind, c.project.specs, c.catalog, w.updateSpecs, genericFor);
const byId = (c: GestureContext, id: string) => c.catalog.find((entry) => entry.id === id)!;
const withManualPrice = (id: string) => () => ({ ...gestureBase(id), rates: { ...gestureBase(id).rates, energyCostPerKWh: 0.31, energyRateSource: 'manual' as const } });
const withTwoPanels = (id: string) => () => {
  const p = gestureBase(id);
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'add', item: { id: 'panel-2', brandModel: 'Panel B 700W', catalogItemId: 'p-b', powerW: 700, count: 4, unitPriceUSD: 130 } }), autoCalculatePanels: false };
  return p;
};
const withDirect = (id: string) => () => ({ ...gestureBase(id), specs: { ...gestureBase(id).specs, pricingMode: 'direct_watt' as const, pricePerWattUSD: 1.4, pricePerKWpUSD: 1400 } });

export const DOCK_GESTURES: DockGesture[] = [
  // Tarifas (RatesFields): distribuidora, tarifa, tarifa oficial; perfil de carga.
  { label: 'distribuidora EDENORTE', base: gestureBase, dock: (w, c) => applyPlan(w, planDistributorChange(ratesContext(c.project), 'EDENORTE')) },
  { label: 'distribuidora CEPM', base: gestureBase, dock: (w, c) => applyPlan(w, planDistributorChange(ratesContext(c.project), 'CEPM')) },
  { label: 'distribuidora con precio a mano', base: withManualPrice('gesture-manual'), dock: (w, c) => applyPlan(w, planDistributorChange(ratesContext(c.project), 'EDEESTE')) },
  { label: 'distribuidora con perfil manual', base: gestureVariant, dock: (w, c) => applyPlan(w, planDistributorChange(ratesContext(c.project), 'EDESUR')) },
  { label: 'tarifa BTD', base: gestureBase, dock: (w, c) => applyPlan(w, planTariffChange(ratesContext(c.project), 'BTD')) },
  { label: 'tarifa BTS1', base: gestureBase, dock: (w, c) => applyPlan(w, planTariffChange(ratesContext(c.project), 'BTS1')) },
  { label: 'tarifa con perfil manual', base: gestureVariant, dock: (w, c) => applyPlan(w, planTariffChange(ratesContext(c.project), 'BTS2')) },
  { label: 'tarifa oficial', base: withManualPrice('gesture-reference'), dock: (w, c) => w.updateRates(planApplyReference(ratesContext(c.project))) },
  { label: 'perfil residencial', base: gestureBase, dock: (w) => w.updateSpecs(loadProfileChange('residential')) },
  { label: 'perfil comercial', base: gestureVariant, dock: (w) => w.updateSpecs(loadProfileChange('commercial')) },
  { label: 'perfil industrial', base: gestureBase, dock: (w) => w.updateSpecs(loadProfileChange('industrial')) },
  { label: 'perfil manual', base: gestureBase, dock: (w) => w.updateSpecs(loadProfileChange('custom')) },
  { label: 'consumo diurno 60', base: gestureBase, dock: (w) => w.updateSpecs(daytimeSliderChange(60)) },
  // Cliente: provincia (RadiationSource borra la radiación propia).
  { label: 'provincia', base: gestureBase, dock: (w) => w.updateClient({ province: otherProvince, customMonthlyHSP: undefined }) },
  // Costos y margen (PricingParamsSection, DirectPrice).
  { label: 'margen 30 %', base: gestureBase, dock: (w) => w.updateSpecs({ saleMarginMultiplier: multiplierFromMarginInput(30) }) },
  { label: 'margen 27,35 %', base: gestureBase, dock: (w) => w.updateSpecs({ saleMarginMultiplier: multiplierFromMarginInput(27.35) }) },
  { label: 'margen rápido 35 %', base: gestureBase, dock: (w) => w.updateSpecs({ saleMarginMultiplier: multiplierFromQuickMargin(35) }) },
  { label: 'margen negativo', base: gestureBase, dock: (w) => w.updateSpecs({ saleMarginMultiplier: multiplierFromMarginInput(-5) }) },
  { label: 'modo directo', base: gestureBase, dock: (w, c) => w.updateSpecs({ pricingMode: 'direct_watt', ...wattPricePatch(roundedWattPrice(c.summary.costMatrix?.salePricePerWattUSD, resolvePricePerWattUSD(c.project.specs, c.project.financials))) }) },
  { label: 'modo matriz', base: withDirect('gesture-direct'), dock: (w) => w.updateSpecs({ pricingMode: 'cost_matrix' }) },
  { label: '$/W 1,25', base: withDirect('gesture-watt'), dock: (w) => w.updateSpecs(wattPricePatch(1.25)) },
  { label: '$/kWp 1330', base: withDirect('gesture-kwp'), dock: (w) => w.updateSpecs(kwpPricePatch(1330)) },
  { label: 'sugerir de costos', base: withDirect('gesture-suggest'), dock: (w, c) => w.updateSpecs(wattPricePatch(roundedWattPrice(c.summary.costMatrix?.salePricePerWattUSD, resolvePricePerWattUSD(c.project.specs, { pricePerWattUSD: c.project.financials.pricePerWattUSD })))) },
  // Precios por modelo (UnitCosts).
  { label: 'mejor proveedor', base: gestureBase, dock: (w, c) => w.updateSpecs(bestSupplierPricingPatch(c.project.specs, selectedItems(c.project, c.catalog))) },
  { label: 'mejor proveedor con batería', base: gestureVariant, dock: (w, c) => w.updateSpecs(bestSupplierPricingPatch(c.project.specs, selectedItems(c.project, c.catalog))) },
  { label: 'precio a mano panel', base: gestureBase, dock: (w, c) => w.updateSpecs(manualUnitPricePatch(c.project.specs, 'panel', 0, 120)) },
  { label: 'precio a mano inversor', base: gestureBase, dock: (w, c) => w.updateSpecs(manualUnitPricePatch(c.project.specs, 'inverter', 0, 2100)) },
  // Equipos del catálogo y la lista (EquipmentGroupList → createGroupActions).
  { label: 'catálogo: panel B', base: gestureBase, dock: (w, c) => groups('panel', c, w).select(0, byId(c, 'p-b')) },
  { label: 'catálogo: panel C (agotado)', base: gestureBase, dock: (w, c) => groups('panel', c, w).select(0, byId(c, 'p-c')) },
  { label: 'catálogo: inversor B (genérico)', base: gestureBase, dock: (w, c) => groups('inverter', c, w).select(0, byId(c, 'i-b')) },
  { label: 'catálogo: batería A', base: gestureVariant, dock: (w, c) => groups('battery', c, w).select(0, byId(c, 'b-a')) },
  { label: 'catálogo: batería B (genérico)', base: gestureVariant, dock: (w, c) => groups('battery', c, w).select(0, byId(c, 'b-b')) },
  { label: 'catálogo: panel secundario', base: withTwoPanels('gesture-two'), dock: (w, c) => groups('panel', c, w).select(1, byId(c, 'p-a')) },
  { label: 'añadir panel', base: gestureBase, dock: (w, c) => groups('panel', c, w).add() },
  { label: 'añadir batería', base: gestureBase, dock: (w, c) => groups('battery', c, w).add() },
  { label: 'quitar grupo', base: withTwoPanels('gesture-remove'), dock: (w, c) => groups('panel', c, w).remove(1) },
  { label: 'cantidad de paneles', base: gestureBase, dock: (w, c) => groups('panel', c, w).setCount(0, 40.7) },
  { label: 'marca a mano', base: gestureBase, dock: (w, c) => groups('panel', c, w).setBrand(0, 'Mi panel 600W') },
  { label: 'marca del catálogo a mano', base: gestureBase, dock: (w, c) => groups('panel', c, w).setBrand(0, 'Panel B 700W') },
  { label: 'potencia a mano', base: gestureBase, dock: (w, c) => groups('panel', c, w).setMagnitude(0, 600) },
  { label: 'incluir batería', base: gestureBase, dock: (w) => w.updateSpecs({ hasBattery: true }) },
];

export function resetGestureStore(project: ProjectSimulation, catalog: SolarEquipmentItem[] = GESTURE_CATALOG): void {
  store.setState({
    appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, activeView: 'simulator',
    equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
    agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
    syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  });
  store.getState().setActiveProject(project.id, 'simulator');
}

/** Secciones que deja el gesto (sin sellos ni identificadores de la mutación). */
export const GESTURE_SECTIONS = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization', 'aiSource'] as const;
export const sectionsOf = (p: ProjectSimulation) => Object.fromEntries(GESTURE_SECTIONS.map((section) => [section, p[section] ?? null]));

/** JSON con las claves ordenadas: el orden de inserción de un parche no es parte del resultado. */
export const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, v) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));

/** Ejecuta el gesto del dock desde su base, con `Date.now` fijo (los ids de «+» lo usan), y devuelve la propuesta. */
export function runDockGesture(gesture: DockGesture): ProjectSimulation {
  const project = gesture.base();
  resetGestureStore(project);
  const realNow = Date.now;
  Date.now = () => 1767225600000; // 2026-01-01
  try {
    const state = store.getState();
    const writers = createDockWriters((edits) => store.getState().commitProjectEdits(project.id, edits, DOCK_COMMIT_OPTIONS));
    gesture.dock(writers, { project: state.getActiveProject(), summary: state.getFinancialSummary(), catalog: state.equipmentCatalog });
  } finally {
    Date.now = realNow;
  }
  return store.getState().getActiveProject();
}
