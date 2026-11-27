import { isAssetRef } from '../../../shared/documentAssets';
import {
  canTransitionQuotation, formatQuotationNumber, isQuotationContentLocked, parseQuotationNumber, quotationNumberYear, validateQuotationContent,
  type QuotationContent,
} from '../../../shared/quotations';
import { contentEqual } from './projectDifferences';
import type { QuotationChange, QuotationRecord } from '../../types/quotation';

const CONTENT_KEYS = [
  'status', 'issueDate', 'validUntil', 'currency', 'exchangeRate', 'clientId', 'client', 'sourceProjectId', 'dismissedSourceDocuments', 'folderId', 'seller',
  'projectLabel', 'items', 'discounts', 'notes', 'paymentTerms', 'design', 'attachments', 'issuer',
] as const satisfies readonly (keyof QuotationContent)[];

/** Only the editable content of a record (no identity, number or sync metadata). */
export function quotationContent(record: QuotationContent): QuotationContent {
  const content: Record<string, unknown> = {};
  for (const key of CONTENT_KEYS) if (record[key] !== undefined) content[key] = record[key];
  return content as unknown as QuotationContent;
}

const inline = (image: string | undefined): boolean => !!image && !isAssetRef(image);

/**
 * Reference of each inline image already hashed (data URL → `asset:sha256:`). The reference is the sha256 of the exact
 * text, so it is the same in every workspace: it says what the image is called, not that a server has it (the uploads
 * confirmed per workspace live in `DocumentAssetService`). The sync pass hashes every image before planning a PUT and
 * never publishes a quotation whose new image could not be uploaded.
 */
const knownRefs = new Map<string, string>();
const MAX_KNOWN_REFS = 200;
export function registerImageRef(dataUrl: string, ref: string): void {
  if (!isAssetRef(ref)) return;
  if (knownRefs.size >= MAX_KNOWN_REFS) knownRefs.delete(knownRefs.keys().next().value!);
  knownRefs.set(dataUrl, ref);
}
export const knownImageRef = (dataUrl: string): string | undefined => knownRefs.get(dataUrl);

/**
 * Inline images and attachment references the server refused for good (413/415/other non-retryable 4xx): an image
 * travels as an empty slot and an attachment without its `assetId`, so the rest of the quotation is published. They
 * are re-derived on every pass (a restart simply tries the upload again).
 */
const refusedImages = new Set<string>();
const refusedAttachmentRefs = new Set<string>();
export function markRefusedImage(dataUrl: string): void { refusedImages.add(dataUrl); }
export function markRefusedAttachmentRef(ref: string): void { refusedAttachmentRefs.add(ref); }

/** What travels for an image slot: references as they are, hashed inline images as their reference, the rest empty. */
const published = (image: string | undefined): string =>
  inline(image) ? (refusedImages.has(image!) ? '' : knownRefs.get(image!) ?? '') : image ?? '';

export type QuotationImageSlot = 'logo' | 'thumbnail' | 'signature' | 'stamp';
/** Every image slot of a quotation: logo, attachment thumbnails, and the printed signature and stamp copies. */
export function quotationImageSlots(content: QuotationContent): { slot: QuotationImageSlot; image: string; label: string }[] {
  const slots: { slot: QuotationImageSlot; image: string | undefined; label: string }[] = [
    { slot: 'logo', image: content.issuer?.logo, label: 'el logo del emisor' },
    ...(content.attachments ?? []).map((a) => ({ slot: 'thumbnail' as const, image: a.thumbnailDataUrl, label: `la miniatura de «${a.title || a.fileName}»` })),
    { slot: 'signature', image: content.design?.signature?.image, label: 'la imagen de la firma' },
    { slot: 'stamp', image: content.design?.stampImage, label: 'el sello' },
  ];
  return slots.filter((s): s is { slot: QuotationImageSlot; image: string; label: string } => !!s.image);
}
export function quotationImages(content: QuotationContent): string[] {
  return quotationImageSlots(content).map((s) => s.image);
}

/** What the API accepts: images travel as `asset:sha256:` references (an image never hashed is sent empty). Never mutates. */
export function publishableContent(record: QuotationContent): QuotationContent {
  const content = quotationContent(record);
  let design = content.design;
  if (design && (design.signature || design.stampImage)) {
    const { signature, stampImage, ...rest } = design;
    const stamp = published(stampImage);
    design = {
      ...rest,
      ...(signature ? { signature: { ...signature, image: published(signature.image) } } : {}),
      ...(stamp ? { stampImage: stamp } : {}),
    };
  }
  return {
    ...content,
    design,
    issuer: { ...content.issuer, logo: published(content.issuer?.logo) },
    attachments: (content.attachments ?? []).map((attachment) => {
      let out = attachment;
      if (attachment.assetId && refusedAttachmentRefs.has(attachment.assetId)) {
        const { assetId: _refused, ...rest } = out;
        out = rest;
      }
      if (!inline(out.thumbnailDataUrl)) return out;
      const { thumbnailDataUrl: local, ...rest } = out;
      const ref = published(local);
      return ref ? { ...rest, thumbnailDataUrl: ref } : rest;
    }),
  };
}

