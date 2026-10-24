import type { ClientInfo, FinancialParams, LegacyProjectSpecs, ProjectSimulation, SystemSpecs, UtilityRates } from '../types';
import type { EquipmentSupplierPrice, SolarEquipmentItem } from '../types/equipment';
import { LIST_KEY, editEquipment, migrateLegacySpecs, readEquipment, type EquipmentKind } from '../../shared/equipment';
import { resolveAssumption, resolveAssumptions } from '../../shared/assumptions';
import { resolveSystemLossesPct } from '../../shared/projectDefaults';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { editEquipmentGroup, normalizeEquipmentEdit, normalizeSpecsChange, selectCatalogEquipment } from '../utils/equipmentGroups';
import { normalizeEnabledBatteries } from '../utils/batteryState';
import { supplierQuotesItem } from '../utils/equipmentMatchingUtils';

/**
 * Edición de proyecto (ADR 0004): la única regla para aplicar un cambio de specs, tarifas, cliente, consumo o
 * finanzas a una propuesta. Es pura: sin Zustand, sin temporizadores y sin reloj. Las porciones del store solo
 * persisten, sincronizan y registran deshacer; el sello de la mutación (`updatedAt`, autor) también es suyo.
 *
 * Reglas que viven aquí y en ningún otro lugar:
 * - normalización de equipos (solo grupos, baterías habilitadas con cantidad positiva);
 * - autodimensionado de paneles (`autoCalculatePanels`): cambio de specs, cobertura, provincia o consumo;
 * - una cantidad manual del grupo principal de paneles apaga el autodimensionado;
 * - el proveedor del modelo principal se suelta si el modelo nuevo no lo cotiza;
 * - sobrescrituras financieras manuales: solo sobreviven en el caso de referencia auditado;
 * - reconciliación con el catálogo (potencia del modelo principal y proveedor huérfano), que corre en la siguiente
 *   edición real: mirar un proyecto nunca lo escribe.
 */

export type ProjectEdit =
  | { kind: 'specs'; patch: Partial<SystemSpecs> }
  | { kind: 'rates'; patch: Partial<UtilityRates> }
  | { kind: 'client'; patch: Partial<ClientInfo> }
  /** `lockAutoPanels`: el consumo viene de una fuente que fija la cantidad de paneles (apaga el autodimensionado). */
  | { kind: 'consumption'; monthlyConsumption: number[]; lockAutoPanels?: boolean }
  | { kind: 'financials'; patch: Partial<FinancialParams> }
  /** Precio de un proveedor del catálogo aplicado al grupo principal del tipo. Sin `equipmentItem` se busca por el id del precio. */
  | { kind: 'supplierPrice'; equipmentType: EquipmentKind; supplierPrice: EquipmentSupplierPrice; equipmentItem?: SolarEquipmentItem };

export interface ProjectEditContext {
  /** Catálogo de equipos vigente. Vacío (sin cargar) desactiva la reconciliación, no las demás reglas. */
  equipmentCatalog: readonly SolarEquipmentItem[];
}

/** El caso de referencia auditado conserva sus cifras manuales; en cualquier otra propuesta se recalculan. */
export const AUDITED_REFERENCE_PROJECT_ID = BENCHMARK_PROJECT.id;

