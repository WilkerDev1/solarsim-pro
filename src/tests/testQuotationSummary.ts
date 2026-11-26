import assert from 'node:assert/strict';
import { canTransitionQuotation, emptyQuotationContent, type QuotationStatus } from '../../shared/quotations';
import type { QuotationChange, QuotationDeletionCommand, QuotationRecord } from '../types/quotation';
import {
  QUOTATION_VIEWS, countQuotationsByView, filterQuotations, formatQuotationDate, quotationStatusActions, quotationSyncIssue,
  quotationTotalDopCents, quotationValidityLabel, summarizeQuotations,
} from '../utils/quotationSummary';

const TODAY = '2026-11-26';
let sequence = 0;
/** Cotización de ejemplo: una línea `item` gravada de `priceCents` y, si se pide, una línea `detail`. */
function quotation(overrides: Partial<QuotationRecord> & { priceCents?: number } = {}): QuotationRecord {
  const { priceCents = 10_000, ...rest } = overrides;
  sequence++;
  return {
    ...emptyQuotationContent('2026-11-20'),
    id: `q-${sequence}`,
    number: `COT-2026-${String(sequence).padStart(4, '0')}`,
    version: 1,
    baseVersion: 1,
    createdById: 'u-1',
    createdBy: 'QA',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    client: { name: `Cliente ${sequence}`, attention: '', taxId: '', phone: '', email: '', address: '' },
    items: [{ id: 'l1', kind: 'item', description: 'Línea', quantity: 1, unit: 'UD', unitPriceCents: priceCents, discountPct: 0, taxable: false }],
    ...rest,
  };
}

// --- Totales en RD$ con la tasa de cada cotización ---------------------------------------------------------------
{
  const dop = quotation({ currency: 'DOP', priceCents: 100_000 });
  const usd60 = quotation({ currency: 'USD', exchangeRate: 60, priceCents: 1_000 });
  const usd58 = quotation({ currency: 'USD', exchangeRate: 58.5, priceCents: 1_000 });
  assert.equal(quotationTotalDopCents(dop), 100_000);
  assert.equal(quotationTotalDopCents(usd60), 60_000, 'US$ 10.00 a 60 = RD$ 600.00');
  assert.equal(quotationTotalDopCents(usd58), 58_500, 'cada cotización usa su propia tasa');

  // Línea `detail` (sin precio) y descuento global con ITBIS: el total sale de computeQuotationTotals.
  const withDetail = quotation({
    currency: 'DOP',
    items: [
      { id: 'a', kind: 'item', description: 'Gravada', quantity: 2, unit: 'UD', unitPriceCents: 50_000, discountPct: 10, taxable: true },
      { id: 'b', kind: 'detail', description: 'Incluye instalación', quantity: 1, unit: '', unitPriceCents: 0, discountPct: 0, taxable: false },
    ],
    discounts: [{ id: 'd', label: 'Pronto pago', type: 'fixed', value: 10_000 }],
  });
  // 2 × 500.00 = 1,000.00 − 10% = 900.00 − 100.00 = 800.00 + 18% ITBIS = 944.00
  assert.equal(quotationTotalDopCents(withDetail), 94_400);
}

