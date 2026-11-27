// Correo de la cotización (docs/QUOTATION_EDITOR.md#correo): asunto y cuerpo generados por una función pura, enlace
// `mailto:` sin inyección de cabeceras y con tope de longitud, lista de adjuntos (el PDF con sus incluidos y los
// «solo relacionado» aparte), enlaces externos permitidos y render del conmutador «PDF | Correo» y de la vista de
// correo en borrador, emitida y LECTOR. Mirar el correo nunca escribe en el store.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { emptyQuotationContent, type QuotationAttachment, type QuotationContent } from '../../shared/quotations';
import { isOpenableExternalUrl } from '../../shared/externalUrl';
import type { QuotationRecord } from '../types/quotation';

registerHooks({ load: (url, context, next) => (url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context)) });
const {
  EMPTY_EMAIL_DRAFT, MAILTO_MAX_LENGTH, SUBJECT_MAX_CHARS, buildMailtoUrl, editEmailDraft, emailDraftView, isValidEmailAddress, limitSubject,
  quotationEmailAttachments, quotationEmailBody, quotationEmailContext, quotationEmailRecipient, quotationEmailSignature, quotationEmailSummary,
  quotationEmailText, resetEmailDraft, summarizePaymentTerms,
} = await import('../features/quotations/quotationEmail');
const { openExternalUrl } = await import('../utils/openExternalUrl');

const base = (overrides: Partial<QuotationContent> = {}) => emptyQuotationContent('2026-11-23', {
  exchangeRate: 60,
  seller: 'Mayler Capellán',
  projectLabel: 'Alimentación de planta eléctrica',
  validUntil: '2026-12-08',
  paymentTerms: '70% con la orden, 30% al concluir',
  client: { name: 'Sr. Miguel Bona', attention: '', taxId: '', phone: '829-696-9863', email: 'miguel@example.com', address: '' },
  issuer: { name: 'M&A Electsun SRL', taxId: '1-31-00000-1', address: '', phone: '809-378-6590', email: 'ventas@example.com', website: '', logo: '' },
  items: [{ id: 'l1', kind: 'item', description: 'Breaker europeo 63 A / 2P', quantity: 1, unit: 'UD', unitPriceCents: 98000, discountPct: 0, taxable: true }],
  ...overrides,
});
const source = (number: string | null, overrides: Partial<QuotationContent> = {}) => ({ ...base(overrides), number });

// --- Asunto y cuerpo ---------------------------------------------------------------------------------------------
const issued = source('COT-2026-0147');
const text = quotationEmailText(issued);
assert.equal(text.subject, 'Cotización COT-2026-0147 — M&A Electsun SRL');
assert.ok(text.opening.startsWith('Hola, Sr. Miguel Bona:'), text.opening);
assert.ok(text.opening.includes('Adjuntamos la cotización'), 'redacción de una emitida');
assert.equal(text.closing, 'Quedamos atentos a cualquier consulta.');
const summary = quotationEmailSummary(issued);
assert.equal(summary.reference, 'COT-2026-0147');
assert.equal(summary.total, 'RD$ 1,156.40', 'total con computeQuotationTotals (980 + ITBIS) y moneda');
assert.deepEqual(summary.rows.map((r) => r.label), ['Proyecto', 'Válida hasta', 'Forma de pago']);
assert.equal(summary.rows[1].value, '8 dic 2026');
assert.deepEqual(quotationEmailSignature(issued), ['Mayler Capellán', 'M&A Electsun SRL · 809-378-6590']);
const body = quotationEmailBody(text, summary, quotationEmailSignature(issued));
for (const piece of ['Hola, Sr. Miguel Bona:', 'Cotización: COT-2026-0147', 'Total: RD$ 1,156.40', 'Proyecto: Alimentación de planta eléctrica', 'Válida hasta: 8 dic 2026', 'Forma de pago: 70% con la orden, 30% al concluir', 'Quedamos atentos', 'Mayler Capellán\nM&A Electsun SRL · 809-378-6590']) {
  assert.ok(body.includes(piece), `cuerpo: ${piece}`);
}
assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(body), 'sin emojis');
assert.ok(body.indexOf('Hola') < body.indexOf('Total:') && body.indexOf('Total:') < body.indexOf('Quedamos'), 'orden: saludo, resumen, despedida');

