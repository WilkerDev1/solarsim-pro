import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlignLeft, ArrowDown, ArrowUp, Building2, Copy, Package, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { confirmAction } from '../../common/confirmAction';
import {
  QUOTATION_LIMITS, QUOTATION_SHEET_TEXTS, computeQuotationTotals, formatAmount, formatExchangeRate, formatMoney, formatQuantity, toCents,
  type QuotationCurrency,
} from '../../../../shared/quotations';
import type { QuotationContent, QuotationLine } from '../../../types/quotation';
import type { ClientRecord } from '../../../types/client';
import type { SolarEquipmentItem } from '../../../types/equipment';
import {
  addDetailLine, addDiscount, addItemLine, appendLine, changeCurrency, currencyChangeSummary, duplicateLine, moveLine, removeDiscount,
  removeLine, setDocumentFields, setExchangeRate, setPrintedClient, updateDiscount, updateLine,
} from '../../../domain/quotationEdit';
import { catalogQuotationLine, type CatalogLineContext } from '../../../features/quotations/catalogLine';
import { ClientPicker } from '../../clients/ClientPicker';
import { CURRENCY_NAMES, CurrencyFlag } from '../common/CurrencyFlag';
import { NumberField, TextField } from './fields';
import { CatalogPicker } from './CatalogPicker';

/** Aplica una edición pura sobre el contenido guardado más reciente; devuelve el error del store o `null`. */
export type Edit = (update: (content: QuotationContent) => QuotationContent) => string | null;

interface SectionProps {
  content: QuotationContent;
  readOnly: boolean;
  edit: Edit;
}

const newLineId = () => `line-${crypto.randomUUID()}`;
const newDiscountId = () => `discount-${crypto.randomUUID()}`;
const money = (cents: number) => formatAmount(cents);

const Card: React.FC<{ title: string; titleId: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, titleId, actions, children }) => (
  <section className="qe-card" aria-labelledby={titleId}>
    <div className="qe-card-head">
      <h2 id={titleId}>{title}</h2>
      {actions}
    </div>
    {children}
  </section>
);

export const DocumentSection: React.FC<SectionProps & { number: string | null }> = ({ content, readOnly, edit, number }) => {
  const currencies: QuotationCurrency[] = ['DOP', 'USD'];
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const currencyButtons = useRef<(HTMLButtonElement | null)[]>([]);
  // Cambiar de moneda es una acción explícita: con importes que convertir, se confirma primero.
  const pickCurrency = async (currency: QuotationCurrency) => {
    if (readOnly || currency === content.currency) return;
    const summary = currencyChangeSummary(content, currency);
    if (summary.needsConfirmation && !(await confirmAction({ title: `Cambiar la moneda a ${currency === 'DOP' ? 'RD$' : 'US$'}`, message: summary.message, confirmLabel: 'Convertir importes' }))) return;
    setCurrencyError(edit((c) => changeCurrency(c, currency)));
  };
  return (
    <Card title="Datos del documento" titleId="qe-document-title">
      <div className="qe-grid-2">
        <div className="qe-field">
          <label htmlFor="qe-number">Número</label>
          <input id="qe-number" value={number ?? 'Sin número'} readOnly aria-describedby="qe-number-hint" className="qe-locked" />
          <p id="qe-number-hint" className="qe-field-hint">{number ? 'Asignado al crear; no cambia.' : 'Se asigna al publicar la cotización.'}</p>
        </div>
        <TextField label="Vendedor" value={content.seller} readOnly={readOnly} maxLength={QUOTATION_LIMITS.label} onCommit={(seller) => edit((c) => setDocumentFields(c, { seller }))} />
        <TextField label="Fecha de emisión" type="date" value={content.issueDate} readOnly={readOnly} onCommit={(issueDate) => edit((c) => setDocumentFields(c, { issueDate }))} />
        <TextField label="Válida hasta" type="date" value={content.validUntil ?? ''} readOnly={readOnly} hint="Opcional." onCommit={(value) => edit((c) => setDocumentFields(c, { validUntil: value.trim() || null }))} />
      </div>
      <div className="qe-grid-currency">
        <div className="qe-field">
          <span className="qe-label" id="qe-currency-label">Moneda</span>
          <div
            className="qe-segmented"
            role="group"
            aria-labelledby="qe-currency-label"
            aria-describedby={currencyError ? 'qe-currency-error' : !readOnly ? 'qe-currency-hint' : undefined}
            onKeyDown={(event) => {
              // Las flechas solo mueven el foco; cambiar de moneda exige pulsar el botón.
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const index = currencyButtons.current.findIndex((button) => button === document.activeElement);
              currencyButtons.current[(index + 1) % currencies.length]?.focus();
            }}
          >
            {currencies.map((currency, index) => (
              <button
                key={currency}
                ref={(button) => { currencyButtons.current[index] = button; }}
                type="button"
                aria-pressed={content.currency === currency}
                disabled={readOnly && content.currency !== currency}
                onClick={() => void pickCurrency(currency)}
              >
                <CurrencyFlag currency={currency} width={20} />
                <span>{CURRENCY_NAMES[currency]}</span>
              </button>
            ))}
          </div>
          {currencyError
            ? <p id="qe-currency-error" className="qe-field-error" role="alert">{currencyError}</p>
            : !readOnly && <p id="qe-currency-hint" className="qe-field-hint">Cambiar de moneda convierte los precios con la tasa del documento; se pide confirmación.</p>}
        </div>
        <NumberField
          label="Tasa del dólar"
          value={content.exchangeRate}
          readOnly={readOnly}
          format={formatExchangeRate}
          hint="RD$ por US$ 1."
          onCommit={(rate) => edit((c) => setExchangeRate(c, rate))}
        />
      </div>
      <TextField label="Proyecto" value={content.projectLabel} readOnly={readOnly} maxLength={QUOTATION_LIMITS.label} placeholder="Por ejemplo, alimentación de planta eléctrica" onCommit={(projectLabel) => edit((c) => setDocumentFields(c, { projectLabel }))} />
    </Card>
  );
};

