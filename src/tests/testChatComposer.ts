import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { composerKeyAction, toolStepLabel } from '../features/assistant/chatUi';
import { ChatComposer, ChatThinking, ChatSuggestions } from '../features/assistant/components/ChatComposer';
import { ChatMessage } from '../features/assistant/components/ChatMessage';

// 1. Keyboard: Enter sends, Shift+Enter breaks the line, IME composition never sends, Ctrl/Cmd+Enter still sends.
const key = (k: Partial<Parameters<typeof composerKeyAction>[0]>) => composerKeyAction({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...k });
assert.equal(key({}), 'send');
assert.equal(key({ shiftKey: true }), null);
assert.equal(key({ isComposing: true }), null);
assert.equal(key({ ctrlKey: true }), 'send');
assert.equal(key({ metaKey: true }), 'send');
assert.equal(key({ key: 'a' }), null);

// 2. Composer: labelled field, icon attach, circular send with an explained disabled state, chips inside the composer.
const base = { id: 'c', label: 'Mensaje al asistente', value: '', onChange() {}, onSubmit() {}, onCancel() {}, onPickFiles() {}, placeholder: 'Escribe…', accept: '.pdf' };
const empty = renderToStaticMarkup(React.createElement(ChatComposer, { ...base, busy: false, canSend: false, disabledReason: 'Escribe un mensaje o adjunta un archivo.', attachments: [] }));
assert.match(empty, /<label[^>]*for="c"[^>]*>Mensaje al asistente<\/label>/);
assert.match(empty, /aria-label="Adjuntar archivos"/);
assert.match(empty, /<button[^>]*type="submit"[^>]*aria-label="Enviar mensaje"[^>]*disabled=""|<button[^>]*disabled=""[^>]*aria-label="Enviar mensaje"/);
assert.match(empty, /Escribe un mensaje o adjunta un archivo\./, 'disabled reason is visible text, not only a dimmed button');
const withFiles = renderToStaticMarkup(React.createElement(ChatComposer, { ...base, value: 'Hola', busy: false, canSend: true, attachments: [{ key: 'a', name: 'factura.pdf', onRemove() {} }] }));
assert.match(withFiles, /factura\.pdf/);
assert.match(withFiles, /Enter envía · Shift\+Enter salta línea/, 'keyboard hint when sending is possible');
assert.match(withFiles, /aria-label="Quitar factura\.pdf"/);
assert.doesNotMatch(withFiles, /aria-label="Enviar mensaje"[^>]*disabled=""/);
const busy = renderToStaticMarkup(React.createElement(ChatComposer, { ...base, value: '', busy: true, canSend: false, attachments: [] }));
assert.match(busy, /aria-label="Detener"/, 'while busy the send button becomes stop');

// 3. Thinking state with tool steps; suggestions are buttons.
const thinking = renderToStaticMarkup(React.createElement(ChatThinking, { label: 'Consultando la aplicación…', steps: ['Buscar equipos', 'Abrir propuesta'] }));
assert.match(thinking, /role="status"/);
assert.match(thinking, /Buscar equipos[\s\S]*Abrir propuesta/);
assert.match(thinking, /data-state="done"[\s\S]*data-state="active"/, 'previous steps done, last one active');
const suggestions = renderToStaticMarkup(React.createElement(ChatSuggestions, { title: '¿Qué necesitas?', items: ['Uno', 'Dos'], onPick() {} }));
assert.equal((suggestions.match(/<button/g) || []).length, 2);
assert.equal(toolStepLabel('open_proposal'), 'Abrir propuesta');
assert.equal(toolStepLabel('tool_that_does_not_exist'), 'tool that does not exist');

// 4. Turns: user bubble with file chips; assistant identity; error variant announced with text.
const user = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'user', text: 'Cotiza esto', files: ['a.pdf'] }));
assert.match(user, /assistant-message-user[\s\S]*a\.pdf[\s\S]*Cotiza esto/);
const error = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'assistant', text: 'Falló', variant: 'error' }));
assert.match(error, /assistant-message-error/);
assert.match(error, /No se completó/);
console.log('PASS: chat composer keyboard, disabled reasons, chips, thinking steps and turn styles.');
