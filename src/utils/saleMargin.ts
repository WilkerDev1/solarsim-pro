import type { DefaultSimulationSettings } from '../store/types';
import { DEFAULT_TARGET_MARGIN_PCT } from '../store/defaultSimulationSettings';

/**
 * Multiplicador de margen de venta de las propuestas automáticas: «Margen bruto objetivo» de los ajustes del usuario
 * (o la constante de fábrica), como `1 + margen / 100`. Lo comparten el borrador de IA y la línea de catálogo de una
 * cotización, así el mismo equipo sale al mismo precio en ambos.
 */
export function automatedSaleMarginMultiplier(defaults: Pick<DefaultSimulationSettings, 'defaultTargetMarginPct'> | null | undefined): number {
  return 1 + (defaults?.defaultTargetMarginPct ?? DEFAULT_TARGET_MARGIN_PCT) / 100;
}
