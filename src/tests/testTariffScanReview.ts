import assert from 'node:assert/strict';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { GeminiTariffService } from '../services/geminiTariffService';
import { applyTariffScanReview, assertDominicanTariffOrigin, prepareTariffScanReview, summarizeTariffScan } from '../utils/tariffExtraction';
import type { GeminiTransport } from '../../shared/geminiTransport';

/**
 * Escáner de resoluciones: cuadros de la distribuidora sin resolución citada (revisión con procedencia pedida, nada se aplica
 * sin confirmación), comparación con la matriz vigente («sin cambios de precio»), tarifas nuevas opt-in y rechazo por origen
 * de documentos de otro país aunque la distribuidora se llame igual. Transporte sintético; nunca red real.
 */

const blocks = (rates: number[]) => [
  { minKWh: 0, maxKWh: 200, rateDOP: rates[0] }, { minKWh: 201, maxKWh: 300, rateDOP: rates[1] },
  { minKWh: 301, maxKWh: 700, rateDOP: rates[2] }, { minKWh: 701, maxKWh: null, rateDOP: rates[3] },
];
// Cuadro oficial de EDESUR de noviembre 2026 («Dirección Comercial, aplicada al servicio público»): mismas cifras que la
// matriz SIE-121-2026-TF, sin número de resolución, con una tarifa BTS-VE de recarga de vehículos eléctricos que la matriz no tiene.
const edesurTariffs = {
  BTS1: { code: 'BTS1', currency: 'DOP', baseEnergyRateDOP: 13.09, fixedChargeDOP: 128.59, blocks: blocks([6.05, 8.59, 12.89, 13.09]),
    fixedChargeTiersDOP: [{ minKWh: 0, maxKWh: 100, chargeDOP: 42.1 }, { minKWh: 101, maxKWh: null, chargeDOP: 128.59 }] },
  BTS2: { code: 'BTS2', currency: 'DOP', baseEnergyRateDOP: 13.43, fixedChargeDOP: 128.96, blocks: blocks([8.62, 10.93, 13.26, 13.43]) },
  BTD: { code: 'BTD', currency: 'DOP', baseEnergyRateDOP: 9.02, fixedChargeDOP: 210.15, demandChargePerKWDOP: 1189.16 },
  MTD1: { code: 'MTD1', currency: 'DOP', baseEnergyRateDOP: 9.13, fixedChargeDOP: 211.68, demandChargePerKWDOP: 575.21 },
};
const bvte = { code: 'BTS-VE', name: 'BTS-VE (recarga de vehículos eléctricos)', currency: 'DOP', baseEnergyRateDOP: 11.5, fixedChargeDOP: 128.59 };
const edesurCuadro = {
  country: 'DO', regulator: null, currency: 'DOP',
  resolutionCode: null, effectiveDate: '2026-11-01', publishedBy: 'EDESUR Dominicana, Dirección Comercial',
  notes: 'Cuadro tarifario aplicado al servicio público; el documento no cita resolución.',
  schedules: { EDESUR: { tariffs: { ...edesurTariffs, 'BTS-VE': bvte } } },
};

