import assert from 'node:assert/strict';
import { annexAttemptKey, annexesToCount, releaseFailedAttempt, sessionAllowsRetry } from '../utils/annexPageCountAttempts';
import type { AttachedPDFDocument } from '../types';

const annex = (id: string, extra: Partial<AttachedPDFDocument> = {}): AttachedPDFDocument => ({
  id, origin: 'catalog', fileName: `${id}.pdf`, fileSize: 0, pageCount: 1, pageCountPending: true, title: id,
  uploadedAt: '2026-10-21T12:00:00.000Z', enabled: true, addToTableOfContents: false, ...extra,
});

const attached = [annex('a'), annex('b'), annex('done', { pageCountPending: false }), annex('manual', { origin: 'manual' })];
const attempted = new Set<string>();

// First run claims every pending automatic annex.
assert.deepEqual(annexesToCount(attached, attempted).map((att) => att.id), ['a', 'b']);
for (const att of annexesToCount(attached, attempted)) attempted.add(annexAttemptKey(att));
assert.deepEqual(annexesToCount(attached, attempted), [], 'claimed annexes are not counted twice');

// The fetch of "a" fails (offline): releasing it lets the next trigger retry "a" only; "b" stays claimed.
releaseFailedAttempt(attempted, attached[0]);
assert.deepEqual(annexesToCount(attached, attempted).map((att) => att.id), ['a']);
// Still failing: released again, no scheduling happens by itself (the list is just available for the next trigger).
attempted.add(annexAttemptKey(attached[0]));
releaseFailedAttempt(attempted, attached[0]);
assert.deepEqual(annexesToCount(attached, attempted).map((att) => att.id), ['a']);

// A restored annex (new uploadedAt) is a new attempt; undefined attachments are handled.
assert.equal(annexesToCount([annex('a', { uploadedAt: '2026-10-22T00:00:00.000Z' })], new Set([annexAttemptKey(attached[0])])).length, 1);
assert.deepEqual(annexesToCount(undefined, attempted), []);
console.log('Annex page count: failed fetches release their attempt so they can be retried, without loops.');

// Session change => retry: an expired token followed by a new sign-in releases failed attempts without an `online` event.
{
  const expired = { sessionGeneration: 3, authToken: undefined };
  assert.equal(sessionAllowsRetry(expired, { ...expired }), false, 'same session: no retry');
  assert.equal(sessionAllowsRetry(expired, { sessionGeneration: 3, authToken: 'new' }), true, 'signing back in retries');
  assert.equal(sessionAllowsRetry({ sessionGeneration: 3, authToken: 'a' }, { sessionGeneration: 4, authToken: 'a' }), true, 'new session generation retries');
  assert.equal(sessionAllowsRetry({ sessionGeneration: 3, authToken: null }, { sessionGeneration: 3, authToken: undefined }), false, 'null and undefined are the same signed-out state');
}
