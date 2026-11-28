/**
 * Intenciones de edición (F2b; ADR 0004, «Reglas del dock en el dominio»). Puro. El dock arma cada gesto con las reglas de
 * `rules/` y escribe el parche completo; un lote por ruta del asistente o de un agente suele traer solo la intención
 * («cambia la distribuidora a X», «elige este panel del catálogo»). `expandEditIntents` completa ese lote con las MISMAS
 * reglas, para que el proyecto resultante sea idéntico al del gesto equivalente en el dock. Lo que el lote ya trae manda: una
 * regla solo añade los campos que el lote no fija (un precio del kWh escrito junto con la tarifa nueva se respeta).
 *
 * Lo que no es un campo (añadir o quitar un grupo, el margen en %, «Sugerir de costos») es una intención con nombre
 * (`projectIntentEdits`) que se traduce al lote por ruta que escribiría el dock.
 */
import type { ProjectSimulation, SystemSpecs, UtilityRates } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { LIST_KEY, migrateLegacySpecs, readEquipment, type EquipmentKind } from '../../shared/equipment';
import { resolveAssumptions } from '../../shared/assumptions';
import { tariffMatrixKey } from '../../shared/tariffRules';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { resolveProjectEquipment } from '../utils/equipmentMatchingUtils';
import { detachedCatalogIdentity } from '../utils/equipmentGroups';
import { mapTariffCodeOnDistributorChange, type UtilityDistributor } from '../types/tariffs';
import type { EnergyCalculationMode } from '../../shared/applicationFeatures';
import type { ProjectEditContext } from './projectEdit';
import {
  LOAD_PROFILE_DAYTIME_PCT, averageMonthlyConsumption, currentDistributor, currentTariffCode, recommendedProfileSpecs, referenceRatesPatch,
} from './rules/tariffRules';
import {
  bestSupplierPricingPatch, multiplierFromMarginInput, multiplierFromQuickMargin, pricePerKWpFromWatt, pricePerWattFromKWp, suggestedWattPrice,
  wattPricePatch,
} from './rules/pricingRules';
import { groupAddPatch, groupRemovePatch, groupSelectPatch } from './rules/equipmentRules';

/** Una edición por ruta (la misma forma que `ProjectFieldEdit` de la transacción). */
export interface IntentFieldEdit {
  path: string;
  value: unknown;
}

export interface IntentContext extends ProjectEditContext {
  calculationMode?: EnergyCalculationMode;
}

export interface IntentExpansion {
  /** Rutas del lote que se sustituyen por su traducción (elegir del catálogo por `catalogItemId`). */
  replaced: Set<string>;
  /** Ediciones que añaden las reglas (cambios derivados). */
  edits: IntentFieldEdit[];
  errors: { path: string; message: string }[];
  warnings: string[];
}

const LISTS = { panels: 'panel', inverters: 'inverter', batteries: 'battery' } as const;
type ListName = keyof typeof LISTS;
const NOUN: Record<EquipmentKind, string> = { panel: 'panel', inverter: 'inversor', battery: 'batería' };
const distributorKey = (value: unknown): string => (typeof value === 'string' ? value.trim().toUpperCase() : '');
const patchEdits = (section: 'client' | 'specs' | 'rates' | 'financials', patch: object | null | undefined): IntentFieldEdit[] =>
  Object.entries(patch ?? {}).map(([key, value]) => ({ path: `${section}.${key}`, value }));
const groupPath = /^specs\.(panels|inverters|batteries)\[(\d+)\]\.([A-Za-z]+)$/;

/** Equipos del catálogo que el dock resuelve para «Mejor proveedor» (el modelo principal de cada tipo). */
function primaryCatalogItems(specs: SystemSpecs, catalog: readonly SolarEquipmentItem[]) {
  const { panels, inverters, batteries } = readEquipment(specs);
  const list = catalog as SolarEquipmentItem[];
  return {
    panel: resolveProjectEquipment(list, 'panel', panels[0]?.brandModel, panels[0]?.powerW, panels[0]?.selectedSupplierInfo?.supplierPriceId),
    inverter: resolveProjectEquipment(list, 'inverter', inverters[0]?.brandModel, inverters[0]?.powerKW, inverters[0]?.selectedSupplierInfo?.supplierPriceId),
    battery: resolveProjectEquipment(list, 'battery', batteries[0]?.brandModel, batteries[0]?.capacityKWh, batteries[0]?.selectedSupplierInfo?.supplierPriceId),
  };
}