// Sin número: «Borrador», redacción coherente.
const draft = source(null);
const draftText = quotationEmailText(draft);
assert.equal(draftText.subject, 'Cotización en borrador — M&A Electsun SRL');
assert.ok(draftText.opening.includes('el borrador de la cotización'), draftText.opening);
assert.equal(quotationEmailSummary(draft).reference, 'Borrador');
assert.ok(!quotationEmailBody(draftText, quotationEmailSummary(draft), []).includes('null'));

// Atención: se saluda a la persona; sin cliente: saludo genérico; sin emisor: el asunto no queda colgando.
assert.ok(quotationEmailText(source('COT-2026-0001', { client: { ...base().client, name: 'Hotel Caribe SRL', attention: 'Ing. Laura Peña' } })).opening.startsWith('Hola, Ing. Laura Peña:'));
const anonymous = source('COT-2026-0001', { client: { name: '', attention: '', taxId: '', phone: '', email: '', address: '' }, issuer: { ...base().issuer, name: '', phone: '' }, seller: '', projectLabel: '', validUntil: null, paymentTerms: '' });
assert.ok(quotationEmailText(anonymous).opening.startsWith('Hola:'));
assert.equal(quotationEmailText(anonymous).subject, 'Cotización COT-2026-0001');
assert.deepEqual(quotationEmailSummary(anonymous).rows, [], 'sin proyecto, vigencia ni condiciones no hay filas');
assert.deepEqual(quotationEmailSignature(anonymous), []);
assert.ok(!/undefined|null|: \n/.test(quotationEmailBody(quotationEmailText(anonymous), quotationEmailSummary(anonymous), [])));
// Sin emisor pero con proyecto: el asunto nombra el proyecto.
assert.equal(quotationEmailText(source('COT-2026-0002', { issuer: { ...base().issuer, name: '' } })).subject, 'Cotización COT-2026-0002 — Alimentación de planta eléctrica');

// USD.
const usd = source('COT-2026-0003', { currency: 'USD', items: [{ id: 'l1', kind: 'item', description: 'Panel', quantity: 2, unit: 'UD', unitPriceCents: 1845000, discountPct: 0, taxable: false }] });
assert.equal(quotationEmailSummary(usd).total, 'US$ 36,900.00');

// Condiciones de pago resumidas: primera línea, acotada por palabra con «…».
assert.equal(summarizePaymentTerms('70% con la orden\n30% al concluir'), '70% con la orden…');
assert.equal(summarizePaymentTerms('   '), '');
const longTerms = summarizePaymentTerms('Pago '.repeat(80));
assert.ok(longTerms.length <= 121 && longTerms.endsWith('…'), longTerms);
// Textos largos: el asunto se acota y nunca lleva saltos de línea.
const longSubject = quotationEmailText(source('COT-2026-0004', { issuer: { ...base().issuer, name: 'Empresa\nmuy larga '.repeat(40) } })).subject;
assert.ok(Array.from(longSubject).length <= 200 && !/[\r\n]/.test(longSubject) && longSubject.endsWith('…'), longSubject);

// --- Destinatario ------------------------------------------------------------------------------------------------
assert.equal(isValidEmailAddress('miguel@example.com'), true);
for (const bad of ['', 'miguel', 'a@b', 'a b@c.com', 'a@b.com,c@d.com', 'a@b.com\r\nBcc: x@y.com', 'a@b.com?cc=x@y.com', '<a@b.com>', 'a@@b.com', `${'a'.repeat(250)}@b.com`]) {
  assert.equal(isValidEmailAddress(bad), false, `inválido: ${JSON.stringify(bad)}`);
}
assert.deepEqual(quotationEmailRecipient({ ...base().client, email: '  miguel@example.com \n' }), { address: 'miguel@example.com', valid: true });
assert.deepEqual(quotationEmailRecipient({ ...base().client, email: '' }), { address: '', valid: false });
assert.equal(quotationEmailRecipient({ ...base().client, email: 'miguel@example' }).valid, false);

