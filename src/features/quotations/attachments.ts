/**
 * Adjuntos de una cotización (docs/QUOTATION_EDITOR.md#adjuntos): preparar un archivo subido, armar las fichas técnicas
 * del catálogo, localizar sus bytes y fusionarlos al PDF exportado. Los bytes viven en este equipo
 * (`PDFAttachmentStorage`, por id de adjunto) y en el servidor como activo `asset:sha256:` (subidos al publicar); las
 * fichas del catálogo, en `equipment_assets` (su `assetId` es el id del activo del equipo).
 */
import { PDFDocument } from 'pdf-lib';
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
      const encrypted = error instanceof Error && /encrypt/i.test(error.name + error.message);
      return { ok: false, error: encrypted ? 'El PDF está protegido con contraseña: no se puede incluir.' : 'El PDF está dañado y no se puede leer.' };
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
  /** Contenido (data URL) de un activo `asset:sha256:` del servidor. */
  documentAsset: (ref: string) => Promise<string | null>;
  /** Bytes de una ficha del catálogo (`equipment_assets`). */
  equipmentAsset: (assetId: string) => Promise<Blob | null>;
  decode: (dataUrl: string) => Uint8Array | null;
}

/** Bytes de un adjunto: de este equipo, del servidor (y se guardan aquí para la próxima vez) o `null`. Nunca lanza. */
export async function resolveAttachmentBytes(attachment: QuotationAttachment, deps: AttachmentBytesDeps): Promise<ArrayBuffer | null> {
  try {
    const local = await deps.local(attachment.id);
    if (local) return local;
    if (!attachment.assetId) return null;
    let bytes: ArrayBuffer | null = null;
    if (isAssetRef(attachment.assetId)) {
      const content = await deps.documentAsset(attachment.assetId);
      const decoded = content ? deps.decode(content) : null;
      bytes = decoded ? decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer : null;
    } else {
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

/**
 * Añade al final del PDF de la cotización los adjuntos `include`, en su orden: un PDF con todas sus páginas tal cual y
 * una imagen en una página A4 ajustada a los márgenes. Un adjunto sin bytes, dañado, protegido con contraseña o de un
 * tipo que no se puede incrustar se omite y se informa; nunca rompe la exportación. `toEmbeddable` convierte las imágenes
 * que pdf-lib no incrusta (WebP) en PNG; sin él, se omiten.
 */
export async function mergeQuotationAttachments(
  main: ArrayBuffer,
  items: { attachment: QuotationAttachment; bytes: ArrayBuffer | null }[],
  toEmbeddable?: (bytes: ArrayBuffer, type: DocumentFileType) => Promise<ArrayBuffer | null>,
): Promise<{ bytes: Uint8Array; skipped: SkippedAttachment[]; merged: number }> {
  const doc = await PDFDocument.load(main);
  const skipped: SkippedAttachment[] = [];
  let merged = 0;
  const skip = (attachment: QuotationAttachment, reason: string) => skipped.push({ id: attachment.id, title: attachment.title || attachment.fileName, reason });
  for (const { attachment, bytes } of items) {
    if (attachment.mode !== 'include') continue;
    if (!bytes) { skip(attachment, 'no está disponible en este equipo ni en el servidor'); continue; }
    const type = sniffDocumentFileType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
    try {
      if (type === 'application/pdf') {
        const source = await PDFDocument.load(bytes.slice(0), { updateMetadata: false });
        const pages = await doc.copyPages(source, source.getPageIndices());
        if (!pages.length) { skip(attachment, 'no tiene páginas'); continue; }
        pages.forEach((page) => doc.addPage(page));
      } else if (type) {
        const data = type === 'image/webp' ? (await toEmbeddable?.(bytes, type)) ?? null : bytes;
        if (!data) { skip(attachment, 'formato de imagen que no se puede incluir'); continue; }
        const image = type === 'image/jpeg' ? await doc.embedJpg(data) : await doc.embedPng(data);
        const page = doc.addPage(A4);
        const scale = Math.min((A4[0] - MARGIN * 2) / image.width, (A4[1] - MARGIN * 2) / image.height, 1);
        const width = image.width * scale, height = image.height * scale;
        page.drawImage(image, { x: (A4[0] - width) / 2, y: (A4[1] - height) / 2, width, height });
      } else {
        skip(attachment, 'formato no admitido');
        continue;
      }
      merged++;
    } catch (error) {
      const encrypted = error instanceof Error && /encrypt/i.test(error.name + error.message);
      skip(attachment, encrypted ? 'está protegido con contraseña' : 'está dañado');
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
