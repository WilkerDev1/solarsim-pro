/**
 * Presentación de payback y TIR cuando el sistema no recupera la inversión dentro de la vida útil (p. ej. SIE-007 con un
 * sistema muy sobredimensionado: el cargo por uso de la red supera el ahorro). El motor marca `paybackReached` e
 * `irrDefined` (`src/engine/financeEngine.ts`); un resumen publicado por una versión anterior no los trae y cuenta como
 * alcanzado (lo que mostraba hasta ahora). Lo comparten la app, el PDF y el visor web.
 */

export const PAYBACK_NOT_REACHED_LABEL = 'No se recupera';
export const IRR_NOT_APPLICABLE_LABEL = 'No aplica';

export interface ReturnIndicatorFields {
  paybackYears?: unknown;
  paybackReached?: unknown;
  irrPct?: unknown;
  irrDefined?: unknown;
}

export const isPaybackReached = (summary: ReturnIndicatorFields | null | undefined): boolean => summary?.paybackReached !== false;
export const isIrrDefined = (summary: ReturnIndicatorFields | null | undefined): boolean => summary?.irrDefined !== false;

const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);

/** «3.0 años» o «No se recupera». `digits` como el resto de la vista (1 por defecto). */
export function paybackText(summary: ReturnIndicatorFields | null | undefined, digits = 1, unit = ' años'): string {
  return isPaybackReached(summary) ? `${finite(summary?.paybackYears).toFixed(digits)}${unit}` : PAYBACK_NOT_REACHED_LABEL;
}

/** «30.9%» o «No aplica». */
export function irrText(summary: ReturnIndicatorFields | null | undefined, digits = 1): string {
  return isIrrDefined(summary) ? `${finite(summary?.irrPct).toFixed(digits)}%` : IRR_NOT_APPLICABLE_LABEL;
}
