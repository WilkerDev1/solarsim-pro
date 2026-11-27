/**
 * Adjuntos de una cotización (docs/QUOTATION_EDITOR.md#adjuntos): preparar un archivo subido, armar las fichas técnicas
 * del catálogo, localizar sus bytes y fusionarlos al PDF exportado. Los bytes viven en este equipo
 * (`PDFAttachmentStorage`, por id de adjunto) y en el servidor como activo `asset:sha256:` (subidos al publicar); las
 * fichas del catálogo, en `equipment_assets` (su `assetId` es el id del activo del equipo).
 */
import { PDFDocument, degrees } from 'pdf-lib';
import { isAssetRef } from '../../../shared/documentAssets';
import { sniffDocumentFileType, type DocumentFileType } from '../../../shared/fileSignatures';
import { QUOTATION_LIBRARY_LIMITS, QUOTATION_LIMITS } from '../../../shared/quotations';
import type { QuotationAttachment, QuotationContent } from '../../types/quotation';
import type { SolarEquipmentItem } from '../../types/equipment';
import { assetRefFor } from '../../services/documentAssetService';
import { datasheetFileName } from '../../utils/proposalDatasheets';
import { bytesToDataUrl } from '../../utils/dataUrl';

export const ATTACHMENT_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp';

const MB = 1024 * 1024;
export const formatFileSize = (bytes: number): string =>
  bytes <= 0 ? '' : bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1).replace('.0', '')} MB`;

export const pageCountLabel = (count: number): string => (count <= 0 ? 'Páginas por confirmar' : count === 1 ? '1 página' : `${count} páginas`);

/** Nombre de archivo sin rutas ni caracteres de control, acotado al límite del contrato. */
const safeFileName = (name: string) => name.replace(/[\u0000-\u001f\u007f/\\]+/g, '_').trim().slice(0, QUOTATION_LIMITS.fileName) || 'documento';
const titleOf = (name: string) => name.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' ').trim().slice(0, QUOTATION_LIMITS.label) || 'Documento';

/** Por qué pdf-lib no pudo leer un PDF: protegido (contraseña o permisos), formato no soportado o dañado. */
export type PdfFailure = 'protected' | 'unsupported' | 'damaged';
export function pdfFailure(error: unknown): PdfFailure {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/encrypt/i.test(text)) return 'protected';
  if (/not (yet )?supported|unsupported|unknown (compression|filter)|object stream/i.test(text)) return 'unsupported';
  return 'damaged';
}
const PDF_FAILURE_MESSAGES: Record<PdfFailure, string> = {
  protected: 'El PDF está protegido con contraseña o permisos: no se puede incluir.',
  unsupported: 'El PDF usa un formato que no se puede leer aquí.',
  damaged: 'El PDF está dañado y no se puede leer.',
};
const PDF_SKIP_REASONS: Record<PdfFailure, string> = {
  protected: 'está protegido con contraseña o permisos',
  unsupported: 'usa un formato de PDF no soportado',
  damaged: 'está dañado',
};

/**
 * Orientación EXIF (1–8) de un JPEG, o 1 si no tiene. pdf-lib incrusta los píxeles tal cual: una foto tomada de lado
 * saldría girada sin esto.
 */
export function jpegOrientation(bytes: ArrayBuffer): number {
  const view = new DataView(bytes);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const first = tiff + view.getUint32(tiff + 4, little);
      if (first + 2 > view.byteLength) return 1;
      const entries = view.getUint16(first, little);
      for (let i = 0; i < entries; i++) {
        const entry = first + 2 + i * 12;
        if (entry + 12 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1;
    offset += 2 + size;
  }
  return 1;
}

/** Giro que endereza la imagen (los espejos 2, 4, 5 y 7 se tratan como su giro más próximo). */
const ROTATION: Record<number, 0 | 90 | 180 | 270> = { 1: 0, 2: 0, 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270 };

export type PreparedAttachment = { ok: true; attachment: QuotationAttachment; bytes: ArrayBuffer; type: DocumentFileType } | { ok: false; error: string };

/**
 * Valida un archivo elegido por el usuario por su firma real (PDF, PNG, JPEG o WebP; nunca por la extensión) y su
 * tamaño, cuenta sus páginas y calcula su referencia. Un PDF protegido con contraseña o dañado se rechaza aquí: no se
 * podría fusionar al exportar.
 */
export async function prepareAttachmentFile(
  file: { name: string; bytes: ArrayBuffer },
  { id, now }: { id: string; now: string },
): Promise<PreparedAttachment> {
  const { bytes } = file;
  if (!bytes.byteLength) return { ok: false, error: 'El archivo está vacío.' };
  if (bytes.byteLength > QUOTATION_LIBRARY_LIMITS.attachmentBytes)
    return { ok: false, error: `El archivo supera ${QUOTATION_LIBRARY_LIMITS.attachmentBytes / MB} MB.` };
  const type = sniffDocumentFileType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
  if (!type) return { ok: false, error: 'Formato no admitido: usa PDF, PNG, JPEG o WebP (el contenido del archivo no corresponde a ninguno).' };
  let pageCount = 1;
  if (type === 'application/pdf') {
    try {
      pageCount = (await PDFDocument.load(bytes.slice(0), { updateMetadata: false })).getPageCount();
    } catch (error) {
      return { ok: false, error: PDF_FAILURE_MESSAGES[pdfFailure(error)] };
    }
  }
  const fileName = safeFileName(file.name);
  return {
    ok: true,
    type,
    bytes,
    attachment: {
      id, fileName, fileSize: bytes.byteLength, pageCount, title: titleOf(fileName), uploadedAt: now, mode: 'include', origin: 'manual',
      assetId: await assetRefFor(bytesToDataUrl(bytes, type)),
    },
  };
}

/** Mismo id en todos los equipos para la ficha de un activo: dos equipos no la duplican. */
export const catalogAttachmentId = (assetId: string) => `att-catalog-${assetId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, QUOTATION_LIMITS.id);