const KINDS = ['panel', 'inverter', 'battery'] as const;
type PrimaryKind = (typeof KINDS)[number];
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Aplica una edición y devuelve el proyecto editado. No muta la entrada ni sella la mutación (eso es del store). */
export function applyProjectEdit(project: ProjectSimulation, edit: ProjectEdit, ctx: ProjectEditContext): ProjectSimulation {
  const catalog = ctx.equipmentCatalog;
  let next: ProjectSimulation;
  switch (edit.kind) {
    case 'specs':
      next = editSpecs(project, edit.patch, catalog);
      break;
    case 'supplierPrice':
      next = editSpecs(project, supplierPricePatch(project, edit, catalog), catalog);
      break;
    case 'rates': {
      const rates = { ...project.rates, ...edit.patch };
      next = resizeIfNeeded(project, { ...project, rates, specs: { ...reconcileWithCatalog(project.specs, project.specs, catalog) } }, edit.patch.targetCoveragePct !== undefined);
      break;
    }
    case 'client': {
      const client = { ...project.client, ...edit.patch };
      const customization = { ...(project.customization || {}) };
      if (edit.patch.contactPhone !== undefined) customization.clientPhone = edit.patch.contactPhone;
      if (edit.patch.contactPerson !== undefined) customization.contactName = edit.patch.contactPerson;
      if (edit.patch.contactEmail !== undefined) customization.clientEmail = edit.patch.contactEmail;
      next = resizeIfNeeded(project, { ...project, client, customization, specs: { ...reconcileWithCatalog(project.specs, project.specs, catalog) } }, !!edit.patch.province);
      break;
    }
    case 'consumption': {
      const monthlyConsumption = edit.monthlyConsumption.map((value) => Math.max(0, value));
      const reconciled = { ...reconcileWithCatalog(project.specs, project.specs, catalog) };
      const specs = edit.lockAutoPanels ? { ...reconciled, autoCalculatePanels: false } : reconciled;
      next = resizeIfNeeded(project, {
        ...project,
        monthlyConsumption,
        aiSource: project.aiSource?.consumptionSource === 'theoretical' ? { ...project.aiSource, consumptionSource: 'estimated' } : project.aiSource,
        specs,
      }, true);
      break;
    }
    case 'financials':
      // Sin reconciliación ni entradas de dimensionamiento: la cantidad de paneles no se toca.
      next = { ...project, financials: withoutStaleFinancialOverrides(project, { ...project.financials, ...edit.patch }) };
      break;
  }
  return normalizeProjectEquipment(project, next);
}

/**
 * Edición del documento (textos, datos de contacto de la hoja) que reescribe un espejo de `project.client`. La parte del
 * cliente es una edición `client` más: reconcilia con el catálogo y autodimensiona igual que `updateClient`. La
 * personalización que calculó el documento se conserva tal cual. Si el cliente no cambia (garantía, diseño…), no es una
 * edición de specs y solo se devuelve la personalización. Devuelve solo los campos que el llamador debe fusionar.
 */
export function applyDocumentClientEdit(
  project: ProjectSimulation,
  next: { customization: ProjectSimulation['customization']; client: ClientInfo },
  ctx: ProjectEditContext
): Pick<ProjectSimulation, 'customization' | 'client'> & Partial<Pick<ProjectSimulation, 'specs'>> {
  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(project.client), ...Object.keys(next.client)]) as Set<keyof ClientInfo>) {
    if (project.client[key] !== next.client[key]) patch[key] = next.client[key];
  }
  if (Object.keys(patch).length === 0) return { customization: next.customization, client: next.client };
  const edited = applyProjectEdit({ ...project, customization: next.customization }, { kind: 'client', patch: patch as Partial<ClientInfo> }, ctx);
  return { customization: next.customization, client: edited.client, specs: edited.specs };
}

/** Mantiene los grupos de equipos consistentes (y sin espejo heredado) sea cual sea la ruta que cambió las specs. */
export function normalizeProjectEquipment(previous: ProjectSimulation, next: ProjectSimulation): ProjectSimulation {
  return next.specs === previous.specs ? next : { ...next, specs: normalizeSpecsChange(previous.specs, next.specs) };
}

/** Specs de un proyecto que entra de golpe (importación, borrador de IA): solo grupos y baterías habilitadas válidas; sin autodimensionar. */
export function normalizeIncomingSpecs(specs: LegacyProjectSpecs): SystemSpecs {
  return normalizeEnabledBatteries(migrateLegacySpecs(specs));
}

/** Las sobrescrituras financieras manuales solo sobreviven en el caso de referencia auditado; en las demás ediciones se recalculan. */
export function withoutStaleFinancialOverrides(project: Pick<ProjectSimulation, 'id'>, financials: FinancialParams): FinancialParams {
  const next = { ...financials };
  if (project.id !== AUDITED_REFERENCE_PROJECT_ID) {
    delete next.customITBISSavedUSD;
    delete next.customLey5707CreditUSD;
    delete next.customCostUSD;
  }
  return next;
}

// ── Autodimensionado ────────────────────────────────────────────────────────────────────────

/** Specs con la cantidad de paneles que recomienda el motor para el consumo, la provincia y la cobertura del proyecto. */
function withRecommendedPanels(project: ProjectSimulation, specs: SystemSpecs): SystemSpecs {
  const rec = calculateRecommendedPanelCount(
    project.client.province,
    project.monthlyConsumption,
    readEquipment(specs).panels[0]?.powerW || 620,
    resolveAssumption('targetCoveragePct', project.rates.targetCoveragePct), // la frontera: 0 o fuera de rango dimensiona con el valor resuelto, no con 1 %
    resolveSystemLossesPct(specs),
    project.client.customMonthlyHSP
  );
  // Solo un grupo de paneles recibe la recomendación; con varios modelos la cantidad no se autocalcula.
  return readEquipment(specs).panels.length === 1
    ? editEquipment(specs, 'panel', { type: 'update', index: 0, patch: { count: rec.recommendedPanelCount } })
    : specs;
}

