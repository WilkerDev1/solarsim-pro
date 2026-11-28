import assert from 'node:assert/strict';
import { CHAT_FILE_LIMITS, detectChatFileType, getChatFile, registerChatFile, forgetChatFiles } from '../features/assistant/chatFiles';

const pdf = new TextEncoder().encode('%PDF-1.7 synthetic').buffer;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
assert.equal(detectChatFileType(pdf), 'application/pdf');
assert.equal(detectChatFileType(png), 'image/png');
assert.equal(detectChatFileType(new TextEncoder().encode('<html>').buffer), undefined);
assert.throws(() => registerChatFile('factura.exe', new TextEncoder().encode('MZ').buffer), /solo se admiten/);
assert.throws(() => registerChatFile('grande.pdf', new ArrayBuffer(CHAT_FILE_LIMITS.maxBytes + 1)), /8 MB/);
const file = registerChatFile('factura.pdf', pdf);
assert.equal(getChatFile(file.id)?.name, 'factura.pdf');

forgetChatFiles([file.id]);
assert.equal(getChatFile(file.id), undefined);
console.log('PASS: chat files validated by signature and size, addressable by id (el envío en línea con el mensaje actual lo cubre testAssistantSession).');
