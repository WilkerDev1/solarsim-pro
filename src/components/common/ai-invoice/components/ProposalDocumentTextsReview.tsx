import { Trash2 } from 'lucide-react';
import type { ExtractedInvoiceData } from '../../../../types/aiInvoice';

/** Cambios a textos del PDF propuestos por la IA: se revisan (y se pueden quitar) antes de aplicar el borrador. */
export function ProposalDocumentTextsReview({ draft, update }: { draft: ExtractedInvoiceData; update: (patch: Partial<ExtractedInvoiceData>) => void }) {
  const texts = draft.documentTexts || [];
  if (!texts.length) return null;
  return <section className="proposal-document-texts" aria-label="Textos del documento">
    <h3>Textos del documento<span>Se escriben en el PDF al aplicar el borrador; se deshacen junto con él.</span></h3>
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{texts.map((t) => <li key={t.key} className="proposal-equipment-row">
      <p><strong>{t.label}</strong><br />{t.text === null ? <em>Volver al texto predeterminado</em> : t.text}</p>
      <span />
      <button type="button" className="proposal-icon-button" aria-label={`Quitar el cambio de ${t.label}`}
        onClick={() => update({ documentTexts: texts.filter((other) => other.key !== t.key) })}><Trash2 size={17} /></button>
    </li>)}</ul>
  </section>;
}
