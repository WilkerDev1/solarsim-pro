/**
 * Fábrica única de propuesta nueva (F2b; ADR 0009). Pura: sin store, sin reloj y sin generador de ids (el llamador pasa
 * id, fecha, secuencia y usuario). La usan «Nueva simulación» (`createNewProject`), el asistente de propuestas y el
 * flotante (`createAIProposalBase` → `buildProjectFromDraft`, también `create_proposal` de los agentes) y, para la identidad
 * y los metadatos de sincronización, duplicar (`newProposalIdentity`).
 *
 * Valores que decidió el dueño, iguales por todos los caminos (`NEW_PROPOSAL_DEFAULTS`):
 * - sin datos, 1.000 kWh/mes los doce meses, marcados como ESTIMADOS (`consumptionEstimate`, ver `isConsumptionEstimated`);
 * - factor de venta = «Margen bruto objetivo» de Ajustes (`automatedSaleMarginMultiplier`), cuyo valor de fábrica es 40 % (1,40);
 * - mano de obra 170 USD/kWp (la constante compartida de ADR 0003);
 * - la tarifa de referencia de la distribuidora elegida aplicada a ese consumo, con su fila;
 * - nada del caso de referencia: ni coordenadas, ni datos del cliente, ni equipos ni baterías heredados.
 * Equipos: los elige `chooseCatalogEquipment` (oferta preferida → la más barata en stock → precio genérico señalado → sin
 * precio, nunca inventado, pero un panel y un inversor del catálogo si lo hay: el de los ajustes o el más cercano a su potencia) y los dimensiona `sizing.ts` (paneles con la base del mes pico, inversor por DC/AC, baterías por la
 * regla activa). Una propuesta sin precio en algún equipo nace INCOMPLETA (`proposalCompleteness`), no con un precio prestado.
 *
 * Política de precio por fuente (revisión de F2, M10): «Nueva simulación» respeta el modo de Ajustes (matriz o $/W); el
 * asistente y los agentes cotizan siempre con la matriz de costos (`AUTOMATED_PRICING`, ver `enforceAutomatedPricing`).
 */
import type { ProjectSimulation, SystemSpecs } from '../types';
import type { DefaultSimulationSettings } from '../store/types';
import type { GlobalTariffMatrix } from '../types/tariffs';
import type { SolarEquipmentItem } from '../types/equipment';
import { mapTariffCodeOnDistributorChange, type UtilityDistributor } from '../types/tariffs';
import { LIST_KEY, editEquipment, readEquipment, type EquipmentKind } from '../../shared/equipment';
import { assumptionFields, resolveAssumption, DEFAULT_INSTALLATION_USD_PER_KWP } from '../../shared/assumptions';
import { newProposalNetMeteringFields } from '../../shared/netMetering';
import { tariffMatrixKey } from '../../shared/tariffRules';
import { DEFAULT_BATTERY_CAPACITY_KWH, DEFAULT_BATTERY_DOD_PCT, resolveSystemLossesPct } from '../../shared/projectDefaults';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD, referenceBillingTariff } from '../data/rdTariffs';
import { automatedSaleMarginMultiplier } from '../utils/saleMargin';
import { SIZING_ASSUMPTIONS, chooseCatalogEquipment, recommendBatteryCount, recommendInverterCount, recommendPanelCount } from './sizing';
import { DEFAULT_CATALOG_PANEL, groupSelectPatch, type GenericPriceLookup } from './rules/equipmentRules';
import { pricePerKWpFromWatt } from './rules/pricingRules';

/** Valores con que nace una propuesta nueva sin datos (decisión del dueño, ADR 0009). */
export const NEW_PROPOSAL_DEFAULTS = {
  /** Consumo mensual (kWh) de los doce meses cuando no hay datos; la propuesta queda marcada como estimada. */
  monthlyConsumptionKWh: 1000,
  /** Mano de obra y materiales (USD/kWp): la constante compartida de los supuestos (ADR 0003). */
  laborUSDPerKWp: DEFAULT_INSTALLATION_USD_PER_KWP,
  /** Nombre visible mientras no se escriba el del cliente. */
  name: 'Nuevo Proyecto Solar',
  /** Modelo de inversor cuando Ajustes no nombra ninguno. */
  inverterModel: 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)',
  inverterPowerKW: 8,
  panelPowerW: 620,
  /** Texto de la línea de instalación del documento (genérico, no del cliente de ejemplo). */
  installationServicesDesc: 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).',
} as const;

/** Quién crea: decide la política de precio (el menú respeta Ajustes; el asistente y los agentes, la matriz de costos). */
export type NewProposalSource = 'menu' | 'assistant' | 'agent';

