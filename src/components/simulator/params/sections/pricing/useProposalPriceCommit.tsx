import React from 'react';
import { useSimulationStore } from '../../../../../store/useSimulationStore';
import { acceptProposalGenericQuestion, commitProposalPrice, priceFeatureActive } from '../../../../../store/slices/equipmentPriceSlice';
import type { PriceCommitTarget } from './UnitCosts';
import type { PricedKind } from './supplierPricing';
import { nextRowQuestion, rowQuestionFor, type RowQuestion } from './priceCommit';

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
  // La fila cambió de equipo (otro modelo, o se movieron los grupos): la pregunta se descarta tras el render, no se oculta.
  const stale = React.useRef(false);
  React.useEffect(() => {
    if (stale.current) { stale.current = false; setQuestion(null); }
  });

  const onPriceCommit = (target: PriceCommitTarget, previousUSD: number | undefined, priceUSD: number) => {
    const result = commitProposalPrice(useSimulationStore.getState(), { projectId, equipmentId: target.equipmentId, previousUSD, priceUSD, supplierPriceUSD: target.supplierPriceUSD });
    setQuestion((current) => nextRowQuestion(current, target, result));
  };

  const priceQuestionFor = (kind: PricedKind, index: number, equipmentId: string | undefined): React.ReactNode => {
    const match = rowQuestionFor(question, projectId, kind, index, equipmentId);
    if (!match) {
      if (question && question.projectId === projectId && question.kind === kind && question.index === index) stale.current = true;
      return null;
    }
    return (
      <GenericQuestion
        onUse={() => { acceptProposalGenericQuestion(useSimulationStore.getState(), match); setQuestion(null); }}
        onDismiss={() => { useSimulationStore.getState().dismissGenericQuestion(match.equipmentId); setQuestion(null); }}
      />
    );
  };

  return active ? { showGenericLabel: true, onPriceCommit, priceQuestionFor } : { showGenericLabel: false };
}