/** Emisor impreso: solo lectura, con «Actualizar desde el membrete» (borrador y permiso de escritura, con confirmación). */
export const IssuerSection: React.FC<{ content: QuotationContent; readOnly: boolean; refresh: () => string | null }> = ({ content, readOnly, refresh }) => {
  const [error, setError] = useState<string | null>(null);
  const { issuer } = content;
  const update = async () => {
    const accepted = await confirmAction({
      title: 'Actualizar el emisor',
      message: 'Se reemplazarán los datos impresos del emisor de esta cotización (nombre, RNC, contacto y logo) por los del membrete actual.',
      confirmLabel: 'Actualizar',
    });
    if (accepted) setError(refresh());
  };
  return (
    <Card
      title="Emisor"
      titleId="qe-issuer-title"
      actions={!readOnly && <button type="button" className="qe-btn qe-btn-sm" onClick={() => void update()}><RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar desde el membrete</button>}
    >
      <div className="qe-issuer">
        <Building2 className="h-4 w-4" aria-hidden="true" />
        {issuer.name.trim() ? (
          <dl>
            <div><dt>Nombre</dt><dd>{issuer.name}</dd></div>
            {issuer.taxId && <div><dt>RNC</dt><dd>{issuer.taxId}</dd></div>}
            {issuer.phone && <div><dt>Teléfono</dt><dd>{issuer.phone}</dd></div>}
          </dl>
        ) : <p className="qe-muted">Sin datos del emisor.</p>}
      </div>
      {error && <p className="qe-field-error" role="alert">{error}</p>}
    </Card>
  );
};

