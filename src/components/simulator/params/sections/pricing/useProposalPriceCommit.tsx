import React from 'react';
import { useSimulationStore } from '../../../../../store/useSimulationStore';
import {
  acceptProposalGenericQuestion, commitProposalPrice, priceFeatureActive, type ProposalGenericQuestion,
} from '../../../../../store/slices/equipmentPriceSlice';
import type { PriceCommitTarget } from './UnitCosts';
import type { PricedKind } from './supplierPricing';

type RowQuestion = ProposalGenericQuestion & { kind: PricedKind; index: number };

/** «¿Usar como precio genérico? Usar · No»: una línea gris bajo el precio, sin caja ni color de aviso. */
const GenericQuestion: React.FC<{ onUse: () => void; onDismiss: () => void }> = ({ onUse, onDismiss }) => {
  const link = 'cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-pd-strong underline underline-offset-2';
  return (
    <span role="group" aria-label="¿Usar como precio genérico?" className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-pd-muted">
      <span>¿Usar como precio genérico?</span>
      <button type="button" className={link} onClick={onUse}>Usar</button>
      <span aria-hidden="true">·</span>
      <button type="button" className={link} onClick={onDismiss}>No</button>
    </span>
  );
};

/**
 * Regla 2 del ADR 0006 en el dock: registra el precio confirmado a mano y, si el equipo no tiene genérico, muestra la
 * pregunta bajo esa fila. Solo responde a acciones del usuario (confirmar, «Usar», «No»); mirar la propuesta no escribe.
 */
export function useProposalPriceCommit(projectId: string) {
  const active = useSimulationStore((s) => priceFeatureActive(s));
  const [question, setQuestion] = React.useState<RowQuestion | null>(null);

  const onPriceCommit = (target: PriceCommitTarget, previousUSD: number | undefined, priceUSD: number) => {
    const result = commitProposalPrice(useSimulationStore.getState(), { projectId, equipmentId: target.equipmentId, previousUSD, priceUSD, supplierPriceUSD: target.supplierPriceUSD });
    if (result.observationId) setQuestion(result.question ? { ...result.question, kind: target.kind, index: target.index } : null);
  };

  const priceQuestionFor = (kind: PricedKind, index: number): React.ReactNode => {
    if (!question || question.projectId !== projectId || question.kind !== kind || question.index !== index) return null;
    return (
      <GenericQuestion
        onUse={() => { acceptProposalGenericQuestion(useSimulationStore.getState(), question); setQuestion(null); }}
        onDismiss={() => { useSimulationStore.getState().dismissGenericQuestion(question.equipmentId); setQuestion(null); }}
      />
    );
  };

  return active ? { showGenericLabel: true, onPriceCommit, priceQuestionFor } : { showGenericLabel: false };
}
