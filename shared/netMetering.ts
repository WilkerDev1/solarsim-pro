/**
 * Régimen de medición neta de una propuesta y cargo por uso de la red (Reglamento SIE-007-2026-REG).
 *
 * - `legacy_retention`: régimen con el que se calcularon todas las propuestas hasta la fase 2. Se retiene un
 *   porcentaje (`gridExportFeePct`, 25 % por defecto) de la energía exportada, en cualquier tarifa. Es el valor
 *   de toda propuesta guardada, importada, del historial o publicada que no trae el campo: sus cifras no cambian.
 * - `sie007_2026`: la medición neta acredita el 100 % de lo inyectado y se cobra un cargo por uso de la red
 *   = kWh inyectados × RD$/kWh (art. 19.1.e), solo a las tarifas de un solo precio (BTS-1, BTS-2, RBT-1).
 *   Es el régimen con el que nacen las propuestas nuevas.
 *
 * Lectura (ADR 0003): un dato que falta o no es válido se resuelve aquí, al leer; nunca se repara al hidratar.
 * TypeScript puro, sin dependencias fuera de `shared/` (lo compilan el cliente y el Worker).
 */
import { tariffChargeKind } from './tariffRules';

export const NET_METERING_REGIMES = ['legacy_retention', 'sie007_2026'] as const;
export type NetMeteringRegime = (typeof NET_METERING_REGIMES)[number];

/** Régimen de lo guardado sin el campo (propuestas, importación, historial, enlaces publicados). */
export const SAVED_PROPOSAL_NET_METERING_REGIME: NetMeteringRegime = 'legacy_retention';
/** Régimen con el que nacen las propuestas nuevas (simulador, borrador de IA, agentes). */
export const NEW_PROPOSAL_NET_METERING_REGIME: NetMeteringRegime = 'sie007_2026';

export const NET_METERING_REGIME_LABELS: Record<NetMeteringRegime, string> = {
  legacy_retention: 'Retención % (anterior)',
  sie007_2026: 'SIE-007-2026 (RD$/kWh inyectado)',
};

export function isNetMeteringRegime(value: unknown): value is NetMeteringRegime {
  return typeof value === 'string' && (NET_METERING_REGIMES as readonly string[]).includes(value);
}

/** Régimen efectivo: el guardado si es válido; si falta o es desconocido, el anterior (lo guardado no cambia). */
export function resolveNetMeteringRegime(value: unknown): NetMeteringRegime {
  return isNetMeteringRegime(value) ? value : SAVED_PROPOSAL_NET_METERING_REGIME;
}

/** Procedencia de un cargo por uso de la red de fábrica. */
export interface GridUseChargeSource {
  dopPerKWh: number;
  resolutionCode: string;
  period: string;
}

/**
 * Cargos por uso de la red de fábrica (RD$/kWh inyectado), verificados en las tablas de las resoluciones:
 * - EDESUR, EDENORTE, EDEESTE: Res. SIE-121-2026-TF, art. 9 (pág. 13), octubre–diciembre 2026; calculados sobre la
 *   tarifa de referencia sin subsidio (15.12 / 16.09 / 15.53 × 25 %).
 * - CEPM: Res. SIE-147-2026-TF, art. 2 (pág. 5), septiembre 2026 (22.90 × 25 %); la SIE-142-2026-RR rechazó su reconsideración.
 * La SIE los revisa cada trimestre (cada mes en CEPM): el valor de fábrica solo siembra propuestas nuevas.
 */
export const FACTORY_GRID_USE_CHARGES = {
  EDESUR: { dopPerKWh: 3.78, resolutionCode: 'SIE-121-2026-TF', period: 'octubre–diciembre 2026' },
  EDENORTE: { dopPerKWh: 4.02, resolutionCode: 'SIE-121-2026-TF', period: 'octubre–diciembre 2026' },
  EDEESTE: { dopPerKWh: 3.88, resolutionCode: 'SIE-121-2026-TF', period: 'octubre–diciembre 2026' },
  CEPM: { dopPerKWh: 5.73, resolutionCode: 'SIE-147-2026-TF', period: 'septiembre 2026' },
} as const satisfies Record<string, GridUseChargeSource>;