/** Entradas del dimensionamiento: potencia del panel principal, consumo, provincia y HSP propio, cobertura y pérdidas resueltas. */
const sizingInputs = (project: ProjectSimulation) => {
  const assumptions = resolveAssumptions(project);
  return JSON.stringify([
    readEquipment(project.specs).panels[0]?.powerW, project.monthlyConsumption, project.client.province, project.client.customMonthlyHSP,
    assumptions.targetCoveragePct, assumptions.systemLossesPct,
  ]);
};

/**
 * El único punto donde las ediciones que no son de specs autodimensionan, DESPUÉS de reconciliar con el catálogo: con
 * `autoCalculatePanels` activo la cantidad se recalcula si el cambio lo pide (`forced`: cobertura, provincia, consumo) o si
 * alguna entrada del dimensionamiento cambió por el camino, por ejemplo la potencia que corrigió el catálogo. Así la
 * producción y las finanzas no se mueven sin sostener la cobertura objetivo, sea cual sea la edición. `next` ya trae el cambio.
 */
function resizeIfNeeded(before: ProjectSimulation, next: ProjectSimulation, forced: boolean): ProjectSimulation {
  if (!next.specs.autoCalculatePanels || !(forced || sizingInputs(before) !== sizingInputs(next))) return next;
  return { ...next, specs: withRecommendedPanels(next, next.specs) };
}

// ── Specs ───────────────────────────────────────────────────────────────────────────────────

function editSpecs(project: ProjectSimulation, patch: Partial<SystemSpecs>, catalog: readonly SolarEquipmentItem[]): ProjectSimulation {
  let specs = normalizeEnabledBatteries(normalizeEquipmentEdit(project.specs, patch));
  const before = readEquipment(project.specs);
  const after = readEquipment(specs);
  // Editar la cantidad del primer grupo de paneles (dock, asistente) es una cantidad manual: apaga el autocálculo.
  const panelCountEdited = after.panels[0]?.count !== before.panels[0]?.count;
  const shouldAutoCalc = patch.autoCalculatePanels !== undefined
    ? patch.autoCalculatePanels
    : (project.specs.autoCalculatePanels && !panelCountEdited);

  specs = dropSupplierOfChangedModel(project.specs, specs, catalog);
  specs = reconcileWithCatalog(project.specs, specs, catalog);

  if (shouldAutoCalc) specs = { ...withRecommendedPanels(project, specs), autoCalculatePanels: true };
  else if (panelCountEdited && patch.autoCalculatePanels === undefined) specs = { ...specs, autoCalculatePanels: false };

  return { ...project, specs, financials: withoutStaleFinancialOverrides(project, project.financials) };
}

/** Cuando cambia el modelo principal, se suelta el proveedor elegido que no cotiza el modelo nuevo (el proveedor vive en el grupo). */
function dropSupplierOfChangedModel(previous: SystemSpecs, specs: SystemSpecs, catalog: readonly SolarEquipmentItem[]): SystemSpecs {
  const before = readEquipment(previous);
  let result = specs;
  const lists = [['panel', 'panels'], ['inverter', 'inverters'], ['battery', 'batteries']] as const;
  for (const [kind, key] of lists) {
    const prior = before[key][0];
    const current = readEquipment(result)[key][0];
    if (!current?.brandModel || current.brandModel === prior?.brandModel) continue;
    if (!sameJson(current.selectedSupplierInfo, prior?.selectedSupplierInfo)) continue; // la edición eligió el proveedor
    const supplier = current.selectedSupplierInfo;
    if (!supplier) continue;
    const item = catalog.find((e) => e.type === kind && e.displayName === current.brandModel);
    const quoted = (item?.supplierPrices || []).some(
      (sp) => sp.id === supplier.supplierPriceId || sp.supplierName.toLowerCase().trim() === supplier.supplierName?.toLowerCase().trim()
    );
    if (!quoted) result = editEquipment(result, kind, { type: 'update', index: 0, patch: { selectedSupplierInfo: undefined } });
  }
  return result;
}