export interface NewProposalUser {
  id?: string;
  name?: string;
  email?: string;
  organizationId?: string;
}

export interface NewProposalIdentityInput {
  id: string;
  /** Fecha ISO de creación (el llamador lee el reloj). */
  now: string;
  /** Código de proyecto y de cotización libres (`generateNextProjectSequence`). */
  sequence: { projectId: string; quoteNumber: string };
  /** Usuario con sesión, o nada en modo local. */
  user?: NewProposalUser | null;
  /** Servidor de sincronización (sin barra final) cuando hay sesión. */
  serverUrl?: string;
}

export interface NewProposalInput {
  source: NewProposalSource;
  defaults: DefaultSimulationSettings;
  identity: NewProposalIdentityInput;
  tariffMatrix?: GlobalTariffMatrix | null;
  /** Catálogo de equipos vigente; vacío o sin él, los equipos de Ajustes sin precio (la propuesta nace incompleta). */
  catalog?: readonly SolarEquipmentItem[];
  genericPriceFor?: GenericPriceLookup;
  companyProfileId?: string;
  /** Plantilla del documento de la empresa emisora (`companyDocumentCustomization`). */
  customization?: ProjectSimulation['customization'];
  client?: { name?: string; company?: string; province?: string; distributor?: UtilityDistributor; tariffCode?: string; address?: string };
  /** Doce consumos mensuales conocidos; sin ellos, el consumo estimado de fábrica. */
  monthlyConsumption?: readonly number[];
}

/** Identidad, autoría y estado de sincronización de una propuesta que nace (también la copia de un duplicado). */
export function newProposalIdentity(identity: NewProposalIdentityInput): Pick<ProjectSimulation,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'authorId' | 'authorName' | 'authorEmail' | 'lastModifiedBy' | 'lastModifiedAt'
  | 'version' | 'baseVersion' | 'organizationId' | 'syncServerUrl' | 'syncStatus'> {
  const user = identity.user;
  return {
    id: identity.id,
    createdAt: identity.now,
    updatedAt: identity.now,
    status: 'Draft',
    authorId: user?.id,
    authorName: user?.name || 'Ing. Solar',
    authorEmail: user?.email,
    lastModifiedBy: user?.name || 'Ing. Solar',
    lastModifiedAt: identity.now,
    version: 1,
    baseVersion: 0,
    organizationId: user?.organizationId,
    syncServerUrl: user ? identity.serverUrl : undefined,
    syncStatus: user ? 'pending' : 'local_only',
  };
}

/** La propuesta tiene el consumo estimado de fábrica: lleva la marca y sus doce meses siguen siendo ese valor. */
export function isConsumptionEstimated(project: Pick<ProjectSimulation, 'consumptionEstimate' | 'monthlyConsumption'>): boolean {
  const mark = project.consumptionEstimate;
  return !!mark && mark.kind === 'factory_default' && project.monthlyConsumption?.length === 12 && project.monthlyConsumption.every((value) => value === mark.monthlyKWh);
}

/** Tarifa típica de una distribuidora: la de Ajustes, mapeada como lo hace el dock al cambiar de distribuidora. */
export function typicalTariffCode(distributor: UtilityDistributor, defaults: Pick<DefaultSimulationSettings, 'defaultDistributor' | 'defaultTariffCode'>): string {
  const from = (defaults.defaultDistributor || 'EDEESTE') as UtilityDistributor;
  const code = defaults.defaultTariffCode || 'BTS2';
  return from === distributor ? code : mapTariffCodeOnDistributorChange(from, distributor, code);
}

/**
 * Precio de referencia de una tarifa al consumo medio, con su procedencia y su fila. Una tarifa que no está en la matriz no
 * recibe precio (nunca el de otra tarifa): la propuesta queda incompleta hasta que se indique.
 */
export function newProposalEnergyRates(matrix: GlobalTariffMatrix | null | undefined, distributor: string, tariffCode: string, averageMonthlyKWh: number, dopPerUSD: number) {
  const active = matrix?.schedules && Object.keys(matrix.schedules).length > 0 ? matrix : DEFAULT_RD_TARIFF_MATRIX;
  const key = distributor.trim().toUpperCase();
  const inMatrix = !!active.schedules?.[key as UtilityDistributor]?.tariffs?.[tariffMatrixKey(key, tariffCode)];
  if (!inMatrix) return { energyCostPerKWh: 0 };
  return {
    energyCostPerKWh: getReferenceEnergyRateUSD(active, key, tariffCode, averageMonthlyKWh, dopPerUSD),
    energyRateSource: 'reference' as const,
    billingTariff: referenceBillingTariff(active, key, tariffCode),
  };
}

