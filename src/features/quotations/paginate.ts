/**
 * Paginación pura de la hoja A4 de la cotización (850×1202 px). Estima la altura de cada bloque de la hoja con las
 * mismas medidas que usa el componente (`src/components/quotations/sheet/`): una fila mide lo que su celda más alta
 * (descripción con su «Desc. N%», cantidad con unidad, importes), la primera página resta la cabecera, la franja de datos
 * y el bloque De/Para, las notas (y las condiciones largas) fluyen por párrafos, y el cierre (totales y firmas) va
 * siempre entero en la última página, añadiendo una si no cabe.
 *
 * Qué se garantiza: cada página suma como mucho su capacidad según este modelo (lo fijan las pruebas). El modelo no
 * mide en el DOM: estima el ancho de cada texto con anchos de carácter de Inter algo por encima de los reales y
 * columnas algo más estrechas que las reales, así que en la práctica sobra espacio; un texto con glifos más anchos que
 * los del modelo (p. ej. escrituras no latinas) podría ocupar más de lo estimado.
 */
import {
  computeQuotationTotals, formatAmount, formatQuantity, formatSheetDate, sheetCurrencyLabel, QUOTATION_SHEET_TEXTS,
  type QuotationContent, type QuotationLine,
} from '../../../shared/quotations';

/** Medidas de la hoja en px (y anchos útiles en em de su fuente); las comparte el componente de la hoja. */
export const SHEET_LAYOUT = {
  width: 850,
  height: 1202,
  footer: 42,
  sideMargin: 56,
  /** Ancho del contenido entre márgenes. */
  contentWidth: 738,
  /** Margen inferior reservado sobre el pie. */
  bottomPad: 16,
  /** Alto útil por encima del pie. */
  usableHeight: 1202 - 42 - 16,
  // Cabecera de la primera página: el relleno más alto de las tres disposiciones (banda) y el bloque logo/título.
  headPadding: 6 + 38 + 32,
  titleStack: 64,
  logoImage: 62 + 16,
  logoNameLine: 26,
  logoNameEm: 18,
  // Franja de datos: margen, bordes, relleno, etiqueta y separación; cada renglón de valor, 19 px.
  metaFixed: 32 + 2 + 28 + 15 + 4,
  metaEm: 12.5,
  // De/Para.
  partiesFixed: 28 + 22 + 3,
  partiesNameLine: 22,
  partiesNameEm: 21,
  partiesLine: 19,
  partiesBlockGap: 3,
  partiesEm: 27,
  // Cabecera de las páginas siguientes: margen, relleno, borde y renglones del nombre del emisor.
  continuationFixed: 40 + 12 + 1,
  continuationLine: 19,
  // Margen superior y cabecera de la tabla.
  tableHead: 32 + 38,
  rowPadding: 26,
  rowLine: 19,
  lineDiscountExtra: 17,
  descriptionEm: 23,
  detailEm: 50,
  unitPriceEm: 8.2,
  quantityEm: 6.7,
  lineTotalEm: 8.6,
  // Bloques de texto (notas, condiciones largas).
  textLine: 20,
  textEm: 57,
  textTitle: 22,
  textMargin: 20,
  // Recuadro de condiciones y proyecto junto a los totales.
  sideBoxFixed: 32,
  sideBoxBlock: 22,
  sideBoxBlockGap: 14,
  sideBoxEm: 28,
  sideBoxMax: 200,
  // Totales: columna de 300 px; cada renglón 19 px y 10 px entre filas.
  totalsWidth: 300,
  totalsGap: 10,
  totalsLine: 19,
  totalsTotalFixed: 14,
  totalsTotalLine: 17,
  totalsAmount: 27,
  closingMargin: 24,
  // Firmas: espacio de firma, raya, nombre (renglones de 19 px en 18 em), cargo y relleno inferior; el sello reserva 140.
  signaturesFixed: 64 + 8 + 1 + 8 + 2 + 16,
  signaturesStamp: 140,
  signaturesNameEm: 18,
  signaturesBottom: 34,
} as const;

export interface SheetRow {
  line: QuotationLine;
  /** Número de ítem (solo las líneas con precio), correlativo entre páginas; `null` en las descriptivas. */
  number: number | null;
}

export interface SheetTextChunk {
  section: 'project' | 'paymentTerms' | 'notes';
  text: string;
  /** Continúa un bloque empezado en la página anterior. */
  continued: boolean;
}

