import { isAssetRef } from '../../../shared/documentAssets';
import {
  canTransitionQuotation, formatQuotationNumber, isQuotationContentLocked, parseQuotationNumber, quotationNumberYear, validateQuotationContent,
  type QuotationContent,
} from '../../../shared/quotations';
import { contentEqual } from './projectDifferences';
import type { QuotationChange, QuotationRecord } from '../../types/quotation';

const CONTENT_KEYS = [
  'status', 'issueDate', 'validUntil', 'currency', 'exchangeRate', 'clientId', 'client', 'sourceProjectId', 'folderId', 'seller',
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
 * Inline images already uploaded to `/api/document-assets` (data URL → `asset:sha256:` reference). The reference is the
 * sha256 of the exact text, so once known it stands for that image in every comparison and publication.
 */
const uploadedRefs = new Map<string, string>();
const MAX_KNOWN_REFS = 200;
export function registerUploadedImage(dataUrl: string, ref: string): void {
  if (!isAssetRef(ref)) return;
  if (uploadedRefs.size >= MAX_KNOWN_REFS) uploadedRefs.delete(uploadedRefs.keys().next().value!);
  uploadedRefs.set(dataUrl, ref);
}
/** What travels for an image slot: references as they are, uploaded inline images as their reference, the rest empty. */
const published = (image: string | undefined): string => (inline(image) ? uploadedRefs.get(image!) ?? '' : image ?? '');

/** What the API accepts: images that are not `asset:sha256:` references (nor uploaded already) are sent empty. */
export function publishableContent(record: QuotationContent): QuotationContent {
  const content = quotationContent(record);
  return {
    ...content,
    issuer: { ...content.issuer, logo: published(content.issuer?.logo) },
    attachments: (content.attachments ?? []).map((attachment) => {
      if (!inline(attachment.thumbnailDataUrl)) return attachment;
      const { thumbnailDataUrl: local, ...rest } = attachment;
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

export const sameQuotationContent = (left: QuotationContent, right: QuotationContent): boolean =>
  contentEqual(canonicalQuotationContent(left), canonicalQuotationContent(right));

/**
 * The server never stores inline images: its empty value, or the reference of the same uploaded image, keeps the local
 * inline image of the same slot.
 */
export function keepLocalImages(server: QuotationRecord, local: QuotationRecord | undefined): QuotationRecord {
  if (!local) return server;
  const same = (remote: string | undefined, mine: string | undefined) => inline(mine) && (!remote || remote === uploadedRefs.get(mine!));
  const logo = same(server.issuer?.logo, local.issuer?.logo) ? local.issuer.logo : undefined;
  const thumbnails = new Map((local.attachments ?? []).filter((a) => inline(a.thumbnailDataUrl)).map((a) => [a.id, a.thumbnailDataUrl!]));
  const attachments = (server.attachments ?? []).map((a) => (thumbnails.has(a.id) && same(a.thumbnailDataUrl, thumbnails.get(a.id)) ? { ...a, thumbnailDataUrl: thumbnails.get(a.id) } : a));
  const changedAttachments = attachments.some((a, index) => a !== server.attachments[index]);
  if (!logo && !changedAttachments) return server;
  return { ...server, ...(logo ? { issuer: { ...server.issuer, logo } } : {}), ...(changedAttachments ? { attachments } : {}) };
}

/** `target` with the image slots of `base` (logo and thumbnails of the same attachments). */
const withImagesOf = (target: QuotationContent, base: QuotationContent): QuotationContent => {
  const thumbnails = new Map(base.attachments.map((a) => [a.id, a.thumbnailDataUrl]));
  return {
    ...target,
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
