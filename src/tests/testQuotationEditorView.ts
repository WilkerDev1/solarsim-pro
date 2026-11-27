// Editor de cotización (src/components/quotations/editor/): borrador editable, bloqueada en solo lectura con
// «Reabrir para editar», LECTOR siempre en solo lectura, y mirar nunca escribe.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { emptyQuotationContent } from '../../shared/quotations';
import type { QuotationRecord } from '../types/quotation';

registerHooks({ load: (url, context, next) => (url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context)) });
const { useSimulationStore } = await import('../store/useSimulationStore');
const { QuotationEditorView } = await import('../components/quotations/editor/QuotationEditorView');
const { quotationSaveStatus } = await import('../components/quotations/editor/saveStatus');

const record = (extra: Partial<QuotationRecord> = {}): QuotationRecord => ({
  ...emptyQuotationContent('2026-11-23', {
    exchangeRate: 60,
    seller: 'Mayler Capellán',
    client: { name: 'Sr. Miguel Bona', attention: '', taxId: '', phone: '829-696-9863', email: '', address: '' },
    items: [{ id: 'l1', kind: 'item', description: 'Breaker europeo 63 A / 2P', quantity: 1, unit: 'UD', unitPriceCents: 98000, discountPct: 0, taxable: true }],
  }),
  id: 'q-1', number: 'COT-2026-0147', version: 0, baseVersion: 0, createdById: '', createdBy: 'Local', createdAt: '2026-11-23T00:00:00.000Z', updatedAt: '2026-11-23T00:00:00.000Z',
  ...extra,
});
const reader = { id: 'u-r', name: 'Lucía', email: 'l@example.invalid', role: 'LECTOR', organizationId: 'org-a' };
const setup = (quotation: QuotationRecord, currentUser: typeof reader | null = null) => {
  useSimulationStore.setState({
    quotations: [quotation], quotationChanges: {}, activeQuotationId: quotation.id, activeView: 'quotation-editor', sidebarTheme: 'light',
    syncSettings: { ...useSimulationStore.getState().syncSettings, currentUser: currentUser as never, authToken: currentUser ? 'synthetic' : null, autoSyncEnabled: false },
  });
  // renderToStaticMarkup lee el estado inicial del store (getServerSnapshot): se alinea con el actual.
  Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
};
const render = () => renderToStaticMarkup(React.createElement(QuotationEditorView));
const inputs = (html: string) => html.match(/<(input|textarea)\b[^>]*>/g) ?? [];
const editable = (html: string) => inputs(html).filter((tag) => !/\b(readonly|disabled)=""/.test(tag) && !/type="search"/.test(tag));

// Borrador: campos editables, emitir, sin «Guardar», vista previa en vivo con la hoja.
setup(record());
const draft = render();
assert.ok(draft.includes('COT-2026-0147'));
assert.ok(draft.includes('Borrador'));
assert.ok(draft.includes('Emitir cotización'));
assert.ok(!draft.includes('Reabrir para editar'));
assert.ok(!/>\s*Guardar\s*</.test(draft), 'no hay botón Guardar');
assert.ok(editable(draft).length >= 10, `campos editables en borrador (${editable(draft).length})`);
for (const label of ['Vendedor', 'Fecha de emisión', 'Válida hasta', 'Tasa del dólar', 'Nombre', 'Atención', 'RNC o cédula', 'Teléfono', 'Correo', 'Dirección', 'Condiciones de pago', 'Notas']) {
  assert.ok(draft.includes(`>${label}</label>`) || draft.includes(`>${label}<`), `etiqueta ${label}`);
}
assert.ok(draft.includes('Ítem libre') && draft.includes('Línea descriptiva') && draft.includes('Del catálogo de equipos'));
assert.ok(draft.includes('aria-label="Subir línea 1"') && draft.includes('aria-label="Bajar línea 1"'), 'reordenar con botones accesibles');
assert.ok(draft.includes('Peso dominicano (RD$)') && draft.includes('Bandera de República Dominicana'));
assert.ok(draft.includes('980.00'), 'total de línea y resumen');
assert.ok(draft.includes('1,156.40'), 'total calculado con computeQuotationTotals (980 + 18 %)');
assert.ok(draft.includes('data-quotation-page="1"'), 'vista previa con la hoja real');
assert.ok(draft.includes('Página 1 de 1'));
assert.ok(draft.includes('Descargar PDF'));
assert.ok(draft.includes('Guardado en este equipo'), 'estado de guardado honesto en modo local');
assert.ok(draft.includes('role="tablist"') && draft.includes('>Plantilla y firmas<') && draft.includes('>Adjuntos<'), 'pestañas Contenido, Plantilla y firmas, Adjuntos');
assert.ok(/role="tab"[^>]*aria-selected="true"[^>]*>.*?Contenido/.test(draft), 'Contenido abierta al entrar');
// Emisor de solo lectura con la acción explícita en borrador.
assert.ok(draft.includes('>Emisor<') && draft.includes('Actualizar desde el membrete'));
// Orden del tabulador en cada línea: descripción → cantidad → precio → ITBIS → «…» → unidad → descuento → acciones.
const order = ['Descripción de la línea 1', 'Cantidad de la línea 1', 'Precio unitario de la línea 1', 'ITBIS de la línea 1', 'Más opciones de la línea 1', '>Unidad<', '>Descuento<', 'Subir línea 1', 'Quitar línea 1'].map((text) => draft.indexOf(text));
assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `orden de la línea: ${order.join(', ')}`);
// La moneda son botones con aria-pressed, no un grupo de radio que cambia con las flechas.
assert.ok(draft.includes('aria-pressed="true"') && !draft.includes('role="radiogroup"'));
// Toda referencia aria-describedby apunta a un elemento presente.
const describedRefs = (html: string) => [...html.matchAll(/aria-describedby="([^"]+)"/g)].flatMap((m) => m[1].split(' '));
for (const ref of describedRefs(draft)) assert.ok(draft.includes(`id="${ref}"`), `aria-describedby sin destino: ${ref}`);