// --- mailto: -----------------------------------------------------------------------------------------------------
const plain = buildMailtoUrl({ to: 'miguel@example.com', subject: 'Cotización COT-2026-0147 — M&A', body: 'Hola:\n\nLínea 2 & más' });
assert.equal(plain.truncated, false);
assert.equal(plain.recipientIncluded, true);
assert.ok(plain.url.startsWith('mailto:miguel@example.com?subject='), plain.url);
const parsed = new URL(plain.url);
assert.equal(parsed.searchParams.get('subject'), 'Cotización COT-2026-0147 — M&A');
assert.equal(parsed.searchParams.get('body'), 'Hola:\r\n\r\nLínea 2 & más', 'saltos de línea como CRLF y & codificado');
assert.ok(plain.url.includes('%0D%0A') && !/[\r\n ]/.test(plain.url), 'sin saltos ni espacios crudos');
assert.equal([...plain.url.matchAll(/[?&](\w+)=/g)].map((m) => m[1]).join(','), 'subject,body', 'solo asunto y cuerpo');
// Inyección de cabeceras: saltos en el asunto se vuelven espacios; un destinatario con cabeceras se descarta.
const injected = buildMailtoUrl({ to: 'a@b.com\r\nBcc: espia@example.com', subject: 'Hola\r\nBcc: espia@example.com', body: 'x' });
assert.equal(injected.recipientIncluded, false);
assert.ok(injected.url.startsWith('mailto:?subject='), injected.url);
assert.equal(new URL(injected.url).searchParams.get('subject'), 'Hola Bcc: espia@example.com');
assert.ok(!/bcc=|cc=/i.test(injected.url.replace(/subject=[^&]*/, '')), 'no aparece una cabecera nueva');
assert.equal(buildMailtoUrl({ to: 'a@b.com?cc=x@y.com', subject: 's', body: 'b' }).recipientIncluded, false);
assert.equal(buildMailtoUrl({ to: 'no-es-correo', subject: 's', body: 'b' }).url.startsWith('mailto:?'), true);
// No ASCII y emoji: se codifican en UTF-8 y vuelven intactos.
const unicode = buildMailtoUrl({ to: '', subject: 'Señor Peña ☀️', body: 'Año 2026 😀 ñandú' });
assert.equal(new URL(unicode.url).searchParams.get('subject'), 'Señor Peña ☀️');
assert.equal(new URL(unicode.url).searchParams.get('body'), 'Año 2026 😀 ñandú');
// Un sustituto suelto (texto pegado dañado) no rompe la codificación.
assert.doesNotThrow(() => buildMailtoUrl({ to: '', subject: 'a\uD800b', body: 'c\uDC00d' }));
// Tope de longitud: el cuerpo se recorta por puntos de código, nunca parte un emoji, y avisa.
const huge = buildMailtoUrl({ to: 'miguel@example.com', subject: 'Cotización', body: '😀 Línea de texto bastante larga.\n'.repeat(400) });
assert.equal(huge.truncated, true);
assert.ok(huge.url.length <= MAILTO_MAX_LENGTH, `${huge.url.length} ≤ ${MAILTO_MAX_LENGTH}`);
const hugeBody = new URL(huge.url).searchParams.get('body') ?? '';
assert.ok(hugeBody.startsWith('😀 Línea'), 'conserva el principio');
assert.ok(hugeBody.includes('pega aquí el mensaje completo'), 'aviso de pegar el mensaje copiado');
assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(hugeBody), 'sin emoji partido');
const hugeSubject = buildMailtoUrl({ to: '', subject: '😀'.repeat(500), body: 'b' });
assert.ok(hugeSubject.url.length <= MAILTO_MAX_LENGTH, 'un asunto enorme también cabe');
assert.equal(buildMailtoUrl({ to: '', subject: 's', body: 'b'.repeat(100) }, 60).truncated, true, 'tope configurable');
// Sin sitio para el cuerpo (la nota no cabe): el asunto también se acota y el enlace respeta el tope.
for (const max of [40, 25, 16]) {
  const tight = buildMailtoUrl({ to: '', subject: 'Cotización COT-2026-0147 — M&A Electsun SRL', body: 'Hola'.repeat(50) }, max);
  assert.ok(tight.truncated && tight.url.length <= max, `tope ${max}: ${tight.url.length}`);
  assert.equal(isOpenableExternalUrl(tight.url), true, 'sigue siendo un mailto: permitido');
}
const tightTo = buildMailtoUrl({ to: 'miguel@example.com', subject: 'Asunto largo de prueba', body: 'x'.repeat(500) }, 40);
assert.ok(tightTo.url.length <= 40 && tightTo.url.startsWith('mailto:miguel@example.com?subject='), tightTo.url);
// Todo enlace que arma el constructor pasa la lista blanca del proceso principal.
for (const built of [plain, injected, unicode, huge, hugeSubject]) assert.equal(isOpenableExternalUrl(built.url), true, built.url.slice(0, 60));

