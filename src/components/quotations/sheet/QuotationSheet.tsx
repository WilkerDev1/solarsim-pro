import React, { useMemo } from 'react';
import {
  QUOTATION_SHEET_TEXTS as T, computeQuotationTotals, currencySymbol, formatAmount, formatQuantity, formatSheetDate, sheetCurrencyLabel,
  sheetPageLabel, type QuotationTotals,
} from '../../../../shared/quotations';
import type { QuotationContent } from '../../../types/quotation';
import { SHEET_LAYOUT, paginateQuotation, sheetFit, type SheetPage, type SheetRow, type SheetTextChunk } from '../../../features/quotations/paginate';
import { SANS, SHEET_BODY, SHEET_INK, SHEET_MUTED, SHEET_ROW_RULE, SHEET_RULE, sheetTheme, type SheetTheme } from './sheetTheme';

/**
 * Hoja A4 de la cotización (850×1202 px por página), lista para `exportProposalPdf`. Reglas html2canvas
 * (.agents/rules/html2canvas_pdf_export_rules.md): ningún recorte sobre texto, imágenes con `max-h/max-w` + `w-auto
 * h-auto`, pie de 42 px. Cada página lleva `data-quotation-page` para que la exportación las encuentre.
 */
export type QuotationSheetData = QuotationContent & { number: string | null };

export interface QuotationSheetProps {
  quotation: QuotationSheetData;
  /** Sello del membrete activo (`signatureSealBase64`); se pinta solo si `design.showStamp`. */
  stampImage?: string | null;
  /** Dibuja solo esa página (índice desde 0); la numeración «Página X de N» sigue contando todas. */
  onlyPage?: number;
}

const isImage = (value: string | null | undefined): value is string => !!value && /^data:image\//.test(value);
const COLUMNS = '34px minmax(0, 1fr) 110px 90px 120px';
const LABEL: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: SHEET_MUTED, lineHeight: 1.4 };
const WRAP: React.CSSProperties = { overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' };
const joined = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(' · ');

export const QuotationSheet: React.FC<QuotationSheetProps> = ({ quotation, stampImage, onlyPage }) => {
  const pages = useMemo(() => paginateQuotation(quotation), [quotation]);
  const totals = useMemo(() => computeQuotationTotals(quotation), [quotation]);
  const theme = sheetTheme(quotation.design);
  const stamp = quotation.design.showStamp && isImage(stampImage) ? stampImage : null;
  return (
    <>
      {pages.map((page, index) => (onlyPage !== undefined && onlyPage !== index ? null : (
        <SheetPageView key={index} index={index} count={pages.length} page={page} quotation={quotation} totals={totals} theme={theme} stamp={stamp} />
      )))}
    </>
  );
};

interface PageProps {
  index: number;
  count: number;
  page: SheetPage;
  quotation: QuotationSheetData;
  totals: QuotationTotals;
  theme: SheetTheme;
  stamp: string | null;
}

const SheetPageView: React.FC<PageProps> = ({ index, count, page, quotation, totals, theme, stamp }) => {
  const number = quotation.number || T.draftNumber;
  const netById = new Map(totals.lines.map((line) => [line.id, line.netCents]));
  return (
    <div
      data-quotation-page={index + 1}
      style={{
        width: SHEET_LAYOUT.width, height: SHEET_LAYOUT.height, minHeight: SHEET_LAYOUT.height, maxHeight: SHEET_LAYOUT.height,
        boxSizing: 'border-box', background: '#ffffff', color: SHEET_INK, fontFamily: SANS, display: 'flex', flexDirection: 'column', position: 'relative',
      }}
    >
      {index === 0 ? <FirstHeader quotation={quotation} theme={theme} number={number} /> : <ContinuationHeader quotation={quotation} number={number} />}
      {page.rows.length > 0 && <LinesTable rows={page.rows} quotation={quotation} theme={theme} netById={netById} first={index === 0} />}
      {page.texts.map((chunk, i) => <TextBlock key={i} chunk={chunk} />)}
      {page.closing && <Summary quotation={quotation} totals={totals} theme={theme} termsBeside={page.termsBeside} />}
      <div style={{ flex: '1 1 auto' }} />
      {page.closing && <Signatures seller={quotation.seller} stamp={stamp} />}
      <Footer quotation={quotation} label={`${number} · ${sheetPageLabel(index + 1, count)}`} />
    </div>
  );
};

const Logo: React.FC<{ quotation: QuotationSheetData; theme: SheetTheme }> = ({ quotation, theme }) => {
  const { issuer } = quotation;
  if (!isImage(issuer.logo)) {
    return issuer.name.trim()
      ? <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: theme.titleColor, maxWidth: 380, ...WRAP }}>{sheetFit.headerName(issuer.name)}</div>
      : <div />;
  }
  const image = <img alt={`Logo de ${issuer.name || 'la empresa'}`} src={issuer.logo} className="block h-auto max-h-[62px] w-auto max-w-[300px]" />;
  // Sobre la banda de color, el logo va en un recuadro blanco para conservar su contraste.
  return theme.banda ? <div style={{ background: '#ffffff', borderRadius: 8, padding: '8px 12px' }}>{image}</div> : image;
};

