import assert from 'node:assert/strict';
import { CHAT_FILE_LIMITS, detectChatFileType, getChatFile, registerChatFile, forgetChatFiles } from '../features/assistant/chatFiles';
import { runAssistant } from '../features/assistant/service';
import type { GeminiTransport } from '../../shared/geminiTransport';

const pdf = new TextEncoder().encode('%PDF-1.7 synthetic').buffer;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
assert.equal(detectChatFileType(pdf), 'application/pdf');
assert.equal(detectChatFileType(png), 'image/png');
assert.equal(detectChatFileType(new TextEncoder().encode('<html>').buffer), undefined);
assert.throws(() => registerChatFile('factura.exe', new TextEncoder().encode('MZ').buffer), /solo se admiten/);
assert.throws(() => registerChatFile('grande.pdf', new ArrayBuffer(CHAT_FILE_LIMITS.maxBytes + 1)), /8 MB/);
const file = registerChatFile('factura.pdf', pdf);
assert.equal(getChatFile(file.id)?.name, 'factura.pdf');

let seen: any;
const transport: GeminiTransport = async (_url, body: any) => {
  seen = body;
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Leí la factura.' }] } }] };
};
const reply = await runAssistant({ apiKey: 'synthetic', model: 'synthetic', prompt: 'Resume la factura', history: [{ role: 'user', text: 'antes' }],
  signal: new AbortController().signal, execute: () => ({ data: null }), transport, files: [file] });
assert.equal(reply.text, 'Leí la factura.');
const last = seen.contents.at(-1).parts;
assert.equal(last[0].text, 'Resume la factura');
assert.match(last[1].text, new RegExp(file.id));
assert.equal(last[2].inlineData.mimeType, 'application/pdf');
assert.equal(atob(last[2].inlineData.data).slice(0, 5), '%PDF-');
assert.equal(seen.contents[0].parts.length, 1, 'history stays text-only');
forgetChatFiles([file.id]);
assert.equal(getChatFile(file.id), undefined);
console.log('PASS: chat files validated by signature and size, sent inline only with the current prompt, addressable by id.');
