/**
 * Confirmación de un precio de la fila de costo unitario (ADR 0006 §4, Regla 2). El campo escribe en cada tecla; la
 * confirmación es aparte: Enter, o salir del campo mientras la ventana tiene el foco, y solo si el valor cambió respecto
 * al que tenía al entrar. Salir porque la ventana perdió el foco no confirma ni olvida la base: al volver, el campo
 * recupera el foco y el cambio pendiente se confirma en la siguiente salida.
 */
export interface PriceCommit {
  previousUSD: number | undefined;
  priceUSD: number;
}

export interface PriceCommitTracker {
  focus: (value: number | undefined) => void;
  commit: (value: number, reason: 'enter' | 'blur', windowFocused: boolean) => PriceCommit | null;
}

export function createPriceCommitTracker(): PriceCommitTracker {
  let focused = false;
  let base: { value: number | undefined } | null = null;
  return {
    focus: (value) => {
      focused = true;
      if (!base) base = { value };
    },
    commit: (value, reason, windowFocused) => {
      if (!focused || !base) return null;
      if (reason === 'blur') {
        focused = false;
        if (!windowFocused) return null; // la base se conserva para cuando la ventana vuelva
      }
      const previousUSD = base.value;
      base = reason === 'enter' ? { value } : null;
      return previousUSD === value ? null : { previousUSD, priceUSD: value };
    },
  };
}
