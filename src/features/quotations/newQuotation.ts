import { useSimulationStore } from '../../store/useSimulationStore';
import type { QuotationContent } from '../../types/quotation';

/**
 * Crea un borrador y lo abre en el editor. Único punto de entrada de «Nueva cotización» (catálogo, cliente,
 * propuesta): quien complete los datos iniciales del borrador lo hace aquí.
 */
export function createAndOpenQuotation(overrides: Partial<QuotationContent> = {}): { ok: true; id: string } | { ok: false; error: string } {
  const store = useSimulationStore.getState();
  const result = store.createQuotationRecord(overrides);
  if (!result.ok) return { ok: false, error: result.error };
  store.openQuotation(result.quotation.id);
  return { ok: true, id: result.quotation.id };
}
