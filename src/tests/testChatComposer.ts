import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { offsetWithin, composerKeyAction, createStickController, fitTextarea, composerDropEffect, leavesContainer, shouldRefocusComposer, createStopLatch } from '../features/assistant/chatUi';
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
const sendTag = (html: string) => html.match(/<button[^>]*aria-label="Enviar mensaje"[^>]*>/)?.[0] || '';
assert.match(sendTag(empty), /type="submit"/);
assert.match(sendTag(empty), /\sdisabled=""/, 'send disabled without text, whatever the attribute order');
assert.match(empty, /Escribe un mensaje o adjunta un archivo\./, 'disabled reason is exposed as text (screen-reader only), not only a dimmed button');
const withFiles = renderToStaticMarkup(React.createElement(ChatComposer, { ...base, value: 'Hola', busy: false, canSend: true, attachments: [{ key: 'a', name: 'factura.pdf', onRemove() {} }] }));
assert.match(withFiles, /factura\.pdf/);
assert.match(withFiles, /Enter envía · Shift\+Enter salta línea/, 'keyboard hint when sending is possible');
assert.match(withFiles, /aria-label="Quitar factura\.pdf"/);
assert(sendTag(withFiles), 'send button rendered');
assert.doesNotMatch(sendTag(withFiles), /\sdisabled=""/, 'send enabled with text, whatever the attribute order');
const busy = renderToStaticMarkup(React.createElement(ChatComposer, { ...base, value: '', busy: true, canSend: false, attachments: [] }));
assert.match(busy, /aria-label="Detener"/, 'while busy the send button becomes stop');

// 3. Thinking state with tool steps; suggestions are buttons.
const thinking = renderToStaticMarkup(React.createElement(ChatThinking, { label: 'Consultando la aplicación…', steps: ['Buscar equipos', 'Abrir propuesta'] }));
assert.match(thinking, /role="status"/);
assert.match(thinking, /Buscar equipos[\s\S]*Abrir propuesta/);
assert.match(thinking, /data-state="done"[\s\S]*data-state="active"/, 'previous steps done, last one active');
const suggestions = renderToStaticMarkup(React.createElement(ChatSuggestions, { title: '¿Qué necesitas?', items: ['Uno', 'Dos'], onPick() {} }));
assert.equal((suggestions.match(/<button/g) || []).length, 2);

// 4. Turns: user bubble with file chips; assistant identity; error variant announced with text.
const user = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'user', text: 'Cotiza esto', files: ['a.pdf'] }));
assert.match(user, /assistant-message-user[\s\S]*a\.pdf[\s\S]*Cotiza esto/);
const error = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'assistant', text: 'Falló', variant: 'error' }));
assert.match(error, /assistant-message-error/);
assert.match(error, /No se completó/);
// 5. Elapsed seconds stay out of the live region (no announcement every second).
const timed = renderToStaticMarkup(React.createElement(ChatThinking, { label: 'Pensando', elapsed: 12 }));
assert.match(timed, /<span[^>]*aria-hidden="true"[^>]*>[^<]*12 s<\/span>|<span[^>]*class="chat-thinking-time"[^>]*aria-hidden="true"/);

// 6. Stick-to-bottom: programmatic smooth scroll never unsticks; only the user does.
{
  const m = (top: number) => ({ scrollTop: top, scrollHeight: 2000, clientHeight: 500 });
  const c = createStickController();
  c.beginProgrammatic(0);
  assert.equal(c.onScroll(m(600), 100), null, 'mid-animation event ignored');
  assert.equal(c.stuck, true);
  assert.equal(c.onScroll(m(1500), 200), false, 'reaching the bottom ends the guard and stays anchored');
  assert.equal(c.onScroll(m(900), 300), true, 'user scroll up unsticks');
  assert.equal(c.stuck, false);
  const late = createStickController();
  late.beginProgrammatic(0);
  assert.equal(late.onScroll(m(700), 5000), true, 'after the fallback timeout, events count as the user again');
  const wheel = createStickController();
  wheel.beginProgrammatic(0);
  wheel.userIntent();
  assert.equal(wheel.onScroll(m(700), 50), true, 'wheel/touch/keys during the animation hand control back to the user');
  const end = createStickController();
  end.beginProgrammatic(0);
  end.endProgrammatic();
  assert.equal(end.onScroll(m(700), 50), true, 'scrollend releases the guard');
}

// 6b. A tall reply anchored by its start leaves the controller unstuck: the next dependency change must not drag the view down.
{
  const m = (top: number) => ({ scrollTop: top, scrollHeight: 4000, clientHeight: 500 });
  const c = createStickController();
  c.beginProgrammatic(0, false);
  assert.equal(c.stuck, false, 'anchoring at the start is not following the bottom');
  assert.equal(c.onScroll(m(1200), 50), null, 'the programmatic scroll event is still ignored');
  assert.equal(c.stuck, false);
  assert.equal(c.onScroll(m(3500), 5000), false, 'reaching the bottom later re-anchors');
  assert.equal(c.stuck, true);
}

// 6c. Position inside the scroller does not depend on offsetParent.
{
  const box = (top: number, scrollTop = 0) => ({ getBoundingClientRect: () => ({ top }), scrollTop });
  assert.equal(offsetWithin(box(100, 300), box(450)), 650, 'viewport distance plus the scroll already consumed');
  assert.equal(offsetWithin(box(100, 0), box(100)), 0);
}

// 7. Textarea fit: height and overflow come from one helper (also used on panel resize).
{
  const el = (scrollHeight: number) => ({ scrollHeight, style: { height: '', overflowY: '' } });
  const tall = el(300); fitTextarea(tall, 220);
  assert.deepEqual(tall.style, { height: '220px', overflowY: 'auto' });
  const short = el(48); fitTextarea(short, 220);
  assert.deepEqual(short.style, { height: '48px', overflowY: 'hidden' });
}

// 8. Drag and drop: the drop is always swallowed (Electron would navigate to the file); leave ignores children.
assert.equal(composerDropEffect({ attachDisabled: false }), 'copy');
assert.equal(composerDropEffect({}), 'copy');
assert.equal(composerDropEffect({ attachDisabled: true }), 'none');
const box = { contains: (n: unknown) => n === 'child' };
assert.equal(leavesContainer(box, 'child'), false);
assert.equal(leavesContainer(box, 'outside'), true);
assert.equal(leavesContainer(box, null), true);

// 9. Focus returns to the field only when a reply finishes.
assert.equal(shouldRefocusComposer(true, false), true);
assert.equal(shouldRefocusComposer(false, false), false, 'never on a plain mount/re-render');
assert.equal(shouldRefocusComposer(false, true), false);

// 10. Stop must not resend: the click that stops a reply must not become a submit once the button turns into «Enviar».
{
  const tasks: Array<() => void> = [];
  const latch = createStopLatch((fn) => { tasks.push(fn); });
  assert.equal(latch.blocks(), false, 'nothing blocked before a stop');
  latch.stop();
  assert.equal(latch.blocks(), true, 'a submit in the same click as Detener is swallowed');
  tasks.splice(0).forEach((fn) => fn());
  assert.equal(latch.blocks(), false, 'a later, deliberate send works again');
  const busy = renderToStaticMarkup(React.createElement(ChatComposer, { ...base, busy: true, canSend: false, attachments: [] }));
  assert.match(busy.match(/<button[^>]*aria-label="Detener"[^>]*>/)?.[0] || '', /type="button"/, 'stop is never a submit button');
}

console.log('PASS: chat composer keyboard, disabled reasons, chips, thinking steps and turn styles.');
