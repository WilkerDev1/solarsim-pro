/**
 * Registro de campos editables de una propuesta (F2a2; ADR 0004, «Registro de campos y transacción»). Dominio puro: sin
 * React ni Zustand. Una entrada por opción editable con ruta estable, etiqueta en español, tipo, rango o valores
 * permitidos, dependencias, ancla del dock (id del control, para el resaltado de F5a) y sección. De aquí salen la
 * validación de `applyProjectEdits` y las etiquetas de su diff; en F3 saldrán también el esquema de las herramientas.
 *
 * Rutas: `seccion.campo`, con índices entre corchetes para listas (`specs.panels[0].count`, `monthlyConsumption[3]`). El
 * registro guarda el patrón (`specs.panels[].count`). Los rangos son los del valor GUARDADO que el motor usa tal cual
 * (`ASSUMPTION_RULES`, `shared/netMetering`, `shared/offGridSupply`…): fuera de ellos el motor resolvería otro número y el
 * diff mentiría.
 */
import type { ProjectSimulation } from '../types';
import { ASSUMPTION_RULES } from '../../shared/assumptions';
import { MAX_GRID_USE_CHARGE_DOP_PER_KWH, NET_METERING_REGIMES, resolveNetMeteringRegime } from '../../shared/netMetering';
import { GRID_CONNECTION_MODES, resolveGridConnection } from '../../shared/gridConnection';
import { MAX_GENERATOR_COST_PER_KWH, SUPPLY_ALTERNATIVES, storedSupplyAlternative } from '../../shared/offGridSupply';
import { ENERGY_RATE_SOURCES, FIXED_CHARGE_TIER_BASES, MAX_SETTLEMENT_DOP_PER_KWH } from '../../shared/tariffBilling';
import { BATTERY_PCT_RANGE } from '../../shared/projectDefaults';
import { RD_PROVINCES } from '../data/rdProvinces';

/** Consumo diurno del perfil de carga (%): el rango del deslizador del dock. */
export const DAYTIME_MIN = 15;
export const DAYTIME_MAX = 95;

/** Sección del simulador donde vive el control: las del dock más la pestaña de energía y el documento. */
export type ProjectFieldSection = 'client' | 'rates' | 'equipment' | 'costs' | 'financials' | 'energy' | 'document';
export type ProjectFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'date' | 'numberList' | 'list' | 'object';
/**
 * Cómo se escribe hoy el campo:
 * - `control`: tiene un control propio en el simulador;
 * - `action`: lo escribe una acción del simulador junto con otro campo («Aplicar tarifa oficial», «Mejor proveedor», «Obtener radiación»…);
 * - `hidden`: sin control en el simulador (asistente, agentes, factura, importación, texto del PDF);
 * - `derived`: solo lo escriben las reglas o la lista que lo contiene (de solo lectura por ruta).
 */
export type ProjectFieldOrigin = 'control' | 'action' | 'hidden' | 'derived';

export interface FieldRequirement {
  /** Ruta registrada de la que depende. */
  path: string;
  /** Valor (efectivo) que exige. */
  value: unknown;
  /** `activate`: la transacción lo fija como cambio derivado; `reject`: la edición se rechaza si no se cumple. */
  resolve: 'activate' | 'reject';
  /** Solo cuando el valor nuevo cumple esto (p. ej. una lista no vacía). */
  when?: (value: unknown) => boolean;
}

