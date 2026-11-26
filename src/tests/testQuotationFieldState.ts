// Estado puro de los campos del editor de cotización (editor/fieldState.ts): un campo nunca confirma lo que el usuario
// no modificó, ni queda atascado tras pasar por solo lectura.
import assert from 'node:assert/strict';
import { formatAmount, formatExchangeRate } from '../../shared/quotations';
import { fieldDraftReducer as step, initialFieldDraft, pendingCommit, type FieldDraftEvent, type FieldDraftState } from '../components/quotations/editor/fieldState';

const run = (state: FieldDraftState, ...events: FieldDraftEvent[]) => events.reduce(step, state);

// Secuencia del revisor: emitida → clic en «Precio unit.» (980.00) → «Reabrir» → cambio a USD (16.33) → Tab.
let s = initialFieldDraft(formatAmount(98000), true);
s = run(s, { type: 'focus' }, { type: 'input', text: '1' }, { type: 'blur' });
assert.equal(s.draft, '980.00', 'en solo lectura no se edita');
assert.equal(pendingCommit(s), null, 'en solo lectura no se confirma');
s = run(s, { type: 'focus' });
s = run(s, { type: 'stored', display: '980.00', readOnly: false }); // reabrir, con el foco dentro
s = run(s, { type: 'stored', display: formatAmount(1633), readOnly: false }); // cambio a USD
assert.equal(s.draft, '16.33', 'el campo muestra lo guardado');
s = run(s, { type: 'blur' }, { type: 'focus' });
assert.equal(pendingCommit(s), null, 'pasar con Tab no escribe');
s = run(s, { type: 'blur' });
assert.equal(s.focused, false);
assert.equal(s.draft, '16.33');

// Lo guardado cambia con foco y sin edición: se muestra lo nuevo y no se confirma nada.
let t = run(initialFieldDraft('980.00', false), { type: 'focus' }, { type: 'stored', display: '16.33', readOnly: false });
assert.equal(t.draft, '16.33');
assert.equal(pendingCommit(t), null);

// Lo guardado cambia con foco y con edición: se conserva lo tecleado y se confirma al salir.
let u = run(initialFieldDraft('980.00', false), { type: 'focus' }, { type: 'input', text: '12' }, { type: 'stored', display: '16.33', readOnly: false });
assert.equal(u.draft, '12');
assert.equal(pendingCommit(u), '12');
// …salvo que la cotización pase a solo lectura: se descarta.
u = run(u, { type: 'stored', display: '16.33', readOnly: true });
assert.equal(u.draft, '16.33');
assert.equal(pendingCommit(u), null);

// Tasa con más decimales de los mostrados: mirar no la reescribe.
const rate = formatExchangeRate(58.123456);
assert.equal(rate, '58.1235');
assert.equal(pendingCommit(run(initialFieldDraft(rate, false), { type: 'focus' }, { type: 'blur' })), null);
// Volver a teclear lo mismo tampoco escribe.
assert.equal(pendingCommit(run(initialFieldDraft(rate, false), { type: 'focus' }, { type: 'input', text: '58.12' }, { type: 'input', text: '58.1235' })), null);

// Un rechazo deja el texto y el mensaje; un éxito o Escape reinician.
let v = run(initialFieldDraft('1', false), { type: 'focus' }, { type: 'input', text: '-3' }, { type: 'blur' }, { type: 'result', error: 'La cantidad es inválida' });
assert.equal(v.draft, '-3');
assert.equal(v.error, 'La cantidad es inválida');
v = run(v, { type: 'stored', display: '2', readOnly: false });
assert.equal(v.draft, '-3', 'lo rechazado sigue a la vista mientras no se corrija');
v = run(v, { type: 'escape' });
assert.equal(v.draft, '2');
assert.equal(v.error, null);
const ok = run(initialFieldDraft('1', false), { type: 'input', text: '5' }, { type: 'result', error: null }, { type: 'stored', display: '5', readOnly: false });
assert.equal(ok.draft, '5');
assert.equal(ok.dirty, false);

console.log('Quotation field state tests passed.');