// Bloqueada (emitida): solo lectura, explicación y «Reabrir para editar».
setup(record({ status: 'issued' }));
const issued = render();
assert.ok(issued.includes('Emitida'));
assert.ok(issued.includes('Reabrir para editar'));
assert.ok(!issued.includes('Emitir cotización'));
assert.equal(editable(issued).length, 0, `sin campos editables: ${editable(issued).join(' ')}`);
assert.ok(!issued.includes('Ítem libre'), 'sin acciones de edición');
assert.ok(issued.includes('Descargar PDF'), 'se puede descargar');
assert.ok(!issued.includes('Actualizar desde el membrete'), 'el emisor no se actualiza fuera de borrador');
for (const ref of describedRefs(issued)) assert.ok(issued.includes(`id="${ref}"`), `aria-describedby sin destino en solo lectura: ${ref}`);
// Aceptada: bloqueada y sin reabrir (no es una transición permitida).
setup(record({ status: 'accepted' }));
const accepted = render();
assert.ok(!accepted.includes('Reabrir para editar'));
assert.equal(editable(accepted).length, 0);

// LECTOR: solo lectura aunque sea borrador, y sin acciones de estado.
setup(record(), reader);
const readOnly = render();
assert.equal(editable(readOnly).length, 0);
assert.ok(!readOnly.includes('Emitir cotización') && !readOnly.includes('Reabrir para editar'));
assert.ok(readOnly.includes('Solo lectura'));

// Sin cotización activa (o ya borrada): no dibuja nada ni escribe (el efecto vuelve al catálogo con closeQuotation).
setup(record());
useSimulationStore.setState({ activeQuotationId: 'q-borrada' });
Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
const missingBefore = JSON.stringify(useSimulationStore.getState().quotations);
assert.equal(render(), '');
assert.equal(JSON.stringify(useSimulationStore.getState().quotations), missingBefore);

// Estado de guardado leído de quotationChanges.
const online = { online: true, version: 3 };
assert.equal(quotationSaveStatus(undefined, { online: false, version: 0 }).label, 'Guardado en este equipo');
assert.equal(quotationSaveStatus(undefined, online).label, 'Publicado');
assert.equal(quotationSaveStatus({ revision: 'r', baseVersion: 3 }, online).label, 'Pendiente de publicar');
assert.equal(quotationSaveStatus({ revision: 'r', baseVersion: 3, serverQuotation: record() }, online).tone, 'error');
assert.match(quotationSaveStatus({ revision: 'r', baseVersion: 3, serverDeleted: true }, online).label, /Conflicto/);
assert.match(quotationSaveStatus({ revision: 'r', baseVersion: 3, rejected: { revision: 'r', status: 422, error: 'Fecha inválida' } }, online).label, /Rechazad/);
assert.equal(quotationSaveStatus({ revision: 'r2', baseVersion: 3, rejected: { revision: 'r', status: 422, error: 'x' } }, online).label, 'Pendiente de publicar', 'un rechazo viejo no cuenta tras una edición nueva');

