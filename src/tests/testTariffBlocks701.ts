import assert from 'node:assert/strict';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { buildAITariffContext } from '../utils/aiTariffContext';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { averageBlockEnergyRateDOP } from '../../shared/tariffRules';

/** Fase 1 del plan tarifario. */

const m = DEFAULT_RD_TARIFF_MATRIX;
const aiContext = { province: 'Santiago', tariffReference: buildAITariffContext(DEFAULT_RD_TARIFF_MATRIX) };
// ── 1c. Desde 701 kWh, en BTS-1 y BTS-2 todos los kWh van al 4.º rango (SIE-121, art. 4.d) ─────────
const ref = (d: string, code: string, kWh: number) => getReferenceEnergyRateUSD(m, d, code, kWh, 60);
const round3 = (n: number) => Math.round(n * 1000) / 1000;
assert.equal(ref('EDESUR', 'BTS1', 150), round3(6.05 / 60));
assert.equal(ref('EDESUR', 'BTS1', 250), round3(((200 * 6.05 + 50 * 8.59) / 250) / 60));
assert.equal(ref('EDESUR', 'BTS1', 700), round3(((200 * 6.05 + 100 * 8.59 + 400 * 12.89) / 700) / 60), '700 kWh sigue escalonado');
assert.equal(ref('EDESUR', 'BTS1', 701), round3(13.09 / 60), '701 kWh: todo al 4.º rango');
assert.equal(ref('EDESUR', 'BTS1', 1000), round3(13.09 / 60));
assert.equal(ref('EDENORTE', 'BTS1', 1000), round3(14.04 / 60));
assert.equal(ref('EDENORTE', 'BTS2', 800), round3(14.38 / 60), 'BTS-2 también');
assert.equal(ref('EDESUR', 'BTD', 3000), round3(9.02 / 60));
const blocks = [{ fromKWh: 0, toKWh: 200, rateDOP: 6 }, { fromKWh: 201, toKWh: 300, rateDOP: 8 }, { fromKWh: 301, toKWh: 700, rateDOP: 12 }, { fromKWh: 701, toKWh: null, rateDOP: 13 }];
assert.equal(averageBlockEnergyRateDOP(blocks, 1000, 'BTS1'), 13);
assert.equal(averageBlockEnergyRateDOP(blocks, 1000, 'BTS-2'), 13);
assert.equal(averageBlockEnergyRateDOP(blocks, 1000, 'VMT1'), (200 * 6 + 100 * 8 + 400 * 12 + 300 * 13) / 1000, 'Otras tarifas por bloques siguen escalonadas');
assert.equal(averageBlockEnergyRateDOP(blocks, 0, 'BTS1'), undefined);
// 701 kWh o mayor: el tramo 700–701 sigue escalonado y 701 exacto va todo al 4.º rango.
assert.equal(averageBlockEnergyRateDOP(blocks, 700.4, 'BTS1'), (200 * 6 + 100 * 8 + 400 * 12 + 0.4 * 13) / 700.4, '700.4 kWh sigue escalonado');
assert.equal(averageBlockEnergyRateDOP(blocks, 700, 'BTS1'), (200 * 6 + 100 * 8 + 400 * 12) / 700);
assert.equal(averageBlockEnergyRateDOP(blocks, 701, 'BTS1'), 13, '701 kWh: todo al 4.º rango');
assert.equal(averageBlockEnergyRateDOP(blocks, 701.2, 'BTS1'), 13);
// Bloques malformados: nunca NaN.
assert.equal(averageBlockEnergyRateDOP([{ fromKWh: 0, toKWh: undefined as never, rateDOP: 6 }], 100, 'BTS1'), undefined, 'toKWh indefinido');
assert.equal(averageBlockEnergyRateDOP([{ fromKWh: 0, toKWh: Number.NaN, rateDOP: 6 }], 100, 'BTS1'), undefined, 'toKWh NaN');
assert.equal(averageBlockEnergyRateDOP([{ fromKWh: Number.NaN, toKWh: null, rateDOP: 6 }], 100, 'BTS1'), undefined, 'fromKWh NaN');
assert.equal(averageBlockEnergyRateDOP([{ fromKWh: undefined as never, toKWh: 200, rateDOP: 6 }, { fromKWh: 201, toKWh: null, rateDOP: 8 }], 100), undefined, 'fromKWh indefinido');
assert.equal(averageBlockEnergyRateDOP([{ fromKWh: 0, toKWh: null, rateDOP: Number.NaN }], 100, 'BTS1'), undefined);
const highDraft = normalizeProposalDraft({ clientName: 'Cliente', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: Array(12).fill(1000), panels: [], inverters: [] }, [], aiContext as never) as any;
assert.equal(highDraft.energyCostPerKWhDOP, 13.09, 'El borrador de IA usa la misma regla');

console.log('Tarifas 1c: desde 701 kWh, BTS-1 y BTS-2 facturan todo al 4.º rango.');