// --- Recuentos por estado efectivo (incluida «Vencida») ------------------------------------------------------------
const draft = quotation({ status: 'draft', priceCents: 10_000 });
const issued = quotation({ status: 'issued', validUntil: '2026-12-20', priceCents: 20_000, issueDate: '2026-11-21' });
const issuedToday = quotation({ status: 'issued', validUntil: TODAY, priceCents: 5_000, issueDate: '2026-11-10' });
const expired = quotation({ status: 'issued', validUntil: '2026-11-14', priceCents: 30_000, issueDate: '2026-10-30' });
const accepted = quotation({ status: 'accepted', currency: 'USD', exchangeRate: 60, priceCents: 1_000, issueDate: '2026-11-19' });
const rejected = quotation({ status: 'rejected', priceCents: 7_000 });
const voided = quotation({ status: 'void', priceCents: 9_000 });
const all = [draft, issued, issuedToday, expired, accepted, rejected, voided];
{
  assert.deepEqual(countQuotationsByView(all, TODAY), { all: 7, draft: 1, issued: 2, accepted: 1, expired: 1, rejected: 1, void: 1 });
  assert.deepEqual(countQuotationsByView([], TODAY), { all: 0, draft: 0, issued: 0, accepted: 0, expired: 0, rejected: 0, void: 0 });
  assert.deepEqual(QUOTATION_VIEWS.map((v) => v.label), ['Todas', 'Borradores', 'Emitidas', 'Aceptadas', 'Vencidas', 'Rechazadas', 'Anuladas']);

  const kpis = summarizeQuotations(all, TODAY);
  assert.deepEqual(kpis.map((k) => [k.id, k.count, k.amountDopCents]), [
    ['draft', 1, 10_000],
    ['issued', 2, 25_000], // la que vence hoy aún está por responder
    ['accepted', 1, 60_000], // US$ 10.00 × 60
    ['expired', 1, 30_000],
  ]);
  assert.deepEqual(kpis.map((k) => k.label), ['Borradores', 'Emitidas por responder', 'Aceptadas', 'Vencidas']);
  assert.deepEqual(summarizeQuotations([], TODAY).map((k) => [k.count, k.amountDopCents]), [[0, 0], [0, 0], [0, 0], [0, 0]]);
}

// --- Filtro, búsqueda, moneda, carpetas y orden ----------------------------------------------------------------------
{
  const base = { view: 'all' as const, folderId: null, hiddenFolderIds: new Set<string>(), query: '', currency: 'all' as const, today: TODAY };
  const ordered = filterQuotations(all, base);
  const dates = ordered.map((q) => q.issueDate);
  assert.deepEqual(dates, [...dates].sort().reverse(), 'orden por fecha de emisión descendente');
  assert.equal(ordered[0].id, issued.id);

  assert.deepEqual(filterQuotations(all, { ...base, view: 'expired' }).map((q) => q.id), [expired.id]);
  assert.deepEqual(filterQuotations(all, { ...base, view: 'issued' }).map((q) => q.id).sort(), [issued.id, issuedToday.id].sort());
  assert.deepEqual(filterQuotations(all, { ...base, currency: 'USD' }).map((q) => q.id), [accepted.id]);

  const labelled = quotation({ projectLabel: 'Alimentación de planta eléctrica', client: { name: 'Clínica Santa Ána', attention: '', taxId: '', phone: '', email: '', address: '' } });
  const list = [...all, labelled];
  assert.deepEqual(filterQuotations(list, { ...base, query: 'santa ana' }).map((q) => q.id), [labelled.id], 'cliente sin acentos ni mayúsculas');
  assert.deepEqual(filterQuotations(list, { ...base, query: 'PLANTA' }).map((q) => q.id), [labelled.id], 'proyecto');
  assert.deepEqual(filterQuotations(list, { ...base, query: expired.number! }).map((q) => q.id), [expired.id], 'número');
  assert.deepEqual(filterQuotations(list, { ...base, query: 'no existe' }), []);
  const unnumbered = quotation({ number: null });
  assert.equal(filterQuotations([unnumbered], { ...base, query: 'cot' }).length, 0);

  // Carpetas: en «todas» se ocultan las de carpetas ocultas; con carpeta activa solo esa carpeta (aunque esté oculta).
  const inVisible = quotation({ folderId: 'f-visible' });
  const inHidden = quotation({ folderId: 'f-hidden' });
  const hidden = new Set(['f-hidden']);
  const scoped = [draft, inVisible, inHidden];
  assert.deepEqual(filterQuotations(scoped, { ...base, hiddenFolderIds: hidden }).map((q) => q.id).sort(), [draft.id, inVisible.id].sort());
  assert.deepEqual(filterQuotations(scoped, { ...base, hiddenFolderIds: hidden, folderId: 'f-hidden' }).map((q) => q.id), [inHidden.id]);
  assert.deepEqual(countQuotationsByView(scoped, TODAY, { folderId: null, hiddenFolderIds: hidden }).all, 2);
}

