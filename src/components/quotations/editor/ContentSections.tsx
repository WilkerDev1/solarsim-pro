import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlignLeft, ArrowDown, ArrowUp, Building2, Check, ChevronDown, Copy, CornerDownRight, Eye, FileSymlink, MoreHorizontal, Package, Plus, RefreshCw, Trash2, Unlink } from 'lucide-react';
import { confirmAction } from '../../common/confirmAction';
import {
  QUOTATION_LIMITS, QUOTATION_SHEET_TEXTS, computeQuotationTotals, currencySymbol, formatAmount, formatExchangeRate, formatMoney, formatQuantity, toCents,
  type QuotationCurrency,
} from '../../../../shared/quotations';
import type { QuotationContent, QuotationLine } from '../../../types/quotation';
import type { ClientRecord } from '../../../types/client';
import type { SolarEquipmentItem } from '../../../types/equipment';
import {
  addDetailLine, addDiscount, addItemLine, appendLine, changeCurrency, currencyChangeSummary, duplicateLine, moveLine, removeDiscount,
  removeLine, setDocumentFields, setExchangeRate, setPrintedClient, setSourceProject, updateDiscount, updateLine,
} from '../../../domain/quotationEdit';
import { SOURCE_PROPOSAL_NOTICES, proposalName, type SourceProposalLink } from '../../../features/quotations/linkedQuotations';
import { catalogQuotationLine, type CatalogLineContext } from '../../../features/quotations/catalogLine';
import { ClientPicker } from '../../clients/ClientPicker';
import { CURRENCY_NAMES, CurrencyFlag } from '../common/CurrencyFlag';
import { InfoTip } from '../../simulator/params/ui/InfoTip';
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
const initials = (name: string) => name.trim().split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '·';

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
      <div className="qe-grid-3">
        <TextField label="Fecha de emisión" type="date" value={content.issueDate} readOnly={readOnly} onCommit={(issueDate) => edit((c) => setDocumentFields(c, { issueDate }))} />
        <TextField label="Válida hasta" type="date" value={content.validUntil ?? ''} readOnly={readOnly} info="Opcional. Pasada esta fecha, una cotización emitida se muestra como vencida." onCommit={(value) => edit((c) => setDocumentFields(c, { validUntil: value.trim() || null }))} />
        <TextField label="Vendedor" value={content.seller} readOnly={readOnly} maxLength={QUOTATION_LIMITS.label} onCommit={(seller) => edit((c) => setDocumentFields(c, { seller }))} />
      </div>
      <div className="qe-grid-currency">
        <div className="qe-field">
          <span className="qe-label-row">
            <span className="qe-label" id="qe-currency-label">Moneda</span>
            {!readOnly && <InfoTip text="Cambiar de moneda convierte los precios con la tasa del documento; se pide confirmación." label="Qué pasa al cambiar de moneda" />}
          </span>
          <div
            className="qe-segmented"
            role="group"
            aria-labelledby="qe-currency-label"
            aria-describedby={currencyError ? 'qe-currency-error' : undefined}
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
                title={CURRENCY_NAMES[currency]}
                onClick={() => void pickCurrency(currency)}
              >
                <CurrencyFlag currency={currency} width={20} />
                <span className="sr-only">{CURRENCY_NAMES[currency]}</span>
                <span aria-hidden="true"><strong>{currencySymbol(currency)}</strong> {currency === 'DOP' ? 'Peso' : 'Dólar'}</span>
              </button>
            ))}
          </div>
          {currencyError && <p id="qe-currency-error" className="qe-field-error" role="alert">{currencyError}</p>}
        </div>
        <NumberField
          label="Tasa del dólar"
          value={content.exchangeRate}
          readOnly={readOnly}
          format={formatExchangeRate}
          prefix="RD$"
          info="Pesos por cada dólar. Se usa al convertir importes y se imprime en el documento."
          onCommit={(rate) => edit((c) => setExchangeRate(c, rate))}
        />
        <TextField label="Proyecto" value={content.projectLabel} readOnly={readOnly} maxLength={QUOTATION_LIMITS.label} placeholder="Por ejemplo, sistema de 12 kWp" onCommit={(projectLabel) => edit((c) => setDocumentFields(c, { projectLabel }))} />
      </div>
      {!number && <p className="qe-muted qe-quiet-note">El número se asigna al publicar la cotización.</p>}
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

