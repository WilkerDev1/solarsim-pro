import { isAssetRef } from '../../../shared/documentAssets';
import {
  canTransitionQuotation, formatQuotationNumber, isQuotationContentLocked, parseQuotationNumber, quotationNumberYear, validateQuotationContent,
  type QuotationAttachment, type QuotationContent,
} from '../../../shared/quotations';
import { contentEqual } from './projectDifferences';
import type { ConfirmedLocalOnly, QuotationChange, QuotationRecord } from '../../types/quotation';

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
 * Campos opcionales que una API anterior descarta en silencio (valida con un `shared/` previo):
 * - `dismissedSourceDocuments` (lo descarta la 2.10.0): si la copia del servidor no lo trae y la local sí, con la misma
 *   propuesta enlazada;
 * - `alsoSeparate` de cada adjunto (lo descarta la 2.10.1, que rearma cada adjunto solo con las claves que conoce): si
 *   el adjunto del mismo id en el servidor está `include` sin el campo y el local está `include` con él.
 * Eso no cuenta como diferencia y, al instalar la copia del servidor, se conserva lo local. Así funciona igual con la
 * API anterior y con la nueva, sin depender del orden de despliegue (docs/QUOTATIONS.md).
 */
// TODO: cuando la API mínima (`MIN_CLIENT_VERSION` / versión mínima de la API) conozca estos campos, activar este
// relajo solo frente a una API anterior: con la nueva, un servidor sin el campo es un valor real.
const separateLostByServer = (server: QuotationAttachment | undefined, local: QuotationAttachment): boolean =>
  !!server && server.mode === 'include' && server.alsoSeparate === undefined && local.mode === 'include' && local.alsoSeparate === true;

/** Qué campos se relajan en una comparación (por defecto, todos). */
export interface LocalOnlyRelax { dismissed?: boolean; separate?: boolean }

/**
 * Lo que se sabe de la API de un servidor: guarda `dismissedSourceDocuments` / `alsoSeparate` (la nueva) porque un
 * recibo de un PUT que los llevaba los devolvió. Con la API detectada como nueva, un servidor sin el campo es un valor
 * real (otro equipo lo quitó): no se relaja ni se conserva lo local. En memoria, por `serverUrl`: la API nueva lo declara
 * en cada descarga (`declareQuotationApiSupport`); con una que no lo declara, se detecta por el recibo de un PUT.
 */
export interface LocalOnlySupport { dismissed: boolean; separate: boolean }
const NO_SUPPORT: LocalOnlySupport = { dismissed: false, separate: false };
const supportByServer = new Map<string, LocalOnlySupport>();
export const quotationApiSupport = (serverUrl: string | undefined): LocalOnlySupport => supportByServer.get(serverUrl ?? '') ?? NO_SUPPORT;
/** Olvida lo detectado (como un reinicio). Para pruebas. */
export function forgetQuotationApiSupport(): void { supportByServer.clear(); }
/**
 * Lo que la API declara en `GET /api/quotations` (`localOnlyFieldsStored`), leído en cada pasada antes de instalar nada:
 * así lo sabe también tras reiniciar. Sin la declaración (API anterior) se queda lo detectado por recibos.
 */
export function declareQuotationApiSupport(serverUrl: string | undefined, fields: readonly string[] | undefined): void {
  if (!fields) return;
  const known = quotationApiSupport(serverUrl);
  const next = { dismissed: known.dismissed || fields.includes('dismissedSourceDocuments'), separate: known.separate || fields.includes('alsoSeparate') };
  if (next.dismissed !== known.dismissed || next.separate !== known.separate) supportByServer.set(serverUrl ?? '', next);
}
/** Respaldo: recibo de un PUT que llevaba un campo «solo local» y el servidor lo devuelve: esa API lo guarda. */
export function noteQuotationReceipt(serverUrl: string | undefined, sent: QuotationContent, saved: QuotationContent): void {
  const known = quotationApiSupport(serverUrl);
  const savedAttachments = new Map((saved.attachments ?? []).map((a) => [a.id, a]));
  const dismissed = known.dismissed || (!!sent.dismissedSourceDocuments?.length && !!saved.dismissedSourceDocuments?.length);
  const separate = known.separate || (sent.attachments ?? []).some((a) => a.alsoSeparate === true && savedAttachments.get(a.id)?.alsoSeparate === true);
  if (dismissed !== known.dismissed || separate !== known.separate) supportByServer.set(serverUrl ?? '', { dismissed, separate });
}
const relaxFor = (support: LocalOnlySupport, relax: LocalOnlyRelax = {}): LocalOnlyRelax => ({
  dismissed: (relax.dismissed ?? true) && !support.dismissed,
  separate: (relax.separate ?? true) && !support.separate,
});