// --- Fechas y vigencia ----------------------------------------------------------------------------------------------
{
  assert.equal(formatQuotationDate('2026-11-23'), '23 nov 2026');
  assert.equal(formatQuotationDate('2026-01-05'), '5 ene 2026');
  assert.equal(formatQuotationDate('no-fecha'), '—');
  assert.equal(quotationValidityLabel({ status: 'draft', validUntil: null }, TODAY), 'Sin vigencia');
  assert.equal(quotationValidityLabel({ status: 'issued', validUntil: '2026-12-21' }, TODAY), 'Vence 21 dic 2026');
  assert.equal(quotationValidityLabel({ status: 'issued', validUntil: TODAY }, TODAY), 'Vence 26 nov 2026');
  assert.equal(quotationValidityLabel({ status: 'issued', validUntil: '2026-11-14' }, TODAY), 'Venció 14 nov 2026');
  assert.equal(quotationValidityLabel({ status: 'draft', validUntil: '2026-11-14' }, TODAY), 'Venció 14 nov 2026');
}

// --- Transiciones ofrecidas = canTransitionQuotation -----------------------------------------------------------------
{
  const statuses: QuotationStatus[] = ['draft', 'issued', 'accepted', 'rejected', 'void'];
  for (const from of statuses) {
    const offered = quotationStatusActions(from).map((a) => a.to).sort();
    assert.deepEqual(offered, statuses.filter((to) => canTransitionQuotation(from, to)).sort(), `transiciones desde ${from}`);
  }
  assert.deepEqual(quotationStatusActions('draft').map((a) => a.label), ['Emitir', 'Anular']);
  assert.deepEqual(quotationStatusActions('issued').map((a) => a.label), ['Marcar aceptada', 'Marcar rechazada', 'Reabrir', 'Anular']);
  assert.deepEqual(quotationStatusActions('void'), []);
}

// --- Marca de sincronización en la fila ------------------------------------------------------------------------------
{
  const ctx = (changes: Record<string, QuotationChange>, deletionQueue: QuotationDeletionCommand[] = [], signedIn = true) => ({ changes, deletionQueue, userId: 'u-1', signedIn });
  const server = quotation({ id: 'srv' });
  assert.equal(quotationSyncIssue('x', ctx({})), null);
  assert.equal(quotationSyncIssue('x', ctx({ x: { revision: 'r', baseVersion: 1 } }, [], false)), null, 'sin cuenta no hay nada que publicar');
  assert.equal(quotationSyncIssue('x', ctx({ x: { revision: 'r', baseVersion: 1 } }))?.kind, 'pending');
  assert.equal(quotationSyncIssue('x', ctx({ x: { revision: 'r', baseVersion: 1, serverQuotation: server } }))?.kind, 'version_conflict');
  assert.equal(quotationSyncIssue('x', ctx({ x: { revision: 'r', baseVersion: 1, serverQuotation: server, deletionConflict: true } }))?.kind, 'stale_deletion');
  assert.equal(quotationSyncIssue('x', ctx({ x: { revision: 'r', baseVersion: 1, serverDeleted: true } }))?.kind, 'server_deleted');
  const rejectedIssue = quotationSyncIssue('x', ctx({ x: { revision: 'r', baseVersion: 1, rejected: { revision: 'r', status: 409, code: 'quotation_locked', error: 'Bloqueada' } } }));
  assert.equal(rejectedIssue?.kind, 'rejected');
  assert.equal(rejectedIssue?.error, 'Bloqueada');
  const refused = quotationSyncIssue('x', ctx({}, [{ id: 'x', ownerId: 'u-1', baseVersion: 2, rejected: { status: 403, error: 'Sin permiso' } }]));
  assert.equal(refused?.kind, 'deletion_rejected');
  assert.equal(refused?.error, 'Sin permiso');
  const foreign = quotationSyncIssue('x', ctx({ x: { revision: 'r', baseVersion: 1, ownerId: 'u-2', serverQuotation: server } }));
  assert.equal(foreign?.kind, 'version_conflict');
  assert.equal(foreign?.own, false, 'el cambio de otra cuenta no se resuelve desde aquí');
}

console.log('Quotation summary tests passed.');
