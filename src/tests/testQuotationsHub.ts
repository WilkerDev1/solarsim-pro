import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canTransitionQuotation, emptyQuotationContent, type QuotationStatus } from '../../shared/quotations';
import type { QuotationRecord } from '../types/quotation';
import { QuotationsHub } from '../components/quotations/hub/QuotationsHub';
import { QuotationDetailDock } from '../components/quotations/hub/QuotationDetailDock';
import { useSimulationStore } from '../store/useSimulationStore';
import { localIsoDate } from '../utils/localDate';

const TODAY = localIsoDate();
const line = (id: string, description: string, quantity: number, unit: string, priceCents: number) =>
  ({ id, kind: 'item' as const, description, quantity, unit, unitPriceCents: priceCents, discountPct: 0, taxable: true });

/** Plantilla de referencia de Electsun: seis líneas gravadas en DOP (subtotal 30,480.00, ITBIS 5,486.40, total 35,966.40). */
const reference: QuotationRecord = {
  ...emptyQuotationContent(TODAY),
  id: 'q-ref',
  number: 'COT-2026-0147',
  version: 1,
  baseVersion: 1,
  createdById: '',
  createdBy: 'Local',
  createdAt: '2026-11-23T10:00:00.000Z',
  updatedAt: '2026-11-23T10:00:00.000Z',
  projectLabel: 'Alimentación de planta eléctrica',
  client: { name: 'Sr. Miguel Bona', attention: 'Sr. Miguel Bona', taxId: '', phone: '829-696-9863', email: '', address: '' },
  issuer: { name: 'M&A Electsun SRL', taxId: '', address: 'Plaza Toledo, Local 307, Santo Domingo', phone: '809-378-6590', email: '', website: '', logo: '' },
  items: [
    line('l1', 'Pies alambre 10.0 mm² negro', 250, 'pies', 3_920),
    line('l2', 'Breaker europeo 63 A / 2P', 1, 'UD', 98_000),
    line('l3', 'Breaker doble tiro 100 A / 6P', 1, 'UD', 600_000),
    line('l4', 'Pies cable UTP cat. 5 blindado', 150, 'pies', 1_200),
    line('l5', 'Pies tubería LQT 3/4 y accesorios', 50, 'pies', 6_800),
    line('l6', 'Mano de obra y gastos operativos', 1, 'UD', 850_000),
    { id: 'l7', kind: 'detail', description: 'Incluye canalización existente', quantity: 1, unit: '', unitPriceCents: 0, discountPct: 0, taxable: false },
  ],
  notes: 'Pago del 70% con la orden y 30% al concluir.',
  attachments: [{ id: 'a1', fileName: 'breaker.pdf', fileSize: 1000, pageCount: 2, title: 'Ficha técnica — breaker 63 A', uploadedAt: '2026-11-23T10:00:00.000Z', mode: 'include', origin: 'manual' }],
};
const usdIssued: QuotationRecord = {
  ...reference,
  id: 'q-usd',
  number: 'COT-2026-0146',
  status: 'issued',
  currency: 'USD',
  exchangeRate: 60,
  issueDate: '2026-01-02',
  validUntil: '2026-01-10',
  client: { ...reference.client, name: 'Residencial Vista Sol' },
  sourceProjectId: 'p-1',
  items: [{ ...line('u1', 'Sistema 12 kWp', 1, 'UD', 1_845_000), taxable: false }],
  attachments: [],
};

