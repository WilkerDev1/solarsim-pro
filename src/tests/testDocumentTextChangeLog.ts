import assert from 'node:assert/strict';
import {
  announceActivities, announceAppliedChanges, condenseText, proposalSubject, subjectHeadline, textChangeRows, textChangeSummary,
} from '../features/agentTools/documentTextLog';
import { restoreComposerText } from '../features/assistant/chatUi';
import { aiMenuStackClass } from '../components/layout/aiMenuStack';

// 1. Resumen: una línea, sin saltos, recortado y con marca para vacío.
assert.equal(condenseText('  Hola\n\n  mundo  '), 'Hola mundo');
assert.equal(condenseText(''), '(vacío)');
assert.equal(condenseText('a'.repeat(300), 20), `${'a'.repeat(19)}…`);
assert.equal(textChangeSummary('10 años', '25 años'), '«10 años» → «25 años»');
assert.equal(textChangeSummary('', 'Nuevo'), '(vacío) → «Nuevo»');

// 2. Filas: etiqueta legible + antes → después; un restablecimiento lo dice.
const rows = textChangeRows([
  { label: 'Garantía de paneles', before: '10 años', after: '25 años' },
  { label: 'Teléfono', before: '809-111', after: '809-222', reset: true },
]);
assert.deepEqual(rows[0], { label: 'Garantía de paneles', value: '«10 años» → «25 años»' });
assert.equal(rows[1].value, '«809-111» → «809-222» (predeterminado)');

// 3. Propuesta afectada: nombre del cliente y marca de «otra propuesta» frente a la abierta.
const p = { id: 'a', client: { name: 'Hotel Sol', projectId: 'SS-001' } };
assert.deepEqual(proposalSubject(p, 'a'), { proposalId: 'a', label: 'SS-001 · Hotel Sol', outsideOpen: false });
assert.equal(proposalSubject(p, 'b').outsideOpen, true);
assert.equal(proposalSubject(p, undefined).outsideOpen, true);
assert.equal(proposalSubject({ id: 'z', client: { name: 'Ana' } }, 'z').label, 'Ana');
assert.equal(subjectHeadline(proposalSubject(p, 'b')), 'Cambio en otra propuesta: SS-001 · Hotel Sol');
assert.equal(subjectHeadline(proposalSubject(p, 'a')), 'Propuesta: SS-001 · Hotel Sol');

// 4. Anuncio para lectores de pantalla: destaca la otra propuesta y lista los textos.
const other = { title: 'Texto «Garantía de paneles»', subject: proposalSubject(p, 'b'), changes: rows.slice(0, 1) };
assert.equal(announceAppliedChanges([other]), 'Cambio aplicado en otra propuesta: SS-001 · Hotel Sol. Garantía de paneles: «10 años» → «25 años». Puedes deshacerlo.');
const same = { title: 't', subject: proposalSubject(p, 'a'), changes: rows };
assert.match(announceAppliedChanges([same]), /^Cambio aplicado en SS-001 · Hotel Sol\. /);
assert.equal(announceAppliedChanges([{ title: 'x', changes: rows }]), '');

// 4b. Anuncio por ids de actividad (turno del chat o confirmación manual): solo las entradas pedidas, en el orden del registro.
const log = [{ id: 'x', ...other }, { id: 'y', title: 'z', changes: rows }];
assert.equal(announceActivities(['x'], log), announceAppliedChanges([other]));
assert.equal(announceActivities(['y'], log), '');
assert.equal(announceActivities([], log), '');

// 5. Compositor: se restaura el texto enviado solo si el campo sigue vacío.
assert.equal(restoreComposerText('', 'hola'), 'hola');
assert.equal(restoreComposerText('   ', 'hola'), 'hola');
assert.equal(restoreComposerText('otro', 'hola'), 'otro');

// 6. Menú de IA: el dock sube sobre Ajustes (z-40, posterior en el DOM) solo con el menú abierto.
assert.match(aiMenuStackClass(true), /z-\[60\]/);
assert.match(aiMenuStackClass(false), /z-40/);
console.log('testDocumentTextChangeLog OK');