// --- Adjuntos ------------------------------------------------------------------------------------------------------
const attachment = (id: string, mode: QuotationAttachment['mode'], fileName: string): QuotationAttachment => ({ id, fileName, fileSize: 1000, pageCount: 1, title: `Título ${id}`, uploadedAt: '2026-11-23T00:00:00.000Z', mode, origin: 'manual' });
const files = quotationEmailAttachments('COT-2026-0147', [attachment('a1', 'include', 'ficha.pdf'), attachment('a2', 'related', 'plano.png'), attachment('a3', 'include', 'otra.pdf'), attachment('a4', 'related', '')]);
assert.deepEqual(files.map((f) => f.id), ['quotation-pdf', 'a2', 'a4'], 'clave estable por id');
assert.deepEqual(files.map((f) => [f.name, f.kind, f.separate]), [['COT-2026-0147.pdf', 'PDF', false], ['plano.png', 'PNG', true], ['Título a4', 'PDF', true]]);
assert.ok(files[0].note.includes('2 adjuntos'), `el PDF dice qué incluye: ${files[0].note}`);
assert.equal(quotationEmailAttachments(null, [])[0].name, 'Cotizacion-borrador.pdf', 'nombre real de exportación sin número');
assert.equal(quotationEmailAttachments(null, []).length, 1);
// Dos adjuntos con el mismo nombre de archivo: dos entradas con claves distintas.
const twins = quotationEmailAttachments('COT-2026-0147', [attachment('f1', 'related', 'ficha.pdf'), attachment('f2', 'related', 'ficha.pdf')]);
assert.deepEqual(twins.map((f) => [f.id, f.name]), [['quotation-pdf', 'COT-2026-0147.pdf'], ['f1', 'ficha.pdf'], ['f2', 'ficha.pdf']]);

