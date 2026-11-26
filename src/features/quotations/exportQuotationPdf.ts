/**
 * Exportación de la cotización a PDF: rasteriza las páginas de la hoja (`[data-quotation-page]`) con el mismo
 * exportador que la propuesta (`exportProposalPdf`: html2canvas → jsPDF), sin anexos (llegan en otra fase).
 */

const DRAFT_FILE_NAME = 'Cotizacion-borrador';

/** `<número>.pdf` saneado (solo letras, dígitos, `_` y `-`); sin número, `Cotizacion-borrador.pdf`. */
export function quotationPdfFileName(number: string | null | undefined): string {
  const safe = (number ?? '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || DRAFT_FILE_NAME}.pdf`;
}

/** Páginas de la hoja dentro de `root`, en orden. */
export function quotationPages(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-quotation-page]'));
}

export async function exportQuotationPdf(pages: HTMLElement[], number: string | null): Promise<void> {
  // Carga diferida: html2canvas y jsPDF solo se descargan al exportar.
  const { exportProposalPdf } = await import('../../components/pdf/export/exportProposalPdf');
  await exportProposalPdf({ pages, fileName: quotationPdfFileName(number), attachments: [], resolveAttachmentBytes: async () => null });
}