// 1. Sin resolución: la revisión pide procedencia, no lanza; prellenada con la resolución de la matriz cuyos valores coinciden.
{
  const review = prepareTariffScanReview(edesurCuadro, DEFAULT_RD_TARIFF_MATRIX);
  assert.equal(review.provenanceRequired, true, 'un cuadro sin resolución pide procedencia en la revisión');
  assert.equal(review.document.resolutionCode, null);
  assert.equal(review.suggestion?.resolutionCode, 'SIE-121-2026-TF', 'los valores coinciden con la matriz vigente: se sugiere su resolución');
  assert.match(review.suggestion!.reason, /coinciden/);
  assert.deepEqual(review.defaultDecision, { kind: 'resolution', resolutionCode: 'SIE-121-2026-TF', effectiveDate: '2026-11-01' }, 'prellenado, pero solo se aplica al confirmar');
  // Valores iguales: «sin cambios de precio».
  assert.equal(review.priceChanges, false);
  assert.deepEqual(review.rows.filter((row) => row.status === 'unchanged').map((row) => row.code).sort(), ['BTD', 'BTS1', 'BTS2', 'MTD1']);
  const summary = summarizeTariffScan(review);
  assert.match(summary, /[Ss]in cambios de precio/);
  assert.match(summary, /SIE-121-2026-TF/);
  // Tarifa nueva: se muestra como nueva y no se aplica por defecto.
  const fresh = review.rows.filter((row) => row.status === 'new');
  assert.deepEqual(fresh.map((row) => `${row.distributor}/${row.code}`), ['EDESUR/BTS-VE']);
  assert.match(summary, /BTS-VE/);
  assert.match(summary, /nueva/);

  // Sin decidir procedencia (resolución vacía) no se aplica.
  assert.throws(() => applyTariffScanReview(review, { kind: 'resolution', resolutionCode: '  ', effectiveDate: '2026-11-01' }), /resolución/);
  assert.throws(() => applyTariffScanReview(review, { kind: 'resolution', resolutionCode: 'SIE-121-2026-TF', effectiveDate: '2026-11' }), /fecha/);
  assert.throws(() => applyTariffScanReview(review, { kind: 'distributor_table', period: '' }), /vigencia/);
  assert.throws(() => applyTariffScanReview(review, { kind: 'distributor_table', period: '2026-13' }), /vigencia/);

  // 2. Con resolución tecleada por el usuario: se aplica con esa procedencia; la tarifa nueva queda fuera salvo opt-in.
  const applied = applyTariffScanReview(review, { kind: 'resolution', resolutionCode: 'SIE-121-2026-TF', effectiveDate: '2026-11-01' });
  assert.equal(applied.resolutionCode, 'SIE-121-2026-TF');
  assert.equal(applied.effectiveDate, '2026-11-01');
  assert.equal(applied.publishedBy, 'EDESUR Dominicana, Dirección Comercial');
  assert.equal(applied.schedules.EDESUR.tariffs.BTS1.source?.resolutionCode, 'SIE-121-2026-TF');
  assert.equal(applied.schedules.EDESUR.tariffs.BTS1.source?.effectiveDate, '2026-11-01');
  assert.equal(applied.schedules.EDESUR.tariffs.BTS1.baseEnergyRateDOP, 13.09);
  assert.equal(applied.schedules.EDESUR.tariffs['BTS-VE'], undefined, 'la tarifa nueva no se aplica por defecto');
  assert.match(applied.notes ?? '', /indicada por el usuario/, 'la procedencia tecleada queda declarada en las notas');
  assert.equal(DEFAULT_RD_TARIFF_MATRIX.schedules.EDESUR.tariffs['BTS-VE'], undefined, 'no muta la matriz de fábrica');

  const optIn = applyTariffScanReview(review, { kind: 'resolution', resolutionCode: 'SIE-121-2026-TF', effectiveDate: '2026-11-01' }, ['EDESUR/BTS-VE']);
  assert.equal(optIn.schedules.EDESUR.tariffs['BTS-VE'].baseEnergyRateDOP, 11.5, 'opt-in: se incorpora con la procedencia elegida');
  assert.equal(optIn.schedules.EDESUR.tariffs['BTS-VE'].source?.resolutionCode, 'SIE-121-2026-TF');

  // 3. Marcado como cuadro de la distribuidora sin resolución citada, con vigencia mes/año obligatoria.
  const table = applyTariffScanReview(review, { kind: 'distributor_table', period: '2026-11' });
  assert.equal(table.effectiveDate, '2026-11-01');
  assert.match(table.resolutionCode, /sin resolución citada/);
  assert.match(table.resolutionCode, /EDESUR/);
  assert.match(table.resolutionCode, /2026-11/);
  assert.equal(table.schedules.EDESUR.tariffs.BTD.source?.resolutionCode, table.resolutionCode);
  assert.equal(table.schedules.EDENORTE.tariffs.BTS1.source?.resolutionCode, 'SIE-121-2026-TF', 'las filas no documentadas conservan su fuente');
}

// Nota del usuario con resolución: manda sobre la coincidencia de valores.
{
  const review = prepareTariffScanReview(edesurCuadro, DEFAULT_RD_TARIFF_MATRIX, 'Cuadro de noviembre, corresponde a la SIE-121-2026-TF');
  assert.equal(review.suggestion?.resolutionCode, 'SIE-121-2026-TF');
  assert.match(review.suggestion!.reason, /nota/);
}

