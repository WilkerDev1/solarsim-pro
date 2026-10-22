import { DEFAULT_PDF_SECTION_ORDER, type PDFSectionId } from '../constants/pdfSections';
import type { AttachedPDFDocument, ExtraTOCItem } from '../types';
import { DOCUMENT_SECTIONS } from '../../shared/documentTexts/sections';

export interface TOCItem {
  number: string;
  title: string;
  subtitle?: string;
  targetPage: number;
}

/** Saved order with unknown ids removed and any missing sections appended in default order. */
export function normalizeSectionOrder(saved?: readonly string[]): PDFSectionId[] {
  if (!saved || !Array.isArray(saved) || saved.length === 0) return DEFAULT_PDF_SECTION_ORDER;
  const valid = saved.filter((id): id is PDFSectionId => DEFAULT_PDF_SECTION_ORDER.includes(id as PDFSectionId));
  return [...valid, ...DEFAULT_PDF_SECTION_ORDER.filter((id) => !valid.includes(id))];
}

export interface PdfLayout {
  /** Page number per section; 0 when hidden. */
  pageNumbers: Record<PDFSectionId, number>;
  /** Visible internal sections (one page each). */
  activePagesCount: number;
  /** "M" in every page footer ("N de M"): internal pages plus annexes listed in the TOC. */
  footerTotalPages: number;
  tocItems: TOCItem[];
}

export function buildPdfLayout(
  order: readonly PDFSectionId[],
  visibility: Record<PDFSectionId, boolean>,
  extraTocItems: readonly ExtraTOCItem[] = [],
  attachedPdfs: readonly AttachedPDFDocument[] = [],
): PdfLayout {
  const pageNumbers = Object.fromEntries(DEFAULT_PDF_SECTION_ORDER.map((id) => [id, 0])) as Record<PDFSectionId, number>;
  let page = 0;
  for (const id of order) if (visibility[id]) pageNumbers[id] = ++page;

  const tocItems: TOCItem[] = [];
  let sectionIndex = 1;
  for (const id of order) {
    const meta = DOCUMENT_SECTIONS[id].toc;
    if (!visibility[id] || !meta) continue;
    tocItems.push({ number: `${sectionIndex}`, title: meta.title, subtitle: `${sectionIndex}.1 ${meta.subtitle}`, targetPage: pageNumbers[id] });
    sectionIndex++;
  }

  // Annex entries follow the internal pages, each occupying its declared page count.
  let nextPage = page + 1;
  const pagesOf = (count?: number) => (typeof count === 'number' && count > 0 ? count : 1);
  for (const extra of extraTocItems) {
    if (!extra.title?.trim()) continue;
    tocItems.push({ number: `${sectionIndex++}`, title: extra.title.trim(), subtitle: extra.subtitle ? extra.subtitle.trim() : undefined, targetPage: nextPage });
    nextPage += pagesOf(extra.pageCount);
  }
  for (const att of attachedPdfs.filter((a) => a.enabled !== false && a.addToTableOfContents === true)) {
    if (!att.title?.trim()) continue;
    tocItems.push({
      number: `${sectionIndex++}`,
      title: att.title.trim(),
      subtitle: att.subtitle ? att.subtitle.trim() : `Ficha Técnica / Anexo Oficial (${att.fileName})`,
      targetPage: nextPage,
    });
    nextPage += pagesOf(att.pageCount);
  }

  return { pageNumbers, activePagesCount: page, footerTotalPages: nextPage - 1, tocItems };
}