/**
 * Fichas técnicas disponibles para las líneas del catálogo de la cotización: equipos con `datasheetAssetId` (PDF en el
 * servidor) que aún no están adjuntos. Sin fichas en el catálogo, la lista sale vacía y solo queda subir a mano.
 */
export function catalogDatasheetCandidates(
  content: Pick<QuotationContent, 'items' | 'attachments'>,
  catalog: readonly SolarEquipmentItem[],
  now: string,
): QuotationAttachment[] {
  const present = new Set(content.attachments.map((a) => a.assetId).filter(Boolean));
  const seen = new Set<string>();
  const out: QuotationAttachment[] = [];
  for (const line of content.items) {
    const item = line.catalogItemId ? catalog.find((c) => c.id === line.catalogItemId) : undefined;
    const assetId = item?.datasheetAssetId;
    if (!item || !assetId || present.has(assetId) || seen.has(assetId)) continue;
    if (item.datasheetName && !item.datasheetName.toLowerCase().endsWith('.pdf')) continue;
    seen.add(assetId);
    out.push({
      id: catalogAttachmentId(assetId), fileName: datasheetFileName(item.displayName).slice(0, QUOTATION_LIMITS.fileName), fileSize: 0, pageCount: 0,
      title: `Ficha técnica — ${item.displayName}`.slice(0, QUOTATION_LIMITS.label), uploadedAt: now, mode: 'include', origin: 'catalog',
      assetId, catalogItemId: item.id,
    });
  }
  return out;
}

export interface AttachmentBytesDeps {
  local: (attachmentId: string) => Promise<ArrayBuffer | null>;
  save: (attachmentId: string, fileName: string, bytes: ArrayBuffer) => Promise<void>;
  /** Bytes de un activo `asset:sha256:` del servidor (`GET /api/document-assets/:sha256/file`). */
  documentAssetBytes: (ref: string) => Promise<ArrayBuffer | null>;
  /** Bytes de una ficha del catálogo (`equipment_assets`). */
  equipmentAsset: (assetId: string) => Promise<Blob | null>;
}

/** Bytes de un adjunto: de este equipo, del servidor (y se guardan aquí para la próxima vez) o `null`. Nunca lanza. */
export async function resolveAttachmentBytes(attachment: QuotationAttachment, deps: AttachmentBytesDeps): Promise<ArrayBuffer | null> {
  try {
    const local = await deps.local(attachment.id);
    if (local) return local;
    if (!attachment.assetId) return null;
    let bytes: ArrayBuffer | null = null;
    if (isAssetRef(attachment.assetId)) bytes = await deps.documentAssetBytes(attachment.assetId);
    else {
      const blob = await deps.equipmentAsset(attachment.assetId);
      bytes = blob ? await blob.arrayBuffer() : null;
    }
    if (!bytes || !sniffDocumentFileType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)))) return null;
    await deps.save(attachment.id, attachment.fileName, bytes).catch(() => undefined);
    return bytes;
  } catch {
    return null;
  }
}

export interface SkippedAttachment { id: string; title: string; reason: string }

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 36;
/** Tope de bytes de adjuntos que se leen en una exportación (cada uno se carga, se copia y se suelta en orden). */
export const MAX_EXPORT_ATTACHMENT_BYTES = 64 * MB;

/**
 * Añade al final del PDF de la cotización los adjuntos `include`, en su orden y de uno en uno (cada uno se carga, se
 * copia y se suelta antes del siguiente): un PDF con todas sus páginas tal cual y una imagen en una página A4 ajustada
 * a los márgenes y enderezada según su orientación EXIF. Un adjunto sin bytes, dañado, protegido, de un formato no
 * soportado o que supera el tope total de la exportación se omite y se informa; nunca rompe la exportación.
 * `toEmbeddable` convierte las imágenes que pdf-lib no incrusta (WebP) en PNG; sin él, se omiten.
 */
