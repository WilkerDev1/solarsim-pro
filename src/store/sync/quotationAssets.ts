import { collectAssetRefs, isAssetRef, assetRefHash } from '../../../shared/documentAssets';
import { sniffDocumentFileType } from '../../../shared/fileSignatures';
import type { QuotationAttachment, QuotationContent } from '../../../shared/quotations';
import { assetRefFor } from '../../services/documentAssetService';
import { bytesToDataUrl } from '../../utils/dataUrl';
import { quotationImages, registerImageRef } from './quotationContent';

export interface QuotationAssetDeps {
  /** Espacio de trabajo de la pasada (las subidas confirmadas son de un servidor y una organización). */
  scope: string;
  /** Contenido confirmado por el servidor (la base del cambio): lo que ya referencia no hace falta subirlo. */
  base?: QuotationContent;
  /** Sube un data URL y devuelve su referencia (`DocumentAssetService.ensureUploaded`); lanza si no se pudo. */
  upload: (dataUrl: string) => Promise<string>;
  /** Bytes de un adjunto guardados en este equipo (`PDFAttachmentStorage`). */
  attachmentBytes: (attachmentId: string) => Promise<ArrayBuffer | null>;
  /** Registro de adjuntos ya subidos (por defecto, el persistente de este equipo). */
  uploads?: UploadedAttachments;
}

/** Adjuntos ya subidos por espacio de trabajo, por id + tamaño + fecha de carga: no se rehashean en cada publicación. */
export interface UploadedAttachments {
  has: (key: string) => boolean;
  add: (key: string) => void;
  /** Olvida las claves cuyo activo el servidor dice no tener (`unknown_document_asset`). */
  forgetHashes: (hashes: readonly string[]) => void;
}

const STORAGE_KEY = 'solarsim-quotation-uploaded-attachments';
const MAX_KEYS = 500;

/** Registro en memoria, guardado en localStorage si está disponible (barato: solo claves cortas). */
export function createUploadedAttachments(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): UploadedAttachments {
  let keys: string[] = [];
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) keys = parsed.filter((k): k is string => typeof k === 'string').slice(-MAX_KEYS);
  } catch {
    keys = [];
  }
  const set = new Set(keys);
  const save = () => { try { storage?.setItem(STORAGE_KEY, JSON.stringify([...set].slice(-MAX_KEYS))); } catch { /* cuota o modo privado */ } };
  return {
    has: (key) => set.has(key),
    add: (key) => { set.add(key); save(); },
    forgetHashes: (hashes) => {
      const lost = new Set(hashes);
      for (const key of [...set]) if (lost.has(key.split('|').pop() ?? '')) set.delete(key);
      save();
    },
  };
}

const defaultUploads = createUploadedAttachments();
export const uploadedQuotationAttachments = defaultUploads;

export const attachmentUploadKey = (scope: string, attachment: QuotationAttachment) =>
  `${scope}|${attachment.id}|${attachment.fileSize}|${attachment.uploadedAt}|${assetRefHash(attachment.assetId ?? '')}`;

/**
 * Antes de publicar una cotización: calcula la referencia de cada imagen en línea (logo, miniaturas, firma y sello
 * fijados) y sube a `/api/document-assets` lo que la base confirmada aún no referencia, más los bytes de los adjuntos
 * de este equipo. Devuelve lo que quedó pendiente: con algo pendiente la cotización NO se publica (se reintenta en la
 * siguiente pasada), así nunca viaja un hueco vacío que borre una imagen ni una referencia que el servidor no tiene.
 * Un adjunto cuyos bytes no están aquí (llegó de otro equipo o de una duplicación) se publica: lo comprueba la API.
 */
export async function publishQuotationAssets(content: QuotationContent, deps: QuotationAssetDeps): Promise<{ pending: string[] }> {
  const confirmed = deps.base ? collectAssetRefs(deps.base) : new Set<string>();
  const uploads = deps.uploads ?? defaultUploads;
  const pending: string[] = [];
  for (const image of quotationImages(content)) {
    if (isAssetRef(image)) continue;
    const ref = await assetRefFor(image);
    registerImageRef(image, ref);
    if (confirmed.has(assetRefHash(ref))) continue;
    try {
      await deps.upload(image);
    } catch {
      pending.push('una imagen');
    }
  }
  for (const attachment of content.attachments ?? []) {
    if (!attachment.assetId || !isAssetRef(attachment.assetId) || confirmed.has(assetRefHash(attachment.assetId))) continue;
    const key = attachmentUploadKey(deps.scope, attachment);
    if (uploads.has(key)) continue;
    const bytes = await deps.attachmentBytes(attachment.id).catch(() => null);
    if (!bytes) continue;
    const type = sniffDocumentFileType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
    const dataUrl = type ? bytesToDataUrl(bytes, type) : null;
    if (!dataUrl || (await assetRefFor(dataUrl)) !== attachment.assetId) continue;
    try {
      await deps.upload(dataUrl);
      uploads.add(key);
    } catch {
      pending.push(`«${attachment.title || attachment.fileName}»`);
    }
  }
  return { pending };
}
