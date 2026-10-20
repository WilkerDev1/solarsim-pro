import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { confirmAction, confirmKeyAction, confirmQueue, createConfirmQueue, initialConfirmFocus } from '../components/common/confirmAction';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

// Resolution: confirm → true, cancel → false, and the dialog closes.
{
  const queue = createConfirmQueue();
  const accepted = queue.request({ title: 'Eliminar', message: '¿Seguro?' });
  assert.equal(queue.current()?.title, 'Eliminar');
  queue.resolve(true);
  assert.equal(await accepted, true);
  assert.equal(queue.current(), null);
  const rejected = queue.request({ title: 'Eliminar', message: '¿Seguro?' });
  queue.resolve(false);
  assert.equal(await rejected, false);
}

// Two simultaneous confirmations queue: the second waits until the first is answered.
{
  const queue = createConfirmQueue();
  const seen: (string | undefined)[] = [];
  queue.subscribe(() => seen.push(queue.current()?.title));
  const first = queue.request({ title: 'Primera', message: 'a' });
  const second = queue.request({ title: 'Segunda', message: 'b' });
  assert.equal(queue.current()?.title, 'Primera');
  queue.resolve(false);
  assert.equal(await first, false);
  assert.equal(queue.current()?.title, 'Segunda', 'la segunda confirmación aparece al responder la primera');
  queue.resolve(true);
  assert.equal(await second, true);
  assert.equal(queue.current(), null);
  assert.deepEqual(seen, ['Primera', 'Segunda', undefined]);
  queue.resolve(true); // answering with nothing pending is a no-op
  assert.equal(queue.current(), null);
}

// Keyboard: Escape cancels, Enter confirms (except on the focused Cancel button, which cancels natively), Tab stays inside.
assert.equal(confirmKeyAction({ key: 'Escape', shiftKey: false, focused: 'confirm' }), 'cancel');
assert.equal(confirmKeyAction({ key: 'Escape', shiftKey: false, focused: 'cancel' }), 'cancel');
assert.equal(confirmKeyAction({ key: 'Enter', shiftKey: false, focused: 'confirm' }), 'confirm');
assert.equal(confirmKeyAction({ key: 'Enter', shiftKey: false, focused: null }), 'confirm');
assert.equal(confirmKeyAction({ key: 'Enter', shiftKey: false, focused: 'cancel' }), null);
assert.equal(confirmKeyAction({ key: 'Tab', shiftKey: false, focused: 'cancel' }), 'focus-confirm');
assert.equal(confirmKeyAction({ key: 'Tab', shiftKey: false, focused: 'confirm' }), 'focus-cancel');
assert.equal(confirmKeyAction({ key: 'Tab', shiftKey: true, focused: 'cancel' }), 'focus-confirm');
assert.equal(confirmKeyAction({ key: 'a', shiftKey: false, focused: 'cancel' }), null);

// Destructive actions start on Cancel; the rest start on the confirm button.
assert.equal(initialConfirmFocus('danger'), 'cancel');
assert.equal(initialConfirmFocus('default'), 'confirm');
assert.equal(initialConfirmFocus(undefined), 'confirm');

// Rendering: nothing without a request; an accessible alertdialog themed with dark: classes otherwise.
assert.equal(renderToStaticMarkup(React.createElement(ConfirmDialog)), '');
const pending = confirmAction({ title: 'Eliminar propuesta', message: 'Línea 1\n\nLínea 2', confirmLabel: 'Eliminar', tone: 'danger' });
const html = renderToStaticMarkup(React.createElement(ConfirmDialog));
assert.match(html, /role="alertdialog"/);
assert.match(html, /aria-modal="true"/);
const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
assert.ok(labelledBy && html.includes(`id="${labelledBy}"`), 'el título etiqueta el diálogo');
assert.ok(describedBy && html.includes(`id="${describedBy}"`), 'el mensaje describe el diálogo');
assert.match(html, />Eliminar propuesta</);
assert.match(html, /Línea 1\n\nLínea 2/);
assert.match(html, /whitespace-pre-line/, 'los saltos de línea del mensaje se conservan');
assert.match(html, />Cancelar</);
assert.match(html, />Eliminar</);
assert.match(html, /data-tone="danger"/);
assert.match(html, /dark:/, 'el tema oscuro usa clases dark:');
confirmQueue.resolve(false);
assert.equal(await pending, false);
const plain = confirmAction({ title: 'Restablecer', message: 'x' });
assert.match(renderToStaticMarkup(React.createElement(ConfirmDialog)), />Confirmar</, 'etiqueta por defecto');
confirmQueue.resolve(true);
assert.equal(await plain, true);

// Guard: no native confirm() in app code.
const srcRoot = path.resolve(import.meta.dirname, '..');
const offenders: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { if (full !== path.join(srcRoot, 'tests')) walk(full); continue; }
    if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
    readFileSync(full, 'utf8').split('\n').forEach((line, index) => {
      if (/(^|[^\w.$])confirm\s*\(|\b(window|globalThis|self)\s*\.\s*confirm\s*\(/.test(line)) offenders.push(`${path.relative(srcRoot, full)}:${index + 1}`);
    });
  }
};
walk(srcRoot);
assert.deepEqual(offenders, [], `confirm() nativo encontrado; usa confirmAction():\n${offenders.join('\n')}`);

console.log('Confirm dialog queues, resolves, handles keys, renders accessibly and no native confirm() remains.');
