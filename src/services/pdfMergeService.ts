import { PDFDocument } from 'pdf-lib';

/**
 * 🛠️ PDFMergeService
 * 
 * Utilidades para inspeccionar y fusionar archivos PDF externos
 * (fichas técnicas, planos, certificaciones) directamente con la propuesta generada.
 */
export class PDFMergeService {
  /**
   * Obtiene la cantidad exacta de páginas de un archivo PDF
   */
  static async getPdfPageCount(source: File | ArrayBuffer): Promise<number> {
    try {
      const buffer = source instanceof File ? await source.arrayBuffer() : source;
      const doc = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });
      return doc.getPageCount();
    } catch (err) {
      console.warn('Advertencia al leer páginas con pdf-lib (usando 1 por defecto):', err);
      return 1;
    }
  }

  /**
   * Fusiona el PDF madre de la propuesta con los documentos externos adjuntos.
   * Copia directamente las páginas vectoriales sin perder resolución, texto ni enlaces.
   */
  static async mergeProposalWithAttachments(
    proposalBuffer: ArrayBuffer,
    attachments: { name: string; buffer: ArrayBuffer }[]
  ): Promise<Uint8Array> {
    try {
      const mergedDoc = await PDFDocument.load(proposalBuffer, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });

      for (const att of attachments) {
        try {
          const attDoc = await PDFDocument.load(att.buffer, {
            ignoreEncryption: true,
            throwOnInvalidObject: false,
          });
          const pageIndices = attDoc.getPageIndices();
          const copiedPages = await mergedDoc.copyPages(attDoc, pageIndices);
          copiedPages.forEach((page) => mergedDoc.addPage(page));
        } catch (err) {
          console.error(`Error fusionando el documento adjunto ${att.name}:`, err);
        }
      }

      return await mergedDoc.save();
    } catch (err) {
      console.error('Error general en mergeProposalWithAttachments, exportando original sin anexos:', err);
      return new Uint8Array(proposalBuffer);
    }
  }

  /**
   * Descarga un buffer de bytes como archivo PDF en el navegador
   */
  static downloadPdfBytes(bytes: Uint8Array, fileName: string): void {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const blob = new Blob([buffer as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Abre un buffer PDF en una nueva pestaña para previsualizarlo
   */
  static previewPdfBytes(bytes: Uint8Array | ArrayBuffer): void {
    const buffer = bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes;
    const blob = new Blob([buffer as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