// --- Texto editado para este envío (lógica pura de la vista) -------------------------------------------------------
const ctx = quotationEmailContext(issued);
const defaults = quotationEmailText(issued);
assert.deepEqual(emailDraftView(EMPTY_EMAIL_DRAFT, defaults, ctx), { text: defaults, edited: false, stale: false });
let draftState = editEmailDraft(EMPTY_EMAIL_DRAFT, 'subject', 'Asunto a mano', ctx);
draftState = editEmailDraft(draftState, 'opening', 'Buenas tardes:', ctx);
draftState = editEmailDraft(draftState, 'closing', 'Saludos.', ctx);
const viewed = emailDraftView(draftState, defaults, ctx);
assert.deepEqual(viewed.text, { subject: 'Asunto a mano', opening: 'Buenas tardes:', closing: 'Saludos.' });
assert.equal(viewed.edited, true);
assert.equal(viewed.stale, false);
assert.ok(quotationEmailBody(viewed.text, summary, []).startsWith('Buenas tardes:'), 'el cuerpo usa lo editado');
assert.equal(emailDraftView(editEmailDraft(EMPTY_EMAIL_DRAFT, 'subject', defaults.subject, ctx), defaults, ctx).edited, false, 'igual a lo generado no cuenta como editado');
assert.deepEqual(resetEmailDraft(), EMPTY_EMAIL_DRAFT, 'Restablecer texto vuelve a lo generado');
assert.deepEqual(emailDraftView(resetEmailDraft(), defaults, ctx).text, defaults);
// Quedó viejo: cambian el número, el estado o el nombre del cliente después de editar.
for (const changed of [source('COT-2026-0148'), { ...issued, status: 'issued' as const }, source('COT-2026-0147', { client: { ...base().client, name: 'Otro cliente' } })]) {
  assert.equal(emailDraftView(draftState, quotationEmailText(changed), quotationEmailContext(changed)).stale, true);
}
assert.equal(emailDraftView(editEmailDraft(EMPTY_EMAIL_DRAFT, 'subject', 'x', quotationEmailContext(draft)), quotationEmailText(issued), quotationEmailContext(issued)).stale, true, 'borrador sin número → emitida');
// Máximo del asunto: el mismo para el generador y el campo.
assert.equal(Array.from(limitSubject('😀'.repeat(SUBJECT_MAX_CHARS + 50))).length, SUBJECT_MAX_CHARS);
assert.equal(Array.from(editEmailDraft(EMPTY_EMAIL_DRAFT, 'subject', 'a'.repeat(500), ctx).overrides.subject ?? '').length, SUBJECT_MAX_CHARS);
assert.equal(limitSubject('corto'), 'corto');

// --- Enlaces externos ----------------------------------------------------------------------------------------------
assert.equal(isOpenableExternalUrl('https://example.com'), true);
assert.equal(isOpenableExternalUrl(plain.url), true);
for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.com\r\nX: y', '', 42, 'ftp://x']) assert.equal(isOpenableExternalUrl(bad), false, `rechaza ${String(bad)}`);
const opened: string[] = [];
assert.equal(await openExternalUrl(plain.url, { electron: { openExternalUrl: async (u: string) => { opened.push(`electron:${u}`); return true; } }, assign: (u) => opened.push(`web:${u}`) }), true);
assert.equal(await openExternalUrl(plain.url, { electron: { openExternalUrl: async () => false } }), false, 'el puente rechaza: no se da por abierto');
assert.equal(await openExternalUrl(plain.url, { assign: (u) => opened.push(`web:${u}`) }), true);
assert.equal(await openExternalUrl('javascript:alert(1)', { assign: (u) => opened.push(`web:${u}`) }), false);
assert.deepEqual(opened, [`electron:${plain.url}`, `web:${plain.url}`], 'Electron por su puente; web con location; nunca lo no permitido');