/**
 * Valores de los campos «solo locales» que tenía la copia del servidor instalada por última vez (antes de conservar
 * lo local). Se guarda en el registro (`confirmedLocalOnly`) para que la base de un cambio sea lo que el servidor tiene
 * de verdad y un cambio de estado de una bloqueada los envíe exactamente así.
 */
export function confirmedLocalOnlyOf(server: QuotationContent): ConfirmedLocalOnly {
  return {
    ...(server.dismissedSourceDocuments ? { dismissedSourceDocuments: [...server.dismissedSourceDocuments] } : {}),
    alsoSeparate: (server.attachments ?? []).filter((a) => a.mode === 'include' && a.alsoSeparate === true).map((a) => a.id),
  };
}

interface LocalOnlyValues { dismissedSourceDocuments?: string[]; separateIds: ReadonlySet<string> }
/** `target` con los campos «solo locales» exactamente como los tiene `source` (lo demás, intacto). */
export function withLocalOnlyOf<T extends QuotationContent>(target: T, source: LocalOnlyValues): T {
  const { dismissedSourceDocuments: _mine, ...rest } = target;
  return {
    ...rest,
    ...(source.dismissedSourceDocuments ? { dismissedSourceDocuments: [...source.dismissedSourceDocuments] } : {}),
    attachments: (target.attachments ?? []).map((a) => {
      const { alsoSeparate: _local, ...plain } = a;
      return a.mode === 'include' && source.separateIds.has(a.id) ? { ...plain, alsoSeparate: true as const } : plain;
    }),
  } as T;
}
const localOnlyOfContent = (content: QuotationContent): LocalOnlyValues => ({
  dismissedSourceDocuments: content.dismissedSourceDocuments,
  separateIds: new Set((content.attachments ?? []).filter((a) => a.mode === 'include' && a.alsoSeparate === true).map((a) => a.id)),
});

/**
 * Contenido confirmado de un registro: el registro con los campos «solo locales» como los tenía el servidor
 * (`confirmedLocalOnly`). Sin esa copia (registros de una versión anterior), el registro tal cual.
 */
export function serverTruth(record: QuotationRecord): QuotationRecord {
  const confirmed = record.confirmedLocalOnly;
  if (!confirmed) return record;
  return withLocalOnlyOf(record, { dismissedSourceDocuments: confirmed.dismissedSourceDocuments, separateIds: new Set(confirmed.alsoSeparate) });
}

/** Clave de los campos «solo locales» de un contenido, para saber si una edición los cambió. */
export const localOnlyKey = (content: QuotationContent): string =>
  JSON.stringify([content.dismissedSourceDocuments ?? null, [...localOnlyOfContent(content).separateIds].sort()]);

const withoutFieldsServerLacks = (local: QuotationContent, server: QuotationContent, { dismissed = true, separate = true }: LocalOnlyRelax = {}): QuotationContent => {
  let out = local;
  if (dismissed && server.dismissedSourceDocuments === undefined && local.dismissedSourceDocuments !== undefined) {
    const { dismissedSourceDocuments: _onlyLocal, ...rest } = local;
    out = rest;
  }
  const serverAttachments = new Map((server.attachments ?? []).map((a) => [a.id, a]));
  if (separate && (local.attachments ?? []).some((a) => separateLostByServer(serverAttachments.get(a.id), a))) {
    out = {
      ...out,
      attachments: local.attachments.map((a) => {
        if (!separateLostByServer(serverAttachments.get(a.id), a)) return a;
        const { alsoSeparate: _onlyLocal, ...rest } = a;
        return rest;
      }),
    };
  }
  return out;
};