export async function mergeQuotationAttachments(
  main: ArrayBuffer,
  items: { attachment: QuotationAttachment; load: () => Promise<ArrayBuffer | null> }[],
  options: { toEmbeddable?: (bytes: ArrayBuffer, type: DocumentFileType) => Promise<ArrayBuffer | null>; maxTotalBytes?: number } = {},
): Promise<{ bytes: Uint8Array; skipped: SkippedAttachment[]; merged: number }> {
  const doc = await PDFDocument.load(main);
  const skipped: SkippedAttachment[] = [];
  const maxTotal = options.maxTotalBytes ?? MAX_EXPORT_ATTACHMENT_BYTES;
  let merged = 0, total = 0;
  const skip = (attachment: QuotationAttachment, reason: string) => skipped.push({ id: attachment.id, title: attachment.title || attachment.fileName, reason });
  for (const { attachment, load } of items) {
    if (attachment.mode !== 'include') continue;
    if (attachment.fileSize > 0 && total + attachment.fileSize > maxTotal) { skip(attachment, 'supera el tamaño total de adjuntos de un PDF'); continue; }
    const bytes = await load().catch(() => null);
    if (!bytes) { skip(attachment, 'no está disponible en este equipo ni en el servidor'); continue; }
    if (total + bytes.byteLength > maxTotal) { skip(attachment, 'supera el tamaño total de adjuntos de un PDF'); continue; }
    total += bytes.byteLength;
    const type = sniffDocumentFileType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
    if (type === 'application/pdf') {
      try {
        const source = await PDFDocument.load(bytes, { updateMetadata: false });
        const pages = await doc.copyPages(source, source.getPageIndices());
        if (!pages.length) { skip(attachment, 'no tiene páginas'); continue; }
        pages.forEach((page) => doc.addPage(page));
        merged++;
      } catch (error) {
        skip(attachment, PDF_SKIP_REASONS[pdfFailure(error)]);
      }
      continue;
    }
    if (!type) { skip(attachment, 'formato no admitido'); continue; }
    try {
      const data = type === 'image/webp' ? (await options.toEmbeddable?.(bytes, type)) ?? null : bytes;
      if (!data) { skip(attachment, 'formato de imagen que no se puede incluir'); continue; }
      const image = type === 'image/jpeg' ? await doc.embedJpg(data) : await doc.embedPng(data);
      const rotation = type === 'image/jpeg' ? ROTATION[jpegOrientation(bytes)] : 0;
      const sideways = rotation === 90 || rotation === 270;
      const [shownWidth, shownHeight] = sideways ? [image.height, image.width] : [image.width, image.height];
      const scale = Math.min((A4[0] - MARGIN * 2) / shownWidth, (A4[1] - MARGIN * 2) / shownHeight, 1);
      const width = image.width * scale, height = image.height * scale;
      const boxW = shownWidth * scale, boxH = shownHeight * scale;
      const left = (A4[0] - boxW) / 2, bottom = (A4[1] - boxH) / 2;
      const page = doc.addPage(A4);
      // pdf-lib gira en sentido antihorario alrededor de (x, y): cada caso coloca ese punto para que la imagen
      // girada ocupe la caja centrada.
      const placed = rotation === 90 ? { x: left, y: bottom + boxH, rotate: degrees(-90) }
        : rotation === 270 ? { x: left + boxW, y: bottom, rotate: degrees(90) }
          : rotation === 180 ? { x: left + boxW, y: bottom + boxH, rotate: degrees(180) }
            : { x: left, y: bottom };
      page.drawImage(image, { width, height, ...placed });
      merged++;
    } catch {
      skip(attachment, 'formato de imagen no soportado');
    }
  }
  return { bytes: await doc.save(), skipped, merged };
}

/** Aviso para el usuario tras exportar con adjuntos omitidos. */
export function skippedAttachmentsMessage(skipped: readonly SkippedAttachment[]): string | null {
  if (!skipped.length) return null;
  const list = skipped.map((s) => `«${s.title}» (${s.reason})`).join(', ');
  return skipped.length === 1 ? `El PDF se generó sin un adjunto: ${list}.` : `El PDF se generó sin ${skipped.length} adjuntos: ${list}.`;
}

/**
 * Los bytes de un adjunto quitado se borran de este equipo solo si es propio (`manual`) y ninguna cotización lo sigue
 * usando con el mismo id (las duplicadas antes de que duplicar diera ids nuevos lo compartían).
 */
export function attachmentBytesUnused(quotations: readonly Pick<QuotationContent, 'attachments'>[], attachment: QuotationAttachment): boolean {
  return attachment.origin === 'manual' && !quotations.some((q) => q.attachments.some((a) => a.id === attachment.id));
}

/** Descarga un adjunto con su nombre (el renderer no abre archivos del sistema: lo guarda el navegador). */
export function downloadAttachmentBytes(bytes: ArrayBuffer, attachment: QuotationAttachment): void {
  const type = sniffDocumentFileType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength))) ?? 'application/octet-stream';
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.fileName || 'documento';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
