import type { AttachedPDFDocument } from '../types';

/**
 * Bookkeeping for the page count of automatic annexes (ProposalAnnexSync). An annex is "attempted" while its bytes are
 * being fetched; a failed fetch (offline, transient error) releases the attempt so the next trigger (catalog change,
 * attachment change, the `online` event) retries it. Nothing here schedules a retry, so being offline never loops.
 */
type AnnexIdentity = Pick<AttachedPDFDocument, 'id' | 'uploadedAt'>;

/** Keyed by id and creation time: a dismissed annex that is restored later is counted again. */
export function annexAttemptKey(att: AnnexIdentity): string {
  return `${att.id}|${att.uploadedAt}`;
}

/** Automatic annexes still waiting for a page count that no run has claimed yet. */
export function annexesToCount(attached: readonly AttachedPDFDocument[] | undefined, attempted: ReadonlySet<string>): AttachedPDFDocument[] {
  return (attached ?? []).filter((att) => att.origin === 'catalog' && att.pageCountPending && !attempted.has(annexAttemptKey(att)));
}

/** A fetch that returned nothing is not final: forget the attempt so the annex can be counted again. */
export function releaseFailedAttempt(attempted: Set<string>, att: AnnexIdentity): void {
  attempted.delete(annexAttemptKey(att));
}
