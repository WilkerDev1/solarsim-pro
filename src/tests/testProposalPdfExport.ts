import assert from 'node:assert/strict';
import type { AttachedPDFDocument } from '../types';
import { collectAttachmentBuffers } from '../components/pdf/export/proposalAttachmentCollection';
import { isEditorChrome, stripEditorChrome } from '../components/pdf/export/editorChrome';

const att = (id: string, enabled = true): AttachedPDFDocument => ({
  id, fileName: `${id}.pdf`, fileSize: 1, pageCount: 1, title: id, uploadedAt: '2026-10-21T00:00:00.000Z', enabled, addToTableOfContents: false,
});
const bytes = (n: number) => new Uint8Array([n]).buffer;

// Characterization: export merges enabled attachments in their stored order and silently skips missing bytes.
const resolved = await collectAttachmentBuffers([att('a'), att('off', false), att('missing'), att('b')], async (a) =>
  a.id === 'missing' ? null : bytes(a.id.charCodeAt(0)));
assert.deepEqual(resolved.ready.map((r) => r.name), ['a.pdf', 'b.pdf']);
assert.deepEqual(resolved.missing.map((m) => m.id), ['missing']);
assert.equal(new Uint8Array(resolved.ready[1].buffer)[0], 'b'.charCodeAt(0));

// A resolver that throws counts as missing instead of aborting the whole export.
const failing = await collectAttachmentBuffers([att('x')], async () => { throw new Error('offline'); });
assert.deepEqual(failing, { ready: [], missing: [failing.missing[0]] });
assert.equal(failing.missing[0].id, 'x');

assert.deepEqual(await collectAttachmentBuffers([], async () => bytes(1)), { ready: [], missing: [] });
// Editor chrome never reaches the PDF: chrome nodes are removed from the clone and ignored by html2canvas,
// and editing attributes are cleared from the remaining text.
const removed: string[] = [];
const cleared: string[] = [];
const node = (id: string, attrs: Record<string, string>) => ({
  id,
  hasAttribute: (name: string) => name in attrs,
  removeAttribute: (name: string) => { cleared.push(`${id}:${name}`); delete attrs[name]; },
  remove: () => removed.push(id),
});
const chrome = [node('badge', { 'data-pdf-chrome': '' }), node('toolbar', { 'data-pdf-chrome': '' })];
const editable = [node('text', { contenteditable: 'true', 'data-doc-text': 'client.name', role: 'button', tabindex: '0' })];
const fakeRoot = {
  querySelectorAll: (selector: string) => (selector === '[data-pdf-chrome]' ? chrome : selector === '[contenteditable],[data-doc-text]' ? editable : []),
};
assert.equal(stripEditorChrome(fakeRoot), 2);
assert.deepEqual(removed, ['badge', 'toolbar']);
assert.deepEqual(cleared.sort(), ['text:contenteditable', 'text:role', 'text:tabindex']);
assert.equal(isEditorChrome(node('x', { 'data-pdf-chrome': '' }) as unknown as Element), true);
assert.equal(isEditorChrome(node('y', {}) as unknown as Element), false);

console.log('PASS: proposal export collects enabled attachments in order and reports missing bytes.');