/** Normalized publishable content: the form compared against the server copy. */
export function canonicalQuotationContent(record: QuotationContent): QuotationContent {
  const publishable = publishableContent(record);
  const validated = validateQuotationContent(publishable);
  return validated.ok ? validated.value : publishable;
}

/**
 * Campos opcionales que una API anterior descarta en silencio (la 2.10.0 valida con el `shared/` previo):
 * `dismissedSourceDocuments`. Si la copia del servidor no lo trae y la local sí, no cuenta como diferencia y, al
 * instalar la copia del servidor, se conserva el local (solo con la misma propuesta enlazada). Así funciona igual con
 * la API anterior y con la nueva, sin depender del orden de despliegue (docs/QUOTATIONS.md).
 */
const withoutFieldsServerLacks = (local: QuotationContent, server: QuotationContent): QuotationContent => {
  if (server.dismissedSourceDocuments !== undefined || local.dismissedSourceDocuments === undefined) return local;
  const { dismissedSourceDocuments: _onlyLocal, ...rest } = local;
  return rest;
};

/** La copia del servidor con lo que solo conoce este cliente (ver `withoutFieldsServerLacks`). */
export function keepLocalOnlyFields<T extends QuotationContent>(server: T, local: QuotationContent | undefined): T {
  if (!local?.dismissedSourceDocuments || server.dismissedSourceDocuments !== undefined) return server;
  if (!server.sourceProjectId || server.sourceProjectId !== local.sourceProjectId) return server;
  return { ...server, dismissedSourceDocuments: [...local.dismissedSourceDocuments] };
}

/** Misma publicación: `server` es la copia del servidor y `local` la de este equipo (el orden importa). */
export const sameQuotationContent = (server: QuotationContent, local: QuotationContent): boolean =>
  contentEqual(canonicalQuotationContent(server), canonicalQuotationContent(withoutFieldsServerLacks(local, server)));

/**
 * The server never stores inline images: its empty value, or the reference of the same uploaded image, keeps the local
 * inline image of the same slot.
 */
export function keepLocalImages(server: QuotationRecord, local: QuotationRecord | undefined): QuotationRecord {
  if (!local) return server;
  const same = (remote: string | undefined, mine: string | undefined) => inline(mine) && (!remote || remote === knownRefs.get(mine!));
  // The printed copies only keep the local image when the server holds exactly its reference.
  const sameRef = (remote: string | undefined, mine: string | undefined) => inline(mine) && !!remote && remote === knownRefs.get(mine!);
  const logo = same(server.issuer?.logo, local.issuer?.logo) ? local.issuer.logo : undefined;
  const thumbnails = new Map((local.attachments ?? []).filter((a) => inline(a.thumbnailDataUrl)).map((a) => [a.id, a.thumbnailDataUrl!]));
  const attachments = (server.attachments ?? []).map((a) => (thumbnails.has(a.id) && same(a.thumbnailDataUrl, thumbnails.get(a.id)) ? { ...a, thumbnailDataUrl: thumbnails.get(a.id) } : a));
  const changedAttachments = attachments.some((a, index) => a !== server.attachments[index]);
  const signature = server.design?.signature && sameRef(server.design.signature.image, local.design?.signature?.image) ? local.design.signature!.image : undefined;
  const stamp = sameRef(server.design?.stampImage, local.design?.stampImage) ? local.design.stampImage : undefined;
  if (!logo && !changedAttachments && !signature && !stamp) return server;
  const design = signature || stamp
    ? { ...server.design, ...(signature ? { signature: { ...server.design.signature!, image: signature } } : {}), ...(stamp ? { stampImage: stamp } : {}) }
    : server.design;
  return { ...server, design, ...(logo ? { issuer: { ...server.issuer, logo } } : {}), ...(changedAttachments ? { attachments } : {}) };
}

/** `target` with the image slots of `base` (logo, thumbnails of the same attachments, printed signature and stamp). */
const withImagesOf = (target: QuotationContent, base: QuotationContent): QuotationContent => {
  const thumbnails = new Map(base.attachments.map((a) => [a.id, a.thumbnailDataUrl]));
  const { stampImage: _mine, ...designRest } = target.design;
  const design = {
    ...designRest,
    ...(target.design.signature && base.design.signature ? { signature: { ...target.design.signature, image: base.design.signature.image } } : {}),
    ...(base.design.stampImage ? { stampImage: base.design.stampImage } : {}),
  };
  return {
    ...target,
    design,
    issuer: { ...target.issuer, logo: base.issuer.logo },
    attachments: target.attachments.map((a) => {
      const { thumbnailDataUrl: _mine, ...rest } = a;
      const theirs = thumbnails.has(a.id) ? thumbnails.get(a.id) : a.thumbnailDataUrl;
      return theirs ? { ...rest, thumbnailDataUrl: theirs } : rest;
    }),
  };
};