// --- Render -------------------------------------------------------------------------------------------------------
const { QuotationEmailPreview } = await import('../components/quotations/editor/QuotationEmailPreview');
const { QuotationPreview } = await import('../components/quotations/editor/QuotationPreview');
const emailProps = (number: string | null, overrides: Partial<QuotationContent> = {}, extra: Record<string, unknown> = {}) => ({
  quotation: { ...source(number, overrides), signature: null },
  draft: EMPTY_EMAIL_DRAFT,
  onDraftChange: () => {},
  onGoToClientEmail: () => {},
  ...extra,
});
const draftHtml = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps(null, { attachments: [attachment('a1', 'include', 'ficha.pdf'), attachment('a2', 'related', 'plano.png')] })));
for (const piece of ['>De<', '>Para<', '>Asunto<', 'miguel@example.com', 'Cotización en borrador — M&amp;A Electsun SRL', 'Borrador', 'RD$ 1,156.40', 'Válida hasta', 'Forma de pago', 'Cotizacion-borrador.pdf', 'plano.png', 'Copiar mensaje', 'Copiar asunto', 'Abrir en la aplicación de correo', 'no envía']) {
  assert.ok(draftHtml.includes(piece), `vista de correo (borrador): ${piece}`);
}
assert.ok(!draftHtml.includes('ficha.pdf'), 'un adjunto incluido no se lista aparte: va dentro del PDF');
assert.ok(!draftHtml.includes('Restablecer texto'), 'sin cambios no hay nada que restablecer');
assert.ok(/<input[^>]*aria-label="Asunto del correo"/.test(draftHtml) && /<textarea[^>]*aria-label="Saludo e introducción"/.test(draftHtml), 'asunto y cuerpo editables');
// Texto cambiado para este envío: se ve y se ofrece restablecer.
const edited = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps('COT-2026-0147', {}, { draft: editEmailDraft(EMPTY_EMAIL_DRAFT, 'subject', 'Asunto a mano', ctx) })));
assert.ok(edited.includes('value="Asunto a mano"') && edited.includes('Restablecer texto'));
assert.ok(!edited.includes('La cotización cambió'), 'sin cambios en la cotización no hay aviso');
const staleHtml = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps('COT-2026-0148', {}, { draft: editEmailDraft(EMPTY_EMAIL_DRAFT, 'subject', 'Asunto a mano', ctx) })));
assert.ok(staleHtml.includes('La cotización cambió') && staleHtml.includes('Restablecer texto'), 'aviso discreto del texto viejo');
// Claves por id: dos «ficha.pdf» relacionados se dibujan los dos.
const twinsHtml = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps('COT-2026-0147', { attachments: [attachment('f1', 'related', 'ficha.pdf'), attachment('f2', 'related', 'ficha.pdf')] })));
assert.equal(twinsHtml.match(/>ficha\.pdf</g)?.length, 2);
// Sin correo del cliente: aviso discreto y enlace al campo (si se puede editar); bloqueada o LECTOR, solo el aviso.
const noEmail = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps('COT-2026-0147', { client: { ...base().client, email: '' } })));
assert.ok(noEmail.includes('Agregar correo del cliente') && /<button[^>]*>[^<]*Agregar correo del cliente/.test(noEmail), 'botón que lleva al campo');
const noEmailLocked = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps('COT-2026-0147', { client: { ...base().client, email: '' } }, { onGoToClientEmail: undefined })));
assert.ok(noEmailLocked.includes('Sin correo del cliente') && !noEmailLocked.includes('Agregar correo del cliente'));
assert.ok(noEmailLocked.includes('Abrir en la aplicación de correo'), 'se puede abrir sin destinatario');
const badEmail = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps('COT-2026-0147', { client: { ...base().client, email: 'miguel@' } })));
assert.ok(badEmail.includes('no es válido'), 'correo inválido avisado');
// Alternativa del logo: con logo, su `alt` es el emisor; sin logo, el nombre del emisor en texto.
const withLogo = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps('COT-2026-0147', { issuer: { ...base().issuer, logo: 'data:image/png;base64,AAAA' } })));
assert.ok(withLogo.includes('alt="M&amp;A Electsun SRL"'));

