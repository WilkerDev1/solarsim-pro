import type { ProjectSimulation, UtilityRates } from '../types';
import {
  factoryGridUseCharge,
  gridUseChargeApplies,
  isValidGridUseCharge,
  resolveNetMeteringRegime,
  type GridUseChargeSource,
  type NetMeteringRatesInput,
} from '../../shared/netMetering';
import { resolveEnergyValuationMethod } from '../../shared/tariffBilling';
import { commercialState } from '../../shared/proposalCommercial';

/**
 * Propuestas existentes en el régimen anterior (`legacy_retention`) frente a SIE-007-2026 (fase 7 del plan tarifario).
 *
 * EDESUR comunicó que desde el 1/11/2026 aplica el esquema SIE-007-2026 (cargo por uso de red = energía inyectada × 25 %
 * del cargo por energía) a los clientes BTS-1/BTS-2 en medición neta, también a los anteriores a octubre de 2021. La
 * postura es conservadora y provisional: nada migra solo. El dock ofrece «Actualizar a SIE-007-2026» como acción
 * explícita (pasa por `applyProjectEdit` y se deshace) y el listado marca las propuestas abiertas que siguen en el
 * régimen anterior. Mostrar la oferta o la insignia nunca escribe; los enlaces publicados conservan su snapshot.
 *
 * Funciones puras: sin store ni React.
 */

/**
 * ¿Se ofrece pasar a SIE-007-2026? Solo en el régimen anterior (explícito, ausente o desconocido) y cuando el cargo por
 * uso de la red aplicaría: con inyección a la red y en tarifas sin cargo de potencia (`gridUseChargeApplies`; las sin
 * clasificar cuentan, mismo criterio conservador que el cargo). Nunca en inyección cero, aislado ni ya en SIE-007-2026.
 */
export function canOfferSie007Upgrade(rates: NetMeteringRatesInput | null | undefined): boolean {
  if (!rates) return false;
  return resolveNetMeteringRegime(rates.netMeteringRegime) === 'legacy_retention' && gridUseChargeApplies(rates);
}

/**
 * Parche de tarifas de la actualización: fija el régimen y siembra el cargo de fábrica de la distribuidora solo si no hay
 * uno válido guardado (un 0 explícito es válido y se respeta). No toca el precio de la energía, su procedencia ni la
 * retención guardada: volver al régimen anterior con el selector recupera las cifras de antes.
 */
export function sie007UpgradePatch(rates: NetMeteringRatesInput): Partial<UtilityRates> {
  return isValidGridUseCharge(rates.gridUseChargeDOPPerKWh)
    ? { netMeteringRegime: 'sie007_2026' }
    : { netMeteringRegime: 'sie007_2026', gridUseChargeDOPPerKWh: factoryGridUseCharge(rates.distributor).dopPerKWh };
}

export interface Sie007UpgradePlan {
  patch: Partial<UtilityRates>;
  /** Cargo de fábrica de la distribuidora, con su resolución y periodo. */
  factory: GridUseChargeSource;
  /** Cargo por kWh inyectado con el que queda la propuesta (RD$/kWh): el guardado válido o el de fábrica. */
  chargeDOPPerKWh: number;
  /** El parche siembra el cargo de fábrica (no había uno válido guardado). */
  seedsFactoryCharge: boolean;
  /** Tras actualizar, la energía se valora por bloques (ya tenía la tarifa oficial con su fila guardada). */
  valuesByBlocks: boolean;
  /**
   * Tras actualizar se seguiría valorando con el precio escalar, pero «Aplicar tarifa oficial» permitiría facturar por
   * bloques con la fila oficial. Solo se menciona: el precio no cambia solo.
   */
  suggestOfficialTariff: boolean;
}

/**
 * Plan del aviso del dock, o `null` si no se ofrece. `referencePatch` es lo que escribiría «Aplicar tarifa oficial»
 * (`planApplyReference`/`referenceRatesPatch`); sin él no se menciona.
 */
export function planSie007Upgrade(rates: UtilityRates | null | undefined, referencePatch?: Partial<UtilityRates>): Sie007UpgradePlan | null {
  if (!rates || !canOfferSie007Upgrade(rates)) return null;
  const patch = sie007UpgradePatch(rates);
  const upgraded: UtilityRates = { ...rates, ...patch };
  const valuesByBlocks = resolveEnergyValuationMethod(upgraded) === 'block_billing';
  const suggestOfficialTariff = !valuesByBlocks && !!referencePatch && resolveEnergyValuationMethod({ ...upgraded, ...referencePatch }) === 'block_billing';
  const factory = factoryGridUseCharge(rates.distributor);
  return {
    patch,
    factory,
    chargeDOPPerKWh: patch.gridUseChargeDOPPerKWh ?? (rates.gridUseChargeDOPPerKWh as number),
    seedsFactoryCharge: patch.gridUseChargeDOPPerKWh !== undefined,
    valuesByBlocks,
    suggestOfficialTariff,
  };
}

/**
 * ¿Propuesta abierta? El modelo no guarda si se publicó (los enlaces viven aparte y conservan su snapshot), así que
 * «cerrada» es: en papelera, archivada (`status: 'Archived'`) o con decisión comercial final (aprobada o rechazada).
 * Borrador, Final sin decisión, en espera y de prueba siguen abiertas.
 */
export function isOpenProposal(project: Pick<ProjectSimulation, 'status' | 'isDeleted' | 'commercial' | 'authorId' | 'authorName'>): boolean {
  if (project.isDeleted || project.status === 'Archived') return false;
  const decision = commercialState(project).status;
  return decision !== 'approved' && decision !== 'rejected';
}

/** Insignia «Régimen anterior» del listado: propuesta abierta a la que se le ofrecería la actualización. */
export function showsLegacyRegimeBadge(project: Pick<ProjectSimulation, 'status' | 'isDeleted' | 'commercial' | 'authorId' | 'authorName' | 'rates'>): boolean {
  return isOpenProposal(project) && canOfferSie007Upgrade(project.rates);
}

export const LEGACY_REGIME_BADGE_LABEL = 'Régimen anterior';
export const LEGACY_REGIME_BADGE_TOOLTIP =
  'Calculada con la retención % del régimen anterior de medición neta. EDESUR comunicó que desde el 1/11/2026 aplica el Reglamento SIE-007-2026 (cargo por kWh inyectado) también a clientes en medición neta anteriores a octubre de 2021. Las propuestas guardadas no cambian solas: ábrela para revisar el régimen en Tarifas.';

/** Texto del aviso del dock: el comunicado y lo que la propuesta sigue usando. */
export const SIE007_UPGRADE_NOTICE =
  'Esta propuesta usa la retención % del régimen anterior. EDESUR comunicó que desde el 1/11/2026 aplica SIE-007-2026 (cargo por kWh inyectado) también a clientes en medición neta anteriores a octubre de 2021.';