const FirstHeader: React.FC<{ quotation: QuotationSheetData; theme: SheetTheme; number: string }> = ({ quotation, theme, number }) => (
  <>
    {theme.topBar > 0 && <div style={{ height: theme.topBar, background: theme.accent, flexShrink: 0 }} />}
    <div style={{ padding: theme.headPadding, background: theme.headBackground, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
      <Logo quotation={quotation} theme={theme} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <div style={{ fontFamily: theme.titleFont, fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, color: theme.titleColor }}>{T.title}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.numberColor, letterSpacing: '0.02em', lineHeight: 1.3, whiteSpace: 'nowrap' }}>{number}</div>
      </div>
    </div>
    <div style={{ margin: theme.metaMargin, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, borderTop: `1px solid ${theme.metaTopBorder}`, borderBottom: `1px solid ${SHEET_RULE}` }}>
      {[
        [T.issueDate, formatSheetDate(quotation.issueDate)],
        [T.validUntil, formatSheetDate(quotation.validUntil)],
        [T.currency, sheetCurrencyLabel(quotation.currency, quotation.exchangeRate)],
        [T.seller, quotation.seller || '—'],
      ].map(([label, value]) => (
        <div key={label} style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={LABEL}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, ...WRAP }}>{sheetFit.meta(value)}</div>
        </div>
      ))}
    </div>
    <Parties quotation={quotation} />
  </>
);

const Parties: React.FC<{ quotation: QuotationSheetData }> = ({ quotation }) => {
  const { issuer, client } = quotation;
  const detail = (text: string, key: string) => text ? <div key={key} style={{ fontSize: 12.5, lineHeight: 1.5, color: SHEET_BODY, ...WRAP }}>{text}</div> : null;
  return (
    <div style={{ margin: '28px 56px 0 56px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ ...LABEL, marginBottom: 4 }}>{T.from}</div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, ...WRAP }}>{issuer.name || '—'}</div>
        {detail(issuer.address, 'address')}
        {detail(joined(issuer.taxId && `${T.taxId} ${issuer.taxId}`, issuer.phone && `${T.phone} ${issuer.phone}`), 'ids')}
        {detail(joined(issuer.email, issuer.website), 'contact')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ ...LABEL, marginBottom: 4 }}>{T.to}</div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, ...WRAP }}>{client.name || '—'}</div>
        {detail(client.attention && `${T.attention}: ${client.attention}`, 'attention')}
        {detail(joined(client.taxId && `${T.clientTaxId} ${client.taxId}`, client.phone && `${T.phone} ${client.phone}`), 'ids')}
        {detail(client.email, 'email')}
        {detail(client.address, 'address')}
      </div>
    </div>
  );
};

