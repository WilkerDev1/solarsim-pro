import React, { useMemo, useState } from 'react';
import { Copy, Mail, RotateCcw } from 'lucide-react';
import type { QuotationSheetData } from '../sheet/QuotationSheet';
import {
  buildMailtoUrl, quotationEmailAttachments, quotationEmailBody, quotationEmailRecipient, quotationEmailSignature, quotationEmailSummary,
  quotationEmailText, type QuotationEmailText,
} from '../../../features/quotations/quotationEmail';
import { openExternalUrl } from '../../../utils/openExternalUrl';

type Feedback = { tone: 'ok' | 'error'; message: string } | null;

/** Copia texto plano al portapapeles; `false` si el sistema no lo permite. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const isImage = (value: string | null | undefined) => !!value && /^data:image\//.test(value);

/**
 * Vista previa del correo (docs/QUOTATION_EDITOR.md#correo): De, Para y Asunto, el cuerpo con el resumen de la
 * cotización y los archivos que lo acompañarían. Asunto, saludo y despedida se editan aquí para este envío
 * (`overrides`, estado local del editor): nunca se guardan en la cotización, así que también un LECTOR o una
 * cotización bloqueada pueden prepararlo, copiarlo y abrirlo. La app no envía ni adjunta nada.
 */
export const QuotationEmailPreview: React.FC<{
  quotation: QuotationSheetData;
  overrides: Partial<QuotationEmailText>;
  onOverridesChange: (next: Partial<QuotationEmailText>) => void;
  /** Lleva al campo «Correo» del cliente; sin él (bloqueada o LECTOR) solo se avisa. */
  onGoToClientEmail?: () => void;
}> = ({ quotation, overrides, onOverridesChange, onGoToClientEmail }) => {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const defaults = useMemo(() => quotationEmailText(quotation), [quotation]);
  const summary = useMemo(() => quotationEmailSummary(quotation), [quotation]);
  const signature = useMemo(() => quotationEmailSignature(quotation), [quotation]);
  const files = useMemo(() => quotationEmailAttachments(quotation.number, quotation.attachments), [quotation.number, quotation.attachments]);
  const text: QuotationEmailText = { ...defaults, ...overrides };
  const edited = (Object.keys(overrides) as (keyof QuotationEmailText)[]).some((key) => overrides[key] !== undefined && overrides[key] !== defaults[key]);
  const body = quotationEmailBody(text, summary, signature);
  const recipient = quotationEmailRecipient(quotation.client);
  const set = (key: keyof QuotationEmailText) => (value: string) => onOverridesChange({ ...overrides, [key]: value });
  const seller = quotation.seller.trim();
  const fromName = seller || quotation.issuer.name.trim();
  const fromDetail = [seller ? quotation.issuer.name.trim() : '', quotation.issuer.email.trim()].filter(Boolean).join(' · ');
  const separate = files.some((f) => f.separate);

  const copy = async (value: string, done: string) => {
    const ok = await copyToClipboard(value);
    setFeedback(ok ? { tone: 'ok', message: done } : { tone: 'error', message: 'No se pudo usar el portapapeles: selecciona el texto y cópialo a mano.' });
  };
  const openMail = async () => {
    const mail = buildMailtoUrl({ to: recipient.valid ? recipient.address : '', subject: text.subject, body });
    // Si el cuerpo no cabe en el enlace, primero se copia entero para pegarlo en el mensaje.
    const copied = mail.truncated ? await copyToClipboard(body) : false;
    const opened = await openExternalUrl(mail.url).catch(() => false);
    if (!opened) setFeedback({ tone: 'error', message: 'No se pudo abrir la aplicación de correo. Copia el mensaje y pégalo en un correo nuevo.' });
    else if (mail.truncated) {
      setFeedback({
        tone: 'ok',
        message: copied
          ? 'El mensaje era largo para el enlace: se abrió recortado y el texto completo quedó copiado; pégalo en el correo.'
          : 'El mensaje era largo para el enlace: se abrió recortado. Usa «Copiar mensaje» y pégalo en el correo.',
      });
    } else setFeedback(null);
  };

  return (
    <div className="qe-mail-view">
      <article className="qe-mail" aria-label="Vista previa del correo">
        <div className="qe-mail-head">
          <div className="qe-mail-row">
            <span className="qe-mail-label">De</span>
            <span className="qe-mail-value">
              {fromName ? <strong>{fromName}</strong> : <span className="qe-muted">Sin vendedor ni emisor</span>}
              {fromDetail && <span className="qe-muted">{fromDetail}</span>}
            </span>
          </div>
          <div className="qe-mail-row">
            <span className="qe-mail-label">Para</span>
            <span className="qe-mail-value">
              {recipient.valid ? (
                <span className="qe-mail-chip">{quotation.client.name.trim() && <span className="qe-muted">{quotation.client.name.trim()}</span>}{recipient.address}</span>
              ) : recipient.address ? (
                <>
                  <span className="qe-mail-chip qe-mail-chip-missing">{recipient.address}</span>
                  <span className="qe-mail-note">no es válido: el correo se abrirá sin destinatario.</span>
                  {onGoToClientEmail && <button type="button" className="qe-link" onClick={onGoToClientEmail}>Corregir</button>}
                </>
              ) : onGoToClientEmail ? (
                <button type="button" className="qe-mail-chip qe-mail-chip-missing qe-mail-chip-button" onClick={onGoToClientEmail}>Agregar correo del cliente</button>
              ) : (
                <span className="qe-mail-chip qe-mail-chip-missing">Sin correo del cliente</span>
              )}
            </span>
          </div>
          <div className="qe-mail-row qe-mail-row-subject">
            <label className="qe-mail-label" htmlFor="qe-mail-subject">Asunto</label>
            <input id="qe-mail-subject" className="qe-mail-subject" aria-label="Asunto del correo" value={text.subject} maxLength={250} onChange={(e) => set('subject')(e.target.value)} />
            <button type="button" className="qe-icon-btn" aria-label="Copiar asunto" title="Copiar asunto" onClick={() => void copy(text.subject.replace(/\s+/g, ' ').trim(), 'Asunto copiado.')}>
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="qe-mail-body">
          {isImage(quotation.issuer.logo) ? (
            <img className="qe-mail-logo" src={quotation.issuer.logo} alt={quotation.issuer.name.trim() || 'Logo del emisor'} />
          ) : quotation.issuer.name.trim() ? <strong className="qe-mail-issuer">{quotation.issuer.name.trim()}</strong> : null}
          <textarea className="qe-mail-text" aria-label="Saludo e introducción" value={text.opening} rows={Math.max(3, text.opening.split('\n').length + 1)} onChange={(e) => set('opening')(e.target.value)} />
          <div className="qe-mail-card">
            <div className="qe-mail-card-head" style={{ background: quotation.design.accent }}>
              <span className="qe-mail-card-ref">{summary.reference}</span>
              <span className="qe-mail-card-total">{summary.total}</span>
            </div>
            {summary.rows.length > 0 && (
              <dl className="qe-mail-card-rows">
                {summary.rows.map((row) => (
                  <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                ))}
              </dl>
            )}
          </div>
          <div className="qe-mail-closing">
            <textarea className="qe-mail-text" aria-label="Despedida" value={text.closing} rows={Math.max(1, text.closing.split('\n').length)} onChange={(e) => set('closing')(e.target.value)} />
            {signature.length > 0 && (
              <p className="qe-mail-signature">
                {seller ? <strong>{signature[0]}</strong> : <span className="qe-muted">{signature[0]}</span>}
                {signature[1] && <span className="qe-muted">{signature[1]}</span>}
              </p>
            )}
          </div>
        </div>
        <ul className="qe-mail-files" aria-label="Archivos que acompañan el mensaje">
          {files.map((file) => (
            <li key={`${file.separate ? 'r' : 'q'}-${file.name}`} className="qe-mail-file" title={file.note}>
              <span className="qe-mail-file-kind" aria-hidden="true">{file.kind}</span>
              <span className="qe-mail-file-name">{file.name}</span>
              {file.separate ? <span className="qe-mail-file-tag">Aparte</span> : <span className="sr-only">: {file.note}</span>}
            </li>
          ))}
        </ul>
      </article>
      <div className="qe-actions qe-mail-actions">
        <button type="button" className="qe-btn" onClick={() => void copy(body, 'Mensaje copiado.')}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar mensaje
        </button>
        <button type="button" className="qe-btn" onClick={() => void openMail()}>
          <Mail className="h-4 w-4" aria-hidden="true" />
          Abrir en la aplicación de correo
        </button>
        {edited && (
          <button type="button" className="qe-link qe-mail-reset" onClick={() => { onOverridesChange({}); setFeedback(null); }}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Restablecer texto
          </button>
        )}
      </div>
      {feedback && (
        <p className={feedback.tone === 'error' ? 'qe-field-error qe-preview-hint' : 'qe-field-hint qe-preview-hint'} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.message}</p>
      )}
      <p className="qe-field-hint qe-preview-hint">
        SolarSim no envía el correo ni adjunta archivos: abre tu aplicación de correo con este texto. Descarga el PDF y adjúntalo
        {separate ? ', junto con los archivos marcados «Aparte».' : '.'}
      </p>
    </div>
  );
};
