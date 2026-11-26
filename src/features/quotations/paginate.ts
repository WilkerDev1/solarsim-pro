/**
 * Paginación pura de la hoja A4 de la cotización (850×1202 px). Reparte las líneas por alturas estimadas: una
 * descripción larga (o con saltos de línea) ocupa más filas; la primera página tiene menos espacio (cabecera, datos y
 * De/Para); las notas (y las condiciones largas) fluyen por párrafos; y el cierre (totales y firmas) va siempre entero
 * en la última página, añadiendo una si no cabe. Las estimaciones son conservadoras: la hoja real
 * (`src/components/quotations/sheet/`) usa las mismas medidas y ocupa como mucho lo estimado.
 */
import type { QuotationContent, QuotationLine } from '../../../shared/quotations';

/** Medidas de la hoja en px; las comparte el componente de la hoja. */
export const SHEET_LAYOUT = {
  width: 850,
  height: 1202,
  footer: 42,
  /** Margen lateral del contenido. */
  sideMargin: 56,
  /** Margen inferior reservado sobre el pie. */
  bottomPad: 16,
  /** Alto útil por encima del pie. */
  usableHeight: 1202 - 42 - 16,
  /** Cabecera de la primera página: barra, logo y título, franja de datos y márgenes, sin De/Para. */
  firstHeader: 220,
  /** Cabecera compacta de las páginas siguientes. */
  continuationHeader: 96,
  /** Margen superior y cabecera de la tabla. */
  tableHead: 32 + 38,
  rowPadding: 26,
  rowLine: 19,
  /** Anchos de columna en em de su fuente (ancho en px ÷ tamaño de letra), algo por debajo del real. */
  descriptionEm: 23,
  lineDiscountExtra: 18,
  partiesTop: 28,
  partiesLabel: 26,
  partiesName: 24,
  partiesLine: 19,
  partiesEm: 27,
  partiesNameEm: 21,
  textLine: 20,
  textEm: 57,
  textTitle: 24,
  textMargin: 20,
  sideBoxEm: 28,
  sideBoxMax: 200,
  totalsRow: 30,
  totalsTotalRow: 52,
  closingMargin: 24,
  signatures: 184,
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

export type PaginationInput = Pick<QuotationContent, 'items' | 'discounts' | 'notes' | 'paymentTerms' | 'projectLabel' | 'issuer' | 'client'>;

const L = SHEET_LAYOUT;

/**
 * Ancho aproximado de un texto en em de Inter: mayúsculas y cifras son más anchas que minúsculas y espacios. Así un
 * texto en mayúsculas no se subestima y uno en minúsculas no se sobreestima. Incluye un 4 % por el corte en palabras.
 */
export function textWidthEm(text: string): number {
  let em = 0;
  for (const char of text) {
    if (char === ' ') em += 0.25;
    else if (/[A-ZÁÉÍÓÚÑÜ@MW%&]/.test(char)) em += 0.68;
    else if (/[0-9]/.test(char)) em += 0.6;
    else if (/[a-záéíóúñü]/.test(char)) em += char === 'm' || char === 'w' ? 0.8 : 0.5;
    else em += 0.45;
  }
  return em * 1.04;
}

/** Renglones que ocupa un texto en una columna de `widthEm` em; cada salto de línea empieza uno nuevo. */
export function wrappedLines(text: string, widthEm: number): number {
  return text.split('\n').reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(textWidthEm(paragraph) / widthEm)), 0);
}

export function estimateLineHeight(line: QuotationLine): number {
  const discount = line.kind === 'item' && line.discountPct > 0 ? L.lineDiscountExtra : 0;
  return L.rowPadding + wrappedLines(line.description || ' ', L.descriptionEm) * L.rowLine + discount;
}

const partyLines = (values: string[]) => values.filter((v) => v.trim()).reduce((sum, v) => sum + wrappedLines(v, L.partiesEm), 0);

/** Alto del bloque De/Para: el más alto de los dos. */
export function estimatePartiesHeight(input: Pick<PaginationInput, 'issuer' | 'client'>): number {
  const { issuer, client } = input;
  const issuerLines = partyLines([issuer.address, [issuer.taxId, issuer.phone].join(' '), [issuer.email, issuer.website].join(' ')]);
  const clientLines = partyLines([client.attention, [client.taxId, client.phone].join(' '), client.email, client.address]);
  const nameLines = (name: string) => wrappedLines(name || ' ', L.partiesNameEm);
  return L.partiesTop + L.partiesLabel + Math.max(
    nameLines(issuer.name) * L.partiesName + issuerLines * L.partiesLine,
    nameLines(client.name) * L.partiesName + clientLines * L.partiesLine,
  );
}

const sideBoxHeight = (input: PaginationInput) => {
  const blocks = [input.paymentTerms, input.projectLabel].filter((v) => v.trim());
  if (!blocks.length) return 0;
  return 32 + blocks.reduce((sum, text) => sum + L.textTitle + wrappedLines(text, L.sideBoxEm) * L.textLine, 0);
};

export function estimateClosingHeight(input: PaginationInput, termsBeside: boolean): number {
  const totals = (2 + input.discounts.length) * L.totalsRow + L.totalsTotalRow;
  return L.closingMargin + Math.max(totals, termsBeside ? sideBoxHeight(input) : 0) + L.signatures;
}

export function paginateQuotation(input: PaginationInput): SheetPage[] {
  const termsBeside = sideBoxHeight(input) <= L.sideBoxMax;
  const pages: SheetPage[] = [];
  const fresh = (first: boolean): SheetPage => {
    const header = first ? L.firstHeader + estimatePartiesHeight(input) : L.continuationHeader;
    const capacity = L.usableHeight - header;
    return { rows: [], texts: [], termsBeside, closing: false, capacity, estimatedHeight: L.tableHead };
  };
  let page = fresh(true);
  const next = () => {
    pages.push(page);
    page = fresh(false);
  };

  let number = 0;
  for (const line of input.items) {
    const height = estimateLineHeight(line);
    if (page.rows.length && page.estimatedHeight + height > page.capacity) next();
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
    for (const paragraph of block.text.split('\n')) {
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
