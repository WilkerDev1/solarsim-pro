import assert from 'node:assert/strict';
import {
  QUOTATION_NUMBER_PREFIX, QUOTATION_STATUS_LABELS, canTransitionQuotation, effectiveQuotationStatus, formatQuotationNumber,
  isQuotationContentLocked, parseQuotationNumber, quotationNumberYear, validateQuotationContent,
} from '../../shared/quotations/index';
import type { QuotationStatus } from '../../shared/quotations/index';

const STATUSES: QuotationStatus[] = ['draft', 'issued', 'accepted', 'rejected', 'void'];
const ALLOWED = new Set([
  'draft>issued', 'draft>void', 'issued>accepted', 'issued>rejected', 'issued>void', 'issued>draft', 'accepted>void', 'rejected>draft',
]);

// etiquetas en español
assert.deepEqual(QUOTATION_STATUS_LABELS, {
  draft: 'Borrador', issued: 'Emitida', accepted: 'Aceptada', rejected: 'Rechazada', void: 'Anulada', expired: 'Vencida',
});

// matriz completa de transiciones contra la lista permitida (incluye mismo → mismo)
let checked = 0;
for (const from of STATUSES) {
  for (const to of STATUSES) {
    assert.equal(canTransitionQuotation(from, to), ALLOWED.has(`${from}>${to}`), `${from} → ${to}`);
    checked++;
  }
}
assert.equal(checked, 25);
assert.equal(ALLOWED.size, 8);
assert.equal(canTransitionQuotation('void', 'draft'), false, 'anulada es terminal');
assert.equal(canTransitionQuotation('bogus' as never, 'draft'), false);
assert.equal(canTransitionQuotation('draft', 'expired' as never), false, 'vencida es derivada, no se asigna');

// bloqueo de contenido: solo el borrador se edita
for (const status of STATUSES) assert.equal(isQuotationContentLocked(status), status !== 'draft', status);

// vencida: solo emitidas, y el día límite aún es válido
const q = (status: QuotationStatus, validUntil: string | null) => ({ status, validUntil });
assert.equal(effectiveQuotationStatus(q('issued', '2026-03-10'), '2026-03-09'), 'issued');
assert.equal(effectiveQuotationStatus(q('issued', '2026-03-10'), '2026-03-10'), 'issued', 'el mismo día aún es válida');
assert.equal(effectiveQuotationStatus(q('issued', '2026-03-10'), '2026-03-11'), 'expired');
assert.equal(effectiveQuotationStatus(q('issued', '2025-12-31'), '2026-01-01'), 'expired', 'cambio de año');
assert.equal(effectiveQuotationStatus(q('issued', null), '2099-01-01'), 'issued', 'sin vigencia nunca vence');
for (const status of STATUSES.filter(s => s !== 'issued')) {
  assert.equal(effectiveQuotationStatus(q(status, '2020-01-01'), '2026-03-11'), status, `${status} no vence`);
}

// numeración
assert.equal(QUOTATION_NUMBER_PREFIX, 'COT');
assert.equal(formatQuotationNumber(2026, 147), 'COT-2026-0147');
assert.equal(formatQuotationNumber(2026, 1), 'COT-2026-0001');
assert.equal(formatQuotationNumber(2026, 9999), 'COT-2026-9999');
assert.equal(formatQuotationNumber(2026, 12345), 'COT-2026-12345', 'no trunca pasado 9999');
assert.throws(() => formatQuotationNumber(2026, 0), RangeError);
assert.throws(() => formatQuotationNumber(2026, 1.5), RangeError);
assert.throws(() => formatQuotationNumber(26, 1), RangeError);

assert.deepEqual(parseQuotationNumber('COT-2026-0147'), { year: 2026, sequence: 147 });
assert.deepEqual(parseQuotationNumber('COT-2026-12345'), { year: 2026, sequence: 12345 });
for (const bad of ['', 'cot-2026-0147', 'COT-2026-147', 'COT-2026-00147', 'COT-26-0147', 'COT-2026-0000', 'COT-2026-0147 ', ' COT-2026-0147', 'COT-2026-01x7', 'FAC-2026-0147', 'COT2026-0147', 'COT-2026-0147-1']) {
  assert.equal(parseQuotationNumber(bad), null, `rechaza ${JSON.stringify(bad)}`);
}
assert.equal(parseQuotationNumber(undefined as never), null);
assert.equal(parseQuotationNumber(42 as never), null);
for (const [year, sequence] of [[2026, 1], [2026, 9999], [2031, 10000], [1999, 42]]) {
  assert.deepEqual(parseQuotationNumber(formatQuotationNumber(year, sequence)), { year, sequence }, 'ida y vuelta');
}

assert.equal(quotationNumberYear('2026-03-10'), 2026);
assert.equal(quotationNumberYear('2025-12-31'), 2025);
assert.throws(() => quotationNumberYear('10/03/2026'), RangeError);

// toda fecha de emisión que la validación acepta produce un número sin lanzar
{
  const dates = ['0000-01-01', '0999-05-01', '1000-01-01', '1999-12-31', '2000-01-01', '2026-03-10', '2199-12-31', '2200-01-01', '9999-12-31'];
  for (let year = 1990; year <= 2210; year += 7) dates.push(`${String(year).padStart(4, '0')}-06-15`);
  let accepted = 0;
  for (const issueDate of dates) {
    const result = validateQuotationContent({ status: 'draft', issueDate, currency: 'DOP', exchangeRate: 60 });
    if (!result.ok) continue;
    accepted++;
    assert.doesNotThrow(() => formatQuotationNumber(quotationNumberYear(result.value.issueDate), 1), `número para ${issueDate}`);
  }
  assert(accepted >= 3, 'se aceptan fechas del rango');
}

console.log('Quotation status and numbering tests passed.');
