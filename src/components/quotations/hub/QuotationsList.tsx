import { useState, type KeyboardEvent } from 'react';
import { AlertTriangle, CloudUpload, FileText, FolderInput, Search, Trash2 } from 'lucide-react';
import { effectiveQuotationStatus, formatMoney, type QuotationCurrency } from '../../../../shared/quotations';
import type { ProjectFolder } from '../../../types/folder';
import type { QuotationRecord } from '../../../types/quotation';
import { formatQuotationDate, quotationTotalCents, quotationValidityLabel, type QuotationSyncIssue } from '../../../utils/quotationSummary';
import { CURRENCY_NAMES, CurrencyFlag } from '../common/CurrencyFlag';
import { QuotationStatusChip } from '../common/QuotationStatusChip';

const ISSUE_MARKS: Record<QuotationSyncIssue['kind'], { label: string; tone: 'muted' | 'error' }> = {
  pending: { label: 'Cambios pendientes de publicar', tone: 'muted' },
  version_conflict: { label: 'Conflicto: otro miembro la cambió', tone: 'error' },
  stale_deletion: { label: 'Conflicto: borrado obsoleto', tone: 'error' },
  server_deleted: { label: 'Conflicto: eliminada en el servidor', tone: 'error' },
  rejected: { label: 'El servidor rechazó el último cambio', tone: 'error' },
  deletion_rejected: { label: 'El servidor rechazó eliminarla', tone: 'error' },
};

const rowName = (quotation: QuotationRecord) => quotation.number ?? `cotización sin número${quotation.client.name ? ` de ${quotation.client.name}` : ''}`;

interface QuotationsListProps {
  quotations: readonly QuotationRecord[];
  /** Cotizaciones en el espacio de trabajo, para distinguir «sin cotizaciones» de «sin resultados». */
  totalCount: number;
  today: string;
  readOnly: boolean;
  selectedId: string | null;
  checked: ReadonlySet<string>;
  folders: readonly ProjectFolder[];
  query: string;
  currency: 'all' | QuotationCurrency;
  bulkMessage: string | null;
  issueFor: (id: string) => QuotationSyncIssue | null;
  onQuery: (query: string) => void;
  onCurrency: (currency: 'all' | QuotationCurrency) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onBulkMove: (folderId: string | null) => void;
  onBulkDelete: () => void;
  onCreate?: () => void;
  onClearFilters: () => void;
}

