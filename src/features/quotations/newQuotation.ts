import { applyTemplateToNewContent, emptyQuotationContent } from '../../../shared/quotations';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { QuotationContent } from '../../types/quotation';
import { localIsoDate } from '../../utils/localDate';
import { LOGO_REJECTED, issuerFromCompany, newDocumentCompany } from './issuer';
import { newQuotationTemplate } from './library';

/**
 * Crea un borrador y lo abre en el editor. Único punto de entrada de «Nueva cotización» (catálogo, cliente,
 * propuesta): quien complete los datos iniciales del borrador lo hace aquí.
 *
 * El emisor sale del membrete que usarían las propuestas nuevas (`issuerFromCompany`), salvo que `overrides.issuer`
 * diga otro, con cada texto recortado a su límite. Si el logo no es una imagen que la cotización admita, el borrador
 * nace sin logo: un membrete nunca impide crear la cotización.
 *
 * La plantilla predeterminada del espacio de trabajo pone el diseño, las notas, las condiciones de pago y la vigencia
 * (`applyTemplateToNewContent`), salvo que quien llama traiga su propio `design`; los textos que ya traiga ganan.
 */
export function createAndOpenQuotation(overrides: Partial<QuotationContent> = {}): { ok: true; id: string } | { ok: false; error: string } {
  const store = useSimulationStore.getState();
  const issuer = overrides.issuer ?? issuerFromCompany(newDocumentCompany(store));
  const template = overrides.design ? undefined : newQuotationTemplate(store.quotationLibrary.templates.items);
  let initial: Partial<QuotationContent> = { ...overrides, issuer };
  if (template) {
    const applied = applyTemplateToNewContent(emptyQuotationContent(overrides.issueDate ?? localIsoDate(), initial), template);
    initial = { ...initial, design: applied.design, notes: applied.notes, paymentTerms: applied.paymentTerms, validUntil: applied.validUntil };
  }
  let result = store.createQuotationRecord(initial);
  if (!result.ok && !overrides.issuer && issuer.logo && result.error.startsWith(LOGO_REJECTED)) {
    result = store.createQuotationRecord({ ...initial, issuer: { ...issuer, logo: '' } });
  }
  if (!result.ok) return { ok: false, error: result.error };
  store.openQuotation(result.quotation.id);
  return { ok: true, id: result.quotation.id };
}
