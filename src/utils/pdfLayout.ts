import { DEFAULT_PDF_SECTION_ORDER, type PDFSectionId } from '../constants/pdfSections';
import type { AttachedPDFDocument, ExtraTOCItem } from '../types';

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

const TOC_METADATA: Partial<Record<PDFSectionId, { title: string; subtitle: string }>> = {
  executiveSummary: { title: 'Cuadro Resumen de Inversión y Retorno', subtitle: 'Pipeline Técnico, Beneficio Ley 57-07 y Payback' },
  aboutUs: { title: 'Quiénes Somos & Nuestros Servicios', subtitle: 'Por Qué Elegirnos y Pilares de Servicio' },
  benefits: { title: 'Beneficios de la Energía Solar', subtitle: 'Objetivos e Incentivos Fiscales de la Ley 57-07' },
  techIntro: { title: '¿Qué es un Sistema Fotovoltaico?', subtitle: 'Funcionamiento y Diagrama de Flujo Técnico' },
  projectDescription: { title: 'Descripción del Proyecto & Normativa SIE', subtitle: 'Criterios de Dimensionamiento y Resolución SIE-007' },
  energy: { title: 'Análisis de Energía y Balance', subtitle: 'Generación Solar Estimada vs Demanda Mensual' },
  quotation: { title: 'Presupuesto y Cotización de Sistema', subtitle: 'Equipos Tier-1, Inversión y Términos de Garantías' },
  roi: { title: 'Cálculo de Retorno de Inversión', subtitle: 'Payback, VAN, TIR y Ahorro Estimado' },
  cashFlow: { title: 'Flujo de Caja y Proyección a 25 Años', subtitle: 'Análisis Financiero Acumulado y Rendimiento Anual' },
  costMatrix: { title: 'Matriz de Costos Internos (Confidencial)', subtitle: 'Desglose Detallado de Proveedores y Margen Comercial' },
};

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
    const meta = TOC_METADATA[id];
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