const validMonths = (months: readonly number[] | undefined): months is readonly number[] =>
  Array.isArray(months) && months.length === 12 && months.every((value) => Number.isFinite(value) && value >= 0) && months.some((value) => value > 0);

/**
 * Grupo principal de un tipo: el modelo de Ajustes sin precio y, si el catálogo ofrece uno (`chooseCatalogEquipment`), ese
 * modelo con su identidad, sus campos y su precio, como el selector del dock. La lista se siembra explícita: una lista vacía
 * haría que la migración inventara el grupo del formato heredado (con su precio por defecto).
 */
function primaryGroup(specs: SystemSpecs, kind: EquipmentKind, input: NewProposalInput, preferredName: string | undefined, preferredMagnitude: number | undefined, manual: Record<string, unknown>): SystemSpecs {
  const seeded = { ...specs, [LIST_KEY[kind]]: [{ id: `primary-${kind}`, count: 1, ...manual }] } as SystemSpecs;
  const choice = chooseCatalogEquipment(input.catalog ?? [], kind, { preferredName, preferredMagnitude, genericFor: input.genericPriceFor });
  if (!choice.item) return seeded;
  const patch = groupSelectPatch(kind, seeded, 0, choice.item, input.genericPriceFor?.(choice.item.id));
  // Los parámetros de panel del sistema vienen del modelo; la degradación de Ajustes manda (ADR 0003): la del modelo vive en su grupo.
  const { annualDegradation: _modelDegradation, ...system } = patch as Partial<SystemSpecs>;
  return { ...seeded, ...system };
}