// Conmutador en la barra de la vista previa: PDF por defecto con paginación; Correo oculta la paginación.
const sheet = { ...source('COT-2026-0147'), signature: null };
const pdfMode = renderToStaticMarkup(React.createElement(QuotationPreview, { quotation: sheet }));
assert.ok(/role="tablist"[^>]*aria-label="Formato de la vista previa"/.test(pdfMode), 'conmutador con role=tablist');
assert.ok(/role="tab"[^>]*aria-selected="true"[^>]*>.*?PDF/.test(pdfMode) && /role="tab"[^>]*aria-selected="false"[^>]*>.*?Correo/.test(pdfMode));
assert.ok(pdfMode.includes('Página 1 de 1') && pdfMode.includes('data-quotation-page="1"') && pdfMode.includes('Descargar PDF'));
const mailMode = renderToStaticMarkup(React.createElement(QuotationPreview, { quotation: sheet, initialView: 'email' }));
assert.ok(/role="tab"[^>]*aria-selected="true"[^>]*>.*?Correo/.test(mailMode));
assert.ok(!mailMode.includes('Página anterior') && !mailMode.includes('data-quotation-page'), 'sin paginación ni hoja en modo Correo');
assert.ok(mailMode.includes('Descargar PDF'), 'el PDF se descarga a mano para adjuntarlo');
assert.ok(mailMode.includes('Cotización COT-2026-0147 — M&amp;A Electsun SRL'));
const describedRefs = (html: string) => [...html.matchAll(/aria-(?:describedby|controls|labelledby)="([^"]+)"/g)].flatMap((m) => m[1].split(' '));
for (const html of [pdfMode, mailMode]) for (const ref of describedRefs(html)) assert.ok(html.includes(`id="${ref}"`), `referencia ARIA sin destino: ${ref}`);

// En el editor: emitida y LECTOR ven el conmutador; mirar nunca escribe en el store.
const { useSimulationStore } = await import('../store/useSimulationStore');
const { QuotationEditorView } = await import('../components/quotations/editor/QuotationEditorView');
const record = (extra: Partial<QuotationRecord> = {}): QuotationRecord => ({
  ...base(), id: 'q-1', number: 'COT-2026-0147', version: 0, baseVersion: 0, createdById: '', createdBy: 'Local', createdAt: '2026-11-23T00:00:00.000Z', updatedAt: '2026-11-23T00:00:00.000Z', ...extra,
});
const reader = { id: 'u-r', name: 'Lucía', email: 'l@example.invalid', role: 'LECTOR', organizationId: 'org-a' };
for (const [label, quotation, user] of [['emitida', record({ status: 'issued' }), null], ['LECTOR', record(), reader]] as const) {
  useSimulationStore.setState({
    quotations: [quotation], quotationChanges: {}, activeQuotationId: quotation.id, activeView: 'quotation-editor', sidebarTheme: 'dark',
    syncSettings: { ...useSimulationStore.getState().syncSettings, currentUser: user as never, authToken: user ? 'synthetic' : null, autoSyncEnabled: false },
  });
  Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
  const before = useSimulationStore.getState();
  const html = renderToStaticMarkup(React.createElement(QuotationEditorView));
  assert.ok(html.includes('aria-label="Formato de la vista previa"') && html.includes('>Correo<'), `${label}: conmutador visible`);
  const mailHtml = renderToStaticMarkup(React.createElement(QuotationEditorView, { initialPreview: 'email' }));
  assert.ok(mailHtml.includes('Vista previa del correo') && mailHtml.includes('Copiar mensaje') && !mailHtml.includes('data-quotation-page'), `${label}: vista Correo dentro del editor`);
  assert.ok(!mailHtml.includes('Agregar correo del cliente'), `${label}: sin enlace al campo en solo lectura`);
  const after = useSimulationStore.getState();
  assert.equal(after.quotations, before.quotations, `${label}: mirar no escribe cotizaciones`);
  assert.equal(after.quotationChanges, before.quotationChanges, `${label}: mirar no encola cambios`);
}
// Lectura y solo lectura en la vista de correo: copiar y abrir siguen disponibles.
const readerMail = renderToStaticMarkup(React.createElement(QuotationEmailPreview, emailProps('COT-2026-0147', { status: 'issued' }, { onGoToClientEmail: undefined })));
assert.ok(readerMail.includes('Copiar mensaje') && readerMail.includes('Abrir en la aplicación de correo') && !/<button[^>]*disabled=""[^>]*>[^<]*Copiar/.test(readerMail));

console.log('Quotation email tests passed.');
