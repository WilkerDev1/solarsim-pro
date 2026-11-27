import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, X } from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useQuotationsFeature } from '../../../features/application/quotationsFeature';
import type { AppView, QuotationReturn } from '../../../store/types';
import './return-pill.css';

const PROPOSAL_VIEWS: readonly AppView[] = ['project-hub', 'simulator', 'pdf-preview'];

/**
 * Cuándo se ve «Volver a COT-…»: en las vistas de la propuesta que se abrió desde el visor de la cotización
 * («Abrir propuesta») mientras esa cotización exista. Puro, para probarlo sin montar la app.
 */
export function returnPillLabel(state: {
  quotationReturn: QuotationReturn | null;
  activeView: AppView;
  activeProjectId: string;
  quotations: readonly { id: string; number: string | null }[];
}): string | null {
  const target = state.quotationReturn;
  if (!target || !PROPOSAL_VIEWS.includes(state.activeView) || state.activeProjectId !== target.projectId) return null;
  const quotation = state.quotations.find((q) => q.id === target.quotationId);
  if (!quotation) return null;
  return `Volver a ${quotation.number ?? 'la cotización'}`;
}

/** Píldora fija en la vista de la propuesta: reabre el editor en la misma pestaña (y el visor, si estaba abierto). */
export const ReturnToQuotationPill: React.FC = () => {
  const enabled = useQuotationsFeature();
  const { label, returnToQuotation, dismissQuotationReturn } = useSimulationStore(useShallow((s) => ({
    label: returnPillLabel(s),
    returnToQuotation: s.returnToQuotation,
    dismissQuotationReturn: s.dismissQuotationReturn,
  })));
  if (!enabled || !label) return null;
  return (
    <div className="qr-pill" role="region" aria-label="Cotización abierta">
      <button type="button" className="qr-pill-main" onClick={returnToQuotation}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      <button type="button" className="qr-pill-close" aria-label="Descartar el regreso a la cotización" title="Descartar" onClick={dismissQuotationReturn}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