const initial = { ...useSimulationStore.getState() };
/** renderToStaticMarkup lee la instantánea de servidor del store (su estado inicial): se alinea con el actual. */
const syncServerSnapshot = () => Object.assign(useSimulationStore.getInitialState(), useSimulationStore.getState());
const render = () => { syncServerSnapshot(); return renderToStaticMarkup(React.createElement(QuotationsHub)); };
const renderDock = (props: React.ComponentProps<typeof QuotationDetailDock>) => { syncServerSnapshot(); return renderToStaticMarkup(React.createElement(QuotationDetailDock, props)); };
try {
  // --- Estado vacío ---------------------------------------------------------------------------------------------------
  useSimulationStore.setState({ quotations: [], quotationChanges: {}, quotationDeletionQueue: [], folders: [], syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null } });
  const empty = render();
  assert.match(empty, /Todavía no hay cotizaciones/);
  assert.match(empty, /Nueva cotización/);
  assert.doesNotMatch(empty, /Papelera|Desde una propuesta/, 'sin entradas de fases posteriores');
  assert.match(empty, /Plantillas y firmas/, 'acceso al gestor de plantillas, firmas y sellos');

  // --- Catálogo con datos (modo local: se puede escribir) -------------------------------------------------------------
  useSimulationStore.setState({ quotations: [reference, usdIssued] });
  const html = render();
  assert.match(html, /COT-2026-0147/);
  assert.match(html, /RD\$ 35,966\.40/, 'total formateado de la plantilla de referencia');
  assert.match(html, /US\$ 18,450\.00/);
  assert.match(html, />Borrador<\/span>/, 'estado al final de la fila');
  assert.match(html, />Vencida<\/span>/, 'estado efectivo: emitida con vigencia pasada');
  assert.match(html, /Venció 10 ene 2026/);
  assert.match(html, /Desde propuesta/);
  assert.match(html, /Alimentación de planta eléctrica/);
  assert.match(html, /Nueva cotización/);
  assert.match(html, /aria-label="Seleccionar COT-2026-0147"/);
  // Dock de detalle de la primera (la más reciente): De/Para, ítems, totales, nota y adjuntos.
  assert.match(html, /M&amp;A Electsun SRL/);
  assert.match(html, /5,486\.40/, 'ITBIS');
  assert.match(html, /30,480\.00/, 'subtotal');
  assert.match(html, /Incluye canalización existente/);
  assert.match(html, /Pago del 70%/);
  assert.match(html, /Ficha técnica — breaker 63 A/);
  assert.match(html, /Se incluye/);
  assert.match(html, />Duplicar</);
  assert.match(html, />Eliminar</);
  // Un indicador por grupo con su importe en RD$ (la emitida vencida se convierte con su tasa: 18,450 × 60).
  const kpi = (id: string) => new RegExp(`<li class="qh-kpi" data-kpi="${id}">(.*?)</li>`).exec(html)?.[1] ?? '';
  assert.match(kpi('expired'), /Vencidas/);
  assert.match(kpi('expired'), /RD\$ 1,107,000\.00/, 'la emitida vencida suma en Vencidas');
  assert.match(kpi('expired'), /1 cotización/);
  assert.match(kpi('issued'), /Emitidas por responder/);
  assert.match(kpi('issued'), /RD\$ 0\.00/, 'y no en Emitidas por responder');
  assert.match(kpi('draft'), /RD\$ 35,966\.40/);
  assert.match(kpi('accepted'), /RD\$ 0\.00/);

  // --- LECTOR: ve todo y no tiene acciones de escritura ---------------------------------------------------------------
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, serverUrl: 'https://qa.example.invalid', authToken: 'synthetic', currentUser: { id: 'u-r', name: 'Lectora', email: 'r@example.invalid', role: 'LECTOR', organizationId: 'org' } } });
  const reader = render();
  assert.match(reader, /COT-2026-0147/);
  assert.match(reader, /RD\$ 35,966\.40/);
  assert.match(reader, />Borrador<\/span>/);
  for (const write of [/Nueva cotización/, />Duplicar</, />Eliminar</, />Emitir</, />Anular</, /Seleccionar COT/, /Mover a carpeta/, />Editar</])
    assert.doesNotMatch(reader, write, `sin ${write}`);
  assert.match(reader, />Ver</, 'puede abrir la cotización para consultarla');

  // --- Transiciones del dock = canTransitionQuotation ----------------------------------------------------------------
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, currentUser: null, authToken: null } });
  const labels: Record<QuotationStatus, string> = { issued: 'Emitir', accepted: 'Marcar aceptada', rejected: 'Marcar rechazada', void: 'Anular', draft: 'Reabrir' };
  for (const from of Object.keys(labels) as QuotationStatus[]) {
    const dock = renderDock({ quotation: { ...reference, status: from }, today: TODAY, readOnly: false });
    for (const to of Object.keys(labels) as QuotationStatus[]) {
      const offered = new RegExp(`>${labels[to]}</button>`).test(dock);
      assert.equal(offered, canTransitionQuotation(from, to), `${from} → ${to}`);
    }
  }

  // --- Conflictos: se explican y ofrecen las dos resoluciones ----------------------------------------------------------
  const user = { id: 'u-w', name: 'Editora', email: 'w@example.invalid', role: 'EDITOR' as const, organizationId: 'org' };
  useSimulationStore.setState({ syncSettings: { ...initial.syncSettings, serverUrl: 'https://qa.example.invalid', authToken: 'synthetic', currentUser: user } });
  const dockWith = (change: object, deletionQueue: object[] = []) => {
    useSimulationStore.setState({ quotationChanges: { [reference.id]: { revision: 'r', baseVersion: 1, ownerId: user.id, ...change } }, quotationDeletionQueue: deletionQueue as never });
    return renderDock({ quotation: reference, today: TODAY, readOnly: false });
  };
  const version = dockWith({ serverQuotation: { ...reference, version: 4 } });
  assert.match(version, /Otro miembro cambió esta cotización/);
  assert.match(version, /Usar la del servidor/);
  assert.match(version, /Conservar la mía/);
  assert.match(dockWith({ serverDeleted: true }), /Otro miembro eliminó esta cotización/);
  // Conflicto de otra cuenta de este equipo: se explica, sin acciones.
  const foreign = dockWith({ ownerId: 'u-otra', serverQuotation: { ...reference, version: 6 } });
  assert.match(foreign, /Otro miembro cambió esta cotización/);
  assert.match(foreign, /solo esa cuenta puede resolverlo/);
  assert.doesNotMatch(foreign, /Usar la del servidor|Conservar la mía/);
  // Rechazo de una revisión anterior (superado por una edición): no se muestra como rechazo activo.
  const stale = dockWith({ revision: 'r2', rejected: { revision: 'r1', status: 400, error: 'Error viejo.' } });
  assert.doesNotMatch(stale, /El servidor rechazó|Error viejo/);
  assert.match(stale, /Cambios pendientes de publicar/);
  assert.match(dockWith({ serverQuotation: { ...reference, version: 5 }, deletionConflict: true }), /La eliminaste/);
  assert.match(dockWith({ rejected: { revision: 'r', status: 409, code: 'quotation_locked', error: 'La cotización está bloqueada.' } }), /El servidor rechazó[^<]*La cotización está bloqueada\./);
  useSimulationStore.setState({ quotationChanges: {} });
  const refusedDeletion = renderDock({ quotation: reference, today: TODAY, readOnly: false });
  assert.doesNotMatch(refusedDeletion, /Usar la del servidor/);
  useSimulationStore.setState({ quotationDeletionQueue: [{ id: reference.id, ownerId: user.id, baseVersion: 1, rejected: { status: 403, error: 'Sin permiso.' } }] });
  assert.match(renderDock({ quotation: reference, today: TODAY, readOnly: false }), /rechazó eliminarla[^<]*Sin permiso\./);
  useSimulationStore.setState({ quotationDeletionQueue: [] });

  // --- Fila descriptiva sin cantidad (p. ej. «Incluye descuento…» de una conversión): celda de cantidad vacía, no «0» --
  const withNote: QuotationRecord = {
    ...reference,
    items: [...reference.items, { id: 'note-1', kind: 'detail', description: 'Incluye descuento: Cierre (10 %) −RD$ 100.00', quantity: 0, unit: '', unitPriceCents: 0, discountPct: 0, taxable: false }],
  };
  const noteDock = renderDock({ quotation: withNote, today: TODAY, readOnly: false });
  assert.match(noteDock, /<tr data-kind="detail"><td>Incluye descuento: Cierre \(10 %\) −RD\$ 100\.00<\/td><td><\/td><td><\/td><td><\/td><\/tr>/, 'sin «0» en la cantidad');
} finally {
  useSimulationStore.setState(initial, true);
  syncServerSnapshot();
}

console.log('Quotations hub render tests passed.');
