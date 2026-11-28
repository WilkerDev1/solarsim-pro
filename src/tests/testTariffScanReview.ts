import assert from 'node:assert/strict';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { GeminiTariffService } from '../services/geminiTariffService';
import { applyTariffScanReview, assertDominicanTariffOrigin, describeTariffSource, humanizeTariffNotes, PENDING_TARIFF_SOURCE, prepareTariffScanReview, summarizeTariffScan } from '../utils/tariffExtraction';
import { type GeminiTransport } from './support/restFixture';
import { clientFromTransport } from './support/clientFromTransport';

/**
 * Escáner de resoluciones: cuadros de la distribuidora sin resolución citada (revisión con procedencia pedida, nada se aplica
 * sin confirmación), comparación con la matriz vigente («sin cambios de precio»), tarifas no soportadas (se muestran y se
 * descartan) y rechazo por origen
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
  // Tarifa que SolarSim no soporta todavía: se muestra (informativa) y se descarta; nunca se incorpora.
  const unsupported = review.rows.filter((row) => row.status === 'unsupported');
  assert.deepEqual(unsupported.map((row) => `${row.distributor}/${row.code}`), ['EDESUR/BTS-VE']);
  assert.equal(unsupported[0].name, 'BTS-VE (recarga de vehículos eléctricos)');
  assert.match(summary, /BTS-VE/);
  assert.match(summary, /no soportada todavía por SolarSim/);
  assert.match(summary, /no se incorpora/);

  // Sin decidir procedencia (resolución vacía) no se aplica.
  assert.throws(() => applyTariffScanReview(review, { kind: 'resolution', resolutionCode: '  ', effectiveDate: '2026-11-01' }), /resolución/);
  assert.throws(() => applyTariffScanReview(review, { kind: 'resolution', resolutionCode: 'SIE-121-2026-TF', effectiveDate: '2026-11' }), /fecha/);
  assert.throws(() => applyTariffScanReview(review, { kind: 'distributor_table', period: '' }), /vigencia/);
  assert.throws(() => applyTariffScanReview(review, { kind: 'distributor_table', period: '2026-13' }), /vigencia/);

  // 2. Con resolución tecleada por el usuario: se aplica con esa procedencia; la tarifa no soportada queda fuera.
  const applied = applyTariffScanReview(review, { kind: 'resolution', resolutionCode: 'SIE-121-2026-TF', effectiveDate: '2026-11-01' });
  assert.equal(applied.resolutionCode, 'SIE-121-2026-TF');
  assert.equal(applied.effectiveDate, '2026-11-01');
  assert.equal(applied.publishedBy, 'EDESUR Dominicana, Dirección Comercial');
  assert.equal(applied.schedules.EDESUR.tariffs.BTS1.source?.resolutionCode, 'SIE-121-2026-TF');
  assert.equal(applied.schedules.EDESUR.tariffs.BTS1.source?.effectiveDate, '2026-11-01');
  assert.equal(applied.schedules.EDESUR.tariffs.BTS1.baseEnergyRateDOP, 13.09);
  assert.equal(applied.schedules.EDESUR.tariffs['BTS-VE'], undefined, 'la tarifa no soportada no se incorpora');
  assert.equal(applied.schedules.EDESUR.tariffs.BTSVE, undefined, 'tampoco con la clave normalizada');
  assert.equal(applyTariffScanReview.length, 2, 'no hay opción para activar tarifas no soportadas');
  assert.match(applied.notes ?? '', /indicada por el usuario/, 'la procedencia tecleada queda declarada en las notas');
  assert.equal(DEFAULT_RD_TARIFF_MATRIX.schedules.EDESUR.tariffs['BTS-VE'], undefined, 'no muta la matriz de fábrica');

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

// Solo tarifas no soportadas: nada que aplicar, con mensaje claro (no el genérico). Una fila no soportada mal formada no
// bloquea la revisión: se descarta sin validarse.
{
  const onlyUnsupported = { ...edesurCuadro, schedules: { EDESUR: { tariffs: { 'BTS-VE': bvte, 'BTS VE2': { code: 'BTS VE2', currency: 'DOP' } } } } };
  const review = prepareTariffScanReview(onlyUnsupported, DEFAULT_RD_TARIFF_MATRIX);
  assert.deepEqual(review.rows.map((row) => row.status), ['unsupported', 'unsupported']);
  assert.throws(() => applyTariffScanReview(review, { kind: 'distributor_table', period: '2026-11' }), /no soportadas todavía por SolarSim/);
  assert.match(summarizeTariffScan(review), /[Nn]ada que aplicar/);
}

// Códigos comparados siempre normalizados (BTS-1, «bts 2», CEPM RBT1): se casan con la fila existente, sin duplicados.
{
  const hyphen = { ...edesurCuadro, schedules: { EDESUR: { tariffs: { 'BTS-1': { ...edesurTariffs.BTS1, code: 'BTS-1' }, 'bts 2': { ...edesurTariffs.BTS2, code: 'bts 2' } } } } };
  const review = prepareTariffScanReview(hyphen, DEFAULT_RD_TARIFF_MATRIX);
  assert.deepEqual(review.rows.map((row) => [row.code, row.status]), [['BTS1', 'unchanged'], ['BTS2', 'unchanged']]);
  const applied = applyTariffScanReview(review, review.defaultDecision);
  assert.equal(applied.schedules.EDESUR.tariffs['BTS-1'], undefined);
  assert.equal(applied.schedules.EDESUR.tariffs['bts 2'], undefined);
  const cepm = prepareTariffScanReview({ ...edesurCuadro, schedules: { CEPM: { tariffs: { RBT1: { code: 'RBT1', currency: 'DOP', baseEnergyRateDOP: 22.9, fixedChargeDOP: DEFAULT_RD_TARIFF_MATRIX.schedules.CEPM.tariffs['RBT-1'].fixedChargeDOP } } } } }, DEFAULT_RD_TARIFF_MATRIX);
  assert.deepEqual(cepm.rows.map((row) => [row.code, row.status]), [['RBT-1', 'unchanged']]);
}

// Sugerencia por coincidencia de valores: solo resoluciones reales, nunca marcadores internos de procedencia.
{
  const firstTable = applyTariffScanReview(prepareTariffScanReview({ ...edesurCuadro, effectiveDate: '2026-10-01' }, DEFAULT_RD_TARIFF_MATRIX), { kind: 'distributor_table', period: '2026-10' });
  assert.match(firstTable.schedules.EDESUR.tariffs.BTS1.source!.resolutionCode, /sin resolución citada/);
  const again = prepareTariffScanReview({ ...edesurCuadro, effectiveDate: null }, firstTable);
  assert.equal(again.priceChanges, false);
  assert.equal(again.suggestion, undefined, 'no prellena «Cuadro de EDESUR sin resolución citada (2026-10)»');
  assert.deepEqual(again.defaultDecision, { kind: 'distributor_table', period: '' });
  const marked = structuredClone(DEFAULT_RD_TARIFF_MATRIX);
  for (const tariff of Object.values(marked.schedules.EDESUR.tariffs)) tariff.source = { resolutionCode: 'Catálogo anterior (no confirmado)', effectiveDate: '2026-01-01', publishedBy: 'X' };
  assert.equal(prepareTariffScanReview({ ...edesurCuadro, schedules: { EDESUR: { tariffs: edesurTariffs } } }, marked).suggestion, undefined, 'no prellena «Catálogo anterior (no confirmado)»');
}

// Documento con resolución y fecha: no pide procedencia y se aplica con la del documento.
{
  const cited = { ...edesurCuadro, resolutionCode: 'SIE-130-2026-TF', publishedBy: 'Superintendencia de Electricidad (SIE)', regulator: 'SIE' };
  const review = prepareTariffScanReview(cited, DEFAULT_RD_TARIFF_MATRIX);
  assert.equal(review.provenanceRequired, false);
  assert.deepEqual(review.defaultDecision, { kind: 'resolution', resolutionCode: 'SIE-130-2026-TF', effectiveDate: '2026-11-01' });
  assert.equal(applyTariffScanReview(review, review.defaultDecision).schedules.EDESUR.tariffs.BTS1.source?.resolutionCode, 'SIE-130-2026-TF');
}

// Prueba real con Gemini: el cuadro de EDESUR «0-200, 201-300, 301-700, >701 kWh» daba un falso «Cambia: Energía (RD$)» en BTS1
// y BTS2. La IA da como precio plano el primer tramo (o un redondeo) y escribe los límites de varias formas; con bloques, el precio
// plano de la matriz es el del último tramo y los límites inclusivos/exclusivos o el tramo abierto (null/999999) no son un cambio.
{
  const asPrinted = (rates: number[], style: 'inclusive' | 'exclusive') => style === 'inclusive'
    ? [{ minKWh: 0, maxKWh: 200, rateDOP: rates[0] }, { minKWh: 201, maxKWh: 300, rateDOP: rates[1] }, { minKWh: 301, maxKWh: 700, rateDOP: rates[2] }, { minKWh: 701, maxKWh: null, rateDOP: rates[3] }]
    : [{ minKWh: 0, maxKWh: 200, rateDOP: rates[0] }, { minKWh: 200, maxKWh: 300, rateDOP: rates[1] }, { minKWh: 300, maxKWh: 700, rateDOP: rates[2] }, { minKWh: 700, maxKWh: 999999, rateDOP: rates[3] }];
  const real = {
    country: 'DO', regulator: null, currency: 'DOP', resolutionCode: null, effectiveDate: '2026-11-01', publishedBy: 'EDESUR Dominicana, Dirección Comercial',
    notes: 'BTD: demandChargePerKWDOP leído de la columna de potencia; baseEnergyRateDOP de BTS1 es el primer tramo; fixedChargeTiersDOP 0-100 y >101.',
    schedules: { EDESUR: { tariffs: {
      'BTS-1': { code: 'BTS-1', currency: 'DOP', baseEnergyRateDOP: 6.05, fixedChargeDOP: 128.59, blocks: asPrinted([6.05, 8.59, 12.89, 13.09], 'inclusive'),
        fixedChargeTiersDOP: [{ minKWh: 0, maxKWh: 100, chargeDOP: 42.10 }, { minKWh: 101, maxKWh: null, chargeDOP: 128.59 }] },
      'BTS-2': { code: 'BTS-2', currency: 'DOP', baseEnergyRateDOP: 8.62, fixedChargeDOP: 128.96, blocks: asPrinted([8.62, 10.93, 13.26, 13.4300001], 'exclusive') },
      BTD: { code: 'BTD', currency: 'DOP', baseEnergyRateDOP: 9.02, fixedChargeDOP: 210.15, demandChargePerKWDOP: 1189.164 },
      'BTS-VE': bvte,
    } } },
  };
  const review = prepareTariffScanReview(real, DEFAULT_RD_TARIFF_MATRIX);
  assert.deepEqual(review.rows.map((row) => [row.code, row.status, row.changedFields]), [['BTS1', 'unchanged', []], ['BTS2', 'unchanged', []], ['BTD', 'unchanged', []], ['BTS-VE', 'unsupported', []]], 'bloques idénticos con otra convención de límites: sin cambios');
  assert.equal(review.priceChanges, false);
  assert.match(summarizeTariffScan(review), /^Sin cambios de precio: 3 tarifas coinciden/);
  // 2. Coincidencia total → resolución de la matriz prellenada y esa opción marcada por defecto.
  assert.equal(review.suggestion?.resolutionCode, 'SIE-121-2026-TF');
  assert.deepEqual(review.defaultDecision, { kind: 'resolution', resolutionCode: 'SIE-121-2026-TF', effectiveDate: '2026-11-01' });
  // Aplicado, el precio plano de una tarifa por bloques sigue siendo el del último tramo (convención de la matriz).
  const applied = applyTariffScanReview(review, review.defaultDecision);
  assert.equal(applied.schedules.EDESUR.tariffs.BTS1.baseEnergyRateDOP, 13.09);
  assert.equal(applied.schedules.EDESUR.tariffs.BTS2.baseEnergyRateDOP, 13.4300001);
  assert.equal(applied.schedules.EDESUR.tariffs.BTS2.blocks![3].maxKWh, Infinity);

  // Un cambio real de un tramo sí se detecta, y una diferencia de redondeo (±0.005) no.
  const moved = structuredClone(real);
  moved.schedules.EDESUR.tariffs['BTS-1'].blocks[3].rateDOP = 13.2;
  moved.schedules.EDESUR.tariffs['BTS-2'].blocks[1].rateDOP = 10.934;
  const movedReview = prepareTariffScanReview(moved, DEFAULT_RD_TARIFF_MATRIX);
  assert.deepEqual(movedReview.rows.slice(0, 2).map((row) => [row.code, row.status, row.changedFields]), [['BTS1', 'changed', ['baseEnergyRateDOP', 'blocks']], ['BTS2', 'unchanged', []]]);
  const bounds = structuredClone(real);
  bounds.schedules.EDESUR.tariffs['BTS-2'].blocks = asPrinted([8.62, 10.93, 13.26, 13.43], 'inclusive').map((block, index) => index === 2 ? { ...block, maxKWh: 650 } : index === 3 ? { ...block, minKWh: 651 } : block);
  assert.deepEqual(prepareTariffScanReview(bounds, DEFAULT_RD_TARIFF_MATRIX).rows[1].changedFields, ['blocks'], 'un límite de tramo distinto sí es un cambio');

  // 3. La vista previa no muestra la fecha centinela de la procedencia provisional.
  const pending = review.preview.schedules.EDESUR.tariffs.BTS1.source!;
  assert.equal(pending.resolutionCode, PENDING_TARIFF_SOURCE);
  assert.equal(describeTariffSource(pending), 'Procedencia pendiente de revisión');
  assert.doesNotMatch(describeTariffSource(pending), /2000/);
  assert.equal(describeTariffSource({ resolutionCode: 'SIE-121-2026-TF', effectiveDate: '2026-10-01' }), 'SIE-121-2026-TF · 2026-10-01');

  // 4. Las notas del documento usan etiquetas legibles, no nombres internos; también las que quedan en la matriz.
  assert.equal(humanizeTariffNotes('demandChargePerKWDOP y fixedChargeTiersDOP'), 'Demanda (RD$) y Cargo fijo por rango');
  for (const text of [review.notes ?? '', applied.notes ?? '']) {
    assert.doesNotMatch(text, /demandChargePerKWDOP|baseEnergyRateDOP|fixedChargeTiersDOP/);
    assert.match(text, /Demanda \(RD\$\)/);
  }
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
// Una cadena observada larga no cuenta como «no observada»: falla el origen.
assert.throws(() => assertDominicanTariffOrigin({ ...edesurCuadro, currency: `Pesos Argentinos (ARS)${' '.repeat(30)}según cuadro tarifario vigente` }), /Pesos Argentinos/);
assert.throws(() => assertDominicanTariffOrigin({ ...edesurCuadro, country: `Argentina ${'x'.repeat(150)}` }), /Argentina/);
assert.throws(() => assertDominicanTariffOrigin({ ...edesurCuadro, regulator: `Ente Nacional Regulador del Gas y la Electricidad (ENReGE) ${'x'.repeat(250)}` }), /ENReGE/);
// Regulador claramente extranjero rechaza aunque falte el país o sea RD.
for (const foreign of ['ENRE', 'ENReGE', 'CREG', 'CRE', 'Comisión Reguladora de Energía (CRE)', 'OSINERGMIN']) {
  assert.throws(() => assertDominicanTariffOrigin({ ...edesurCuadro, country: null, regulator: foreign }), originError, `regulador ${foreign}`);
}
assert.throws(() => assertDominicanTariffOrigin({ ...edesurCuadro, country: 'DO', regulator: 'ENRE' }), originError);
// Lo dominicano pasa: país por nombre, regulador SIE o CNE, o sin declarar; y reguladores/emisores dominicanos distintos de SIE/CNE.
for (const ok of [
  { country: 'República Dominicana', regulator: 'Superintendencia de Electricidad (SIE)' }, { country: 'DO', regulator: 'CNE' }, { country: null, regulator: null, currency: null },
  { country: 'DO', regulator: 'Ministerio de Energía y Minas' }, { country: null, regulator: 'EDESUR Dominicana' }, { country: 'República Dominicana', regulator: 'Dirección Comercial' },
  { currency: 'RD$' }, { currency: 'Pesos dominicanos (DOP)' },
]) {
  assert.doesNotThrow(() => assertDominicanTariffOrigin({ ...edesurCuadro, ...ok }), JSON.stringify(ok));
}
// Con país de otro lugar, cualquier regulador rechaza.
assert.throws(() => assertDominicanTariffOrigin({ ...edesurCuadro, country: 'AR', regulator: 'Dirección Comercial' }), originError);

// Por el servicio: el prompt pide país, regulador y moneda observados; la respuesta argentina se rechaza por origen y la
// dominicana sin resolución vuelve como revisión (no lanza).
{
  let prompt = '';
  const answer = (payload: unknown): GeminiTransport => async (_url, body) => {
    prompt = JSON.stringify(body);
    return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }] };
  };
  const base = { fileBase64: 'QA==', mimeType: 'application/pdf', apiKey: 'synthetic-test-key', currentMatrix: DEFAULT_RD_TARIFF_MATRIX };
  await assert.rejects(GeminiTariffService.scanTariffDocument({ ...base, client: clientFromTransport(answer(argentina)) }), originError);
  assert.match(prompt, /country/);
  assert.match(prompt, /regulator/);
  assert.match(prompt, /currency/);
  const review = await GeminiTariffService.scanTariffDocument({ ...base, userPromptNotes: 'Cuadro EDESUR noviembre', client: clientFromTransport(answer(edesurCuadro)) });
  assert.equal(review.provenanceRequired, true);
  assert.equal(review.priceChanges, false);
  // La ruta estricta (sin revisión) sigue exigiendo la resolución del documento.
  await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ ...base, client: clientFromTransport(answer(edesurCuadro)) }), /resolución/);
  await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ ...base, client: clientFromTransport(answer(argentina)) }), originError);
  // …y el emisor: sin publishedBy rechaza como antes, aunque traiga resolución y fecha.
  const cited = { ...edesurCuadro, resolutionCode: 'SIE-130-2026-TF' };
  await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ ...base, client: clientFromTransport(answer({ ...cited, publishedBy: null })) }), /entidad emisora/);
  await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ ...base, client: clientFromTransport(answer({ ...cited, publishedBy: '   ' })) }), /entidad emisora/);
  const strict = await GeminiTariffService.extractTariffMatrixFromDocument({ ...base, client: clientFromTransport(answer(cited)) });
  assert.equal(strict.schedules.EDESUR.tariffs['BTS-VE'], undefined);
}

console.log('PASS escáner de resoluciones: cuadro sin resolución, sin cambios, tarifas no soportadas descartadas y rechazo por origen');