/** Lista de cotizaciones: número resaltado, cliente, fechas, total y estado al final de la fila. */
export function QuotationsList(props: QuotationsListProps) {
  const { quotations, totalCount, today, readOnly, selectedId, checked, folders, query, currency, bulkMessage, issueFor } = props;
  const [target, setTarget] = useState('');
  const allChecked = quotations.length > 0 && quotations.every((q) => checked.has(q.id));
  const someChecked = quotations.some((q) => checked.has(q.id));

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, quotation: QuotationRecord) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onOpen(quotation.id);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (event.key === 'ArrowDown' ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling) as HTMLTableRowElement | null;
      if (next) {
        next.focus();
        const id = next.dataset.id;
        if (id) props.onSelect(id);
      }
    }
  };

  return (
    <section className="qh-panel qh-list" aria-labelledby="qh-list-title">
      <div className="qh-list-toolbar">
        <h2 id="qh-list-title">Cotizaciones</h2>
        <div className="qh-filters">
          <label className="qh-search">
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Buscar cotizaciones</span>
            <input type="search" value={query} onChange={(e) => props.onQuery(e.target.value)} placeholder="Número, cliente o proyecto" />
          </label>
          <label>
            <span className="sr-only">Moneda</span>
            <select className="qh-select" value={currency} onChange={(e) => props.onCurrency(e.target.value as 'all' | QuotationCurrency)}>
              <option value="all">Todas las monedas</option>
              <option value="DOP">{CURRENCY_NAMES.DOP}</option>
              <option value="USD">{CURRENCY_NAMES.USD}</option>
            </select>
          </label>
        </div>
      </div>

      {!readOnly && checked.size > 0 && (
        <div className="qh-bulk" role="region" aria-label="Acciones en lote">
          <strong>{checked.size === 1 ? '1 seleccionada' : `${checked.size} seleccionadas`}</strong>
          <label>
            <span className="sr-only">Carpeta de destino</span>
            <select className="qh-select" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Sin carpeta</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          <button type="button" className="qh-btn" onClick={() => props.onBulkMove(target || null)}>
            <FolderInput className="h-4 w-4" aria-hidden="true" />Mover a carpeta
          </button>
          <button type="button" className="qh-btn qh-btn-danger" onClick={props.onBulkDelete}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />Eliminar
          </button>
        </div>
      )}
      {bulkMessage && <p className="qh-notice qh-notice-error" role="alert" style={{ margin: '0 18px 12px' }}>{bulkMessage}</p>}

      {quotations.length === 0 ? (
        <div className="qh-empty">
          <FileText className="h-8 w-8" aria-hidden="true" style={{ color: 'var(--qh-muted)' }} />
          {totalCount === 0 ? (
            <>
              <h3>Todavía no hay cotizaciones</h3>
              <p>Una cotización es un documento comercial simple: líneas, descuentos, ITBIS y total, independiente de las propuestas.{readOnly ? '' : ' Crea la primera para empezar.'}</p>
              {props.onCreate && <button type="button" className="qh-btn qh-btn-primary qh-btn-lg" onClick={props.onCreate}>Nueva cotización</button>}
            </>
          ) : (
            <>
              <h3>Ninguna cotización coincide</h3>
              <p>Prueba con otro número, cliente o proyecto, otra moneda u otra vista o carpeta.</p>
              <button type="button" className="qh-btn" onClick={props.onClearFilters}>Quitar filtros</button>
            </>
          )}
        </div>
      ) : (
        <div className="qh-table-wrap">
          <table className="qh-table">
            <caption className="sr-only">Cotizaciones ordenadas por fecha de emisión, de la más reciente a la más antigua. Enter abre el editor.</caption>
            <thead>
              <tr>
                <th scope="col">
                  {readOnly ? <span className="sr-only">Fila</span> : (
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={(e) => props.onToggleAll(e.target.checked)}
                    />
                  )}
                </th>
                <th scope="col" className="qh-col-number">Número</th>
                <th scope="col">Cliente</th>
                <th scope="col" className="qh-col-dates">Fechas</th>
                <th scope="col" className="qh-col-total">Total</th>
                <th scope="col" className="qh-col-status">Estado</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((quotation) => {
                const issue = issueFor(quotation.id);
                const mark = issue ? ISSUE_MARKS[issue.kind] : null;
                const selected = quotation.id === selectedId;
                return (
                  <tr
                    key={quotation.id}
                    data-id={quotation.id}
                    tabIndex={0}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => props.onSelect(quotation.id)}
                    onDoubleClick={() => props.onOpen(quotation.id)}
                    onKeyDown={(event) => onRowKey(event, quotation)}
                  >
                    <td onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      {!readOnly && (
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${rowName(quotation)}`}
                          checked={checked.has(quotation.id)}
                          onChange={() => props.onToggle(quotation.id)}
                        />
                      )}
                    </td>
                    <td>
                      <div className="qh-number-cell">
                        <button
                          type="button"
                          className="qh-number"
                          data-empty={quotation.number ? undefined : 'true'}
                          aria-label={`Abrir ${rowName(quotation)} en el editor`}
                          onClick={(e) => { e.stopPropagation(); props.onOpen(quotation.id); }}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          {quotation.number ?? 'Sin número'}
                        </button>
                        {mark && (
                          <span className="qh-mark" data-tone={mark.tone} title={mark.label}>
                            {mark.tone === 'error' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />}
                            <span className="sr-only">{mark.label}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="qh-cell-main">{quotation.client.name || 'Sin cliente'}</div>
                      <div className="qh-cell-sub">
                        {[quotation.projectLabel, quotation.sourceProjectId ? 'Desde propuesta' : ''].filter(Boolean).join(' · ') || 'Sin proyecto'}
                      </div>
                    </td>
                    <td className="qh-cell-dates">
                      <div>{formatQuotationDate(quotation.issueDate)}</div>
                      <div className="qh-cell-sub">{quotationValidityLabel(quotation, today)}</div>
                    </td>
                    <td>
                      <div className="qh-cell-total">
                        <CurrencyFlag currency={quotation.currency} width={18} />
                        {formatMoney(quotationTotalCents(quotation), quotation.currency)}
                      </div>
                    </td>
                    <td><QuotationStatusChip status={effectiveQuotationStatus(quotation, today)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="qh-list-footer" aria-live="polite">
        <span>{quotations.length === 1 ? '1 cotización' : `${quotations.length} cotizaciones`}</span>
        {!readOnly && checked.size > 0 && <span>{checked.size === 1 ? '1 seleccionada' : `${checked.size} seleccionadas`}</span>}
      </div>
    </section>
  );
}
