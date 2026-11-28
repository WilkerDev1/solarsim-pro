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

/**
 * «Margen Bruto Objetivo» de Ajustes mientras se teclea: el número escrito, limitado a 0–100, o `null` (vacío o no numérico:
 * no se escribe nada y el campo puede quedar vacío para teclear un valor nuevo).
 */
export function targetMarginDraftValue(draft: string): number | null {
  const text = draft.trim();
  const parsed = text === '' ? NaN : Number(text);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : null;
}

/** Al salir del campo: el valor tecleado o, vacío o no numérico, el de fábrica. */
export function targetMarginOnBlur(draft: string): number {
  return targetMarginDraftValue(draft) ?? DEFAULT_TARGET_MARGIN_PCT;
}