const ContinuationHeader: React.FC<{ quotation: QuotationSheetData; number: string }> = ({ quotation, number }) => (
  <div style={{ margin: '40px 56px 0 56px', paddingBottom: 12, borderBottom: `1px solid ${SHEET_RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24 }}>
    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap' }}>{sheetFit.continuation(quotation.issuer.name, `${T.title} ${number} ${T.continued}`)}</div>
    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap' }}>{T.title} {number} <span style={{ color: SHEET_MUTED, fontWeight: 500 }}>{T.continued}</span></div>
  </div>
);

const LinesTable: React.FC<{ rows: SheetRow[]; quotation: QuotationSheetData; theme: SheetTheme; netById: Map<string, number>; first: boolean }> = ({ rows, quotation, theme, netById, first }) => (
  <div style={{ margin: first ? '32px 56px 0 56px' : '24px 56px 0 56px', display: 'flex', flexDirection: 'column' }}>
    <div style={{ ...LABEL, color: theme.headerCellColor, display: 'grid', gridTemplateColumns: COLUMNS, gap: 12, padding: '10px 14px', background: theme.headerCellBackground, borderRadius: theme.headerCellRadius, borderBottom: `1.5px solid ${theme.headerCellBorder}` }}>
      <div>{T.columnNumber}</div>
      <div>{T.columnDescription}</div>
      <div style={{ textAlign: 'right' }}>{T.columnUnitPrice}</div>
      <div style={{ textAlign: 'right' }}>{T.columnQuantity}</div>
      <div style={{ textAlign: 'right' }}>{T.columnTotal} {currencySymbol(quotation.currency)}</div>
    </div>
    {rows.map(({ line, number }, i) => (
      <div key={line.id} style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 12, padding: '12px 14px', borderBottom: `1px solid ${SHEET_ROW_RULE}`, background: i % 2 === 1 ? theme.stripe : 'transparent', fontSize: 13, lineHeight: 1.45, alignItems: 'baseline' }}>
        <div style={{ color: SHEET_MUTED, fontVariantNumeric: 'tabular-nums' }}>{number === null ? '' : String(number).padStart(2, '0')}</div>
        {line.kind === 'detail' ? (
          <div style={{ gridColumn: '2 / 6', color: SHEET_BODY, fontStyle: 'italic', ...WRAP }}>
            {line.description}
            {line.quantity > 0 && <span style={{ fontStyle: 'normal', color: SHEET_MUTED }}>{` · ${formatQuantity(line.quantity)}${line.unit ? ` ${line.unit}` : ''}`}</span>}
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 500, ...WRAP }}>
              {line.description}
              {line.discountPct > 0 && <div style={{ fontSize: 11.5, fontWeight: 400, color: SHEET_MUTED, lineHeight: 1.4 }}>{T.lineDiscount} {formatQuantity(line.discountPct)}%</div>}
            </div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...WRAP }}>{formatAmount(line.unitPriceCents)}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...WRAP }}>{formatQuantity(line.quantity)}{line.unit ? ` ${line.unit}` : ''}</div>
            <div style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', ...WRAP }}>{formatAmount(netById.get(line.id) ?? 0)}</div>
          </>
        )}
      </div>
    ))}
  </div>
);

const SECTION_TITLES: Record<SheetTextChunk['section'], string> = { project: T.project, paymentTerms: T.paymentTerms, notes: T.notes };

const TextBlock: React.FC<{ chunk: SheetTextChunk }> = ({ chunk }) => (
  <div style={{ margin: '20px 56px 0 56px', display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={LABEL}>{SECTION_TITLES[chunk.section]}{chunk.continued ? ` ${T.continued}` : ''}</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: SHEET_BODY, ...WRAP }}>{chunk.text}</div>
  </div>
);

const TotalRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, lineHeight: 1.45 }}>
    <span style={{ color: SHEET_MUTED, whiteSpace: 'nowrap' }}>{sheetFit.discount(label, value)}</span>
    <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
  </div>
);

const Summary: React.FC<{ quotation: QuotationSheetData; totals: QuotationTotals; theme: SheetTheme; termsBeside: boolean }> = ({ quotation, totals, theme, termsBeside }) => {
  const side = termsBeside ? ([[T.paymentTerms, quotation.paymentTerms], [T.project, quotation.projectLabel]] as const).filter(([, text]) => text.trim()) : [];
  const applied = new Map(totals.discounts.map((d) => [d.id, d.appliedCents]));
  return (
    <div style={{ margin: '24px 56px 0 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 40 }}>
      {side.length ? (
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', border: `1px solid ${SHEET_RULE}`, borderRadius: 10 }}>
          {side.map(([label, text], i) => (
            <React.Fragment key={label}>
              <div style={{ ...LABEL, marginTop: i ? 8 : 0 }}>{label}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: SHEET_BODY, ...WRAP }}>{text}</div>
            </React.Fragment>
          ))}
        </div>
      ) : <div style={{ flex: '1 1 0' }} />}
      <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
        <TotalRow label={T.subtotal} value={formatAmount(totals.subtotalCents)} />
        {quotation.discounts.map((discount) => (
          <TotalRow key={discount.id} label={discount.label.trim() || T.discount} value={formatAmount(-(applied.get(discount.id) ?? 0))} />
        ))}
        <TotalRow label={T.itbis} value={formatAmount(totals.taxCents)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingTop: 12, borderTop: `2px solid ${theme.totalBorder}` }}>
          <span style={{ fontWeight: 700, lineHeight: 1.3 }}>{T.total} {currencySymbol(quotation.currency)}</span>
          <span style={{ fontFamily: theme.titleFont, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatAmount(totals.totalCents)}</span>
        </div>
      </div>
    </div>
  );
};

const Signatures: React.FC<{ seller: string; stamp: string | null }> = ({ seller, stamp }) => {
  const signer = (name: string, role: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 64 }} />
      <div style={{ borderTop: `1px solid ${SHEET_INK}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, minHeight: 18, ...WRAP }}>{sheetFit.signature(name) || ' '}</div>
        <div style={{ fontSize: 11, color: SHEET_MUTED, lineHeight: 1.4 }}>{role}</div>
      </div>
    </div>
  );
  return (
    <div style={{ margin: '0 56px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 170px minmax(0, 1fr)', gap: 32, alignItems: 'end', paddingBottom: 34 }}>
      {signer(seller, T.quotedBy)}
      <div style={{ minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {stamp && <img alt="Sello de la empresa" src={stamp} className="mx-auto block h-auto max-h-[140px] w-auto max-w-[160px]" />}
      </div>
      {signer('', T.receivedBy)}
    </div>
  );
};

const Footer: React.FC<{ quotation: QuotationSheetData; label: string }> = ({ quotation, label }) => (
  <div style={{ height: SHEET_LAYOUT.footer, minHeight: SHEET_LAYOUT.footer, maxHeight: SHEET_LAYOUT.footer, boxSizing: 'border-box', padding: '0 56px', borderTop: `1px solid ${SHEET_RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, fontSize: 10.5, lineHeight: 1.2, color: SHEET_MUTED, flexShrink: 0 }}>
    <span style={{ whiteSpace: 'nowrap' }}>{sheetFit.footer(joined(quotation.issuer.name, quotation.issuer.website), label)}</span>
    <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{label}</span>
  </div>
);
