import assert from 'node:assert/strict';
import { validateAssistantEdits } from '../features/assistant/validation';
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

// ── 1a. Un solo normalizador de códigos de tarifa ────────────────────────────────────────────────
for (const [raw, expected] of [
  ['BTS-1', 'BTS1'], ['BTS 1', 'BTS1'], ['bts1', 'BTS1'], [' bts_1 ', 'BTS1'], ['BTS–2', 'BTS2'], ['MTD-1', 'MTD1'], ['mtd 2', 'MTD2'], ['btd', 'BTD'],
  ['RBT1', 'RBT-1'], ['rbt 2', 'RBT-2'], ['ESTRBT2', 'ESTRBT-2'], ['RMT1', 'RMT-1'], ['RBT-1', 'RBT-1'], ['', ''],
] as const) assert.equal(normalizeTariffCode(raw), expected, `normalizeTariffCode(${JSON.stringify(raw)})`);
assert.equal(normalizeTariffCode(undefined), '');

assert.equal(resolveAITariffSelection(DEFAULT_RD_TARIFF_MATRIX, 'EDENORTE', 'BTS-1')?.code, 'BTS1');
assert.equal(resolveAITariffSelection(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'MTD-1')?.code, 'MTD1');
assert.equal(resolveAITariffSelection(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'RBT1')?.code, 'RBT-1');
assert.equal(resolveAITariffSelection(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'BTS-1')?.code, 'RBT-1');
assert.equal(resolveAITariffSelection(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'XYZ'), null, 'Un código desconocido sigue sin resolverse');
assert.equal(getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDENORTE', 'BTS-1', 250, 60), getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDENORTE', 'BTS1', 250, 60));
assert.equal(getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'rbt 2', 900, 60), getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'RBT-2', 900, 60));
assert.equal(getTariffDisplayName('EDENORTE', 'BTS-1'), getTariffDisplayName('EDENORTE', 'BTS1'));
assert.equal(getTariffDisplayName('CEPM', 'RBT1'), 'RBT-1 (Baja Tensión Regular)');
assert.equal(mapTariffCodeOnDistributorChange('EDESUR', 'CEPM', 'BTS-1'), 'RBT-1');
assert.equal(validateAssistantEdits([{ section: 'rates', field: 'tariffCode', value: 'bts-1' }], 'project')[0].value, 'BTS1', 'El asistente guarda el código canónico');
assert.equal(mapTariffCodeOnDistributorChange('CEPM', 'EDESUR', 'RBT2'), 'BTD');

// El aviso falso «La tarifa BTS-1 de EDENORTE no se pudo confirmar» desaparece y se usa la referencia por bloques.
const aiContext = { province: 'Santiago', tariffReference: buildAITariffContext(DEFAULT_RD_TARIFF_MATRIX) };
const draft = normalizeProposalDraft({ clientName: 'Cliente', distributor: 'edenorte', tariffCode: 'BTS-1', monthlyConsumptionKWh: Array(12).fill(250), panels: [], inverters: [] }, [], aiContext as never) as any;
assert.equal(draft.tariffCode, 'BTS1');
assert.ok(!draft.validationIssues.some((issue: any) => issue.code === 'unknown_tariff'), JSON.stringify(draft.validationIssues));
assert.equal(draft.energyRateSource, 'reference');
const [first, second] = DEFAULT_RD_TARIFF_MATRIX.schedules.EDENORTE.tariffs.BTS1.blocks!;
assert.equal(Math.round(draft.energyCostPerKWhDOP * 1000) / 1000, Math.round(((200 * first.rateDOP + 50 * second.rateDOP) / 250) * 1000) / 1000);
const cepmDraft = normalizeProposalDraft({ clientName: 'Cliente', distributor: 'CEPM', tariffCode: 'RBT1', monthlyConsumptionKWh: Array(12).fill(500), panels: [], inverters: [] }, [], aiContext as never) as any;
assert.equal(cepmDraft.tariffCode, 'RBT-1');
assert.ok(!cepmDraft.validationIssues.some((issue: any) => issue.code === 'unknown_tariff'));
const unknownDraft = normalizeProposalDraft({ clientName: 'Cliente', distributor: 'EDESUR', tariffCode: 'XYZ', monthlyConsumptionKWh: Array(12).fill(500), panels: [], inverters: [] }, [], aiContext as never) as any;
assert.ok(unknownDraft.validationIssues.some((issue: any) => issue.code === 'unknown_tariff'), 'Un código realmente desconocido sigue avisando');

console.log('Tarifas 1a: un solo normalizador de códigos (BTS-1 → BTS1, RBT1 → RBT-1).');
