import React from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';

/** Editor de cotización. Marcador de posición: lo implementa la fase del editor. */
export const QuotationEditorView: React.FC = () => {
  const closeQuotation = useSimulationStore((s) => s.closeQuotation);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-slate-500 dark:text-zinc-400">
      <span role="status">Editor de cotización en construcción.</span>
      <button type="button" onClick={closeQuotation} className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-800 dark:border-zinc-600 dark:text-zinc-100">
        Volver a cotizaciones
      </button>
    </div>
  );
};