/** La copia del servidor con lo que solo conoce este cliente (ver `withoutFieldsServerLacks`). */
export function keepLocalOnlyFields<T extends QuotationContent>(server: T, local: QuotationContent | undefined, support: LocalOnlySupport = NO_SUPPORT): T {
  if (!local) return server;
  let out = server;
  if (!support.dismissed && local.dismissedSourceDocuments && server.dismissedSourceDocuments === undefined && server.sourceProjectId && server.sourceProjectId === local.sourceProjectId)
    out = { ...out, dismissedSourceDocuments: [...local.dismissedSourceDocuments] };
  const localAttachments = new Map((local.attachments ?? []).map((a) => [a.id, a]));
  const lost = (a: QuotationAttachment) => { const mine = localAttachments.get(a.id); return !!mine && separateLostByServer(a, mine); };
  if (!support.separate && (server.attachments ?? []).some(lost))
    out = { ...out, attachments: server.attachments.map((a) => (lost(a) ? { ...a, alsoSeparate: true as const } : a)) };
  return out;
}

/**
 * Misma publicación: `server` es la copia del servidor y `local` la de este equipo (el orden importa). `relax` dice qué
 * campos que el servidor no trae se dan por descartados por una API anterior (por defecto, todos).
 *
 * `alsoSeparate` se conmuta solo (es a menudo el único cambio de una edición), así que solo se relaja cuando el servidor
 * ya pudo recibirlo: al recuperar un recibo perdido con la versión del servidor por delante de la base (quien llama lo
 * decide) y en una bloqueada. Al planear desde la base, la base de una edición ya trae lo conservado (es el registro
 * local confirmado), así que un `alsoSeparate` recién marcado sí es una diferencia y se publica.
 */
export const sameQuotationContent = (server: QuotationContent, local: QuotationContent, relax: LocalOnlyRelax = {}, support: LocalOnlySupport = NO_SUPPORT): boolean =>
  contentEqual(canonicalQuotationContent(server), canonicalQuotationContent(withoutFieldsServerLacks(local, server, relaxFor(support, relax))));

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
export function planQuotationPush(base: QuotationContent | undefined, local: QuotationContent, support: LocalOnlySupport = NO_SUPPORT): QuotationContent[] {
  let target = canonicalQuotationContent(local);
  // A creation is only accepted as `draft` or `issued`: an accepted/rejected one that was never published is created
  // as issued first. (A never-published `void` is discarded by the store without any request.)
  if (!base) return target.status === 'accepted' || target.status === 'rejected' ? [{ ...target, status: 'issued' }, target] : [target];
  let current = canonicalQuotationContent(base);
  // Lo que la base no tiene porque la API anterior lo descarta (`dismissedSourceDocuments`, `alsoSeparate`) no cuenta
  // como edición: una bloqueada no se reabre por él.
  const comparable = (content: QuotationContent) => withoutFieldsServerLacks(content, current, relaxFor(support));
  // Salir de un estado bloqueado (aceptar, rechazar, anular, reabrir) exige el contenido guardado idéntico (si no, 400
  // `quotation_locked`): sin otras ediciones, el PUT lleva los campos «solo locales» exactamente como los tiene la base
  // (la copia del servidor, `serverTruth`); lo local se conserva al instalar el recibo (`keepLocalOnlyFields`). While it
  // stays locked, an image uploaded later never reopens it: a status change keeps the confirmed images.
  if (isQuotationContentLocked(current.status)) {
    const forced = withLocalOnlyOf(isQuotationContentLocked(target.status) ? withImagesOf(target, current) : target, localOnlyOfContent(current));
    if (contentEqual({ ...forced, status: current.status }, current)) {
      // Reabrir con valores locales distintos (p. ej. tras «Conservar la mía»): primero se reabre con lo del servidor y,
      // ya en borrador, se publican los locales (una API anterior los vuelve a descartar; una nueva los guarda).
      if (target.status === 'draft' && !contentEqual(forced, target)) return [forced, target];
      target = forced;
    }
  }
  if (contentEqual(current, target)) return [];
  // Solo añade lo que la API anterior no guarda (`dismissedSourceDocuments`): nada que publicar, o sería un bucle de PUT.
  // Con cualquier otro cambio se publica todo, también el campo, para que la API nueva lo guarde.
  if (sameQuotationContent(base, local, { separate: false }, support)) return [];
  const plan: QuotationContent[] = [];
  const { status: _currentStatus, ...currentRest } = current;
  const { status: _targetStatus, ...targetRest } = comparable(target);
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
      ...(q.version ? { base: canonicalQuotationContent(serverTruth(q)) } : {}),
    };
    changes = { ...changes, [q.id]: { ...kept, revision: crypto.randomUUID() } };
    return rest as QuotationRecord;
  });
  return { quotations, quotationChanges: changes };
}