/** Crea la propuesta nueva. Ver el encabezado del módulo. */
export function createNewProposal(input: NewProposalInput): ProjectSimulation {
  const defs = input.defaults;
  const assumptions = assumptionFields(undefined, defs);
  const province = input.client?.province || defs.defaultProvince || 'Santo Domingo / Distrito Nacional';
  const distributor = (input.client?.distributor || defs.defaultDistributor || 'EDEESTE') as UtilityDistributor;
  const tariffCode = input.client?.tariffCode || typicalTariffCode(distributor, defs);
  const company = input.client?.company || '';
  const name = input.client?.name || NEW_PROPOSAL_DEFAULTS.name;
  const estimated = !validMonths(input.monthlyConsumption);
  const monthlyConsumption = estimated ? Array(12).fill(NEW_PROPOSAL_DEFAULTS.monthlyConsumptionKWh) as number[] : [...input.monthlyConsumption!];
  const average = monthlyConsumption.reduce((sum, value) => sum + value, 0) / 12;
  const wattPrice = assumptions.specs.pricePerWattUSD;
  const direct = input.source === 'menu' && defs.defaultPricingMode === 'direct';

  // ── Equipos ──
  let specs: SystemSpecs = {
    isDetailed: false, // Simple (Catálogo IA): equipos del catálogo con precios de proveedor
    pricingMode: direct ? 'direct_watt' : 'cost_matrix',
    autoSupplierPricing: true,
    pricePerWattUSD: wattPrice,
    pricePerKWpUSD: pricePerKWpFromWatt(wattPrice),
    systemLosses: assumptions.specs.systemLosses,
    annualDegradation: assumptions.specs.annualDegradation,
    dopExchangeRate: assumptions.specs.dopExchangeRate,
    saleMarginMultiplier: automatedSaleMarginMultiplier(defs),
    installationUnitPriceUSD: assumptions.specs.installationUnitPriceUSD,
    installationServicesDesc: NEW_PROPOSAL_DEFAULTS.installationServicesDesc,
    panelEfficiency: DEFAULT_CATALOG_PANEL.efficiencyPct,
    tempCoeff: DEFAULT_CATALOG_PANEL.tempCoeff,
    autoCalculatePanels: defs.defaultAutoCalculatePanels || false,
    hasBattery: defs.defaultHasBattery || false,
    sizingBasis: SIZING_ASSUMPTIONS.newProposalBasis,
    panels: [],
    inverters: [],
    batteries: [],
  };
  const panelPowerW = defs.defaultPanelPowerW || NEW_PROPOSAL_DEFAULTS.panelPowerW;
  const inverterPowerKW = defs.defaultInverterPowerKW || NEW_PROPOSAL_DEFAULTS.inverterPowerKW;
  specs = primaryGroup(specs, 'panel', input, defs.defaultPanelModel, panelPowerW, { brandModel: defs.defaultPanelModel || 'Panel solar', powerW: panelPowerW });
  specs = primaryGroup(specs, 'inverter', input, defs.defaultInverterModel || NEW_PROPOSAL_DEFAULTS.inverterModel, inverterPowerKW,
    { brandModel: defs.defaultInverterModel || NEW_PROPOSAL_DEFAULTS.inverterModel, powerKW: inverterPowerKW });
  // La batería de Ajustes (nunca la del caso de referencia) va siempre en su grupo, oculta si «Incluir batería» está apagado:
  // así encenderla no hace que `readEquipment` derive el grupo heredado con su precio por defecto (un precio inventado).
  const capacity = defs.defaultBatteryCapacityKWh || DEFAULT_BATTERY_CAPACITY_KWH;
  // Sin potencia preferida: sin precio en el catálogo, la batería sigue siendo la de Ajustes (su DOD y eficiencia, que el
  // modelo del catálogo cambiaría, y con ellos la cantidad que pide la regla activa).
  specs = primaryGroup(specs, 'battery', input, undefined, undefined, { brandModel: `Batería ${capacity} kWh`, capacityKWh: capacity, dodPct: defs.defaultBatteryDOD || DEFAULT_BATTERY_DOD_PCT });

  // ── Dimensionado (supuestos en sizing.ts) ──
  const panel = readEquipment(specs).panels[0];
  const panelCount = recommendPanelCount({
    province, monthlyConsumption, panelPowerW: panel.powerW, coveragePct: resolveAssumption('targetCoveragePct', assumptions.rates.targetCoveragePct),
    lossesPct: resolveSystemLossesPct(specs), basis: SIZING_ASSUMPTIONS.newProposalBasis,
  }).count;
  specs = editEquipment(specs, 'panel', { type: 'update', index: 0, patch: { count: panelCount } });
  const inverter = readEquipment(specs).inverters[0];
  const inverterCount = recommendInverterCount({ dcKWp: panelCount * panel.powerW / 1000, unitPowerKW: inverter.powerKW }).count;
  specs = editEquipment(specs, 'inverter', { type: 'update', index: 0, patch: { count: Math.max(1, inverterCount) } });
  const battery = readEquipment({ ...specs, hasBattery: true }).batteries[0];
  const bank = recommendBatteryCount({ unit: battery, monthlyConsumption });
  specs = { ...specs, batteries: [{ ...battery, count: Math.max(1, bank.count) }] };

  return {
    ...newProposalIdentity(input.identity),
    client: {
      name, company, location: province, province, address: input.client?.address || '',
      distributor, tariffCode,
      contactEmail: '', contactPhone: '', contactPerson: company,
      projectId: input.identity.sequence.projectId,
      quoteNumber: input.identity.sequence.quoteNumber,
      quoteValidityDays: assumptions.client.quoteValidityDays,
    },
    specs,
    rates: {
      distributor, tariffCode,
      currency: defs.currency || 'USD',
      targetCoveragePct: assumptions.rates.targetCoveragePct,
      isZeroExport: defs.defaultZeroExport || false,
      gridExportFeePct: assumptions.rates.gridExportFeePct,
      usdExchangeRate: assumptions.rates.usdExchangeRate,
      annualEnergyInflationPct: assumptions.rates.annualEnergyInflationPct,
      // SIE-007-2026 con el cargo de fábrica de su distribuidora y la tarifa de referencia a su consumo (factura por bloques).
      ...newProposalNetMeteringFields(distributor),
      ...newProposalEnergyRates(input.tariffMatrix, distributor, tariffCode, average, assumptions.specs.dopExchangeRate),
    },
    financials: {
      applyLey5707: defs.applyLey5707 !== undefined ? defs.applyLey5707 : true,
      applyITBISExemption: defs.applyITBISExemption !== undefined ? defs.applyITBISExemption : true,
      pricePerWattUSD: assumptions.financials.pricePerWattUSD,
      discountRatePct: assumptions.financials.discountRatePct,
      projectLifespanYears: assumptions.financials.projectLifespanYears,
      co2FactorKgPerKWh: assumptions.financials.co2FactorKgPerKWh,
      customItems: [],
      customDiscounts: [],
    },
    monthlyConsumption,
    ...(estimated ? { consumptionEstimate: { kind: 'factory_default' as const, monthlyKWh: NEW_PROPOSAL_DEFAULTS.monthlyConsumptionKWh } } : {}),
    companyProfileId: input.companyProfileId,
    customization: { ...(input.customization || {}), contactName: company || name, clientPhone: '', clientEmail: '' },
  };
}
