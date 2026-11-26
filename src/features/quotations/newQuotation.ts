import { useSimulationStore } from '../../store/useSimulationStore';
import type { QuotationContent } from '../../types/quotation';
import { LOGO_REJECTED, issuerFromCompany, newDocumentCompany } from './issuer';

/**
 * Crea un borrador y lo abre en el editor. Único punto de entrada de «Nueva cotización» (catálogo, cliente,
 * propuesta): quien complete los datos iniciales del borrador lo hace aquí.
 *
 * El emisor sale del membrete que usarían las propuestas nuevas (`issuerFromCompany`), salvo que `overrides.issuer`
 * diga otro, con cada texto recortado a su límite. Si el logo no es una imagen que la cotización admita, el borrador
 * nace sin logo: un membrete nunca impide crear la cotización.
 */
export function createAndOpenQuotation(overrides: Partial<QuotationContent> = {}): { ok: true; id: string } | { ok: false; error: string } {
  const store = useSimulationStore.getState();
  const issuer = overrides.issuer ?? issuerFromCompany(newDocumentCompany(store));
  let result = store.createQuotationRecord({ ...overrides, issuer });
  if (!result.ok && !overrides.issuer && issuer.logo && result.error.startsWith(LOGO_REJECTED)) {
    result = store.createQuotationRecord({ ...overrides, issuer: { ...issuer, logo: '' } });
  }
  if (!result.ok) return { ok: false, error: result.error };
  store.openQuotation(result.quotation.id);
  return { ok: true, id: result.quotation.id };
}