// Valores distintos: el resumen cuenta los cambios; sin fecha en el documento, la vigencia queda vacía y pedida.
{
  const changed = { ...edesurCuadro, effectiveDate: null, schedules: { EDESUR: { tariffs: { ...edesurTariffs, BTD: { ...edesurTariffs.BTD, baseEnergyRateDOP: 9.5 } } } } };
  const review = prepareTariffScanReview(changed, DEFAULT_RD_TARIFF_MATRIX);
  assert.equal(review.priceChanges, true);
  const btd = review.rows.find((row) => row.code === 'BTD')!;
  assert.equal(btd.status, 'changed');
  assert.deepEqual(btd.changedFields, ['baseEnergyRateDOP']);
  assert.doesNotMatch(summarizeTariffScan(review), /[Ss]in cambios de precio/);
  assert.match(summarizeTariffScan(review), /1 tarifa con cambios/);
  assert.equal(review.suggestion, undefined, 'sin coincidencia, nota ni fecha no se sugiere resolución');
  assert.deepEqual(review.defaultDecision, { kind: 'distributor_table', period: '' });
  assert.throws(() => applyTariffScanReview(review, review.defaultDecision), /vigencia/, 'vigencia obligatoria');
}

// Fecha dentro del periodo de una resolución conocida de la matriz: se sugiere aunque cambien valores.
{
  const changed = { ...edesurCuadro, schedules: { EDESUR: { tariffs: { BTD: { ...edesurTariffs.BTD, baseEnergyRateDOP: 9.5 } } } } };
  const review = prepareTariffScanReview(changed, DEFAULT_RD_TARIFF_MATRIX);
  assert.equal(review.suggestion?.resolutionCode, 'SIE-121-2026-TF');
  assert.match(review.suggestion!.reason, /periodo/);
}

// Solo tarifas nuevas sin activar: no hay nada que aplicar (mensaje claro, no el genérico).
{
  const onlyNew = { ...edesurCuadro, schedules: { EDESUR: { tariffs: { 'BTS-VE': bvte } } } };
  const review = prepareTariffScanReview(onlyNew, DEFAULT_RD_TARIFF_MATRIX);
  assert.throws(() => applyTariffScanReview(review, { kind: 'distributor_table', period: '2026-11' }), /tarifas nuevas/);
  assert.ok(applyTariffScanReview(review, { kind: 'distributor_table', period: '2026-11' }, ['EDESUR/BTS-VE']).schedules.EDESUR.tariffs['BTS-VE']);
}

// Códigos escritos con guion (BTS-1) se casan con la fila existente; no se crean filas duplicadas como «nuevas».
{
  const hyphen = { ...edesurCuadro, schedules: { EDESUR: { tariffs: { 'BTS-1': { ...edesurTariffs.BTS1, code: 'BTS-1' } } } } };
  const review = prepareTariffScanReview(hyphen, DEFAULT_RD_TARIFF_MATRIX);
  assert.deepEqual(review.rows.map((row) => [row.code, row.status]), [['BTS1', 'unchanged']]);
  const applied = applyTariffScanReview(review, review.defaultDecision);
  assert.equal(applied.schedules.EDESUR.tariffs['BTS-1'], undefined);
}

// Documento con resolución y fecha: no pide procedencia y se aplica con la del documento.
{
  const cited = { ...edesurCuadro, resolutionCode: 'SIE-130-2026-TF', publishedBy: 'Superintendencia de Electricidad (SIE)', regulator: 'SIE' };
  const review = prepareTariffScanReview(cited, DEFAULT_RD_TARIFF_MATRIX);
  assert.equal(review.provenanceRequired, false);
  assert.deepEqual(review.defaultDecision, { kind: 'resolution', resolutionCode: 'SIE-130-2026-TF', effectiveDate: '2026-11-01' });
  assert.equal(applyTariffScanReview(review, review.defaultDecision).schedules.EDESUR.tariffs.BTS1.source?.resolutionCode, 'SIE-130-2026-TF');
}

