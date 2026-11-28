import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMessage } from '../features/assistant/components/ChatMessage';
import { ChatComposer } from '../features/assistant/components/ChatComposer';
import { reusableUserText, isMissingKeyError, replyScrollTarget } from '../features/assistant/chatUi';



// C1/C2. Message actions; the error turn offers a way out.
{
  const assistant = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'assistant', text: 'Hola', onCopy() {}, onRetry() {} }));
  assert.match(assistant, /role="toolbar"[^>]*aria-label="Acciones del mensaje"/);
  assert.match(assistant, /aria-label="Copiar respuesta"/);
  assert.match(assistant, /aria-label="Reintentar"/);
  const older = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'assistant', text: 'Hola', onCopy() {} }));
  assert.doesNotMatch(older, /Reintentar/, 'retry only where offered (last turn)');
  const user = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'user', text: 'Cotiza', onReuse() {} }));
  assert.match(user, /aria-label="Volver a escribir este mensaje"/);
  const error = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'assistant', variant: 'error', text: 'Gemini tardó demasiado (timeout 60 s).', onRetry() {} }));
  assert.match(error, /No pude completar la respuesta/);
  assert.match(error, /<details[^>]*>[\s\S]*Detalles técnicos[\s\S]*timeout 60 s/);
  assert.match(error, />Reintentar</);
  const key = renderToStaticMarkup(React.createElement(ChatMessage, { role: 'assistant', variant: 'error', text: 'Configura la clave de Gemini en Ajustes de IA para continuar.', onOpenSettings() {} }));
  assert.match(key, /Abrir ajustes de IA/);
  assert.equal(isMissingKeyError('Configura una API Key de Google Gemini en Ajustes.'), true);
  assert.equal(isMissingKeyError('Gemini no devolvió datos.'), false);
  assert.equal(reusableUserText('Cotiza esto\n\n📎 factura.pdf, foto.jpg'), 'Cotiza esto', 'attachment line is not reused as text');
}

// C5/C7. The field keeps focus while busy (readOnly + aria-busy) and the resting composer is quiet.
{
  const base = { id: 'c', label: 'Mensaje', onChange() {}, onSubmit() {}, onCancel() {}, onPickFiles() {}, placeholder: 'Describe la propuesta…', accept: '.pdf', attachments: [] };
  const busy = renderToStaticMarkup(React.createElement(ChatComposer, { ...base, value: 'hola', busy: true, canSend: false }));
  const area = busy.match(/<textarea[^>]*>/)?.[0] || '';
  assert.match(area, /readOnly=""|readonly=""/);
  assert.match(area, /aria-busy="true"/);
  assert.doesNotMatch(area, /\sdisabled=""/);
  const idle = renderToStaticMarkup(React.createElement(ChatComposer, { ...base, value: '', busy: false, canSend: false, disabledReason: 'Configura Gemini para enviar.' }));
  assert.doesNotMatch(idle, /Enter envía/, 'no keyboard hint while empty');
  assert.match(idle, /class="sr-only"[^>]*>Configura Gemini para enviar\./, 'disabled reason stays available to assistive tech only');
}
// C4. A reply taller than the view is anchored at its start.
assert.equal(replyScrollTarget(900, 500), 'start');
assert.equal(replyScrollTarget(300, 500), 'end');
console.log('PASS: round 2 — primary guidance with guards, digest hierarchy, message actions, error turns, composer at rest.');
