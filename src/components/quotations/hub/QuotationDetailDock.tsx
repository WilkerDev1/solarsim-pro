import { useState } from 'react';
import { Copy, Eye, FileText, PencilLine, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { ITBIS_RATE } from '../../../../shared/financialRules';
import { computeQuotationTotals, effectiveQuotationStatus, formatAmount, formatMoney } from '../../../../shared/quotations';
import { useSimulationStore } from '../../../store/useSimulationStore';
import type { QuotationRecord, QuotationStatus } from '../../../types/quotation';
import { formatQuotationDate, quotationStatusActions, quotationSyncIssue, quotationTotalDopCents, type QuotationSyncIssue } from '../../../utils/quotationSummary';
import { confirmAction } from '../../common/confirmAction';
import { QuotationStatusChip } from '../common/QuotationStatusChip';

const withPeriod = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
const quantityText = (quantity: number, unit: string) => `${Number(quantity.toFixed(3)).toLocaleString('en-US', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`;
const quotationName = (quotation: QuotationRecord) => quotation.number ?? 'la cotización sin número';

/** Una frase por tipo de conflicto o rechazo; las dos resoluciones dicen qué hacen en cada caso. */
function issueMessage(issue: QuotationSyncIssue): string | null {
  const version = issue.serverVersion ? ` (versión ${issue.serverVersion})` : '';
  switch (issue.kind) {
    case 'version_conflict':
      return `Otro miembro cambió esta cotización${version} mientras tenías cambios sin publicar. «Usar la del servidor» descarta tus cambios; «Conservar la mía» publica los tuyos sobre esa versión.`;
    case 'server_deleted':
      return 'Otro miembro eliminó esta cotización mientras tenías cambios sin publicar. «Usar la del servidor» descarta tu copia; «Conservar la mía» la guarda como un borrador nuevo, sin número.';
    case 'stale_deletion':
      return `La eliminaste, pero otro miembro la cambió antes${version}. «Usar la del servidor» la conserva; «Conservar la mía» vuelve a eliminarla.`;
    case 'rejected':
      return `El servidor rechazó el último cambio: ${withPeriod(issue.error ?? 'sin motivo')} «Usar la del servidor» descarta tus cambios locales; «Conservar la mía» lo reintenta.`;
    case 'deletion_rejected':
      return `El servidor rechazó eliminarla: ${withPeriod(issue.error ?? 'sin motivo')} «Usar la del servidor» la conserva; «Conservar la mía» reintenta eliminarla.`;
    default:
      return null;
  }
}

interface QuotationDetailDockProps {
  quotation: QuotationRecord;
  today: string;
  readOnly: boolean;
  /** Tras duplicar, el catálogo selecciona la copia. */
  onDuplicated?: (id: string) => void;
}

/** Vista previa de la cotización seleccionada con sus acciones. Mirarla nunca escribe en el store. */
export function QuotationDetailDock({ quotation, today, readOnly, onDuplicated }: QuotationDetailDockProps) {
  const {
    changes, deletionQueue, syncSettings, folders, openQuotation, duplicateQuotationRecord, setQuotationStatus, deleteQuotationRecord, resolveQuotationConflict,
  } = useSimulationStore(useShallow((s) => ({
    changes: s.quotationChanges, deletionQueue: s.quotationDeletionQueue, syncSettings: s.syncSettings, folders: s.folders,
    openQuotation: s.openQuotation, duplicateQuotationRecord: s.duplicateQuotationRecord, setQuotationStatus: s.setQuotationStatus,
    deleteQuotationRecord: s.deleteQuotationRecord, resolveQuotationConflict: s.resolveQuotationConflict,
  })));
  // El error se muestra junto a la acción que lo produjo: arriba (Duplicar) o en el pie (estado y Eliminar).
  const [error, setError] = useState<{ text: string; near: 'head' | 'footer' } | null>(null);
  const totals = computeQuotationTotals(quotation);
  const status = effectiveQuotationStatus(quotation, today);
  const signedIn = !!syncSettings.currentUser;
  const issue = quotationSyncIssue(quotation.id, { changes, deletionQueue, userId: syncSettings.currentUser?.id, signedIn });
  const message = issue ? issueMessage(issue) : null;
  const folder = quotation.folderId ? folders.find((f) => f.id === quotation.folderId) : undefined;
  const transitions = readOnly ? [] : quotationStatusActions(quotation.status);
  const itbisPct = Math.round(ITBIS_RATE * 100);

  const changeStatus = async (to: QuotationStatus, label: string) => {
    setError(null);
    if (to === 'void' && !(await confirmAction({
      title: 'Anular cotización',
      message: `¿Anular ${quotationName(quotation)}? Una cotización anulada ya no puede cambiar de estado.`,
      confirmLabel: 'Anular',
      tone: 'danger',
    }))) return;
    const result = setQuotationStatus(quotation.id, to);
    if (!result.ok) setError({ text: `${label}: ${result.error}`, near: 'footer' });
  };
  const duplicate = () => {
    setError(null);
    const result = duplicateQuotationRecord(quotation.id);
    if (result.ok) onDuplicated?.(result.quotation.id);
    else setError({ text: `Duplicar: ${result.error}`, near: 'head' });
  };
  const remove = async () => {
    setError(null);
    if (!(await confirmAction({
      title: 'Eliminar cotización',
      message: `¿Eliminar ${quotationName(quotation)}? Se elimina también en el servidor al sincronizar; el número no se reutiliza.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    }))) return;
    const result = deleteQuotationRecord(quotation.id);
    if (!result.ok) setError({ text: `Eliminar: ${result.error}`, near: 'footer' });
  };

  const issuerLines = [quotation.issuer.address, quotation.issuer.phone, quotation.issuer.email, quotation.issuer.taxId && `RNC ${quotation.issuer.taxId}`].filter(Boolean);
  const clientLines = [
    quotation.client.attention && `Atención: ${quotation.client.attention}`,
    quotation.client.taxId && `RNC/Cédula ${quotation.client.taxId}`,
    quotation.client.phone, quotation.client.email, quotation.client.address,
  ].filter(Boolean);

  return (
    <aside className="qh-panel qh-dock" aria-label="Detalle de la cotización seleccionada">
      <div className="qh-dock-head">
        <h2>Detalle</h2>
        <div className="qh-dock-actions">
          <button type="button" className="qh-btn" onClick={() => openQuotation(quotation.id)}>
            {readOnly ? <Eye className="h-4 w-4" aria-hidden="true" /> : <PencilLine className="h-4 w-4" aria-hidden="true" />}
            {readOnly ? 'Ver' : 'Editar'}
          </button>
          {!readOnly && (
            <button type="button" className="qh-btn" onClick={duplicate}>
              <Copy className="h-4 w-4" aria-hidden="true" />Duplicar
            </button>
          )}
        </div>
      </div>

      <div className="qh-dock-body">
        {error?.near === 'head' && <p className="qh-notice qh-notice-error" role="alert">{error.text}</p>}
        {message && issue && (
          <div className="qh-notice qh-notice-error" role="alert">
            {message}
            {issue.own ? (
              <div className="qh-notice-actions">
                <button type="button" className="qh-btn" onClick={() => resolveQuotationConflict(quotation.id, 'accept_server')}>Usar la del servidor</button>
                {!readOnly && <button type="button" className="qh-btn" onClick={() => resolveQuotationConflict(quotation.id, 'keep_local')}>Conservar la mía</button>}
              </div>
            ) : (
              <p className="qh-muted" style={{ marginTop: 8, color: 'inherit' }}>Este cambio es de otra cuenta de este equipo; solo esa cuenta puede resolverlo.</p>
            )}
          </div>
        )}
        {issue?.kind === 'pending' && <p className="qh-muted">Cambios pendientes de publicar en el servidor.</p>}

        <article className="qh-preview" aria-label={`Vista previa de ${quotation.number ?? 'la cotización sin número'}`}>
          <div className="qh-preview-top">
            <div>
              <h3 className="qh-preview-title">Cotización <span>{quotation.number ? `#${quotation.number}` : 'sin número'}</span></h3>
              <QuotationStatusChip status={status} />
            </div>
            <dl className="qh-preview-dates">
              <dt>Emitida</dt><dd>{formatQuotationDate(quotation.issueDate)}</dd>
              <dt>Válida hasta</dt><dd>{quotation.validUntil ? formatQuotationDate(quotation.validUntil) : 'Sin vigencia'}</dd>
              {folder && <><dt>Carpeta</dt><dd>{folder.name}</dd></>}
            </dl>
          </div>

          <div className="qh-parties">
            <div className="qh-party">
              <span className="qh-party-label">De</span>
              <span className="qh-party-name">{quotation.issuer.name || 'Sin emisor'}</span>
              {issuerLines.length > 0 && <span className="qh-party-lines">{issuerLines.map((text, i) => <span key={i} style={{ display: 'block' }}>{text}</span>)}</span>}
            </div>
            <div className="qh-party">
              <span className="qh-party-label">Para</span>
              <span className="qh-party-name">{quotation.client.name || 'Sin cliente'}</span>
              {clientLines.length > 0 && <span className="qh-party-lines">{clientLines.map((text, i) => <span key={i} style={{ display: 'block' }}>{text}</span>)}</span>}
            </div>
          </div>

          <section aria-label="Ítems">
            <h4 className="qh-section-title">Ítems</h4>
            {quotation.items.length === 0 ? (
              <p className="qh-muted">Sin ítems todavía.</p>
            ) : (
              <div className="qh-items">
                <table>
                  <thead>
                    <tr><th scope="col">Descripción</th><th scope="col">Precio</th><th scope="col">Cant.</th><th scope="col">Total</th></tr>
                  </thead>
                  <tbody>
                    {quotation.items.map((item, index) => {
                      const line = totals.lines[index];
                      const priced = item.kind === 'item';
                      return (
                        <tr key={item.id} data-kind={item.kind}>
                          <td>{item.description || 'Sin descripción'}</td>
                          <td>{priced ? formatAmount(item.unitPriceCents) : ''}</td>
                          <td>{quantityText(item.quantity, item.unit)}</td>
                          <td>
                            {priced ? formatAmount(line?.netCents ?? 0) : ''}
                            {priced && item.discountPct > 0 && <span className="qh-line-discount">−{item.discountPct}%</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <dl className="qh-totals">
                  <div><dt>Subtotal</dt><dd>{formatAmount(totals.subtotalCents)}</dd></div>
                  {quotation.discounts.map((discount, index) => {
                    const applied = totals.discounts[index]?.appliedCents ?? 0;
                    return applied > 0 ? (
                      <div key={discount.id}>
                        <dt>{discount.label || 'Descuento'}{discount.type === 'percentage' ? ` (${discount.value}%)` : ''}</dt>
                        <dd>−{formatAmount(applied)}</dd>
                      </div>
                    ) : null;
                  })}
                  <div><dt>ITBIS {itbisPct}%</dt><dd>{formatAmount(totals.taxCents)}</dd></div>
                  <div className="qh-total-row"><dt>Total</dt><dd>{formatMoney(totals.totalCents, quotation.currency)}</dd></div>
                  {quotation.currency === 'USD' && (
                    <div className="qh-equivalent">
                      <dt>Equivale a</dt>
                      <dd>{formatMoney(quotationTotalDopCents(quotation), 'DOP')} (tasa {quotation.exchangeRate.toFixed(2)})</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </section>

          {quotation.notes && <div className="qh-text-block"><h4>Nota</h4><p>{quotation.notes}</p></div>}
          {quotation.paymentTerms && <div className="qh-text-block"><h4>Condiciones</h4><p>{quotation.paymentTerms}</p></div>}

          <div className="qh-text-block">
            <h4>Adjuntos</h4>
            {quotation.attachments.length === 0 ? (
              <p className="qh-muted">Sin adjuntos.</p>
            ) : (
              <ul className="qh-attachments">
                {quotation.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    {attachment.title || attachment.fileName}
                    <small>{attachment.mode === 'include' ? 'Se incluye' : 'Relacionado'}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </div>

      {!readOnly && (
        <div className="qh-dock-footer">
          <div className="qh-dock-actions" role="group" aria-label="Cambiar estado">
            {transitions.map((action, index) => (
              <button
                key={action.to}
                type="button"
                className={`qh-btn ${action.to === 'void' ? 'qh-btn-danger' : index === 0 ? 'qh-btn-primary' : ''}`}
                onClick={() => void changeStatus(action.to, action.label)}
              >{action.label}</button>
            ))}
            <button type="button" className="qh-btn qh-btn-danger" onClick={() => void remove()} style={{ marginLeft: 'auto' }}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />Eliminar
            </button>
          </div>
          {error?.near === 'footer' && <p className="qh-notice qh-notice-error" role="alert">{error.text}</p>}
        </div>
      )}
    </aside>
  );
}
