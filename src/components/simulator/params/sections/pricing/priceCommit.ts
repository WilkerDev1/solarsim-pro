import type { ProposalGenericQuestion } from '../../../../../store/slices/equipmentPriceSlice';
import type { PricedKind } from './supplierPricing';

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

/** Pregunta «¿Usar como precio genérico?» del dock, atada a la fila y al equipo que tenía al confirmarse. */
export type RowQuestion = ProposalGenericQuestion & { kind: PricedKind; index: number };

/**
 * Estado de la pregunta tras confirmar un precio en una fila. Un registro nuevo la reemplaza (con su pregunta o sin
 * ninguna); un confirmado rechazado en la misma fila la quita, porque el precio capturado ya no es el que muestra la fila.
 */
export function nextRowQuestion(
  current: RowQuestion | null,
  target: { kind: PricedKind; index: number },
  result: { observationId: string | null; question: ProposalGenericQuestion | null },
): RowQuestion | null {
  if (result.question) return { ...result.question, kind: target.kind, index: target.index };
  if (result.observationId) return null;
  return current && current.kind === target.kind && current.index === target.index ? null : current;
}

/** La pregunta solo se muestra en su propuesta, su fila y mientras la fila siga resolviendo al mismo equipo. */
export function rowQuestionFor(
  question: RowQuestion | null, projectId: string, kind: PricedKind, index: number, equipmentId: string | undefined,
): RowQuestion | null {
  if (!question || question.projectId !== projectId || question.kind !== kind || question.index !== index) return null;
  return question.equipmentId === equipmentId ? question : null;
}