/**
 * PUTs needed to move the server copy (`base`, confirmed at the change's base version) to `local`. The API only lets
 * a quotation whose stored status is not `draft` change its status: other edits need a reopen (→ `draft`) first,
 * and a status that is not reachable in one step goes through `issued`. Empty = nothing to publish.
 */
export function planQuotationPush(base: QuotationContent | undefined, local: QuotationContent): QuotationContent[] {
  let target = canonicalQuotationContent(local);
  // A creation is only accepted as `draft` or `issued`: an accepted/rejected one that was never published is created
  // as issued first. (A never-published `void` is discarded by the store without any request.)
  if (!base) return target.status === 'accepted' || target.status === 'rejected' ? [{ ...target, status: 'issued' }, target] : [target];
  let current = canonicalQuotationContent(base);
  // While it stays locked, an image uploaded later never reopens it: a status change keeps the confirmed images.
  if (isQuotationContentLocked(current.status) && isQuotationContentLocked(target.status)) {
    const kept = withImagesOf(target, current);
    if (contentEqual({ ...kept, status: current.status }, current)) target = kept;
  }
  if (contentEqual(current, target)) return [];
  // Solo añade lo que la API anterior no guarda (`dismissedSourceDocuments`): nada que publicar, o sería un bucle de PUT.
  // Con cualquier otro cambio se publica todo, también el campo, para que la API nueva lo guarde.
  if (sameQuotationContent(base, local)) return [];
  const plan: QuotationContent[] = [];
  const { status: _currentStatus, ...currentRest } = current;
  const { status: _targetStatus, ...targetRest } = target;
  const edited = !contentEqual(currentRest, targetRest);
  if (isQuotationContentLocked(current.status) && (edited || !canTransitionQuotation(current.status, target.status))) {
    if (!canTransitionQuotation(current.status, 'draft')) return [target];
    current = { ...current, status: 'draft' };
    plan.push(current);
  }
  if (current.status === target.status) {
    if (!contentEqual(current, target)) plan.push(target);
  } else if (canTransitionQuotation(current.status, target.status)) {
    plan.push(target);
  } else if (canTransitionQuotation(current.status, 'issued') && canTransitionQuotation('issued', target.status)) {
    plan.push({ ...target, status: 'issued' }, target);
  } else {
    plan.push(target);
  }
  return plan;
}

/** Local workspace numbering: one counter per year of the issue date, never below a number already in use. */
export function nextLocalQuotationNumber(
  counters: Record<string, number>,
  quotations: readonly QuotationRecord[],
  issueDate: string,
): { number: string; counters: Record<string, number> } {
  const year = quotationNumberYear(issueDate);
  const used = quotations.reduce((max, q) => {
    const parsed = q.number ? parseQuotationNumber(q.number) : null;
    return parsed && parsed.year === year ? Math.max(max, parsed.sequence) : max;
  }, 0);
  const sequence = Math.max(counters[String(year)] ?? 0, used) + 1;
  return { number: formatQuotationNumber(year, sequence), counters: { ...counters, [String(year)]: sequence } };
}

type LinkState = { quotations: QuotationRecord[]; quotationChanges: Record<string, QuotationChange> };

/**
 * Local deletion of a client or folder. In the local workspace (no account, `localWorkspace`) every linked quotation
 * loses the link, since no API will unlink them. With an account, editable drafts lose the `clientId`/`folderId` link (printed data untouched)
 * and stay pending so the next PUT carries the unlink. Quotations that are not drafts are never edited here: the API
 * accepts unknown ids and, when the deletion is published, unlinks them itself (the change arrives with the pull).
 * Server tombstones (`deletedIds`) never call this: the API already unlinked its quotations in the same transaction.
 */
export function dropQuotationLinks(
  state: LinkState,
  field: 'clientId' | 'folderId',
  ids: ReadonlySet<string>,
  ownerId: string | undefined,
  options: { localWorkspace?: boolean } = {},
): Partial<LinkState> {
  const linked = (q: QuotationRecord) => !!q[field] && ids.has(q[field]!);
  // Without an account there is no API cascade: every quotation loses the dead link (nothing is published).
  const affected = (q: QuotationRecord) => linked(q) && (q.status === 'draft' || !!options.localWorkspace);
  if (!state.quotations.some(affected)) return {};
  let changes = state.quotationChanges;
  const quotations = state.quotations.map((q) => {
    if (!affected(q)) return q;
    const { [field]: _dropped, ...rest } = q;
    if (q.status !== 'draft') return rest as QuotationRecord;
    const { rejected: _retry, ...kept } = changes[q.id] ?? {
      revision: '', ownerId, baseVersion: q.baseVersion ?? q.version ?? 0,
      ...(q.version ? { base: canonicalQuotationContent(q) } : {}),
    };
    changes = { ...changes, [q.id]: { ...kept, revision: crypto.randomUUID() } };
    return rest as QuotationRecord;
  });
  return { quotations, quotationChanges: changes };
}