export const ClientSection: React.FC<SectionProps & {
  clients: readonly ClientRecord[];
  /** Elegir copia los datos del cliente a los impresos; quitar solo desenlaza (`quotationEditorActions`). */
  chooseClient: (client: ClientRecord | null) => string | null;
}> = ({ content, readOnly, edit, clients, chooseClient }) => {
  const [error, setError] = useState<string | null>(null);
  const linked = content.clientId ? clients.find((c) => c.id === content.clientId) : undefined;
  const choose = (client: ClientRecord | null) => setError(chooseClient(client));
  const printed = (key: keyof QuotationContent['client'], label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <TextField
      label={label}
      value={content.client[key]}
      readOnly={readOnly}
      maxLength={key === 'address' ? QUOTATION_LIMITS.address : key === 'taxId' ? QUOTATION_LIMITS.taxId : key === 'phone' ? QUOTATION_LIMITS.phone : QUOTATION_LIMITS.label}
      onCommit={(value) => edit((c) => setPrintedClient(c, { [key]: value }))}
      {...extra}
    />
  );
  return (
    <Card title="Cliente" titleId="qe-client-title">
      {readOnly ? (
        <p className="qe-muted">
          {content.clientId ? (linked ? <>Enlazada con <strong>{linked.name}</strong> del directorio.</> : 'Enlazada con un cliente que ya no está en el directorio.') : 'Sin cliente del directorio.'}
        </p>
      ) : (
        <>
          <ClientPicker className="qe-client-picker qe-field" clients={clients} selectedId={content.clientId ?? null} onSelect={choose} label="Cliente del directorio" collapseWhenEmpty />
          {content.clientId && !linked && <p className="qe-muted">El cliente enlazado ya no está en el directorio.</p>}
          <p className="qe-field-hint">Elegir un cliente copia sus datos al documento. Después se editan aquí y cambiar o quitar el enlace no los reescribe.</p>
        </>
      )}
      {error && <p className="qe-field-error" role="alert">{error}</p>}
      <div className="qe-grid-2">
        {printed('name', 'Nombre')}
        {printed('attention', 'Atención')}
        {printed('taxId', 'RNC o cédula')}
        {printed('phone', 'Teléfono', { type: 'tel' })}
        {printed('email', 'Correo', { type: 'email', className: 'qe-span-2' })}
        {printed('address', 'Dirección', { multiline: true, rows: 2, className: 'qe-span-2' })}
      </div>
    </Card>
  );
};

