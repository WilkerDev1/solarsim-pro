export interface CommitNumberRange {
  min?: number;
  max?: number;
  /** Qué hacer con un valor ≤ 0 o menor que `min`: `clamp` (por defecto) lo sube al mínimo; `revert` conserva el anterior. */
  belowMin?: 'clamp' | 'revert';
}

/**
 * Valor a guardar al confirmar (blur o Enter) un borrador de texto:
 * vacío o no numérico conserva `previous`; el resto se limita a [min, max].
 */
export function commitNumberDraft(draft: string, previous: number, range: CommitNumberRange = {}): number {
  const text = draft.trim();
  const parsed = text === '' ? NaN : Number(text);
  if (!Number.isFinite(parsed)) return previous;
  const { min, max, belowMin = 'clamp' } = range;
  if (min !== undefined && parsed < min) return belowMin === 'revert' ? previous : min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}
