/**
 * Operaciones tipadas de `edit_proposal` y dimensionado de `size_system` (F3a). Puro: sin store ni reloj (`now` lo pasa el
 * llamador). Cada lista de operaciones se traduce a UN lote por ruta del registro de campos (`projectFields.ts`) que la
 * transacción (`applyProjectEdits` / `commitProjectEdits`) valida y aplica entero: todo o nada, una escritura y un paso de
 * deshacer. Las operaciones de equipos usan las MISMAS reglas que el dock (`rules/equipmentRules.ts`: catálogo, precio del
 * resolvedor único, «+», quitar) y las intenciones con nombre de F2b (`editIntents.ts`: margen en %, tarifa oficial, «Mejor
 * proveedor», «Sugerir de costos»).
 *
 * Precios: nunca se inventan. Elegir del catálogo toma la oferta de proveedor (preferida o la más barata utilizable); sin
 * oferta, el precio genérico, que se avisa como tal; sin ninguno, el equipo queda sin precio y la propuesta, incompleta.
 */
import type { CustomQuotationDiscount, CustomQuotationItem, ProjectSimulation, SystemSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { LIST_KEY, editEquipment, migrateLegacySpecs, type EquipmentKind } from '../../shared/equipment';
import { resolveAssumption } from '../../shared/assumptions';
import { resolveSystemLossesPct } from '../../shared/projectDefaults';
import { NET_METERING_REGIMES } from '../../shared/netMetering';
import { projectIntentEdits, type IntentContext, type ProjectIntent } from './editIntents';
import { groupAddPatch, groupRemovePatch, groupSelectPatch } from './rules/equipmentRules';
import {
  chooseCatalogEquipment, equipmentPrice, recommendBatteryCount, recommendInverterCount, recommendPanelCount, resolveSizingBasis, suggestedGroupPanelCount,
  type SizingAssumptionUsed,
} from './sizing';
import type { ProjectEditError, ProjectFieldEdit } from './projectEditTransaction';

/** Operaciones de `edit_proposal`. El orden es el de la declaración de la herramienta. */
export const PROPOSAL_OPERATIONS = [
  'set', 'select_equipment', 'add_equipment', 'remove_equipment', 'set_storage', 'set_tariff', 'set_net_metering', 'set_radiation',
  'set_consumption', 'set_margin_pct', 'apply_official_tariff', 'best_supplier', 'suggest_direct_price',
  'upsert_item', 'remove_item', 'upsert_discount', 'remove_discount',
] as const;
export type ProposalOperationKind = (typeof PROPOSAL_OPERATIONS)[number];

/** Una operación: `op` y sus argumentos, todos en una sola capa (el esquema declarado no anida más). */
export interface ProposalOperation {
  op: ProposalOperationKind;
  path?: string;
  valueJson?: string;
  equipment?: EquipmentKind;
  index?: number;
  catalogItemId?: string;
  count?: number;
  enabled?: boolean;
  distributor?: string;
  tariffCode?: string;
  regime?: string;
  gridUseChargeDOPPerKWh?: number;
  solarSourceMode?: 'province' | 'gps';
  province?: string;
  coordinates?: string;
  averageMonthlyKWh?: number;
  pct?: number;
  id?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPriceUSD?: number;
  exonerateITBIS?: boolean;
  applyMargin?: boolean;
  hideInQuotation?: boolean;
  discountType?: 'fixed' | 'percentage';
  value?: number;
  target?: 'general' | 'equipment';
}

export interface OperationContext extends IntentContext {
  /** Reloj del llamador: ids de grupos, ítems y descuentos nuevos. */
  now: number;
  /** Lo que la organización oculta en el simulador: la herramienta lo rechaza y lo explica. */
  hidden?: { netMeteringRegime?: boolean };
}

export type OperationTranslation =
  | { ok: true; edits: ProjectFieldEdit[]; warnings: string[] }
  | { ok: false; errors: ProjectEditError[]; warnings: string[] };

const NOUN: Record<EquipmentKind, string> = { panel: 'panel', inverter: 'inversor', battery: 'batería' };
const SYSTEM_KEYS = ['hasBattery', 'autoCalculatePanels', 'panelEfficiency', 'tempCoeff', 'annualDegradation'] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
/** Precio dado: positivo, o un 0 escrito a mano (la misma regla que `proposalCompleteness`). */
const priced = (group: { unitPriceUSD?: number; priceSource?: string } | undefined) =>
  !!group && (positive(group.unitPriceUSD) || (group.unitPriceUSD === 0 && group.priceSource === 'manual'));
export const HIDDEN_REGIME_MESSAGE = 'La organización oculta el régimen de medición neta en el simulador: el asistente no lo cambia. Si hace falta, pídelo a un administrador (Ajustes → Funciones).';

/** Texto de un precio elegido, para avisar al usuario (nunca se presenta un genérico como oferta). */
function priceWarning(item: SolarEquipmentItem, genericFor: IntentContext['genericPriceFor']): string | null {
  const price = equipmentPrice(item, genericFor);
  if (price.kind === 'generic') return `Precio genérico, sin proveedor: ${item.displayName} (US$ ${price.priceUSD!.toFixed(2)}). Confírmalo con una oferta antes de enviar la propuesta.`;
  if (price.kind === 'none') return `${item.displayName} no tiene oferta de proveedor ni precio genérico: queda sin precio y la propuesta, incompleta, hasta indicar su costo.`;
  return null;
}

/**
 * La batería que «ponle baterías» usa: la pedida por id; la actual si ya tiene precio; si no, la que elige el catálogo con el
 * resolvedor de precios (oferta preferida → más barata en stock → genérica). Sin baterías en el catálogo, la actual sin precio.
 */
export function storageChoice(specs: SystemSpecs, ctx: IntentContext, catalogItemId?: string):
  { item?: SolarEquipmentItem; keep: boolean; error?: string; reason: string } {
  const catalog = ctx.equipmentCatalog;
  if (catalogItemId) {
    const item = catalog.find((entry) => entry.id === catalogItemId);
    if (!item) return { keep: false, error: `«${catalogItemId}» no es un equipo del catálogo.`, reason: '' };
    if (item.type !== 'battery') return { keep: false, error: `${item.displayName} no es una batería: elige un equipo del tipo correcto.`, reason: '' };
    return { item, keep: false, reason: 'Batería pedida' };
  }
  const current = migrateLegacySpecs(specs).batteries?.[0];
  if (current && priced(current)) return { keep: true, reason: 'La batería actual ya tiene precio' };
  const choice = chooseCatalogEquipment(catalog, 'battery', { genericFor: ctx.genericPriceFor });
  if (choice.item) return { item: choice.item, keep: false, reason: choice.reason };
  return { keep: true, reason: catalog.length ? 'Sin baterías en el catálogo' : 'El catálogo de equipos no está cargado' };
}

/** Traduce las operaciones a un lote por ruta. Los errores llevan la ruta (`ops[i].campo` o la del registro). */
export function operationsToEdits(project: ProjectSimulation, ops: readonly ProposalOperation[], ctx: OperationContext): OperationTranslation {
  const errors: ProjectEditError[] = [];
  const warnings: string[] = [];
  const edits: ProjectFieldEdit[] = [];
  if (!Array.isArray(ops) || ops.length === 0) return { ok: false, errors: [{ path: 'ops', message: 'Indica al menos una operación en ops.' }], warnings };

  const baseSpecs = migrateLegacySpecs(project.specs);
  let specs: SystemSpecs = baseSpecs;
  let items: CustomQuotationItem[] | undefined;
  let discounts: CustomQuotationDiscount[] | undefined;
  const catalog = ctx.equipmentCatalog;
  const fail = (path: string, message: string) => { errors.push({ path, message }); };
  const push = (path: string, value: unknown) => {
    if (path === 'rates.netMeteringRegime' && ctx.hidden?.netMeteringRegime) { fail(path, HIDDEN_REGIME_MESSAGE); return; }
    edits.push({ path, value });
  };
  const parseJson = (at: string, raw: string | undefined): { ok: true; value: unknown } | { ok: false } => {
    if (typeof raw !== 'string') { fail(`${at}.valueJson`, 'Falta valueJson: el valor en JSON (p. ej. 95, true, "Santiago" o doce números).'); return { ok: false }; }
    try {
      const value = JSON.parse(raw);
      // `null` borra el dato (si el campo lo admite): el registro lo trata como `undefined`.
      return { ok: true, value: value === null ? undefined : value };
    } catch {
      fail(`${at}.valueJson`, `valueJson no es JSON válido: ${raw.slice(0, 40)}.`);
      return { ok: false };
    }
  };
  const catalogItem = (at: string, id: string | undefined, kind: EquipmentKind): SolarEquipmentItem | undefined => {
    if (!id) { fail(`${at}.catalogItemId`, `Falta catalogItemId: el id del ${NOUN[kind]} en el catálogo (search_equipment).`); return undefined; }
    if (catalog.length === 0) { fail(`${at}.catalogItemId`, 'El catálogo de equipos no está cargado: no se puede elegir un modelo por su id.'); return undefined; }
    const item = catalog.find((entry) => entry.id === id);
    if (!item) { fail(`${at}.catalogItemId`, `«${id}» no es un equipo del catálogo.`); return undefined; }
    if (item.type !== kind) { fail(`${at}.catalogItemId`, `${item.displayName} no es un ${NOUN[kind]}: elige un equipo del tipo correcto.`); return undefined; }
    return item;
  };
  const groupsOf = (kind: EquipmentKind) => (specs[LIST_KEY[kind]] ?? []) as { count?: number }[];
  const setCount = (kind: EquipmentKind, index: number, count: number) => {
    specs = editEquipment(specs, kind, { type: 'update', index, patch: { count } as never });
  };
  const select = (kind: EquipmentKind, index: number, item: SolarEquipmentItem) => {
    specs = { ...specs, ...groupSelectPatch(kind, specs, index, item, ctx.genericPriceFor?.(item.id)) } as SystemSpecs;
    if (kind === 'battery') specs = { ...specs, hasBattery: true };
    const warning = priceWarning(item, ctx.genericPriceFor);
    if (warning) warnings.push(warning);
  };
  const intent = (value: ProjectIntent) => projectIntentEdits(project, value, ctx).forEach((edit) => push(edit.path, edit.value));

  ops.forEach((op, i) => {
    const at = `ops[${i}]`;
    const kind: EquipmentKind | undefined = op.equipment;
    const noun = kind ? NOUN[kind] : '';
    const needKind = () => { if (!kind) fail(`${at}.equipment`, 'Falta equipment: panel, inverter o battery.'); return !!kind; };
    switch (op.op) {
      case 'set': {
        if (typeof op.path !== 'string' || !op.path) { fail(`${at}.path`, 'Falta path: la ruta del registro (consúltalas con get_proposal_state).'); return; }
        const parsed = parseJson(at, op.valueJson);
        if (parsed.ok) push(op.path, parsed.value);
        return;
      }
      case 'select_equipment': {
        if (!needKind()) return;
        const index = op.index ?? 0;
        if (index > groupsOf(kind!).length) { fail(`${at}.index`, `No existe el grupo #${index + 1} de ${noun}: usa add_equipment para añadir uno.`); return; }
        const item = catalogItem(at, op.catalogItemId, kind!);
        if (!item) return;
        select(kind!, index, item);
        if (op.count !== undefined) setCount(kind!, index, op.count);
        return;
      }
      case 'add_equipment': {
        if (!needKind()) return;
        const item = op.catalogItemId ? catalogItem(at, op.catalogItemId, kind!) : undefined;
        if (op.catalogItemId && !item) return;
        specs = { ...specs, ...groupAddPatch(kind!, specs, catalog, ctx.now + i, ctx.genericPriceFor) } as SystemSpecs;
        const index = groupsOf(kind!).length - 1;
        if (item) select(kind!, index, item);
        if (op.count !== undefined) setCount(kind!, index, op.count);
        return;
      }
      case 'remove_equipment': {
        if (!needKind()) return;
        const index = op.index;
        if (index === undefined) { fail(`${at}.index`, 'Falta index: el número de fila (0 es la primera).'); return; }
        if (!groupsOf(kind!)[index]) { fail(`${at}.index`, `No existe el grupo #${index + 1} de ${noun}.`); return; }
        specs = { ...specs, ...groupRemovePatch(kind!, specs, index) } as SystemSpecs;
        return;
      }
      case 'set_storage': {
        if (typeof op.enabled !== 'boolean') { fail(`${at}.enabled`, 'Falta enabled: true incluye las baterías, false las quita.'); return; }
        if (!op.enabled) { specs = { ...specs, hasBattery: false }; return; }
        const choice = storageChoice(specs, ctx, op.catalogItemId);
        if (choice.error) { fail(`${at}.catalogItemId`, choice.error); return; }
        if (choice.item) {
          select('battery', 0, choice.item);
          const group = (specs.batteries ?? [])[0];
          const count = op.count ?? Math.max(1, recommendBatteryCount({ unit: { capacityKWh: group.capacityKWh, dodPct: group.dodPct, efficiencyPct: group.efficiencyPct }, monthlyConsumption: project.monthlyConsumption }).count);
          setCount('battery', 0, count);
        } else {
          if (!(specs.batteries ?? []).length) { fail(`${at}`, `${choice.reason}: no hay una batería que incluir. Añade una con add_equipment (equipment battery).`); return; }
          if (!priced((specs.batteries ?? [])[0])) warnings.push(`${choice.reason}: se incluye la batería actual sin precio; la propuesta queda incompleta hasta indicar su costo.`);
          if (op.count !== undefined) setCount('battery', 0, op.count);
        }
        specs = { ...specs, hasBattery: true };
        return;
      }
      case 'set_tariff':
        if (op.distributor === undefined && op.tariffCode === undefined) { fail(at, 'Indica distributor, tariffCode o ambos.'); return; }
        if (op.distributor !== undefined) push('rates.distributor', op.distributor);
        if (op.tariffCode !== undefined) push('rates.tariffCode', op.tariffCode);
        return;
      case 'set_net_metering':
        if (op.regime === undefined && op.gridUseChargeDOPPerKWh === undefined) { fail(at, 'Indica regime, gridUseChargeDOPPerKWh o ambos.'); return; }
        if (op.regime !== undefined && !(NET_METERING_REGIMES as readonly string[]).includes(op.regime)) { fail(`${at}.regime`, `Régimen desconocido: ${NET_METERING_REGIMES.join(' o ')}.`); return; }
        if (op.regime !== undefined) push('rates.netMeteringRegime', op.regime);
        if (op.gridUseChargeDOPPerKWh !== undefined) push('rates.gridUseChargeDOPPerKWh', op.gridUseChargeDOPPerKWh);
        return;
      case 'set_radiation': {
        if (op.solarSourceMode === undefined && op.province === undefined && op.coordinates === undefined && op.valueJson === undefined) {
          fail(at, 'Indica province, coordinates (con solarSourceMode gps), solarSourceMode o doce HSP en valueJson.');
          return;
        }
        if (op.solarSourceMode !== undefined) push('client.solarSourceMode', op.solarSourceMode);
        if (op.province !== undefined) push('client.province', op.province);
        if (op.coordinates !== undefined) push('client.coordinates', op.coordinates);
        if (op.valueJson !== undefined) { const parsed = parseJson(at, op.valueJson); if (parsed.ok) push('client.customMonthlyHSP', parsed.value); }
        return;
      }
      case 'set_consumption': {
        if (op.averageMonthlyKWh !== undefined) { push('monthlyConsumption', Array(12).fill(op.averageMonthlyKWh)); return; }
        if (op.valueJson === undefined) { fail(at, 'Indica averageMonthlyKWh o los doce consumos en valueJson.'); return; }
        const parsed = parseJson(at, op.valueJson);
        if (parsed.ok) push('monthlyConsumption', parsed.value);
        return;
      }
      case 'set_margin_pct':
        if (typeof op.pct !== 'number') { fail(`${at}.pct`, 'Falta pct: el margen en %, p. ej. 35.'); return; }
        intent({ kind: 'marginPct', pct: op.pct });
        return;
      case 'apply_official_tariff': intent({ kind: 'applyOfficialTariff' }); return;
      case 'best_supplier': intent({ kind: 'bestSupplier' }); return;
      case 'suggest_direct_price': intent({ kind: 'suggestDirectPrice' }); return;
      case 'upsert_item': {
        items ??= structuredClone(project.financials?.customItems ?? []);
        const existing = op.id ? items.find((item) => item.id === op.id) : undefined;
        if (op.id && !existing) { fail(`${at}.id`, `No existe el ítem «${op.id}»: omite id para añadir uno nuevo.`); return; }
        const patch: Partial<CustomQuotationItem> = {
          ...(op.description !== undefined ? { description: op.description } : {}),
          ...(op.quantity !== undefined ? { quantity: op.quantity } : {}),
          ...(op.unit !== undefined ? { unit: op.unit } : {}),
          ...(op.unitPriceUSD !== undefined ? { unitPriceUSD: op.unitPriceUSD } : {}),
          ...(op.exonerateITBIS !== undefined ? { exonerateITBIS: op.exonerateITBIS, applyITBIS: op.exonerateITBIS } : {}),
          ...(op.applyMargin !== undefined ? { applyMargin: op.applyMargin } : {}),
          ...(op.hideInQuotation !== undefined ? { hideInQuotation: op.hideInQuotation } : {}),
        };
        if (existing) { Object.assign(existing, patch); return; }
        if (!op.description) { fail(`${at}.description`, 'Un ítem nuevo necesita description.'); return; }
        // Nunca un precio inventado: el ítem nuevo trae el suyo.
        if (op.unitPriceUSD === undefined) { fail(`${at}.unitPriceUSD`, 'Un ítem nuevo necesita unitPriceUSD: pregúntalo, no lo inventes.'); return; }
        // Como el «+» del dock: 1 UD, ITBIS exonerado y con margen, salvo lo indicado.
        items.push({ id: `item_${ctx.now}_${i}`, quantity: 1, unit: 'UD', exonerateITBIS: true, applyITBIS: true, applyMargin: true, ...patch } as CustomQuotationItem);
        return;
      }
      case 'remove_item': {
        items ??= structuredClone(project.financials?.customItems ?? []);
        if (!op.id || !items.some((item) => item.id === op.id)) { fail(`${at}.id`, `No existe el ítem «${op.id ?? ''}» (los ids salen de get_proposal_state).`); return; }
        items = items.filter((item) => item.id !== op.id);
        return;
      }
      case 'upsert_discount': {
        discounts ??= structuredClone(project.financials?.customDiscounts ?? []);
        const existing = op.id ? discounts.find((d) => d.id === op.id) : undefined;
        if (op.id && !existing) { fail(`${at}.id`, `No existe el descuento «${op.id}»: omite id para añadir uno nuevo.`); return; }
        const patch: Partial<CustomQuotationDiscount> = {
          ...(op.description !== undefined ? { description: op.description } : {}),
          ...(op.discountType !== undefined ? { type: op.discountType } : {}),
          ...(op.value !== undefined ? { value: op.value } : {}),
          ...(op.target !== undefined ? { target: op.target } : {}),
        };
        if (existing) { Object.assign(existing, patch); return; }
        if (!op.description) { fail(`${at}.description`, 'Un descuento nuevo necesita description (el motivo).'); return; }
        if (op.value === undefined) { fail(`${at}.value`, 'Un descuento nuevo necesita value (USD o %).'); return; }
        discounts.push({ id: `disc_${ctx.now}_${i}`, type: 'fixed', target: 'general', ...patch } as CustomQuotationDiscount);
        return;
      }
      case 'remove_discount': {
        discounts ??= structuredClone(project.financials?.customDiscounts ?? []);
        if (!op.id || !discounts.some((d) => d.id === op.id)) { fail(`${at}.id`, `No existe el descuento «${op.id ?? ''}» (los ids salen de get_proposal_state).`); return; }
        discounts = discounts.filter((d) => d.id !== op.id);
        return;
      }
      default:
        fail(`${at}.op`, `Operación desconocida «${String((op as { op?: unknown }).op)}»: usa una de ${PROPOSAL_OPERATIONS.join(', ')}.`);
    }
  });

  // Las listas de equipos y los parámetros del sistema que cambiaron, una vez y enteros: lo que escribiría el dock.
  for (const kind of ['panel', 'inverter', 'battery'] as const) {
    const list = LIST_KEY[kind];
    if (!same(specs[list], baseSpecs[list])) edits.push({ path: `specs.${list}`, value: specs[list] });
  }
  for (const key of SYSTEM_KEYS) if (!same(specs[key], baseSpecs[key])) edits.push({ path: `specs.${key}`, value: specs[key] });
  if (items && !same(items, project.financials?.customItems ?? [])) edits.push({ path: 'financials.customItems', value: items });
  if (discounts && !same(discounts, project.financials?.customDiscounts ?? [])) edits.push({ path: 'financials.customDiscounts', value: discounts });

  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, edits, warnings };
}

