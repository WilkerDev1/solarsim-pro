import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { primaryAction, ProposalApplyBar } from '../components/common/ai-invoice/components/ProposalApplyBar';
import { ReviewIssueDigest, digestProgress } from '../components/common/ai-invoice/components/ReviewIssueDigest';
import { describeIssues } from '../components/common/ai-invoice/reviewIssues';
import { ChatMessage } from '../features/assistant/components/ChatMessage';
import { ChatComposer } from '../features/assistant/components/ChatComposer';
import { reusableUserText, isMissingKeyError, replyScrollTarget } from '../features/assistant/chatUi';

// R2. The primary keeps its role but can never apply while blocked or unconfirmed.
{
  assert.deepEqual(primaryAction({ blocking: 6, reviewConfirmed: false, canApply: false }), { mode: 'resolve', label: 'Resolver 6 bloqueos', blocked: true });
  assert.deepEqual(primaryAction({ blocking: 1, reviewConfirmed: true, canApply: true }), { mode: 'resolve', label: 'Resolver 1 bloqueo', blocked: true }, 'blockers win even if canApply were stale');
  assert.deepEqual(primaryAction({ blocking: 0, reviewConfirmed: false, canApply: false }), { mode: 'confirm', label: 'Crear propuesta nueva', blocked: true });
  assert.deepEqual(primaryAction({ blocking: 0, reviewConfirmed: true, canApply: false }), { mode: 'confirm', label: 'Crear propuesta nueva', blocked: true }, 'canApply is the last guard');
  assert.deepEqual(primaryAction({ blocking: 0, reviewConfirmed: true, canApply: true }), { mode: 'apply', label: 'Crear propuesta nueva', blocked: false });

  let created = 0, updated = 0, resolved = 0, focusedCheck = 0;
  const bar = (p: Partial<React.ComponentProps<typeof ProposalApplyBar>>) => React.createElement(ProposalApplyBar, {
    blocking: 0, toConfirm: 0, reviewConfirmed: false, canApply: false, busy: false,
    onConfirmChange() {}, onResolve() { resolved++; }, onCreate() { created++; }, onFocusCheck() { focusedCheck++; }, ...p,
  });
  const blocked = renderToStaticMarkup(bar({ blocking: 6 }));
  const primary = blocked.match(/<button[^>]*class="proposal-primary"[^>]*>/)?.[0] || '';
  assert.match(primary, /aria-disabled="true"/, 'blocked primary is aria-disabled, still focusable');
  assert.doesNotMatch(primary, /\sdisabled=""/);
  assert.match(blocked, /Resolver 6 bloqueos/);
  assert.match(blocked, /Disponible al resolver los bloqueos/);
  assert.doesNotMatch(blocked, /Paso final<\/span>/, 'no visual «Paso final» label; the footer keeps its aria-label');
  // Clicking through the handler guard: only `apply` creates.
  ProposalApplyBar.activate(primaryAction({ blocking: 6, reviewConfirmed: true, canApply: true }), { onResolve: () => resolved++, onCreate: () => created++, onFocusCheck: () => focusedCheck++ });
  ProposalApplyBar.activate(primaryAction({ blocking: 0, reviewConfirmed: false, canApply: false }), { onResolve: () => resolved++, onCreate: () => created++, onFocusCheck: () => focusedCheck++ });
  assert.equal(created, 0, 'never creates while blocked or unconfirmed');
  assert.equal(resolved, 1);
  assert.equal(focusedCheck, 1);
  ProposalApplyBar.activate(primaryAction({ blocking: 0, reviewConfirmed: true, canApply: true }), { onResolve: () => resolved++, onCreate: () => created++, onFocusCheck: () => focusedCheck++ });
  assert.equal(created, 1);
  // Update the open proposal: disabled until it can apply.
  const update = renderToStaticMarkup(bar({ blocking: 0, updateLabel: 'Actualizar SP-1', onUpdate() { updated++; } }));
  assert.match(update.match(/<button[^>]*>Actualizar SP-1<\/button>/)?.[0] || '', /disabled=""/);
  assert.equal(updated, 0);
}

// C3. Digest: header chips + progress, compact rows, «Ver N más», not a live region.
{
  const issues = describeIssues([
    ...Array.from({ length: 5 }, (_, i) => ({ code: 'missing_client', severity: 'error' as const, message: `Bloqueo ${i}` })),
    { code: 'pv_overload', severity: 'warning', message: 'Confirmar 1' },
    { code: 'context_consumption', severity: 'warning', message: 'Nota 1' },
  ]);
  const html = renderToStaticMarkup(React.createElement(ReviewIssueDigest, { issues, onNavigate() {}, peak: 8 }));
  assert.match(html, /aria-live="off"/);
  assert.match(html, /5 bloquean/);
  assert.match(html, /1 por confirmar/);
  assert.match(html, /1 de 8 resueltos/, 'progress from the highest pending count seen');
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="1"|aria-valuenow="1"[^>]*role="progressbar"/);
  assert.equal((html.match(/Bloqueo \d/g) || []).length, 3, 'only the first three blockers before «Ver más»');
  assert.match(html, /Ver 2 más/);
  assert.doesNotMatch(html, /<details[^>]*data-tier="confirm"[^>]*open=""/, '«por confirmar» closed while blockers remain');
  assert.deepEqual(digestProgress(8, 6), { resolved: 2, total: 8 });
  assert.deepEqual(digestProgress(3, 6), { resolved: 0, total: 6 }, 'peak never below current');
}

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
