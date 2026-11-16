import assert from 'node:assert/strict';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { buildAITariffContext, resolveAITariffSelection } from '../utils/aiTariffContext';
import { normalizeStoredTariffMatrix } from '../utils/tariffExtraction';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { averageBlockEnergyRateDOP, normalizeTariffCode, tariffChargeKind } from '../../shared/tariffRules';
import { getTariffDisplayName } from '../../shared/proposalPresentation';
import { mapTariffCodeOnDistributorChange, type GlobalTariffMatrix } from '../types/tariffs';
import { createDocumentTextContext } from '../../shared/documentTexts/context';
import { publishedDocumentTexts, regulatoryNoteDefault, resolveDocumentText, viewerText, docTextKey } from '../../shared/documentTexts';

/** Fase 1 del plan tarifario. */

// ── 1d. Nota regulatoria según el tipo de tarifa ──────────────────────────────────────────────────
assert.equal(tariffChargeKind('EDESUR', 'BTS-1'), 'single_price');
assert.equal(tariffChargeKind('EDESUR', 'BTS2'), 'single_price');
assert.equal(tariffChargeKind('CEPM', 'RBT-1'), 'single_price');
assert.equal(tariffChargeKind('CEPM', 'BTS1'), 'single_price');
for (const code of ['BTD', 'BTH', 'MTD1', 'MTD-2', 'MTH']) assert.equal(tariffChargeKind('EDENORTE', code), 'demand', code);
assert.equal(tariffChargeKind('CEPM', 'RBT-2'), 'demand');
assert.equal(tariffChargeKind('EDESUR', 'VMT1'), 'unknown');

const ctx = (distributor: string, tariffCode: string, extra: Record<string, unknown> = {}) => createDocumentTextContext({ distributor, tariffCode, gridExportFeePct: 25, isZeroExport: false, hasBattery: false, ...extra });
const chargeSentence = 'equivalente al 25% del valor de la energía excedente exportada';
assert.ok(regulatoryNoteDefault(ctx('EDENORTE', 'BTS1')).includes(chargeSentence), 'BTS-1 conserva el cargo');
assert.ok(regulatoryNoteDefault(ctx('CEPM', 'RBT-1')).includes(chargeSentence), 'RBT-1 conserva el cargo');
for (const [d, code] of [['EDESUR', 'BTD'], ['EDENORTE', 'MTD1'], ['EDEESTE', 'BTH'], ['CEPM', 'RBT-2']]) {
  const note = regulatoryNoteDefault(ctx(d, code));
  assert.ok(!note.includes(chargeSentence), `${d}/${code}: sin cargo por uso de red`);
  assert.ok(note.includes('no aplica el cargo por derecho de uso de la red'), note);
  assert.ok(note.includes('un 25% de la energía excedente exportada'), `${d}/${code}: declara el criterio del cálculo actual`);
  assert.equal(note.split('\n\n').length, 4);
}
assert.ok(!regulatoryNoteDefault(ctx('EDESUR', 'BTD', { gridExportFeePct: 0 })).includes('% de la energía excedente'), 'Sin retención no menciona porcentaje');
// Inyección cero y tarifas no clasificadas no cambian.
assert.ok(regulatoryNoteDefault(ctx('EDESUR', 'VMT1')).includes(chargeSentence));
assert.ok(regulatoryNoteDefault(ctx('EDESUR', 'BTD', { isZeroExport: true })).includes('no genera cargos por derecho de uso de la red'));
// Edición «legacy» (enlaces publicados antes del cambio): texto anterior para cualquier tarifa.
assert.ok(regulatoryNoteDefault(ctx('EDESUR', 'BTD', { regulatoryNoteEdition: 'legacy' })).includes(chargeSentence));

// Un texto personalizado nunca se toca.
const customNote = 'Nota propia del instalador.';
assert.equal(resolveDocumentText('projectDescription.regulatoryNote', { customization: { regulatoryNote: customNote } as never }, ctx('EDESUR', 'BTD')).text, customNote);

// Publicación: la nota vigente viaja siempre en el enlace nuevo, así el visor no la recalcula.
const published = publishedDocumentTexts({ customization: {} }, ctx('EDESUR', 'BTD'));
assert.equal(published[docTextKey('projectDescription.regulatoryNote')], regulatoryNoteDefault(ctx('EDESUR', 'BTD')));
assert.deepEqual(Object.keys(published), [docTextKey('projectDescription.regulatoryNote')], 'Ningún otro texto por defecto se publica');
// Visor: enlace nuevo → nota publicada; enlace antiguo (sin doc:) → edición legacy.
assert.equal(viewerText('projectDescription.regulatoryNote', published, {}, ctx('EDESUR', 'BTD')), published[docTextKey('projectDescription.regulatoryNote')]);
assert.ok(viewerText('projectDescription.regulatoryNote', {}, {}, ctx('EDESUR', 'BTD', { regulatoryNoteEdition: 'legacy' })).includes(chargeSentence));

console.log('Tarifas 1d: nota regulatoria según tarifa; textos personalizados y enlaces antiguos intactos.');