/** El parche de specs de un precio de proveedor: el grupo principal toma precio, proveedor e identidad de catálogo (para las fichas anexas). */
function supplierPricePatch(project: ProjectSimulation, edit: Extract<ProjectEdit, { kind: 'supplierPrice' }>, catalog: readonly SolarEquipmentItem[]): Partial<SystemSpecs> {
  const { equipmentType, supplierPrice } = edit;
  const targetItem = edit.equipmentItem || catalog.find((e) => e.type === equipmentType && e.supplierPrices?.some((sp) => sp.id === supplierPrice.id));
  const supplierInfo = {
    supplierName: supplierPrice.supplierName,
    priceUSD: supplierPrice.priceUSD,
    updatedAt: supplierPrice.updatedAt,
    supplierPriceId: supplierPrice.id,
  };
  const system: Partial<SystemSpecs> = {};
  if (equipmentType === 'battery') system.hasBattery = true;
  if (equipmentType === 'panel' && targetItem?.efficiencyPct) system.panelEfficiency = targetItem.efficiencyPct;

  const extras: Record<string, unknown> = { unitPriceUSD: supplierPrice.priceUSD, selectedSupplierInfo: supplierInfo };
  if (equipmentType === 'battery' && targetItem) {
    if (targetItem.dodPct) extras.dodPct = targetItem.dodPct;
    if (targetItem.batteryEfficiencyPct) extras.efficiencyPct = targetItem.batteryEfficiencyPct;
  }
  const withSystem: SystemSpecs = { ...project.specs, ...system };
  const group = targetItem
    ? selectCatalogEquipment(withSystem, equipmentType, 0, targetItem, extras)
    : editEquipmentGroup(withSystem, equipmentType, { type: 'update', index: 0, patch: extras });
  return { ...system, ...group };
}

// ── Reconciliación con el catálogo ──────────────────────────────────────────────────────────

const primaryOf = (specs: SystemSpecs, kind: PrimaryKind) => migrateLegacySpecs(specs)[LIST_KEY[kind]]?.[0];
const POWER_FIELD = { panel: 'powerW', inverter: 'powerKW' } as const;

/**
 * Pone el modelo principal en sintonía con el catálogo. Antes lo hacían dos efectos del dock al mirar la propuesta
 * (`useCatalogPowerSync`, `useSupplierCleanup`); mirar nunca escribe, así que corre en la siguiente edición real.
 * - Potencia: un panel o inversor principal que está en el catálogo (por nombre exacto) toma su potencia unitaria.
 * - Proveedor huérfano: se suelta el proveedor del grupo principal que ningún equipo del tipo cotiza (por id de oferta
 *   o por nombre sin mayúsculas ni espacios, `supplierQuotesItem`). Basta con que algún equipo del tipo lo cotice,
 *   igual que cuando el dock resolvía el equipo y lo comparaba.
 * Lo que la propia edición fijó (`previous` ≠ `specs` en ese campo) se respeta: un valor manual no se revierte en el acto.
 * Con el catálogo sin cargar (vacío) no hay con qué reconciliar y no se toca nada.
 */
function reconcileWithCatalog(previous: SystemSpecs, specs: SystemSpecs, catalog: readonly SolarEquipmentItem[]): SystemSpecs {
  if (catalog.length === 0) return specs;
  let result = specs;
  for (const kind of ['panel', 'inverter'] as const) {
    const field = POWER_FIELD[kind];
    const group = primaryOf(result, kind) as unknown as Record<string, unknown> | undefined;
    const prior = primaryOf(previous, kind) as unknown as Record<string, unknown> | undefined;
    const brandModel = group?.brandModel;
    if (typeof brandModel !== 'string' || !brandModel || !group?.[field]) continue;
    if (group[field] !== prior?.[field]) continue; // la edición fijó la potencia
    const match = catalog.find((item) => item.type === kind && item.displayName === brandModel);
    const catalogPower = kind === 'panel' ? match?.powerW : match?.powerKW;
    if (catalogPower && catalogPower !== group[field]) result = editEquipment(result, kind, { type: 'update', index: 0, patch: { [field]: catalogPower } } as never);
  }
  for (const kind of KINDS) {
    const info = primaryOf(result, kind)?.selectedSupplierInfo;
    if (!info) continue;
    if (!sameJson(info, primaryOf(previous, kind)?.selectedSupplierInfo)) continue; // la edición eligió el proveedor
    if (catalog.some((item) => item.type === kind && supplierQuotesItem(item, info))) continue;
    result = editEquipment(result, kind, { type: 'update', index: 0, patch: { selectedSupplierInfo: undefined } });
  }
  return result;
}
