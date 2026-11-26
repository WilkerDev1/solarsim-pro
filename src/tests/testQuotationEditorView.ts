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
assert.ok(!draft.includes('Plantilla y firmas') && !draft.includes('Adjuntos'), 'las pestañas de fases siguientes no se muestran');
// Emisor de solo lectura con la acción explícita en borrador.
assert.ok(draft.includes('>Emisor<') && draft.includes('Actualizar desde el membrete'));
// Orden del tabulador en cada línea: descripción → cantidad → unidad → precio → descuento → ITBIS → acciones.
const order = ['Descripción de la línea 1', '>Cant.<', '>Unidad<', '>Precio unit.<', '>Desc. %<', '>ITBIS<', 'Subir línea 1', 'Quitar línea 1'].map((text) => draft.indexOf(text));
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

console.log('Quotation editor view tests passed.');
