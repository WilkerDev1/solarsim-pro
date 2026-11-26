import { isAssetRef } from '../../../shared/documentAssets';
import { sniffDocumentFileType } from '../../../shared/fileSignatures';
import type { QuotationContent } from '../../../shared/quotations';
import { assetRefFor } from '../../services/documentAssetService';
import { bytesToDataUrl } from '../../utils/dataUrl';
import { registerUploadedImage } from './quotationContent';

export interface QuotationAssetDeps {
  /** Sube un data URL y devuelve su referencia (`DocumentAssetService.ensureUploaded`). */
  upload: (dataUrl: string) => Promise<string>;
  /** Bytes de un adjunto guardados en este equipo (`PDFAttachmentStorage`). */
  attachmentBytes: (attachmentId: string) => Promise<ArrayBuffer | null>;
}

/**
 * Antes de publicar una cotización: sube su logo y sus miniaturas en línea (así viajan como `asset:sha256:`) y los
 * adjuntos que este equipo tiene y cuya referencia (`assetId`) aún no está en el servidor. Un fallo deja ese hueco como
 * antes (vacío) y nunca detiene la publicación: el contenido de la cotización no depende de él.
 */
export async function publishQuotationAssets(content: QuotationContent, deps: QuotationAssetDeps): Promise<void> {
  const images = [content.issuer?.logo, ...(content.attachments ?? []).map((a) => a.thumbnailDataUrl)]
    .filter((image): image is string => !!image && !isAssetRef(image));
  for (const image of images) {
    try {
      registerUploadedImage(image, await deps.upload(image));
    } catch {
      // Sin subir: se publica vacío, como una imagen que la API no admite.
    }
  }
  for (const attachment of content.attachments ?? []) {
    if (!attachment.assetId || !isAssetRef(attachment.assetId)) continue;
    try {
      const bytes = await deps.attachmentBytes(attachment.id);
      if (!bytes) continue;
      const type = sniffDocumentFileType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
      if (!type) continue;
      const dataUrl = bytesToDataUrl(bytes, type);
      if ((await assetRefFor(dataUrl)) === attachment.assetId) await deps.upload(dataUrl);
    } catch {
      // Otro equipo no podrá descargarlo hasta la siguiente pasada; la exportación lo omite con aviso.
    }
  }
}