/** $/Wp que sugiere la matriz de costos de la propuesta (al pasar a Directo y «Sugerir de costos»). */
export function suggestedDirectWattPrice(project: ProjectSimulation, calculationMode: EnergyCalculationMode = 'legacy'): number {
  const matrix = calculateProjectFinancialSummary(project, calculationMode).costMatrix;
  return suggestedWattPrice(matrix?.salePricePerWattUSD, project.specs, project.financials?.pricePerWattUSD);
}

/**
 * Completa un lote por ruta con las reglas del dock. `project` es la base del lote; `preview`, la base con los valores del
 * lote escritos tal cual (de ella salen el consumo y la tasa con que se calcula una tarifa de referencia).
 */
export function expandEditIntents(project: ProjectSimulation, preview: ProjectSimulation, requested: readonly IntentFieldEdit[], ctx: IntentContext): IntentExpansion {
  const result: IntentExpansion = { replaced: new Set(), edits: [], errors: [], warnings: [] };
  const asked = new Map(requested.map((edit) => [edit.path, edit.value]));
  const has = (path: string) => asked.has(path);
  const touchesList = (list: ListName) => requested.some((edit) => edit.path === `specs.${list}` || edit.path.startsWith(`specs.${list}[`));
  const derive = (path: string, value: unknown) => {
    if (has(path) || result.edits.some((edit) => edit.path === path)) return;
    result.edits.push({ path, value });
  };
  const deriveAll = (edits: IntentFieldEdit[]) => edits.forEach((edit) => derive(edit.path, edit.value));
  const specs = migrateLegacySpecs(project.specs);
  const base = { ...project, specs };
  const catalog = ctx.equipmentCatalog;

  // ── Equipos: elegir del catálogo, marca a mano, precio a mano ──
  const selections = new Map<ListName, number>();
  for (const edit of requested) {
    const match = groupPath.exec(edit.path);
    if (!match) continue;
    const [, list, rawIndex, field] = match as unknown as [string, ListName, string, string];
    const kind = LISTS[list];
    const index = Number(rawIndex);
    if (field === 'catalogItemId') {
      const item = typeof edit.value === 'string' ? catalog.find((entry) => entry.id === edit.value) : undefined;
      if (catalog.length === 0) { result.errors.push({ path: edit.path, message: 'El catálogo de equipos no está cargado: no se puede elegir un modelo por su id.' }); continue; }
      if (!item) { result.errors.push({ path: edit.path, message: `«${String(edit.value)}» no es un equipo del catálogo.` }); continue; }
      if (item.type !== kind) { result.errors.push({ path: edit.path, message: `${item.displayName} no es un ${NOUN[kind]}: elige un equipo del tipo correcto.` }); continue; }
      const others = requested.filter((other) => other !== edit && (other.path === `specs.${list}` || other.path.startsWith(`specs.${list}[`)));
      if (others.length || selections.has(list)) {
        result.errors.push({ path: edit.path, message: `Elegir un ${NOUN[kind]} del catálogo cambia todo su grupo: envía los demás cambios de ${list === 'panels' ? 'paneles' : list === 'inverters' ? 'inversores' : 'baterías'} en otro lote.` });
        continue;
      }
      selections.set(list, index);
      result.replaced.add(edit.path);
      deriveAll(patchEdits('specs', groupSelectPatch(kind, specs, index, item, ctx.genericPriceFor?.(item.id))));
      continue;
    }
    const group = readEquipment({ ...specs, hasBattery: true })[list][index];
    if (!group) continue; // la transacción ya informa del índice que no existe
    if (field === 'brandModel' && typeof edit.value === 'string' && !has(`specs.${list}[${index}].catalogItemId`) && !has(`specs.${list}[${index}].manualModel`)) {
      for (const [key, value] of Object.entries(detachedCatalogIdentity(kind, group, edit.value, catalog))) derive(`specs.${list}[${index}].${key}`, value);
    }
    if (field === 'unitPriceUSD' && typeof edit.value === 'number' && edit.value !== group.unitPriceUSD) {
      // Precio a mano (como teclearlo en la fila): marcado `manual`, sin la copia del genérico y sin el modo automático.
      derive(`specs.${list}[${index}].priceSource`, 'manual');
      derive(`specs.${list}[${index}].genericPriceInfo`, undefined);
      derive('specs.autoSupplierPricing', false);
    }
  }

  // ── «Mejor proveedor» ──
  if (asked.get('specs.autoSupplierPricing') === true) {
    // Cada modelo principal toma su proveedor más barato, salvo los grupos que el propio lote escribe (el dock manda el
    // botón con sus grupos ya resueltos; un agente que cambia los paneles en el mismo lote fija esos precios él mismo).
    const patch = bestSupplierPricingPatch(specs, primaryCatalogItems(specs, catalog)) as Record<string, unknown>;
    deriveAll(patchEdits('specs', Object.fromEntries(Object.entries(patch).filter(([key]) => !(key in LISTS && touchesList(key as ListName))))));
  }

  // ── Tarifa: distribuidora, código, precio de referencia y perfil de carga ──
  const newDistributor = asked.get('rates.distributor') as UtilityRates['distributor'] | undefined;
  const distributorChanged = has('rates.distributor') && distributorKey(newDistributor) !== distributorKey(project.rates.distributor);
  let tariffCode = has('rates.tariffCode') ? (asked.get('rates.tariffCode') as string) : undefined;
  if (distributorChanged && tariffCode === undefined) {
    tariffCode = mapTariffCodeOnDistributorChange(currentDistributor(project.rates), newDistributor as UtilityDistributor, currentTariffCode(project.rates));
    derive('rates.tariffCode', tariffCode);
  }
  const finalDistributor = (has('rates.distributor') ? newDistributor : project.rates.distributor) as string;
  const finalCode = tariffCode ?? currentTariffCode(project.rates);
  const codeChanged = has('rates.tariffCode') && tariffMatrixKey(distributorKey(finalDistributor), finalCode) !== tariffMatrixKey(distributorKey(finalDistributor), project.rates.tariffCode ?? '');
  const tariffChanged = distributorChanged || codeChanged;
  const reference = {
    matrix: ctx.tariffMatrix,
    avgMonthlyConsumption: averageMonthlyConsumption(preview),
    dopExchangeRate: resolveAssumptions(preview).dopExchangeRate,
  };
  const pricePinned = has('rates.energyCostPerKWh') || has('rates.billingTariff') || (has('rates.energyRateSource') && asked.get('rates.energyRateSource') !== 'reference');
  if (tariffChanged && !pricePinned) {
    const patch = referenceRatesPatch(reference, currentDistributor({ distributor: finalDistributor as UtilityDistributor }), finalCode);
    if (project.rates.energyRateSource !== 'reference' && patch.energyCostPerKWh !== project.rates.energyCostPerKWh) {
      result.warnings.push('El precio del kWh pasó al de referencia de la tarifa nueva (como en el dock); para conservar otro precio, inclúyelo en el mismo lote.');
    }
    deriveAll(patchEdits('rates', patch));
  }
  const profilePinned = has('specs.loadProfilePreset') || has('specs.daytimeLoadRatio') || has('specs.daytimeSelfConsumptionRatio');
  if (tariffChanged && !profilePinned && preview.specs?.loadProfilePreset !== 'custom') {
    deriveAll(patchEdits('specs', recommendedProfileSpecs(finalCode, reference.avgMonthlyConsumption)));
  }
  // «Aplicar tarifa oficial»: la procedencia de referencia sin precio trae el precio y la fila de la tarifa actual.
  if (!tariffChanged && asked.get('rates.energyRateSource') === 'reference' && !has('rates.energyCostPerKWh') && !has('rates.billingTariff')) {
    deriveAll(patchEdits('rates', referenceRatesPatch(reference, currentDistributor({ distributor: finalDistributor as UtilityDistributor }), finalCode)));
  }

  // ── Perfil de carga ──
  const preset = asked.get('specs.loadProfilePreset');
  if (typeof preset === 'string' && preset in LOAD_PROFILE_DAYTIME_PCT && !has('specs.daytimeLoadRatio') && !has('specs.daytimeSelfConsumptionRatio')) {
    const ratio = LOAD_PROFILE_DAYTIME_PCT[preset as keyof typeof LOAD_PROFILE_DAYTIME_PCT];
    derive('specs.daytimeLoadRatio', ratio);
    derive('specs.daytimeSelfConsumptionRatio', ratio);
  }
  const daytime = asked.get('specs.daytimeLoadRatio');
  if (typeof daytime === 'number' && !has('specs.daytimeSelfConsumptionRatio') && !has('specs.loadProfilePreset')) {
    derive('specs.daytimeSelfConsumptionRatio', daytime);
    derive('specs.loadProfilePreset', 'custom');
  }

  // ── Provincia: la radiación propia era de la ubicación anterior ──
  if (has('client.province') && asked.get('client.province') !== project.client.province && !has('client.customMonthlyHSP') && project.client.customMonthlyHSP !== undefined) {
    derive('client.customMonthlyHSP', undefined);
  }

  // ── Precio directo: $/Wp ↔ $/kWp y el precio sugerido al pasar a Directo ──
  const watt = asked.get('specs.pricePerWattUSD');
  const kwp = asked.get('specs.pricePerKWpUSD');
  if (typeof watt === 'number' && !has('specs.pricePerKWpUSD')) derive('specs.pricePerKWpUSD', pricePerKWpFromWatt(watt));
  if (typeof kwp === 'number' && !has('specs.pricePerWattUSD')) derive('specs.pricePerWattUSD', pricePerWattFromKWp(kwp));
  if (asked.get('specs.pricingMode') === 'direct_watt' && project.specs.pricingMode !== 'direct_watt' && !has('specs.pricePerWattUSD') && !has('specs.pricePerKWpUSD')) {
    deriveAll(patchEdits('specs', wattPricePatch(suggestedDirectWattPrice(base, ctx.calculationMode))));
  }
  return result;
}

