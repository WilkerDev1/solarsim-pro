import assert from 'node:assert/strict';
import { createShareRequestGuard } from '../components/common/shareRequestGuard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const guard = createShareRequestGuard();
const scope = 'synthetic-api|organization-a|user-a|project-a';
let result: string | null = null;
let loading = false;
async function publish(response: Promise<string>) {
  const current = guard.begin();
  loading = true;
  try {
    const value = await response;
    if (current()) result = value;
  } finally {
    if (current()) loading = false;
  }
}

guard.update(scope, true);
const responseA = deferred<string>();
const pendingA = publish(responseA.promise);
guard.update(scope, false);
guard.update(scope, true);
const responseB = deferred<string>();
const pendingB = publish(responseB.promise);
responseA.resolve('old-opening-url');
await pendingA;
assert.equal(result, null, 'The previous opening cannot display its URL after reopen');
assert.equal(loading, true, 'Old request finally cannot stop a new request loading indicator');
responseB.resolve('current-opening-url');
await pendingB;
assert.equal(result, 'current-opening-url');
assert.equal(loading, false);

const pendingUnmount = guard.begin();
guard.invalidate();
assert.equal(pendingUnmount(), false, 'Unmount and explicit close invalidate responses immediately');
guard.update(scope, true);
assert.equal(pendingUnmount(), false, 'Reopening identical context never revalidates an old request');
const first = guard.begin();
const second = guard.begin();
assert.equal(first(), false, 'Only the latest concurrent publication may update the modal');
assert.equal(second(), true);
guard.update('synthetic-api|organization-b|user-b|project-a', true);
assert.equal(second(), false, 'Scope changes invalidate the current publication');
console.log('Share modal close/reopen, unmount, concurrent request and scope guards passed.');