/**
 * Propuesta de origen: «Ver propuesta» navega a su resumen; en un borrador se puede enlazar a una propuesta o quitar el
 * enlace (solo el enlace, no importa contenido). Una propuesta en la papelera o que ya no está se indica con un texto
 * discreto, sin romper. La lista de propuestas del selector se carga al abrirlo o enfocarlo, no al pintar el editor.
 */
export interface SourceProposalProps {
  link: SourceProposalLink;
  /** Opciones de «Enlazar propuesta…», pedidas solo al enfocar o abrir el selector. */
  loadOptions: () => { id: string; label: string }[];
  /** «Ver propuesta»: abre el visor de solo lectura dentro del editor (no cambia la propuesta activa). */
  onOpenProposal: (projectId: string) => void;
  /** Enlaza la propuesta y trae sus documentos (`quotationEditorActions.linkProposal`); sin él, solo el enlace. */
  onLink?: (projectId: string) => { error: string | null; added: number; overflow: number };
  /** Quita el enlace conservando o quitando sus documentos (`unlinkProposal`). */
  onUnlink?: (keepDocuments: boolean) => string | null;
  /** Documentos de la propuesta enlazada en la cotización: con alguno, quitar el enlace pregunta qué hacer con ellos. */
  documentCount?: number;
}

