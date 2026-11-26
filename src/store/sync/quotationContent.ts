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

/** What the API accepts: images that are not `asset:sha256:` references are sent empty. */
export function publishableContent(record: QuotationContent): QuotationContent {
  const content = quotationContent(record);
  return {
    ...content,
    issuer: { ...content.issuer, logo: inline(content.issuer?.logo) ? '' : content.issuer?.logo ?? '' },
    attachments: (content.attachments ?? []).map((attachment) => {
      if (!inline(attachment.thumbnailDataUrl)) return attachment;
      const { thumbnailDataUrl: _inline, ...rest } = attachment;
      return rest;
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

/** The server never stores inline images: its empty value keeps the local inline image of the same slot. */
export function keepLocalImages(server: QuotationRecord, local: QuotationRecord | undefined): QuotationRecord {
  if (!local) return server;
  const logo = !server.issuer?.logo && inline(local.issuer?.logo) ? local.issuer.logo : undefined;
  const thumbnails = new Map((local.attachments ?? []).filter((a) => inline(a.thumbnailDataUrl)).map((a) => [a.id, a.thumbnailDataUrl!]));
  const attachments = (server.attachments ?? []).map((a) => (!a.thumbnailDataUrl && thumbnails.has(a.id) ? { ...a, thumbnailDataUrl: thumbnails.get(a.id) } : a));
  const changedAttachments = attachments.some((a, index) => a !== server.attachments[index]);
  if (!logo && !changedAttachments) return server;
  return { ...server, ...(logo ? { issuer: { ...server.issuer, logo } } : {}), ...(changedAttachments ? { attachments } : {}) };
}

/**
 * PUTs needed to move the server copy (`base`, confirmed at the change's base version) to `local`. The API only lets
 * a quotation whose stored status is not `draft` change its status: other edits need a reopen (→ `draft`) first,
 * and a status that is not reachable in one step goes through `issued`. Empty = nothing to publish.
 */
export function planQuotationPush(base: QuotationContent | undefined, local: QuotationContent): QuotationContent[] {
  const target = canonicalQuotationContent(local);
  // A creation is only accepted as `draft` or `issued`: an accepted/rejected one that was never published is created
  // as issued first. (A never-published `void` is discarded by the store without any request.)
  if (!base) return target.status === 'accepted' || target.status === 'rejected' ? [{ ...target, status: 'issued' }, target] : [target];
  let current = canonicalQuotationContent(base);
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
 * Drops `clientId`/`folderId` links to deleted records without touching the printed data. Server tombstones only
 * change the local copy (the authoritative revision arrives with the quotations pull); a local deletion
 * (`markDirty`) also queues editable drafts so the next PUT carries the unlink.
 */
export function dropQuotationLinks(
  state: LinkState,
  field: 'clientId' | 'folderId',
  ids: ReadonlySet<string>,
  options: { markDirty?: { ownerId?: string } } = {},
): Partial<LinkState> {
  if (!state.quotations.some((q) => q[field] && ids.has(q[field]!))) return {};
  let changes = state.quotationChanges;
  const quotations = state.quotations.map((q) => {
    if (!q[field] || !ids.has(q[field]!)) return q;
    const { [field]: _dropped, ...rest } = q;
    if (options.markDirty && q.status === 'draft') {
      const { rejected: _retry, ...kept } = changes[q.id] ?? {
        revision: '', ownerId: options.markDirty.ownerId, baseVersion: q.baseVersion ?? q.version ?? 0,
        ...(q.version ? { base: canonicalQuotationContent(q) } : {}),
      };
      changes = { ...changes, [q.id]: { ...kept, revision: crypto.randomUUID() } };
    }
    return rest as QuotationRecord;
  });
  return changes === state.quotationChanges ? { quotations } : { quotations, quotationChanges: changes };
}