// ── Pestañas «Plantilla y firmas» y «Adjuntos», y el gestor de plantillas, firmas y sellos ──
const { DesignTab } = await import('../components/quotations/editor/DesignTab');
const { AttachmentsTab } = await import('../components/quotations/editor/AttachmentsTab');
const { QuotationLibraryView } = await import('../components/quotations/library/QuotationLibraryView');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const meta = { version: 0, baseVersion: 0, createdById: '', createdBy: '', createdAt: '2026-11-23T00:00:00Z', updatedAt: '2026-11-23T00:00:00Z' };
const templates = [{ ...meta, id: 't1', name: 'Electsun clásica', description: '', design: { layout: 'clasica' as const, accent: '#087b58', typography: 'sans' as const, showSignature: true, showStamp: true }, notes: '', paymentTerms: '', validityDays: 15, isDefault: true }];
const signatures = [{ ...meta, id: 's1', kind: 'signature' as const, name: 'Idali Candelario', role: 'Ventas', image: PNG, isDefault: true }];
const content = { ...record(), design: { ...record().design, templateId: 't1' } };
const designProps = { content, edit: () => null, templates, signatures, saveTemplate: () => null, openLibrary: () => undefined };
const design = renderToStaticMarkup(React.createElement(DesignTab, { ...designProps, readOnly: false, canSaveTemplate: true }));
for (const text of ['Gestionar plantillas', 'Electsun clásica', 'Predeterminada', 'Color de acento', 'Tipografía de títulos', 'Idali Candelario', 'Ventas', 'Mostrar la firma en el documento', 'Sello de la empresa', 'Guardar este diseño como plantilla', 'Clásica', 'Banda', 'Minimal']) {
  assert.ok(design.includes(text), `diseño: ${text}`);
}
assert.ok(design.includes('role="switch"') && design.includes('aria-checked="true"'), 'interruptores de firma y sello');
assert.ok(design.includes('aria-label="Verde Electsun"') && design.includes('type="color"'), 'paleta y color personalizado');
assert.ok(/aria-pressed="true"[^>]*>.*?Electsun clásica/.test(design), 'la plantilla enlazada se marca');
const lockedDesign = renderToStaticMarkup(React.createElement(DesignTab, { ...designProps, readOnly: true, canSaveTemplate: false }));
assert.ok(!lockedDesign.includes('Guardar este diseño como plantilla'), 'LECTOR: sin guardar plantilla');
assert.ok((lockedDesign.match(/<button\b[^>]*>/g) ?? []).filter((b) => /aria-pressed|role="switch"/.test(b)).every((b) => b.includes('disabled=""')), 'bloqueada: diseño sin cambios');
const withAttachments = { ...content, attachments: [
  { id: 'a1', fileName: 'plano.pdf', fileSize: 2_400_000, pageCount: 3, title: 'Plano de la instalación', uploadedAt: '2026-11-23T00:00:00Z', mode: 'include' as const, origin: 'manual' as const },
  { id: 'a2', fileName: 'ficha.pdf', fileSize: 0, pageCount: 0, title: 'Ficha técnica — Panel', uploadedAt: '2026-11-23T00:00:00Z', mode: 'related' as const, origin: 'catalog' as const, assetId: 'x' },
] };
const attachmentsHtml = renderToStaticMarkup(React.createElement(AttachmentsTab, { quotationId: 'q-1', content: withAttachments, readOnly: false, edit: () => null, catalog: [] }));
for (const text of ['Agregar documentos', 'Desde el equipo', 'Fichas del catálogo', 'Documentos de esta cotización', '2 · 1 se incluyen en el PDF', 'Plano de la instalación', '3 páginas', '2.3 MB', 'Catálogo de equipos', 'Páginas por confirmar', 'Incluir en el PDF', 'Solo relacionado']) {
  assert.ok(attachmentsHtml.includes(text), `adjuntos: ${text}`);
}
assert.ok(attachmentsHtml.includes('aria-label="Subir adjunto 2"') && attachmentsHtml.includes('aria-label="Quitar adjunto 1"'), 'reordenar y quitar con nombre accesible');
assert.ok(/Fichas del catálogo<\/button>/.test(attachmentsHtml) && /disabled=""[^>]*>[^<]*<svg[^>]*>.*?Fichas del catálogo/.test(attachmentsHtml), 'sin fichas en el catálogo, el botón se desactiva');
const lockedAttachments = renderToStaticMarkup(React.createElement(AttachmentsTab, { quotationId: 'q-1', content: withAttachments, readOnly: true, edit: () => null, catalog: [] }));
assert.ok(!lockedAttachments.includes('Agregar documentos') && !lockedAttachments.includes('Quitar adjunto'), 'bloqueada: no se agregan ni se quitan adjuntos');
assert.ok(editable(lockedAttachments).length === 0, 'bloqueada: títulos de solo lectura');

useSimulationStore.setState({ activeView: 'quotation-library', quotationLibrarySection: 'templates', quotationLibrary: { templates: { items: templates, changes: {}, deletions: [], cursor: null }, signatures: { items: signatures, changes: {}, deletions: [], cursor: null } } });
Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
const library = renderToStaticMarkup(React.createElement(QuotationLibraryView));
for (const text of ['Plantillas, firmas y sellos', 'Nueva plantilla', 'Electsun clásica', 'Predeterminada', 'Duplicar', 'Editar', 'Guardadas en este equipo']) assert.ok(library.includes(text), `gestor: ${text}`);
useSimulationStore.setState({ quotationLibrarySection: 'signatures' });
Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
const signaturesHtml = renderToStaticMarkup(React.createElement(QuotationLibraryView));
for (const text of ['Importar firma', 'Importar sello', 'Firmas', 'Sellos', 'Idali Candelario', 'Reemplazar']) assert.ok(signaturesHtml.includes(text), `firmas: ${text}`);
setup(record(), reader);
useSimulationStore.setState({ activeView: 'quotation-library', quotationLibrarySection: 'templates' });
Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
const readerLibrary = renderToStaticMarkup(React.createElement(QuotationLibraryView));
assert.ok(readerLibrary.includes('Solo lectura') && !readerLibrary.includes('Nueva plantilla') && !readerLibrary.includes('Duplicar'), 'LECTOR: el gestor es de solo lectura');

console.log('Quotation editor view tests passed.');