/** Mensaje tras enlazar: cuántos documentos de la propuesta llegaron a «Adjuntos». */
export function linkedDocumentsNotice(added: number, overflow: number): string | null {
  const parts = [
    added ? `${added === 1 ? 'Se agregó 1 documento' : `Se agregaron ${added} documentos`} de la propuesta en Adjuntos, como «Solo relacionado».` : '',
    overflow ? `${overflow === 1 ? '1 documento no cupo' : `${overflow} documentos no cupieron`} (máximo ${QUOTATION_LIMITS.maxAttachments} adjuntos).` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** Pregunta al quitar el enlace con documentos de la propuesta: conservarlos, quitarlos o cancelar. */
export const UnlinkSourcePrompt: React.FC<{ count: number; onAnswer: (answer: 'keep' | 'remove' | 'cancel') => void }> = ({ count, onAnswer }) => (
  <div className="qe-unlink-prompt" role="group" aria-labelledby="qe-unlink-prompt-title">
    <p id="qe-unlink-prompt-title">
      {count === 1 ? 'La cotización tiene 1 documento de esta propuesta.' : `La cotización tiene ${count} documentos de esta propuesta.`} ¿Qué hacemos con {count === 1 ? 'él' : 'ellos'} al quitar el enlace?
    </p>
    <div className="qe-actions">
      <button type="button" className="qe-btn qe-btn-sm" onClick={() => onAnswer('keep')}>Conservar documentos</button>
      <button type="button" className="qe-btn qe-btn-sm qe-btn-danger" onClick={() => onAnswer('remove')}>Quitarlos</button>
      <button type="button" className="qe-link-btn" onClick={() => onAnswer('cancel')}>Cancelar</button>
    </div>
  </div>
);

const SourceProposalField: React.FC<SectionProps & SourceProposalProps> = ({ readOnly, edit, link, loadOptions, onOpenProposal, onLink, onUnlink, documentCount = 0 }) => {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [options, setOptions] = useState<{ id: string; label: string }[] | null>(null);
  const load = () => { if (!options) setOptions(loadOptions()); };
  const linkTo = (projectId: string) => {
    setOptions(null);
    if (!onLink) return setError(edit((c) => setSourceProject(c, projectId)));
    const result = onLink(projectId);
    setError(result.error);
    setNotice(result.error ? null : linkedDocumentsNotice(result.added, result.overflow));
  };
  const unlink = (keepDocuments: boolean) => {
    setConfirmingUnlink(false);
    setNotice(null);
    setError(onUnlink ? onUnlink(keepDocuments) : edit((c) => setSourceProject(c, null)));
  };
  return (
    <div className="qe-field qe-source" role="group" aria-labelledby="qe-source-label">
      <span className="qe-label" id="qe-source-label">Propuesta de origen</span>
      {link.state === 'none' ? (
        readOnly ? <p className="qe-muted">Sin propuesta de origen.</p> : (
          <div className="qe-source-row">
            <FileSymlink className="h-4 w-4" aria-hidden="true" />
            <label htmlFor="qe-source-select" className="sr-only">Enlazar propuesta</label>
            <select id="qe-source-select" value="" onFocus={load} onPointerDown={load} onChange={(e) => { if (e.target.value) linkTo(e.target.value); }}>
              <option value="">Enlazar propuesta…</option>
              {options?.length === 0 && <option value="" disabled>No hay propuestas para enlazar</option>}
              {options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <InfoTip label="Qué trae enlazar una propuesta" text="El enlace y sus documentos (fichas y anexos guardados), en Adjuntos como «Solo relacionado». No cambia líneas, cliente ni importes, y la propuesta no se modifica." />
          </div>
        )
      ) : (
        <div className="qe-source-row">
          <FileSymlink className="h-4 w-4" aria-hidden="true" />
          {link.state === 'available' ? (
            <>
              <span className="qe-source-name">{proposalName(link.project)}</span>
              <button type="button" className="qe-link-btn" onClick={() => onOpenProposal(link.project.id)}>Ver propuesta<Eye className="h-4 w-4" aria-hidden="true" /></button>
            </>
          ) : (
            <span className="qe-muted">{link.state === 'trashed' ? `${proposalName(link.project)}: ${SOURCE_PROPOSAL_NOTICES.trashed}` : SOURCE_PROPOSAL_NOTICES.missing}</span>
          )}
          {!readOnly && (
            <button type="button" className="qe-icon-btn" aria-expanded={documentCount > 0 ? confirmingUnlink : undefined}
              onClick={() => (documentCount > 0 ? setConfirmingUnlink((open) => !open) : unlink(true))} aria-label="Quitar el enlace con la propuesta de origen" title="Quitar enlace"><Unlink className="h-4 w-4" aria-hidden="true" /></button>
          )}
        </div>
      )}
      {confirmingUnlink && !readOnly && link.state !== 'none' && (
        <UnlinkSourcePrompt count={documentCount} onAnswer={(answer) => (answer === 'cancel' ? setConfirmingUnlink(false) : unlink(answer === 'keep'))} />
      )}
      {notice && <p className="qe-field-hint" role="status">{notice}</p>}
      {error && <p className="qe-field-error" role="alert">{error}</p>}
    </div>
  );
};

export const ClientSection: React.FC<SectionProps & {
  clients: readonly ClientRecord[];
  /** Elegir copia los datos del cliente a los impresos; quitar solo desenlaza (`quotationEditorActions`). */
  chooseClient: (client: ClientRecord | null) => string | null;
  /** Propuesta de origen; sin ella (pruebas antiguas) no se muestra. */
  source?: SourceProposalProps;
}> = ({ content, readOnly, edit, clients, chooseClient, source }) => {
  const [error, setError] = useState<string | null>(null);
  const linked = content.clientId ? clients.find((c) => c.id === content.clientId) : undefined;
  const choose = (client: ClientRecord | null) => setError(chooseClient(client));
  const named = !!content.client.name.trim();
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
    <Card title="Cliente y origen" titleId="qe-client-title">
      {named && (
        <div className="qe-client-chip">
          <span className="qe-client-avatar" aria-hidden="true">{initials(content.client.name)}</span>
          <span className="qe-client-text">
            <strong>{content.client.name}</strong>
            <small>{[content.client.phone, content.client.attention && `Atención: ${content.client.attention}`, content.client.taxId && `RNC ${content.client.taxId}`].filter(Boolean).join(' · ') || 'Sin teléfono ni contacto'}</small>
          </span>
          <span className={`qe-pill${linked ? ' qe-pill-on' : ''}`}>{linked ? 'Del directorio' : content.clientId ? 'Ya no está en el directorio' : 'Datos manuales'}</span>
        </div>
      )}
      {!readOnly && (
        <div className="qe-client-link">
          <ClientPicker className="qe-client-picker qe-field" clients={clients} selectedId={null} onSelect={choose} label={named ? 'Cambiar cliente' : 'Cliente del directorio'} collapseWhenEmpty />
          <InfoTip text="Elegir un cliente copia sus datos al documento. Después se editan aquí; cambiar o quitar el enlace no los reescribe." label="Cómo funciona el enlace con el directorio" />
          {content.clientId && <button type="button" className="qe-link-btn" onClick={() => choose(null)}><Unlink className="h-4 w-4" aria-hidden="true" />Quitar enlace</button>}
        </div>
      )}
      {readOnly && !named && <p className="qe-muted">Sin cliente.</p>}
      {error && <p className="qe-field-error" role="alert">{error}</p>}
      <details id="qe-client-printed" className="qe-details" open={!named || undefined}>
        <summary><ChevronDown className="h-4 w-4" aria-hidden="true" />Datos impresos en el documento</summary>
        <div className="qe-grid-2">
          {printed('name', 'Nombre')}
          {printed('attention', 'Atención')}
          {printed('taxId', 'RNC o cédula')}
          {printed('phone', 'Teléfono', { type: 'tel' })}
          {printed('email', 'Correo', { type: 'email' })}
          {printed('address', 'Dirección', { multiline: true, rows: 1 })}
        </div>
      </details>
      {source && <SourceProposalField content={content} readOnly={readOnly} edit={edit} {...source} />}
    </Card>
  );
};

const LineRow: React.FC<{
  line: QuotationLine;
  index: number;
  count: number;
  netCents: number;
  readOnly: boolean;
  edit: Edit;
}> = ({ line, index, count, netCents, readOnly, edit }) => {
  const [actionError, setActionError] = useState<string | null>(null);
  // Unidad, descuento y acciones viven en una segunda fila que se abre a demanda; un descuento ya puesto la deja abierta.
  const [open, setOpen] = useState(line.discountPct > 0);
  const change = (patch: Partial<QuotationLine>) => edit((c) => updateLine(c, line.id, patch));
  const act = (update: (c: QuotationContent) => QuotationContent) => setActionError(edit(update));
  const position = index + 1;
  const detail = line.kind === 'detail';
  return (
    <li className={`qe-line${detail ? ' qe-line-detail' : ''}`} aria-label={`${detail ? 'Línea descriptiva' : 'Ítem'} ${position}`}>
      <div className="qe-line-main">
        <div className="qe-line-desc-cell">
          {detail && <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
          <TextField
            className="qe-line-desc"
            label={`Descripción de la línea ${position}`}
            hideLabel
            multiline
            rows={1}
            value={line.description}
            readOnly={readOnly}
            maxLength={QUOTATION_LIMITS.lineDescription}
            placeholder={detail ? 'Texto descriptivo' : 'Descripción del ítem'}
            onCommit={(description) => change({ description })}
          />
        </div>
        <NumberField label={`Cantidad de la línea ${position}`} hideLabel value={line.quantity} readOnly={readOnly} format={formatQuantity} onCommit={(quantity) => change({ quantity })} />
        {detail ? (
          <span className="qe-line-nosum">No suma al total</span>
        ) : (
          <>
            <NumberField label={`Precio unitario de la línea ${position}`} hideLabel value={line.unitPriceCents} readOnly={readOnly} format={money} toValue={toCents} onCommit={(unitPriceCents) => change({ unitPriceCents })} />
            <div className="qe-line-tax">
              <input type="checkbox" aria-label={`ITBIS de la línea ${position}`} checked={line.taxable} disabled={readOnly} onChange={(e) => setActionError(change({ taxable: e.target.checked }))} />
            </div>
            <output className="qe-line-total" aria-label={`Total de la línea ${position}`}>{money(netCents)}</output>
          </>
        )}
        {!readOnly && (
          <button type="button" className="qe-icon-btn qe-line-more" aria-expanded={open} aria-controls={`qe-extra-${line.id}`} aria-label={`Más opciones de la línea ${position}`} title="Unidad, descuento y acciones" onClick={() => setOpen((o) => !o)}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {!readOnly && (
        <div className="qe-line-extra" id={`qe-extra-${line.id}`} hidden={!open}>
          <TextField className="qe-inline-field" label="Unidad" value={line.unit} readOnly={readOnly} maxLength={QUOTATION_LIMITS.unit} placeholder="UD" onCommit={(unit) => change({ unit })} />
          {!detail && <NumberField className="qe-inline-field" label="Descuento" suffix="%" value={line.discountPct} readOnly={readOnly} format={formatQuantity} onCommit={(discountPct) => change({ discountPct })} />}
          <div className="qe-line-actions">
            <button type="button" className="qe-icon-btn" aria-label={`Subir línea ${position}`} title="Subir" disabled={index === 0} onClick={() => act((c) => moveLine(c, line.id, -1))}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className="qe-icon-btn" aria-label={`Bajar línea ${position}`} title="Bajar" disabled={index === count - 1} onClick={() => act((c) => moveLine(c, line.id, 1))}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className="qe-icon-btn" aria-label={`Duplicar línea ${position}`} title="Duplicar" onClick={() => act((c) => duplicateLine(c, line.id, newLineId))}><Copy className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className="qe-icon-btn qe-danger" aria-label={`Quitar línea ${position}`} title="Quitar" onClick={() => act((c) => removeLine(c, line.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
          </div>
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
  const applied = new Map(totals.discounts.map((d) => [d.id, d.appliedCents]));
  return (
    <Card
      title="Ítems"
      titleId="qe-items-title"
      actions={!readOnly && (
        <div className="qe-actions">
          <button type="button" className="qe-btn qe-btn-sm" aria-expanded={picking} onClick={() => setPicking((isOpen) => !isOpen)}><Package className="h-4 w-4" aria-hidden="true" />Del catálogo de equipos</button>
          <button type="button" className="qe-btn qe-btn-sm" onClick={() => add((c) => addItemLine(c, newLineId))}><Plus className="h-4 w-4" aria-hidden="true" />Ítem libre</button>
        </div>
      )}
    >
      {picking && !readOnly && <CatalogPicker catalog={catalog} contextFor={catalogContext} onPick={pick} onClose={() => setPicking(false)} />}
      {content.items.length === 0 ? (
        <p className="qe-muted qe-empty">{readOnly ? 'Sin líneas.' : 'Todavía no hay líneas. Empieza con un ítem libre o un equipo del catálogo.'}</p>
      ) : (
        <>
          <div className={`qe-lines-head${readOnly ? ' qe-lines-locked' : ''}`} aria-hidden="true">
            <span>Descripción</span><span>Cant.</span><span>Precio</span><span>ITBIS</span><span>Total {currencySymbol(content.currency)}</span>
          </div>
          <ol className={`qe-lines${readOnly ? ' qe-lines-locked' : ''}`} aria-label="Líneas de la cotización">
            {content.items.map((line, index) => (
              <LineRow key={line.id} line={line} index={index} count={content.items.length} netCents={netById.get(line.id) ?? 0} readOnly={readOnly} edit={edit} />
            ))}
          </ol>
        </>
      )}
      {notice && <p className="qe-notice" role="status"><Check className="h-3.5 w-3.5" aria-hidden="true" />{notice}</p>}
      {error && <p className="qe-field-error" role="alert">{error}</p>}
      <div className="qe-items-foot">
        {!readOnly ? (
          <div className="qe-add-bar">
            <button type="button" className="qe-add-btn" onClick={() => add((c) => addDetailLine(c, newLineId))}><AlignLeft className="h-4 w-4" aria-hidden="true" />Línea descriptiva</button>
            {content.discounts.length < QUOTATION_LIMITS.maxDiscounts && (
              <button type="button" className="qe-add-btn" onClick={() => add((c) => addDiscount(c, newDiscountId))}><Plus className="h-4 w-4" aria-hidden="true" />Descuento global</button>
            )}
          </div>
        ) : <span />}
        <dl className="qe-totals" aria-label="Resumen">
          <div><dt>{QUOTATION_SHEET_TEXTS.subtotal}</dt><dd>{money(totals.subtotalCents)}</dd></div>
          {content.discounts.map((discount) => (
            <div key={discount.id}><dt>{discount.label.trim() || QUOTATION_SHEET_TEXTS.discount}</dt><dd>{money(-(applied.get(discount.id) ?? 0))}</dd></div>
          ))}
          <div><dt>{QUOTATION_SHEET_TEXTS.itbis}</dt><dd>{money(totals.taxCents)}</dd></div>
          <div className="qe-totals-grand"><dt>Total {currencySymbol(content.currency)}</dt><dd>{money(totals.totalCents)}</dd></div>
        </dl>
      </div>
    </Card>
  );
};

export const DiscountsSection: React.FC<SectionProps> = ({ content, readOnly, edit }) => {
  const [error, setError] = useState<string | null>(null);
  if (!content.discounts.length) return null;
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
