import { AlertTriangle, FileText, RotateCcw, Trash2 } from 'lucide-react';
import type { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import { getDocumentTextDefinition } from '../../../../../shared/documentTexts/registry';
import { RichText } from '../../../pdf/editor/RichText';
import { reviewAnchor, worstTier, type ReviewIssueView } from '../reviewIssues';
import { IssueNotes } from './ReviewFlags';

/** Cambios a textos del PDF propuestos por la IA: se revisan (y se pueden quitar) antes de aplicar el borrador. */
export function ProposalDocumentTextsReview({ draft, update, issues = [] }: { draft: ExtractedInvoiceData; update: (patch: Partial<ExtractedInvoiceData>) => void; issues?: readonly ReviewIssueView[] }) {
  const texts = draft.documentTexts || [];
  // Sin textos pero con avisos (p. ej. una clave desconocida) la sección existe: es el destino del enlace del resumen.
  if (!texts.length && !issues.length) return null;
  // La lectura parcial se marca en su propia ficha; el resto de avisos del bloque va arriba.
  const blockIssues = issues.filter((issue) => issue.code !== 'document_text_seen_partially');
  const partial = texts.filter((t) => t.partial).length;
  return <section className="proposal-document-texts" id={reviewAnchor.documentTexts} tabIndex={-1} aria-label="Textos del documento"
    data-flag={worstTier(issues) ?? (partial ? 'confirm' : undefined)}>
    <header className="proposal-document-texts-heading">
      <h3><FileText size={17} aria-hidden />Textos del documento{texts.length > 0 && <span className="proposal-group-count">{texts.length === 1 ? '1 cambio' : `${texts.length} cambios`}{partial ? ` · ${partial} por confirmar` : ''}</span>}</h3>
      {texts.length > 0 && <p className="proposal-note">Se escriben en el PDF al aplicar el borrador; se deshacen junto con él.</p>}
    </header>
    <IssueNotes issues={blockIssues} />
    <ul className="proposal-document-text-list">{texts.map((t) => {
      const noteId = t.partial ? `proposal-doctext-${t.key}-note` : undefined;
      const format = getDocumentTextDefinition(t.key)?.format === 'rich' ? 'rich' : 'plain';
      return <li key={t.key} className="proposal-document-text" data-flag={t.partial ? 'confirm' : undefined}>
        <div className="proposal-document-text-head">
          <strong>{t.label}</strong>
          <button type="button" className="proposal-ghost proposal-danger" aria-label={`Quitar el cambio de ${t.label}`} aria-describedby={noteId}
            onClick={() => update({ documentTexts: texts.filter((other) => other.key !== t.key) })}><Trash2 size={15} aria-hidden />Quitar</button>
        </div>
        <div className="proposal-document-text-body">{t.text === null
          ? <span className="proposal-document-text-reset"><RotateCcw size={14} aria-hidden />Volver al texto predeterminado</span>
          : <RichText text={t.text} format={format} />}</div>
        {t.partial && <p className="proposal-row-alert" data-tier="confirm" id={noteId}><span><AlertTriangle size={14} aria-hidden /> <strong>Confirmar:</strong> La IA solo vio el inicio de este texto; revísalo completo.</span></p>}
      </li>;
    })}</ul>
  </section>;
}
