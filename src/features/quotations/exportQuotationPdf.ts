/**
 * Exportación de la cotización a PDF: rasteriza las páginas de la hoja (`[data-quotation-page]`) con el mismo
 * exportador que la propuesta (`exportProposalPdf`: html2canvas → jsPDF) y añade al final los adjuntos en modo
 * `include` (`mergeQuotationAttachments`). Un adjunto que no se puede incluir se omite y se devuelve para avisar.
 */
import type { QuotationAttachment } from '../../types/quotation';
import type { SkippedAttachment } from './attachments';

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

export interface QuotationExportAttachments {
  list: readonly QuotationAttachment[];
  resolve: (attachment: QuotationAttachment) => Promise<ArrayBuffer | null>;
}

/** Convierte una imagen WebP a PNG con un canvas (pdf-lib solo incrusta PNG y JPEG); `null` si no se puede. */
async function webpToPng(bytes: ArrayBuffer): Promise<ArrayBuffer | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    canvas.width = 0;
    canvas.height = 0;
    return blob ? await blob.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function exportQuotationPdf(
  pages: HTMLElement[],
  number: string | null,
  attachments?: QuotationExportAttachments,
): Promise<{ skipped: SkippedAttachment[] }> {
  // Carga diferida: html2canvas, jsPDF y pdf-lib solo se descargan al exportar.
  const { exportProposalPdf } = await import('../../components/pdf/export/exportProposalPdf');
  const included = (attachments?.list ?? []).filter((a) => a.mode === 'include');
  let skipped: SkippedAttachment[] = [];
  await exportProposalPdf({
    pages,
    fileName: quotationPdfFileName(number),
    attachments: [],
    resolveAttachmentBytes: async () => null,
    ...(included.length && attachments ? {
      finalize: async (pdf: ArrayBuffer) => {
        const { mergeQuotationAttachments } = await import('./attachments');
        // Cada adjunto se carga justo antes de fusionarlo y se suelta después: nunca están todos en memoria a la vez.
        const items = included.map((attachment) => ({ attachment, load: () => attachments.resolve(attachment) }));
        const result = await mergeQuotationAttachments(pdf, items, { toEmbeddable: (bytes) => webpToPng(bytes) });
        skipped = result.skipped;
        return result.bytes;
      },
    } : {}),
  });
  return { skipped };
}