// 4. Rechazo por origen: EDESUR Argentina (edesur.com.ar, Resolución ENReGE 887/26, pesos argentinos, T1-R1…).
const argentina = {
  country: 'AR', regulator: 'ENReGE', currency: 'ARS',
  resolutionCode: 'Resolución ENReGE 887/26', effectiveDate: '2026-11-01', publishedBy: 'EDESUR S.A. (edesur.com.ar)',
  schedules: { EDESUR: { tariffs: { 'T1-R1': { code: 'T1-R1', currency: 'ARS', baseEnergyRateDOP: 85.3, fixedChargeDOP: 1200 } } } },
};
const originError = /República Dominicana/;
assert.throws(() => assertDominicanTariffOrigin(argentina), originError);
assert.throws(() => prepareTariffScanReview(argentina, DEFAULT_RD_TARIFF_MATRIX), (error: Error) => {
  assert.match(error.message, originError);
  assert.match(error.message, /AR/);
  assert.doesNotMatch(error.message, /moneda válida/, 'el motivo es el origen, no la moneda de una fila');
  return true;
});
// Aunque la IA diga DOP en todo: país/regulador de otro lugar rechazan igual.
const disguised = { ...argentina, currency: 'DOP', schedules: { EDESUR: { tariffs: { 'T1-R1': { code: 'T1-R1', currency: 'DOP', baseEnergyRateDOP: 85.3, fixedChargeDOP: 1200 } } } } };
assert.throws(() => prepareTariffScanReview(disguised, DEFAULT_RD_TARIFF_MATRIX), originError, 'país AR con moneda DOP');
assert.throws(() => prepareTariffScanReview({ ...disguised, country: null }, DEFAULT_RD_TARIFF_MATRIX), /ENReGE/, 'regulador ENReGE sin país');
assert.throws(() => prepareTariffScanReview({ ...disguised, country: 'Argentina', regulator: 'ENRE' }, DEFAULT_RD_TARIFF_MATRIX), originError);
// Sin país ni regulador, con DOP: los códigos que no casan con los dominicanos también rechazan.
assert.throws(() => prepareTariffScanReview({ ...disguised, country: null, regulator: null }, DEFAULT_RD_TARIFF_MATRIX), /T1-R1/, 'códigos no dominicanos');
// Moneda del documento de otro país.
assert.throws(() => prepareTariffScanReview({ ...edesurCuadro, currency: 'ARS' }, DEFAULT_RD_TARIFF_MATRIX), /ARS/);
// Lo dominicano pasa: país por nombre, regulador SIE o CNE, o sin declarar.
for (const ok of [{ country: 'República Dominicana', regulator: 'Superintendencia de Electricidad (SIE)' }, { country: 'DO', regulator: 'CNE' }, { country: null, regulator: null, currency: null }]) {
  assert.doesNotThrow(() => assertDominicanTariffOrigin({ ...edesurCuadro, ...ok }));
}

// Por el servicio: el prompt pide país, regulador y moneda observados; la respuesta argentina se rechaza por origen y la
// dominicana sin resolución vuelve como revisión (no lanza).
{
  let prompt = '';
  const answer = (payload: unknown): GeminiTransport => async (_url, body) => {
    prompt = JSON.stringify(body);
    return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }] };
  };
  const base = { fileBase64: 'QA==', mimeType: 'application/pdf', apiKey: 'synthetic-test-key', currentMatrix: DEFAULT_RD_TARIFF_MATRIX };
  await assert.rejects(GeminiTariffService.scanTariffDocument({ ...base, transport: answer(argentina) }), originError);
  assert.match(prompt, /country/);
  assert.match(prompt, /regulator/);
  assert.match(prompt, /currency/);
  const review = await GeminiTariffService.scanTariffDocument({ ...base, userPromptNotes: 'Cuadro EDESUR noviembre', transport: answer(edesurCuadro) });
  assert.equal(review.provenanceRequired, true);
  assert.equal(review.priceChanges, false);
  // La ruta estricta (sin revisión) sigue exigiendo la resolución del documento.
  await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ ...base, transport: answer(edesurCuadro) }), /resolución/);
  await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ ...base, transport: answer(argentina) }), originError);
}

console.log('PASS escáner de resoluciones: cuadro sin resolución, sin cambios, tarifas nuevas opt-in y rechazo por origen');