// ── Intenciones con nombre ──────────────────────────────────────────────────────────────────

export type ProjectIntent =
  /** Margen en % (como lo teclea el dock; `quick`: botón de margen rápido, sin redondeo). */
  | { kind: 'marginPct'; pct: number; quick?: boolean }
  /** «Sugerir de costos»: el $/Wp de venta de la matriz de costos. */
  | { kind: 'suggestDirectPrice' }
  /** «Aplicar tarifa oficial». */
  | { kind: 'applyOfficialTariff' }
  /** «Mejor proveedor». */
  | { kind: 'bestSupplier' }
  /** Elegir un equipo del catálogo en la fila `index`. */
  | { kind: 'selectCatalogItem'; equipment: EquipmentKind; index: number; itemId: string }
  /** «+»: añade un modelo (`now` da el id del grupo nuevo; el llamador lo pasa, el dominio no lee el reloj). */
  | { kind: 'addGroup'; equipment: EquipmentKind; now: number }
  /** Quita la fila `index`. */
  | { kind: 'removeGroup'; equipment: EquipmentKind; index: number };

/** Lote por ruta de una intención, el mismo que escribe el gesto del dock. */
export function projectIntentEdits(project: ProjectSimulation, intent: ProjectIntent, ctx: IntentContext): IntentFieldEdit[] {
  const specs = migrateLegacySpecs(project.specs);
  switch (intent.kind) {
    case 'marginPct':
      return [{ path: 'specs.saleMarginMultiplier', value: intent.quick ? multiplierFromQuickMargin(intent.pct) : multiplierFromMarginInput(intent.pct) }];
    case 'suggestDirectPrice':
      return patchEdits('specs', wattPricePatch(suggestedDirectWattPrice({ ...project, specs }, ctx.calculationMode)));
    case 'applyOfficialTariff':
      return [{ path: 'rates.energyRateSource', value: 'reference' }];
    case 'bestSupplier':
      return [{ path: 'specs.autoSupplierPricing', value: true }];
    case 'selectCatalogItem':
      return [{ path: `specs.${LIST_KEY[intent.equipment]}[${intent.index}].catalogItemId`, value: intent.itemId }];
    case 'addGroup':
      return patchEdits('specs', groupAddPatch(intent.equipment, specs, ctx.equipmentCatalog, intent.now, ctx.genericPriceFor));
    case 'removeGroup':
      return patchEdits('specs', groupRemovePatch(intent.equipment, specs, intent.index));
  }
}