export interface SheetPage {
  rows: SheetRow[];
  texts: SheetTextChunk[];
  /** Condiciones de pago y proyecto en el recuadro junto a los totales (si no, fluyen como texto). */
  termsBeside: boolean;
  /** Lleva totales y firmas (solo la última). */
  closing: boolean;
  capacity: number;
  estimatedHeight: number;
}

export type PaginationInput = Pick<
  QuotationContent,
  'items' | 'discounts' | 'notes' | 'paymentTerms' | 'projectLabel' | 'issuer' | 'client' | 'seller' | 'issueDate' | 'validUntil' | 'currency' | 'exchangeRate'
> & { number?: string | null };

const L = SHEET_LAYOUT;

/**
 * Ancho aproximado de un texto en em de Inter (por encima del real): mayúsculas y cifras son más anchas que
 * minúsculas y espacios, así un texto en mayúsculas no se subestima ni uno en minúsculas se sobreestima. Incluye un 4 %
 * por el corte en palabras.
 */
export function textWidthEm(text: string): number {
  let em = 0;
  for (const char of text) {
    if (char === ' ') em += 0.25;
    else if (/[A-ZÁÉÍÓÚÑÜ@%&]/.test(char)) em += char === 'M' || char === 'W' ? 1 : 0.7;
    else if (/[0-9]/.test(char)) em += 0.6;
    else if (/[a-záéíóúñü]/.test(char)) em += char === 'm' || char === 'w' ? 0.8 : 0.5;
    else if (/[.,:;'|!·il]/.test(char)) em += 0.3;
    else em += 0.6;
  }
  return em * 1.04;
}

/** Renglones que ocupa un texto en una columna de `widthEm` em; cada salto de línea empieza uno nuevo. */
export function wrappedLines(text: string, widthEm: number): number {
  return text.split('\n').reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(textWidthEm(paragraph) / widthEm)), 0);
}

/** Recorta un texto a un renglón de `widthEm` em con «…» (para el pie: sin recortes con CSS). */
export function fitToWidth(text: string, widthEm: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (textWidthEm(flat) <= widthEm) return flat;
  let cut = flat;
  while (cut && textWidthEm(`${cut}…`) > widthEm) cut = cut.slice(0, -1);
  return cut ? `${cut.trimEnd()}…` : '';
}

/** Hasta dos renglones de `widthEm` (con «…» si no cabe): datos que la hoja no deja crecer sin límite. */
const twoLines = (text: string, widthEm: number) => fitToWidth(text, widthEm * 1.8);

/** Textos de la hoja que se acortan en JavaScript para que cada bloque tenga una altura acotada (sin CSS de recorte). */
export const sheetFit = {
  /** Valores de la franja de datos (vendedor, moneda): hasta dos renglones. */
  meta: (text: string) => twoLines(text, SHEET_LAYOUT.metaEm),
  /** Nombre del emisor en lugar del logo: hasta dos renglones. */
  headerName: (text: string) => twoLines(text, SHEET_LAYOUT.logoNameEm),
  /** Nombre bajo «Cotizado por»: hasta dos renglones. */
  signature: (text: string) => twoLines(text, SHEET_LAYOUT.signaturesNameEm),
  /** Etiqueta de un descuento en la columna de totales: un renglón junto a su importe. */
  discount: (label: string, value: string) => fitToWidth(label, discountLabelEm(value)),
  /** Pie: el emisor en el ancho que deja «número · Página X de N». */
  footer: (text: string, right: string) => fitToWidth(text, Math.max(6, (SHEET_LAYOUT.contentWidth - 24 - textWidthEm(right) * 10.5 * 1.05) / 10.5)),
  /** Emisor en la cabecera de las páginas siguientes: un renglón junto al título. */
  continuation: (name: string, title: string) => fitToWidth(name, Math.max(6, (SHEET_LAYOUT.contentWidth - 24 - textWidthEm(title) * 13 * 1.05) / 13)),
};

function discountLabelEm(value: string): number {
  return Math.max(4, (SHEET_LAYOUT.totalsWidth - 16 - textWidthEm(value) * 13) / 13);
}