const LineRow: React.FC<{
  line: QuotationLine;
  index: number;
  count: number;
  label: string;
  netCents: number;
  readOnly: boolean;
  edit: Edit;
}> = ({ line, index, count, label, netCents, readOnly, edit }) => {
  const [actionError, setActionError] = useState<string | null>(null);
  const change = (patch: Partial<QuotationLine>) => edit((c) => updateLine(c, line.id, patch));
  const act = (update: (c: QuotationContent) => QuotationContent) => setActionError(edit(update));
  const position = index + 1;
  const detail = line.kind === 'detail';
  return (
    <li className={`qe-line${detail ? ' qe-line-detail' : ''}`} aria-label={`${detail ? 'Línea descriptiva' : 'Ítem'} ${position}`}>
      <div className="qe-line-top">
        <span className="qe-line-number" aria-hidden="true">{detail ? <AlignLeft className="h-3.5 w-3.5" /> : label}</span>
        <TextField
          label={`Descripción de la línea ${position}`}
          hideLabel
          multiline
          rows={1}
          value={line.description}
          readOnly={readOnly}
          maxLength={QUOTATION_LIMITS.lineDescription}
          placeholder={detail ? 'Texto descriptivo (sin precio)' : 'Descripción del ítem'}
          onCommit={(description) => change({ description })}
        />
      </div>
      <div className="qe-line-values">
        <NumberField className="qe-w-qty" label="Cant." value={line.quantity} readOnly={readOnly} format={formatQuantity} onCommit={(quantity) => change({ quantity })} />
        <TextField className="qe-w-unit" label="Unidad" value={line.unit} readOnly={readOnly} maxLength={QUOTATION_LIMITS.unit} onCommit={(unit) => change({ unit })} />
        {detail ? (
          <p className="qe-muted qe-detail-note">Línea descriptiva: no suma al total.</p>
        ) : (
          <>
            <NumberField className="qe-w-price" label="Precio unit." value={line.unitPriceCents} readOnly={readOnly} format={money} toValue={toCents} onCommit={(unitPriceCents) => change({ unitPriceCents })} />
            <NumberField className="qe-w-pct" label="Desc. %" value={line.discountPct} readOnly={readOnly} format={formatQuantity} onCommit={(discountPct) => change({ discountPct })} />
            <div className="qe-field qe-check">
              <label htmlFor={`qe-tax-${line.id}`}>ITBIS</label>
              <input id={`qe-tax-${line.id}`} type="checkbox" checked={line.taxable} disabled={readOnly} onChange={(e) => setActionError(change({ taxable: e.target.checked }))} />
            </div>
            <div className="qe-field qe-line-total">
              <span className="qe-label">Total</span>
              <output aria-label={`Total de la línea ${position}`}>{money(netCents)}</output>
            </div>
          </>
        )}
      </div>
      {!readOnly && (
        <div className="qe-line-actions">
          <button type="button" className="qe-icon-btn" aria-label={`Subir línea ${position}`} disabled={index === 0} onClick={() => act((c) => moveLine(c, line.id, -1))}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className="qe-icon-btn" aria-label={`Bajar línea ${position}`} disabled={index === count - 1} onClick={() => act((c) => moveLine(c, line.id, 1))}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className="qe-icon-btn" aria-label={`Duplicar línea ${position}`} onClick={() => act((c) => duplicateLine(c, line.id, newLineId))}><Copy className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className="qe-icon-btn qe-danger" aria-label={`Quitar línea ${position}`} onClick={() => act((c) => removeLine(c, line.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      )}
      {actionError && <p className="qe-field-error" role="alert">{actionError}</p>}
    </li>
  );
};

export const ItemsSection: React.FC<SectionProps & {
  catalog: readonly SolarEquipmentItem[];
  catalogContext: (item: SolarEquipmentItem) => CatalogLineContext;
}> = ({ content, readOnly, edit, catalog, catalogContext }) => {
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totals = useMemo(() => computeQuotationTotals(content), [content]);
  const netById = useMemo(() => new Map(totals.lines.map((l) => [l.id, l.netCents])), [totals]);
  let itemNumber = 0;
  const add = (update: (c: QuotationContent) => QuotationContent, message: string | null = null) => {
    const failure = edit(update);
    setError(failure);
    setNotice(failure ? null : message);
  };
  const pick = useCallback((item: SolarEquipmentItem) => {
    const result = catalogQuotationLine(item, catalogContext(item), newLineId);
    const failure = edit((c) => appendLine(c, result.line));
    setError(failure);
    if (!failure) {
      setPicking(false);
      setNotice(result.notice ? `Añadido «${result.line.description}»: ${result.notice}.` : `Añadido «${result.line.description}» con la oferta de ${result.supplierName}.`);
    }
  }, [catalogContext, edit]);
  return (
    <Card
      title="Ítems"
      titleId="qe-items-title"
      actions={!readOnly && (
        <div className="qe-actions">
          <button type="button" className="qe-btn qe-btn-sm" aria-expanded={picking} onClick={() => setPicking((open) => !open)}><Package className="h-4 w-4" aria-hidden="true" />Del catálogo de equipos</button>
          <button type="button" className="qe-btn qe-btn-sm" onClick={() => add((c) => addDetailLine(c, newLineId))}><AlignLeft className="h-4 w-4" aria-hidden="true" />Línea descriptiva</button>
          <button type="button" className="qe-btn qe-btn-sm" onClick={() => add((c) => addItemLine(c, newLineId))}><Plus className="h-4 w-4" aria-hidden="true" />Ítem libre</button>
        </div>
      )}
    >
      {picking && !readOnly && <CatalogPicker catalog={catalog} contextFor={catalogContext} onPick={pick} onClose={() => setPicking(false)} />}
      {notice && <p className="qe-notice" role="status">{notice}</p>}
      {error && <p className="qe-field-error" role="alert">{error}</p>}
      {content.items.length === 0 ? (
        <p className="qe-muted">{readOnly ? 'Sin líneas.' : 'Todavía no hay líneas. Añade un ítem libre, una línea descriptiva o un equipo del catálogo.'}</p>
      ) : (
        <ol className="qe-lines" aria-label="Líneas de la cotización">
          {content.items.map((line, index) => (
            <LineRow
              key={line.id}
              line={line}
              index={index}
              count={content.items.length}
              label={line.kind === 'item' ? String(++itemNumber).padStart(2, '0') : ''}
              netCents={netById.get(line.id) ?? 0}
              readOnly={readOnly}
              edit={edit}
            />
          ))}
        </ol>
      )}
    </Card>
  );
};

export const DiscountsSection: React.FC<SectionProps> = ({ content, readOnly, edit }) => {
  const [error, setError] = useState<string | null>(null);
  if (readOnly && !content.discounts.length) return null;
  return (
    <Card
      title="Descuentos globales"
      titleId="qe-discounts-title"
      actions={!readOnly && content.discounts.length < QUOTATION_LIMITS.maxDiscounts && (
        <button type="button" className="qe-btn qe-btn-sm" onClick={() => setError(edit((c) => addDiscount(c, newDiscountId)))}><Plus className="h-4 w-4" aria-hidden="true" />Agregar descuento</button>
      )}
    >
      {error && <p className="qe-field-error" role="alert">{error}</p>}
      {content.discounts.length === 0 ? (
        <p className="qe-muted">Sin descuentos. Un porcentaje se calcula sobre el subtotal; un monto fijo se resta tal cual.</p>
      ) : (
        <ul className="qe-discounts">
          {content.discounts.map((discount, index) => (
            <li key={discount.id} className="qe-discount">
              <TextField label={`Concepto del descuento ${index + 1}`} value={discount.label} readOnly={readOnly} placeholder="Descuento" maxLength={QUOTATION_LIMITS.label} onCommit={(label) => edit((c) => updateDiscount(c, discount.id, { label }))} />
              <div className="qe-field">
                <label htmlFor={`qe-discount-type-${discount.id}`}>Tipo</label>
                <select id={`qe-discount-type-${discount.id}`} value={discount.type} disabled={readOnly} onChange={(e) => setError(edit((c) => updateDiscount(c, discount.id, { type: e.target.value as 'fixed' | 'percentage' })))}>
                  <option value="percentage">Porcentaje</option>
                  <option value="fixed">Monto fijo</option>
                </select>
              </div>
              {discount.type === 'percentage' ? (
                <NumberField label="Valor (%)" value={discount.value} readOnly={readOnly} format={formatQuantity} onCommit={(value) => edit((c) => updateDiscount(c, discount.id, { value }))} />
              ) : (
                <NumberField label={`Valor (${content.currency === 'DOP' ? 'RD$' : 'US$'})`} value={discount.value} readOnly={readOnly} format={money} toValue={toCents} onCommit={(value) => edit((c) => updateDiscount(c, discount.id, { value }))} />
              )}
              {!readOnly && (
                <button type="button" className="qe-icon-btn qe-danger" aria-label={`Quitar descuento ${index + 1}`} onClick={() => setError(edit((c) => removeDiscount(c, discount.id)))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export const NotesSection: React.FC<SectionProps> = ({ content, readOnly, edit }) => (
  <Card title="Notas y condiciones" titleId="qe-notes-title">
    <TextField label="Condiciones de pago" multiline rows={3} value={content.paymentTerms} readOnly={readOnly} maxLength={QUOTATION_LIMITS.paymentTerms} placeholder="Por ejemplo, 70 % con la orden y 30 % al concluir." onCommit={(paymentTerms) => edit((c) => setDocumentFields(c, { paymentTerms }))} />
    <TextField label="Notas" multiline rows={4} value={content.notes} readOnly={readOnly} maxLength={QUOTATION_LIMITS.notes} onCommit={(notes) => edit((c) => setDocumentFields(c, { notes }))} />
  </Card>
);

export const SummarySection: React.FC<{ content: QuotationContent }> = ({ content }) => {
  const totals = useMemo(() => computeQuotationTotals(content), [content]);
  return (
    <section className="qe-card qe-summary" aria-labelledby="qe-summary-title">
      <h2 id="qe-summary-title">Resumen</h2>
      <dl>
        <div><dt>{QUOTATION_SHEET_TEXTS.subtotal}</dt><dd>{formatMoney(totals.subtotalCents, content.currency)}</dd></div>
        {totals.discountCents > 0 && <div><dt>{QUOTATION_SHEET_TEXTS.discount}</dt><dd>{formatMoney(-totals.discountCents, content.currency)}</dd></div>}
        <div><dt>{QUOTATION_SHEET_TEXTS.itbis}</dt><dd>{formatMoney(totals.taxCents, content.currency)}</dd></div>
        <div className="qe-summary-total"><dt>Total</dt><dd>{formatMoney(totals.totalCents, content.currency)}</dd></div>
      </dl>
    </section>
  );
};