// ── size_system ─────────────────────────────────────────────────────────────────────────────

export interface SystemSizingProposal {
  panels: { count: number; currentCount: number; capacityKWp: number; targetAnnualKWh: number; designAnnualKWh: number; basis: string };
  inverters: { count: number; currentCount: number; acKW: number; dcAcRatio: number; targetRatio: number };
  batteries: { count: number; currentCount: number; requiredKWh: number; usableKWh: number; rule: string; model: string; catalogItemId?: string; priceLabel?: string } | null;
  assumptions: SizingAssumptionUsed[];
  /** Operaciones de `edit_proposal` que aplican este dimensionado tal cual. */
  ops: ProposalOperation[];
  warnings: string[];
}

/** Paneles, inversor y baterías para la propuesta, SIN escribir nada. Ver `sizing.ts` para los supuestos. */
export function proposeSystemSizing(
  project: ProjectSimulation, ctx: IntentContext, options: { coveragePct?: number; includeBatteries?: boolean; batteryCatalogItemId?: string } = {},
): { ok: true; sizing: SystemSizingProposal } | { ok: false; errors: ProjectEditError[] } {
  const specs = migrateLegacySpecs(project.specs);
  const panels = specs.panels ?? [];
  const inverters = specs.inverters ?? [];
  const panel = panels[0];
  const inverter = inverters[0];
  if (!panel || !positive(panel.powerW)) return { ok: false, errors: [{ path: 'specs.panels', message: 'Falta un panel con potencia: elige uno del catálogo (select_equipment) antes de dimensionar.' }] };
  if (!inverter || !positive(inverter.powerKW)) return { ok: false, errors: [{ path: 'specs.inverters', message: 'Falta un inversor con potencia: elige uno del catálogo (select_equipment) antes de dimensionar.' }] };
  const warnings: string[] = [];
  const coveragePct = options.coveragePct ?? resolveAssumption('targetCoveragePct', project.rates?.targetCoveragePct);
  const panelSizing = recommendPanelCount({
    province: project.client.province, monthlyConsumption: project.monthlyConsumption, panelPowerW: panel.powerW, coveragePct,
    lossesPct: resolveSystemLossesPct(specs), customMonthlyHSP: project.client.customMonthlyHSP, basis: resolveSizingBasis(specs),
  });
  let panelCount = panelSizing.count;
  if (panels.length > 1) {
    // Con varios modelos, el primero completa lo que falta con los demás tal cual.
    panelCount = suggestedGroupPanelCount({
      targetAnnualKWh: panelSizing.targetAnnualKWh, annualSpecificYieldKWhPerKWp: panelSizing.annualSpecificYieldKWhPerKWp,
      groups: panels.map((g) => ({ powerW: g.powerW, count: g.count })), index: 0,
    });
    warnings.push('Hay varios modelos de panel: solo se dimensiona el primero, con los demás tal cual.');
  }
  panelCount = Math.max(1, panelCount);
  const dcKWp = panels.reduce((sum, g, i) => sum + g.powerW * (i === 0 ? panelCount : g.count) / 1000, 0);
  const inverterSizing = recommendInverterCount({ dcKWp, unitPowerKW: inverter.powerKW });
  if (inverters.length > 1) warnings.push('Hay varios modelos de inversor: solo se dimensiona el primero.');
  const ops: ProposalOperation[] = [
    { op: 'set', path: 'specs.panels[0].count', valueJson: String(panelCount) },
    { op: 'set', path: 'specs.inverters[0].count', valueJson: String(Math.max(1, inverterSizing.count)) },
  ];
  const assumptions = [...panelSizing.assumptions, ...inverterSizing.assumptions];
  let batteries: SystemSizingProposal['batteries'] = null;
  if (options.includeBatteries ?? !!specs.hasBattery) {
    const choice = storageChoice(specs, ctx, options.batteryCatalogItemId);
    if (choice.error) return { ok: false, errors: [{ path: 'batteryCatalogItemId', message: choice.error }] };
    const current = (specs.batteries ?? [])[0];
    const unit = choice.item
      ? { capacityKWh: choice.item.capacityKWh ?? 0, dodPct: choice.item.dodPct, efficiencyPct: choice.item.batteryEfficiencyPct }
      : current ? { capacityKWh: current.capacityKWh, dodPct: current.dodPct, efficiencyPct: current.efficiencyPct } : undefined;
    if (!unit) warnings.push(`${choice.reason}: no hay una batería que dimensionar.`);
    else {
      const bank = recommendBatteryCount({ unit, monthlyConsumption: project.monthlyConsumption });
      const count = Math.max(1, bank.count);
      batteries = {
        count, currentCount: current?.count ?? 0, requiredKWh: bank.requiredKWh, usableKWh: bank.usableKWh, rule: bank.rule,
        model: choice.item?.displayName ?? current?.brandModel ?? '', ...(choice.item ? { catalogItemId: choice.item.id, priceLabel: equipmentPrice(choice.item, ctx.genericPriceFor).label } : {}),
      };
      assumptions.push(...bank.assumptions);
      ops.push({ op: 'set_storage', enabled: true, count, ...(choice.item ? { catalogItemId: choice.item.id } : {}) });
    }
  }
  return {
    ok: true,
    sizing: {
      panels: { count: panelCount, currentCount: panel.count, capacityKWp: dcKWp, targetAnnualKWh: panelSizing.targetAnnualKWh, designAnnualKWh: panelSizing.designAnnualKWh, basis: panelSizing.basis },
      inverters: { count: Math.max(1, inverterSizing.count), currentCount: inverter.count, acKW: inverterSizing.acKW, dcAcRatio: inverterSizing.dcAcRatio, targetRatio: inverterSizing.targetRatio },
      batteries, assumptions, ops, warnings,
    },
  };
}