/** Parte un párrafo demasiado largo para una página en trozos de como mucho `maxLines` renglones (por palabras). */
export function splitParagraph(paragraph: string, maxLines: number, widthEm: number): string[] {
  if (wrappedLines(paragraph, widthEm) <= maxLines) return [paragraph];
  const pieces: string[] = [];
  let current = '';
  for (const word of paragraph.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (wrappedLines(candidate, widthEm) <= maxLines) { current = candidate; continue; }
    if (current) pieces.push(current);
    current = word;
    // Una «palabra» sin espacios más larga que el trozo se corta por caracteres.
    while (wrappedLines(current, widthEm) > maxLines) {
      let cut = current.length;
      while (cut > 1 && wrappedLines(current.slice(0, cut), widthEm) > maxLines) cut = Math.floor(cut * 0.9);
      pieces.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

const quantityText = (line: QuotationLine) => `${formatQuantity(line.quantity)}${line.unit ? ` ${line.unit}` : ''}`;

/** Altura de una fila: la de su celda más alta. */
export function estimateLineHeight(line: QuotationLine): number {
  if (line.kind === 'detail') {
    const text = `${line.description || ' '}${line.quantity > 0 ? ` · ${quantityText(line)}` : ''}`;
    return L.rowPadding + wrappedLines(text, L.detailEm) * L.rowLine;
  }
  const description = wrappedLines(line.description || ' ', L.descriptionEm) * L.rowLine + (line.discountPct > 0 ? L.lineDiscountExtra : 0);
  // El total de la línea es como mucho el bruto (cantidad × precio): sirve de cota para su ancho.
  const gross = formatAmount(Math.round(line.quantity * line.unitPriceCents));
  const cells = [
    description,
    wrappedLines(quantityText(line), L.quantityEm) * L.rowLine,
    wrappedLines(formatAmount(line.unitPriceCents), L.unitPriceEm) * L.rowLine,
    wrappedLines(gross, L.lineTotalEm) * L.rowLine,
  ];
  return L.rowPadding + Math.max(...cells);
}

const isImage = (value: string) => /^data:image\//.test(value);

/** Cabecera de la primera página sin De/Para: logo o nombre del emisor, título y franja de datos. */
export function estimateFirstHeader(input: PaginationInput): number {
  const logo = isImage(input.issuer.logo)
    ? L.logoImage
    : input.issuer.name.trim() ? wrappedLines(sheetFit.headerName(input.issuer.name), L.logoNameEm) * L.logoNameLine : 0;
  const meta = [
    formatSheetDate(input.issueDate), formatSheetDate(input.validUntil), sheetCurrencyLabel(input.currency, input.exchangeRate), input.seller || '—',
  ].reduce((max, value) => Math.max(max, wrappedLines(sheetFit.meta(value), L.metaEm)), 1);
  return L.headPadding + Math.max(L.titleStack, logo) + L.metaFixed + meta * L.partiesLine;
}

const partyHeight = (name: string, blocks: string[]) =>
  wrappedLines(name || '—', L.partiesNameEm) * L.partiesNameLine
  + blocks.filter((text) => text.trim()).reduce((sum, text) => sum + wrappedLines(text, L.partiesEm) * L.partiesLine + L.partiesBlockGap, 0);

/** Alto del bloque De/Para: el más alto de los dos (mismos renglones que dibuja la hoja). */
export function estimatePartiesHeight(input: Pick<PaginationInput, 'issuer' | 'client'>): number {
  const { issuer, client } = input;
  const T = QUOTATION_SHEET_TEXTS;
  return L.partiesFixed + Math.max(
    partyHeight(issuer.name, [issuer.address, `${T.taxId} ${issuer.taxId} · ${T.phone} ${issuer.phone}`, `${issuer.email} · ${issuer.website}`]),
    partyHeight(client.name, [client.attention && `${T.attention}: ${client.attention}`, `${T.clientTaxId} ${client.taxId} · ${T.phone} ${client.phone}`, client.email, client.address]),
  );
}

/** Cabecera de las páginas siguientes: el nombre del emisor va en un renglón junto al título. */
export function estimateContinuationHeader(): number {
  return L.continuationFixed + L.continuationLine;
}

const sideBlocks = (input: PaginationInput) => [input.paymentTerms, input.projectLabel].filter((v) => v.trim());

const sideBoxHeight = (input: PaginationInput) => {
  const blocks = sideBlocks(input);
  if (!blocks.length) return 0;
  return L.sideBoxFixed + blocks.reduce((sum, text) => sum + L.sideBoxBlock + wrappedLines(text, L.sideBoxEm) * L.textLine, 0) + (blocks.length - 1) * L.sideBoxBlockGap;
};

/** Totales: cada etiqueta parte en el ancho que le deja su importe (en una línea) dentro de la columna de 300 px. */
export function estimateTotalsHeight(input: PaginationInput): number {
  const totals = computeQuotationTotals(input);
  const applied = new Map(totals.discounts.map((d) => [d.id, d.appliedCents]));
  const T = QUOTATION_SHEET_TEXTS;
  const rows: [string, string][] = [
    [T.subtotal, formatAmount(totals.subtotalCents)],
    ...input.discounts.map((d): [string, string] => [d.label.trim() || T.discount, formatAmount(-(applied.get(d.id) ?? 0))]),
    [T.itbis, formatAmount(totals.taxCents)],
  ];
  // Las etiquetas de descuento se acortan a un renglón (sheetFit.discount); las fijas caben siempre.
  const height = rows.reduce((sum, [label, value]) => sum + wrappedLines(sheetFit.discount(label, value), discountLabelEm(value)) * L.totalsLine + L.totalsGap, 0);
  const amountPx = textWidthEm(formatAmount(totals.totalCents)) * 22 * 1.05;
  const totalLabel = wrappedLines(`${T.total} RD$`, Math.max(4, (L.totalsWidth - 16 - amountPx) / (13 * 1.05)));
  return height + L.totalsTotalFixed + Math.max(L.totalsAmount, totalLabel * L.totalsTotalLine);
}

export function estimateSignaturesHeight(seller: string): number {
  const name = wrappedLines(sheetFit.signature(seller) || ' ', L.signaturesNameEm) * L.rowLine;
  return Math.max(L.signaturesFixed + name, L.signaturesStamp) + L.signaturesBottom;
}

export function estimateClosingHeight(input: PaginationInput, termsBeside: boolean): number {
  return L.closingMargin + Math.max(estimateTotalsHeight(input), termsBeside ? sideBoxHeight(input) : 0) + estimateSignaturesHeight(input.seller);
}

export function paginateQuotation(input: PaginationInput): SheetPage[] {
  const termsBeside = sideBoxHeight(input) <= L.sideBoxMax;
  const firstHeader = estimateFirstHeader(input) + estimatePartiesHeight(input);
  const continuationHeader = estimateContinuationHeader();
  const pages: SheetPage[] = [];
  const fresh = (first: boolean): SheetPage => ({
    rows: [], texts: [], termsBeside, closing: false,
    capacity: L.usableHeight - (first ? firstHeader : continuationHeader),
    estimatedHeight: L.tableHead,
  });
  let page = fresh(true);
  const next = () => {
    pages.push(page);
    page = fresh(false);
  };

  let number = 0;
  for (const line of input.items) {
    const height = estimateLineHeight(line);
    // Una fila que no cabe pasa a la página siguiente; en la primera, aunque quede sin filas (cabecera muy alta).
    if ((page.rows.length || !pages.length) && page.estimatedHeight + height > page.capacity) next();
    page.rows.push({ line, number: line.kind === 'item' ? ++number : null });
    page.estimatedHeight += height;
  }

  // Bloques de texto que fluyen por párrafos (un párrafo cabe siempre en una página vacía: ≤ 4000 caracteres).
  const flowing: { section: SheetTextChunk['section']; text: string }[] = [
    ...(!termsBeside && input.projectLabel.trim() ? [{ section: 'project' as const, text: input.projectLabel }] : []),
    ...(!termsBeside && input.paymentTerms.trim() ? [{ section: 'paymentTerms' as const, text: input.paymentTerms }] : []),
    ...(input.notes.trim() ? [{ section: 'notes' as const, text: input.notes }] : []),
  ];
  for (const block of flowing) {
    let chunk: SheetTextChunk | null = null;
    let continued = false;
    const pieceLines = Math.floor((L.usableHeight - continuationHeader - L.tableHead - L.textMargin - L.textTitle) / L.textLine);
    for (const paragraph of block.text.split('\n').flatMap((p) => splitParagraph(p, pieceLines, L.textEm))) {
      const lines = wrappedLines(paragraph, L.textEm) * L.textLine;
      const opening = chunk ? 0 : L.textMargin + L.textTitle;
      if (page.estimatedHeight + opening + lines > page.capacity && (chunk || page.rows.length || page.texts.length)) {
        next();
        if (chunk) continued = true;
        chunk = null;
      }
      if (!chunk) {
        chunk = { section: block.section, text: paragraph, continued };
        page.texts.push(chunk);
        page.estimatedHeight += L.textMargin + L.textTitle + lines;
      } else {
        chunk.text += `\n${paragraph}`;
        page.estimatedHeight += lines;
      }
    }
  }

  const closing = estimateClosingHeight(input, termsBeside);
  if (page.estimatedHeight + closing > page.capacity) next();
  page.closing = true;
  page.estimatedHeight += closing;
  pages.push(page);
  return pages;
}