export interface ProjectFieldDefinition {
  /** Patrón de la ruta (`specs.panels[].count`). */
  path: string;
  label: string;
  section: ProjectFieldSection;
  type: ProjectFieldType;
  origin: ProjectFieldOrigin;
  /** Número: cotas inclusivas; `exclusiveMin`: el mínimo no vale (0 = «sin dato»). */
  min?: number;
  max?: number;
  exclusiveMin?: boolean;
  integer?: boolean;
  /** Enum: valores permitidos. */
  values?: readonly (string | boolean)[];
  /** Texto: largo máximo y mínimo. */
  maxLength?: number;
  minLength?: number;
  /** Lista de números: largo exacto. Lista de registros: tamaño. */
  length?: number;
  minItems?: number;
  maxItems?: number;
  /** Admite `undefined` (borrar el dato: «Hoy» en la fecha, sin costo de generador…). */
  optional?: boolean;
  requires?: readonly FieldRequirement[];
  /** Valor efectivo que leen las dependencias (régimen o conexión resueltos), cuando no es el guardado tal cual. */
  effective?: (project: ProjectSimulation) => unknown;
  /** Id del control en el DOM (`{i}` = índice del grupo). Sin él, `anchorNote` dice por qué. */
  anchor?: string;
  anchorNote?: string;
  /** Solo lectura por ruta: lo escriben las reglas o la lista que lo contiene. */
  readOnly?: boolean;
  /** El diff no entra dentro del valor (objetos de la tarifa, del proveedor…). */
  leaf?: boolean;
  /** Etiquetas de cada posición de una lista de números (meses). */
  itemLabels?: readonly string[];
  /** Valor válido de ejemplo cuando el tipo no lo deduce (prueba del registro). */
  sample?: unknown;
  note?: string;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;
const DISTRIBUTORS = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'] as const;
const rule = (key: keyof typeof ASSUMPTION_RULES) => {
  const r = ASSUMPTION_RULES[key];
  return { min: 0, max: r.max, exclusiveMin: r.zeroIsMissing, integer: r.integer };
};
const nonEmpty = (value: unknown) => Array.isArray(value) && value.length > 0;
const isSet = (value: unknown) => value !== undefined;
const nonBlank = (value: unknown) => typeof value === 'string' && value.trim() !== '';
const NEEDS_BATTERY: FieldRequirement = { path: 'specs.hasBattery', value: true, resolve: 'activate' };
const NEEDS_DIRECT_PRICE: FieldRequirement = { path: 'specs.pricingMode', value: 'direct_watt', resolve: 'activate' };
const NEEDS_OFF_GRID: FieldRequirement = { path: 'rates.gridConnection', value: 'off_grid', resolve: 'reject' };
const NEEDS_SIE007: FieldRequirement = { path: 'rates.netMeteringRegime', value: 'sie007_2026', resolve: 'reject' };
const NEEDS_LEGACY: FieldRequirement = { path: 'rates.netMeteringRegime', value: 'legacy_retention', resolve: 'reject' };
const GROUP_IN_SECTION = 'Grupo de la lista: sin id estable por fila (el id del campo sale de React.useId); ancla de la sección.';

type Def = ProjectFieldDefinition;
const text = (path: string, label: string, section: Def['section'], origin: Def['origin'], extra: Partial<Def> = {}): Def =>
  ({ path, label, section, type: 'string', origin, maxLength: 200, ...extra });
const num = (path: string, label: string, section: Def['section'], origin: Def['origin'], extra: Partial<Def> = {}): Def =>
  ({ path, label, section, type: 'number', origin, ...extra });
const bool = (path: string, label: string, section: Def['section'], origin: Def['origin'], extra: Partial<Def> = {}): Def =>
  ({ path, label, section, type: 'boolean', origin, ...extra });
const choice = (path: string, label: string, section: Def['section'], origin: Def['origin'], values: readonly (string | boolean)[], extra: Partial<Def> = {}): Def =>
  ({ path, label, section, type: 'enum', origin, values, ...extra });
const derived = (path: string, label: string, section: Def['section'], type: Def['type'] = 'object', extra: Partial<Def> = {}): Def =>
  ({ path, label, section, type, origin: 'derived', readOnly: true, leaf: true, ...extra });

/** Campos internos de un grupo de equipos: los escribe la lista entera (selección del catálogo, proveedor, «+»). */
function groupInternals(list: 'panels' | 'inverters' | 'batteries', noun: string): Def[] {
  const at = (field: string) => `specs.${list}[].${field}`;
  const defs: Def[] = [
    derived(at('id'), `Identificador del grupo (${noun})`, 'equipment', 'string'),
    derived(at('catalogItemId'), `Equipo del catálogo (${noun})`, 'equipment', 'string'),
    derived(at('manualModel'), `Modelo escrito a mano (${noun})`, 'equipment', 'boolean'),
    derived(at('requestedModel'), `Modelo pedido (${noun})`, 'equipment', 'string'),
    derived(at('priceSource'), `Procedencia del precio (${noun})`, 'costs', 'enum'),
    derived(at('genericPriceInfo'), `Precio genérico copiado (${noun})`, 'costs'),
    derived(at('selectedSupplierInfo'), `Proveedor elegido (${noun})`, 'costs'),
    derived(at('weightKilos'), `Peso (${noun})`, 'equipment', 'number'),
  ];
  if (list === 'panels') defs.push(
    derived(at('efficiencyPct'), 'Eficiencia del modelo de panel', 'equipment', 'number'),
    derived(at('tempCoeff'), 'Coef. de temperatura del modelo de panel', 'equipment', 'number'),
    derived(at('annualDegradation'), 'Degradación del modelo de panel', 'equipment', 'number'),
  );
  if (list === 'inverters') defs.push(derived(at('efficiencyPct'), 'Eficiencia del modelo de inversor', 'equipment', 'number'));
  if (list === 'batteries') defs.push(
    derived(at('lifespanYears'), 'Vida útil del modelo de batería', 'equipment', 'number'),
    derived(at('replacementCostUSD'), 'Reemplazo del modelo de batería', 'equipment', 'number'),
  );
  return defs;
}

/** Lista de grupos y sus campos editables (marca, magnitud, cantidad y precio unitario). */
function equipmentGroup(list: 'panels' | 'inverters' | 'batteries'): Def[] {
  const kind = { panels: 'panel', inverters: 'inverter', batteries: 'battery' }[list];
  const noun = { panels: 'panel', inverters: 'inversor', batteries: 'batería' }[list];
  const plural = { panels: 'Paneles', inverters: 'Inversores', batteries: 'Baterías' }[list];
  const requires = list === 'batteries' ? [NEEDS_BATTERY] : undefined;
  // Borrar un dato opcional de la batería (costo, profundidad, eficiencia) no la incluye: solo un valor escrito.
  const requiresWhenSet = list === 'batteries' ? [{ ...NEEDS_BATTERY, when: isSet }] : undefined;
  const at = (field: string) => `specs.${list}[].${field}`;
  const magnitude: Def = list === 'panels'
    ? num(at('powerW'), 'Potencia del panel (W)', 'equipment', 'control', { min: 0, max: 2000, exclusiveMin: true, anchorNote: GROUP_IN_SECTION, anchor: 'dock-equipment' })
    : list === 'inverters'
      ? num(at('powerKW'), 'Potencia del inversor (kW)', 'equipment', 'control', { min: 0, max: 1000, exclusiveMin: true, anchorNote: GROUP_IN_SECTION, anchor: 'dock-equipment' })
      : num(at('capacityKWh'), 'Capacidad de la batería (kWh)', 'equipment', 'control', { min: 0, max: 1000, exclusiveMin: true, requires, anchorNote: GROUP_IN_SECTION, anchor: 'dock-equipment' });
  const defs: Def[] = [
    {
      path: `specs.${list}`, label: plural, section: 'equipment', type: 'list', origin: 'control', minItems: 1, maxItems: 12,
      anchor: 'dock-equipment', anchorNote: 'Modelo, «+» y quitar de la lista; ancla de la sección.',
      ...(list === 'batteries' ? { requires: [{ ...NEEDS_BATTERY, when: nonEmpty }] } : {}),
    },
    text(at('brandModel'), `Marca y modelo del ${noun}`, 'equipment', 'control', { minLength: 1, requires, anchor: 'dock-equipment', anchorNote: GROUP_IN_SECTION }),
    magnitude,
    num(at('count'), `Cantidad de ${plural.toLowerCase()}`, 'equipment', 'control', { min: 1, max: 10000, integer: true, requires, anchor: 'dock-equipment', anchorNote: GROUP_IN_SECTION }),
    num(at('unitPriceUSD'), `Costo unitario del ${noun} (USD)`, 'costs', 'control', { min: 0, max: 1_000_000, optional: true, requires: requiresWhenSet, anchor: `pd-cost-${kind}-{i}` }),
    ...groupInternals(list, noun),
  ];
  if (list === 'batteries') defs.push(
    num(at('dodPct'), 'Profundidad de descarga', 'equipment', 'control', { ...BATTERY_PCT_RANGE, optional: true, requires: requiresWhenSet, anchor: 'dock-battery-dod', note: 'El dock edita la del grupo principal.' }),
    num(at('efficiencyPct'), 'Eficiencia de carga', 'equipment', 'control', { ...BATTERY_PCT_RANGE, optional: true, requires: requiresWhenSet, anchor: 'dock-battery-efficiency', note: 'El dock edita la del grupo principal.' }),
  );
  return defs;
}

/** Ítems extra y descuentos de la cotización. */
const customItems: Def[] = [
  { path: 'financials.customItems', label: 'Ítems extra', section: 'financials', type: 'list', origin: 'control', minItems: 0, maxItems: 30, anchor: 'dock-financials', anchorNote: 'Agregar y quitar ítems; ancla de la sección.' },
  derived('financials.customItems[].id', 'Identificador del ítem', 'financials', 'string'),
  text('financials.customItems[].description', 'Descripción del ítem', 'financials', 'control', { anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  num('financials.customItems[].quantity', 'Cantidad del ítem', 'financials', 'control', { min: 0, max: 1_000_000, anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  text('financials.customItems[].unit', 'Unidad del ítem', 'financials', 'control', { maxLength: 10, optional: true, anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  num('financials.customItems[].unitPriceUSD', 'Precio unitario del ítem (USD)', 'financials', 'control', { min: 0, max: 10_000_000, anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  bool('financials.customItems[].exonerateITBIS', 'Ítem exento de ITBIS', 'financials', 'control', { anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  bool('financials.customItems[].applyMargin', 'Ítem con margen', 'financials', 'control', { optional: true, anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  bool('financials.customItems[].hideInQuotation', 'Ítem oculto en la cotización', 'financials', 'control', { optional: true, anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  derived('financials.customItems[].applyITBIS', 'ITBIS del ítem (alias antiguo)', 'financials', 'boolean', { note: 'Lo escribe «ITBIS exento» junto con exonerateITBIS.' }),
  { path: 'financials.customDiscounts', label: 'Descuentos', section: 'financials', type: 'list', origin: 'control', minItems: 0, maxItems: 30, anchor: 'dock-financials', anchorNote: 'Agregar y quitar descuentos; ancla de la sección.' },
  derived('financials.customDiscounts[].id', 'Identificador del descuento', 'financials', 'string'),
  text('financials.customDiscounts[].description', 'Motivo del descuento', 'financials', 'control', { anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  choice('financials.customDiscounts[].type', 'Tipo de descuento', 'financials', 'control', ['fixed', 'percentage'], { anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  num('financials.customDiscounts[].value', 'Valor del descuento', 'financials', 'control', { min: 0, max: 10_000_000, anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
  choice('financials.customDiscounts[].target', 'Destino del descuento', 'financials', 'control', ['general', 'equipment'], { optional: true, anchor: 'dock-financials', anchorNote: 'Fila de la lista sin id estable.' }),
];

export const PROJECT_FIELDS: readonly ProjectFieldDefinition[] = [
  // ── Proyecto y cliente ──
  text('client.name', 'Nombre del cliente', 'client', 'control', { minLength: 1, anchor: 'pd-cli-name' }),
  text('client.location', 'Ubicación', 'client', 'control', { anchor: 'pd-cli-location' }),
  text('client.address', 'Dirección', 'client', 'control', { maxLength: 300, optional: true, anchor: 'pd-cli-address' }),
  text('client.contactPhone', 'Teléfono', 'client', 'control', { maxLength: 60, optional: true, anchor: 'pd-cli-phone', note: 'Espejo en customization.clientPhone.' }),
  text('client.contactPerson', 'Atención', 'client', 'control', { maxLength: 120, optional: true, anchor: 'pd-cli-contact', note: 'Espejo en customization.contactName.' }),
  choice('client.solarSourceMode', 'Radiación solar', 'client', 'control', ['province', 'gps'], { optional: true, anchor: 'pd-cli-source-label' }),
  choice('client.province', 'Provincia', 'client', 'control', RD_PROVINCES.map((province) => province.name), {
    anchor: 'pd-cli-province', note: 'El dock borra a la vez la radiación propia (customMonthlyHSP); esa regla sigue en el dock (F2b).',
  }),
  text('client.coordinates', 'Coordenadas (latitud, longitud)', 'client', 'control', { maxLength: 60, optional: true, anchor: 'pd-cli-coords', requires: [{ path: 'client.solarSourceMode', value: 'gps', resolve: 'activate', when: nonBlank }] }),
  { path: 'client.customMonthlyHSP', label: 'Radiación mensual propia (HSP)', section: 'client', type: 'numberList', origin: 'action', length: 12, min: 0, max: 12, optional: true, leaf: true, itemLabels: MONTHS, anchorNote: '«Obtener radiación» (consulta a NASA, botón sin id).' },
  text('client.projectId', 'ID proyecto', 'client', 'control', { minLength: 1, maxLength: 60, anchor: 'pd-cli-id' }),
  text('client.quoteNumber', 'Cotización', 'client', 'control', { maxLength: 60, optional: true, anchor: 'pd-cli-quote' }),
  { path: 'client.quoteDate', label: 'Fecha de emisión', section: 'client', type: 'date', origin: 'control', optional: true, anchor: 'pd-cli-date', note: '«Hoy» la borra (undefined).' },
  text('client.company', 'Empresa del cliente', 'client', 'hidden', { optional: true }),
  text('client.contactEmail', 'Correo del cliente', 'client', 'hidden', { optional: true, note: 'Se edita en el texto del PDF; espejo en customization.clientEmail.' }),
  num('client.quoteValidityDays', 'Vigencia de la cotización (días)', 'client', 'hidden', { ...rule('quoteValidityDays'), optional: true }),
  text('client.rnc', 'RNC', 'client', 'hidden', { maxLength: 60, optional: true }),
  text('client.nic', 'NIC', 'client', 'hidden', { maxLength: 60, optional: true }),
  text('client.nis', 'NIS', 'client', 'hidden', { maxLength: 60, optional: true }),
  text('client.contractNumber', 'Número de contrato', 'client', 'hidden', { maxLength: 60, optional: true }),
  text('client.circuit', 'Circuito', 'client', 'hidden', { maxLength: 60, optional: true }),
  text('client.meterNumber', 'Número de medidor', 'client', 'hidden', { maxLength: 60, optional: true }),
  text('client.voltagePhase', 'Voltaje y fases', 'client', 'hidden', { maxLength: 60, optional: true }),
  choice('client.distributor', 'Distribuidora (copia del cliente)', 'client', 'hidden', DISTRIBUTORS, { optional: true, note: 'Duplicada con rates.distributor: el PDF y la cotización la leen primero (revisión, M8; F2b).' }),
  text('client.tariffCode', 'Tarifa (copia del cliente)', 'client', 'hidden', { maxLength: 20, optional: true, note: 'Duplicada con rates.tariffCode (revisión, M8; F2b).' }),

  // ── Tarifas ──
  choice('rates.distributor', 'Distribuidora', 'rates', 'control', DISTRIBUTORS, { anchor: 'pd-rates-distributor', note: 'El dock mapea a la vez el código de tarifa y el perfil de carga (planDistributorChange); esa regla sigue en el dock (F2b).' }),
  text('rates.tariffCode', 'Tarifa', 'rates', 'control', { minLength: 1, maxLength: 20, anchor: 'pd-rates-tariff', note: 'El dock recalcula a la vez el precio de referencia y el perfil (planTariffChange).' }),
  num('rates.energyCostPerKWh', 'Precio kWh (USD)', 'rates', 'control', { min: 0, max: 10, anchor: 'pd-rates-kwh' }),
  choice('rates.energyRateSource', 'Procedencia del precio kWh', 'rates', 'action', ENERGY_RATE_SOURCES, { optional: true, anchorNote: 'Lo escribe «Aplicar tarifa oficial» o la regla del precio (applyProjectEdit).' }),
  { path: 'rates.billingTariff', label: 'Fila de la tarifa (bloques y cargo fijo)', section: 'rates', type: 'object', origin: 'action', optional: true, leaf: true, anchorNote: 'Lo escribe «Aplicar tarifa oficial» o el cambio de tarifa.' },
  num('rates.targetCoveragePct', 'Cobertura objetivo', 'rates', 'control', { ...rule('targetCoveragePct'), anchor: 'pd-rates-coverage' }),
  choice('rates.gridConnection', 'Conexión a la red', 'rates', 'control', GRID_CONNECTION_MODES, { optional: true, anchor: 'pd-rates-connection', effective: (p) => resolveGridConnection(p.rates) }),
  bool('rates.isZeroExport', 'Inyección cero', 'rates', 'action', { optional: true, anchorNote: 'Se escribe con «Conexión a la red» (gridConnectionFields).' }),
  choice('rates.supplyAlternative', 'Alternativa de suministro', 'rates', 'control', SUPPLY_ALTERNATIVES, { optional: true, anchor: 'pd-rates-supply', requires: [NEEDS_OFF_GRID], effective: (p) => storedSupplyAlternative(p.rates) }),
  num('rates.generatorCostPerKWh', 'Costo generador kWh (USD)', 'rates', 'control', {
    min: 0, max: MAX_GENERATOR_COST_PER_KWH, exclusiveMin: true, optional: true, anchor: 'pd-rates-generator',
    requires: [NEEDS_OFF_GRID, { path: 'rates.supplyAlternative', value: 'generator', resolve: 'reject' }],
  }),
  choice('rates.netMeteringRegime', 'Régimen de medición neta', 'rates', 'control', NET_METERING_REGIMES, {
    optional: true, anchor: 'pd-rates-regime', effective: (p) => resolveNetMeteringRegime(p.rates.netMeteringRegime), note: 'La política de la organización puede ocultar el selector.',
  }),
  num('rates.gridUseChargeDOPPerKWh', 'Cargo uso de red (RD$/kWh)', 'rates', 'control', { min: 0, max: MAX_GRID_USE_CHARGE_DOP_PER_KWH, optional: true, anchor: 'pd-rates-grid-charge', requires: [NEEDS_SIE007] }),
  num('rates.gridExportFeePct', 'Cargo exportación', 'rates', 'control', { ...rule('gridExportFeePct'), anchor: 'pd-rates-export', requires: [NEEDS_LEGACY] }),
  bool('rates.legacyAnnualSettlement', 'Liquidar excedente anual', 'rates', 'control', { optional: true, anchor: 'pd-rates-legacy-settlement', requires: [NEEDS_LEGACY] }),
  derived('rates.legacyAnnualSettlementDOPPerKWh', 'Precio de la liquidación del régimen anterior', 'rates', 'number', { note: 'Lo siembra reconcileLegacySettlement al activar la liquidación.' }),
  num('rates.annualCreditSettlementDOPPerKWh', 'Liquidación anual (RD$/kWh)', 'rates', 'control', { min: 0, max: MAX_SETTLEMENT_DOP_PER_KWH, optional: true, anchor: 'pd-rates-settlement' }),
  choice('rates.fixedChargeTierBasis', 'Rango cargo fijo', 'rates', 'control', FIXED_CHARGE_TIER_BASES, { optional: true, anchorNote: 'ParamRow sin htmlFor (selector compacto); ancla pendiente para F5a.' }),
  num('rates.annualEnergyInflationPct', 'Inflación de la energía', 'rates', 'hidden', rule('annualEnergyInflationPct')),
  num('rates.usdExchangeRate', 'Tasa RD$/US$ de la tarifa', 'rates', 'hidden', { ...rule('dopExchangeRate'), note: 'La tasa efectiva es specs.dopExchangeRate.' }),
  choice('rates.currency', 'Moneda', 'rates', 'hidden', ['USD', 'DOP'], { note: 'Sin efecto en el cálculo.' }),
  choice('specs.loadProfilePreset', 'Perfil de carga', 'rates', 'control', ['residential', 'commercial', 'industrial', 'custom'], { optional: true, anchor: 'pd-rates-profile', note: 'El dock escribe a la vez daytimeLoadRatio y daytimeSelfConsumptionRatio (loadProfileChange).' }),
  num('specs.daytimeLoadRatio', 'Consumo diurno', 'rates', 'control', { min: DAYTIME_MIN, max: DAYTIME_MAX, optional: true, anchor: 'pd-rates-daytime' }),
  num('specs.daytimeSelfConsumptionRatio', 'Consumo diurno (alias)', 'rates', 'action', { min: 0, max: 100, optional: true, anchorNote: 'Lo escribe el perfil de carga junto con daytimeLoadRatio.' }),
  bool('specs.showSelfConsumptionBreakdown', 'Autoconsumo en gráficos', 'rates', 'control', { optional: true, anchor: 'pd-rates-show-label', note: 'También en la pestaña Energía (Autoconsumo/Clásico).' }),

  // ── Equipamiento ──
  bool('specs.isDetailed', 'Modo de equipamiento manual', 'equipment', 'control', { anchor: 'dock-equipment-mode' }),
  num('specs.systemLosses', 'Pérdidas del sistema', 'equipment', 'control', { ...rule('systemLossesPct'), anchor: 'dock-equipment-losses' }),
  bool('specs.autoCalculatePanels', 'Auto-calcular paneles', 'equipment', 'control', { optional: true, anchor: 'dock-equipment', anchorNote: 'Interruptor sin id; ancla de la sección.' }),
  ...equipmentGroup('panels'),
  num('specs.panelEfficiency', 'Eficiencia del panel', 'equipment', 'control', { min: 0, max: 100, anchor: 'dock-panel-efficiency' }),
  num('specs.tempCoeff', 'Coef. de temperatura', 'equipment', 'control', { min: -5, max: 5, anchor: 'dock-panel-temp-coeff' }),
  num('specs.annualDegradation', 'Degradación anual', 'equipment', 'control', { ...rule('annualDegradationPct'), anchor: 'dock-panel-degradation' }),
  ...equipmentGroup('inverters'),
  bool('specs.hasBattery', 'Incluir batería', 'equipment', 'control', { anchor: 'dock-battery-label' }),
  ...equipmentGroup('batteries'),
  num('specs.batteryReplacementCostUSD', 'Reemplazo año 10 (USD)', 'equipment', 'control', { min: 0, max: 10_000_000, optional: true, anchor: 'dock-battery-replacement', requires: [NEEDS_BATTERY] }),
  num('specs.batteryLifespanYears', 'Vida útil de la batería (años)', 'equipment', 'hidden', { ...rule('batteryReplacementYear'), optional: true, requires: [NEEDS_BATTERY] }),
  num('specs.batteryNightLoadSharePct', 'Carga nocturna cubierta por batería', 'equipment', 'hidden', { min: 0, max: 100, optional: true, note: 'Sin lector en el motor.' }),
  num('specs.batteryCostUSD', 'Costo total de baterías (antiguo)', 'equipment', 'hidden', { min: 0, max: 10_000_000, optional: true, note: 'Sin efecto con grupos de baterías.' }),
  num('specs.inverterEfficiencyPct', 'Eficiencia del inversor (sistema)', 'equipment', 'hidden', { min: 0, max: 100, optional: true }),
  text('specs.installationServicesDesc', 'Descripción de la instalación', 'equipment', 'hidden', { maxLength: 2000, optional: true }),

  // ── Costos y margen ──
  choice('specs.pricingMode', 'Fijación de precio', 'costs', 'control', ['cost_matrix', 'direct_watt'], { optional: true, anchor: 'pd-pricing-mode', note: 'Al pasar a Directo el dock escribe también $/W y $/kWp sugeridos.' }),
  num('specs.dopExchangeRate', 'Tasa DOP/USD', 'costs', 'control', { ...rule('dopExchangeRate'), optional: true, anchor: 'pd-dop-rate' }),
  num('specs.saleMarginMultiplier', 'Factor de venta (margen)', 'costs', 'control', {
    ...rule('saleMarginMultiplier'), optional: true, anchor: 'pd-margin', note: 'Factor (1,25 = 25 %). El dock muestra y teclea el margen en %; la conversión vive en el dock (pricingSync, F2b).',
  }),
  num('specs.installationUnitPriceUSD', 'Mano de obra y materiales (USD/kWp)', 'costs', 'control', { ...rule('installationUsdPerKwp'), optional: true, anchor: 'pd-cost-installation' }),
  bool('specs.autoSupplierPricing', 'Mejor proveedor', 'costs', 'action', { optional: true, anchorNote: 'Botón «Mejor proveedor» (escribe también precio y proveedor de cada grupo principal).' }),
  num('specs.pricePerWattUSD', 'Precio por W (USD)', 'costs', 'control', { min: 0.1, max: ASSUMPTION_RULES.pricePerWattUSD.max, anchor: 'pd-price-w', requires: [NEEDS_DIRECT_PRICE], note: 'El dock escribe a la vez $/kWp (wattPricePatch).' }),
  num('specs.pricePerKWpUSD', 'Precio por kWp (USD)', 'costs', 'control', { min: 100, max: ASSUMPTION_RULES.pricePerWattUSD.max * 1000, optional: true, anchor: 'pd-price-kwp', requires: [NEEDS_DIRECT_PRICE] }),
  choice('specs.directPriceSurplusTarget', 'Destino del excedente', 'costs', 'control', ['margin', 'labor'], { optional: true, anchor: 'pd-surplus-label', requires: [NEEDS_DIRECT_PRICE] }),

  // ── Finanzas ──
  bool('financials.applyLey5707', 'Ley 57-07 · ISR 40%', 'financials', 'control', { anchor: 'pd-ley5707' }),
  bool('financials.applyITBISExemption', 'ITBIS exento', 'financials', 'control', { anchor: 'pd-itbis' }),
  num('financials.discountRatePct', 'Tasa de descuento', 'financials', 'control', { ...rule('discountRatePct'), anchor: 'pd-discount-rate' }),
  ...customItems,
  num('financials.projectLifespanYears', 'Vida del proyecto (años)', 'financials', 'hidden', rule('projectLifespanYears')),
  num('financials.co2FactorKgPerKWh', 'Factor de CO₂ (kg/kWh)', 'financials', 'hidden', rule('co2FactorKgPerKWh')),
  num('financials.pricePerWattUSD', 'Precio por W de las finanzas (USD)', 'financials', 'hidden', rule('pricePerWattUSD')),
  derived('financials.customCostUSD', 'Costo manual (caso auditado)', 'financials', 'number'),
  derived('financials.customLey5707CreditUSD', 'Crédito Ley 57-07 manual (caso auditado)', 'financials', 'number'),
  derived('financials.customITBISSavedUSD', 'ITBIS ahorrado manual (caso auditado)', 'financials', 'number'),

  // ── Energía (pestaña) ──
  { path: 'monthlyConsumption', label: 'Consumo mensual (kWh)', section: 'energy', type: 'numberList', origin: 'control', length: 12, min: 0, max: 10_000_000, leaf: true, itemLabels: MONTHS, anchorNote: 'Tabla de la pestaña Energía, sin id por mes; «A todos» escribe los 12.' },
  num('monthlyConsumption[]', 'Consumo mensual (kWh)', 'energy', 'control', { min: 0, max: 10_000_000, anchorNote: 'Celda de la tabla de la pestaña Energía, sin id.' }),

  // ── Espejos y procedencia (solo lectura) ──
  derived('customization.contactName', 'Atención (en el documento)', 'document', 'string'),
  derived('customization.clientPhone', 'Teléfono (en el documento)', 'document', 'string'),
  derived('customization.clientEmail', 'Correo (en el documento)', 'document', 'string'),
  derived('aiSource.consumptionSource', 'Procedencia del consumo', 'energy', 'string'),
];

/**
 * Controles del simulador que hoy no son un campo del registro, con su motivo. Las acciones que solo combinan campos
 * registrados (perfil de carga, tarifa oficial, «Mejor proveedor»…) sí escriben por la transacción; aquí quedan las que no
 * escriben la propuesta o necesitan algo más que una ruta.
 */
export const UNREGISTERED_SIMULATOR_CONTROLS: readonly { control: string; reason: string }[] = [
  { control: '«Obtener radiación» (NASA)', reason: 'Es una consulta de red: escribe client.customMonthlyHSP y solarSourceMode, que sí están registrados.' },
  { control: '«Asignar siguiente código»', reason: 'Calcula el código libre con todas las propuestas (store); escribe client.projectId y quoteNumber, registrados.' },
  { control: 'Desbloquear identificadores (candado)', reason: 'Estado de la vista, no de la propuesta.' },
  { control: 'Selector del catálogo: buscar, «+ Prov.», «Escanear ficha», «Precios IA», «Catálogo»', reason: 'Abren modales o el catálogo; la elección del modelo escribe la lista de grupos, registrada.' },
  { control: 'Precio de un proveedor (modal «N prov.»)', reason: 'Edición `supplierPrice` de applyProjectEdit (busca el equipo y la oferta en el catálogo); sigue por applySupplierPriceToProject. F3 la llevará a la transacción.' },
  { control: '«¿Usar como precio genérico?»', reason: 'Escribe el catálogo de equipos (ADR 0006), no la propuesta.' },
  { control: '«Replicar a consumo» (pestaña Energía)', reason: 'Consumo con lockAutoPanels: sigue por setMonthlyConsumption (la pestaña Energía no es el dock).' },
  { control: 'Moneda de la pestaña Cotización, pestañas, secciones y ancho del dock, Deshacer/Rehacer', reason: 'Estado de la interfaz, no de la propuesta.' },
  { control: 'Papelera: restaurar, eliminar, volver', reason: 'Ciclo de vida de la propuesta (store), no un campo.' },
  { control: 'Textos, diseño, orden de secciones, marca de agua y logos del PDF', reason: 'Viven en customization y tienen sus herramientas (documentTexts, set_document_layout); fuera de esta transacción.' },
];

/** Ids del dock que no son el control de un campo. */
export const DOCK_NON_FIELD_ANCHORS: Readonly<Record<string, string>> = {
  'pd-rates-generator-notice': 'Aviso del costo del generador (texto), no un control.',
};

// ── Rutas ───────────────────────────────────────────────────────────────────────────────────
export type PathToken = string | number;

/** `specs.panels[0].count` → ['specs', 'panels', 0, 'count']; `null` si la ruta está mal formada. */
export function parseFieldPath(path: string): PathToken[] | null {
  if (typeof path !== 'string' || !/^[A-Za-z][A-Za-z0-9]*(\[\d+\])*(\.[A-Za-z][A-Za-z0-9]*(\[\d+\])*)*$/.test(path)) return null;
  const tokens: PathToken[] = [];
  for (const part of path.split('.')) {
    const [name, ...indexes] = part.split('[');
    tokens.push(name);
    for (const index of indexes) tokens.push(Number(index.slice(0, -1)));
  }
  return tokens;
}

/** Ruta concreta → patrón del registro (`[3]` → `[]`). */
export const fieldPattern = (path: string): string => path.replace(/\[\d+\]/g, '[]');
/** Patrón → ruta concreta del primer elemento (`[]` → `[0]`). */
export const concretePath = (pattern: string): string => pattern.replace(/\[\]/g, '[0]');
/** Tokens → ruta. */
export const formatFieldPath = (tokens: readonly PathToken[]): string =>
  tokens.reduce<string>((path, token) => (typeof token === 'number' ? `${path}[${token}]` : path ? `${path}.${token}` : token), '');

const BY_PATTERN = new Map(PROJECT_FIELDS.map((def) => [def.path, def]));
/** Definición de una ruta concreta o de un patrón; `undefined` si no está registrada. */
export const findProjectField = (path: string): ProjectFieldDefinition | undefined => BY_PATTERN.get(fieldPattern(path));

/** Valor en una ruta (sin reglas: el guardado). */
export function readPath(value: unknown, tokens: readonly PathToken[]): unknown {
  let current = value;
  for (const token of tokens) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[token];
  }
  return current;
}
export const readProjectField = (project: ProjectSimulation, path: string): unknown => readPath(project, parseFieldPath(path) ?? []);

/** Etiqueta legible de una ruta concreta: la del registro, con el número del grupo o el mes. */
export function fieldLabel(path: string): string {
  const def = findProjectField(path);
  if (!def) {
    // Un elemento entero de una lista de registros (grupo añadido o quitado, `specs.panels[1]`): la etiqueta de la lista
    // con el número del elemento («Paneles (#2)»).
    const element = /^(.*)\[(\d+)\]$/.exec(path);
    const list = element ? findProjectField(element[1]) : undefined;
    return list?.type === 'list' ? `${list.label} (#${Number(element![2]) + 1})` : path;
  }
  const indexes = [...path.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  if (!indexes.length) return def.label;
  if (def.path === 'monthlyConsumption[]') return `Consumo de ${MONTHS[indexes[0]] ?? `mes ${indexes[0] + 1}`} (kWh)`;
  return `${def.label} (#${indexes[0] + 1})`;
}