/** Tope de un cargo editado (RD$/kWh). */
export const MAX_GRID_USE_CHARGE_DOP_PER_KWH = 100;

/**
 * Cargo de fábrica de una distribuidora. Una distribuidora desconocida o ausente usa el mayor de las tres EDE
 * (EDENORTE, 4.02): ante la duda se estima el ahorro a la baja.
 */
export function factoryGridUseCharge(distributor: unknown): GridUseChargeSource {
  const key = typeof distributor === 'string' ? distributor.trim().toUpperCase() : '';
  return (FACTORY_GRID_USE_CHARGES as Record<string, GridUseChargeSource>)[key] ?? FACTORY_GRID_USE_CHARGES.EDENORTE;
}

export function isValidGridUseCharge(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_GRID_USE_CHARGE_DOP_PER_KWH;
}

/** Forma mínima de las tarifas de una propuesta que leen estas reglas (`UtilityRates` y el JSON del Worker la cumplen). */
export interface NetMeteringRatesInput {
  distributor?: string | null;
  tariffCode?: string | null;
  isZeroExport?: boolean | null;
  netMeteringRegime?: unknown;
  gridUseChargeDOPPerKWh?: number | null;
}

/** Cargo por kWh inyectado de la propuesta (RD$/kWh): el guardado si es válido (0 explícito se respeta); si no, el de fábrica. */
export function resolveGridUseChargeDOPPerKWh(rates: NetMeteringRatesInput | null | undefined): number {
  return isValidGridUseCharge(rates?.gridUseChargeDOPPerKWh) ? rates.gridUseChargeDOPPerKWh : factoryGridUseCharge(rates?.distributor).dopPerKWh;
}

/**
 * ¿Aplica el cargo por uso de la red? Solo con inyección a la red y en tarifas de un solo precio (art. 19.1.e).
 * Tarifas con cargo de potencia (BTD, BTH, MTD, MTH, RBT-2…): no. Tarifas sin clasificar (`unknown`): sí, por
 * criterio conservador (el ahorro se estima a la baja hasta clasificar la tarifa).
 */
export function gridUseChargeApplies(rates: NetMeteringRatesInput | null | undefined): boolean {
  if (rates?.isZeroExport) return false;
  return tariffChargeKind(rates?.distributor ?? undefined, rates?.tariffCode ?? '') !== 'demand';
}

/** Medición neta efectiva de una propuesta para el motor y los textos. */
export interface ResolvedNetMetering {
  regime: NetMeteringRegime;
  /** Cargo por kWh inyectado guardado o de fábrica (RD$/kWh), aplique o no. */
  gridUseChargeDOPPerKWh: number;
  /** Cargo que se cobra de verdad (RD$/kWh): 0 en `legacy_retention`, en tarifas con potencia y con inyección cero. */
  appliedGridUseChargeDOPPerKWh: number;
}

export function resolveNetMetering(rates: NetMeteringRatesInput | null | undefined): ResolvedNetMetering {
  const regime = resolveNetMeteringRegime(rates?.netMeteringRegime);
  const charge = resolveGridUseChargeDOPPerKWh(rates);
  return {
    regime,
    gridUseChargeDOPPerKWh: charge,
    appliedGridUseChargeDOPPerKWh: regime === 'sie007_2026' && gridUseChargeApplies(rates) ? charge : 0,
  };
}

/** Campos con los que nace una propuesta nueva en el régimen vigente (cargo de fábrica de su distribuidora). */
export function newProposalNetMeteringFields(distributor: unknown): { netMeteringRegime: NetMeteringRegime; gridUseChargeDOPPerKWh: number } {
  return { netMeteringRegime: NEW_PROPOSAL_NET_METERING_REGIME, gridUseChargeDOPPerKWh: factoryGridUseCharge(distributor).dopPerKWh };
}

/** Aviso que acompaña al cargo mientras no se haya contrastado con facturas reales. */
export const GRID_USE_CHARGE_ESTIMATE_NOTICE = 'Cargo por uso de la red estimado, no verificado con facturas.';
