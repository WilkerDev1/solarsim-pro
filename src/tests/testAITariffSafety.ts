import assert from 'node:assert/strict';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { buildAITariffContext, gridUseChargeReference, resolveAITariffSelection } from '../utils/aiTariffContext';
import { mergeExtractedTariffs, normalizeStoredTariffMatrix } from '../utils/tariffExtraction';
import { GeminiTariffService } from '../services/geminiTariffService';
import { createTariffSlice } from '../store/slices/tariffSlice';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { useSimulationStore } from '../store/useSimulationStore';
import { SyncService } from '../services/syncService';
import { GeminiRequestError, type GeminiTransport } from '../../shared/geminiTransport';

const document = {
  resolutionCode: 'QA-PLIEGO-2026', effectiveDate: '2026-10-01', publishedBy: 'Entidad QA',
  schedules: { EDESUR: { tariffs: { BTD: { currency: 'DOP', baseEnergyRateDOP: 10.5, fixedChargeDOP: 0, netMeteringRetentionPct: 0 } } } },
};
const current = structuredClone(DEFAULT_RD_TARIFF_MATRIX);
current.schedules.CEPM.tariffs['RBT-1'].baseEnergyRateDOP = 24.1;
const merged = mergeExtractedTariffs(document, current);
assert.equal(merged.schedules.EDESUR.tariffs.BTD.baseEnergyRateDOP, 10.5);
assert.equal(merged.schedules.EDESUR.tariffs.BTD.fixedChargeDOP, 0);
assert.equal(merged.schedules.EDESUR.tariffs.BTD.netMeteringRetentionPct, 0);
assert.equal(merged.schedules.CEPM.tariffs['RBT-1'].baseEnergyRateDOP, 24.1, 'Keep the user matrix, never silently reset to factory values');
assert.equal(merged.schedules.EDENORTE.tariffs.BTS1.source?.resolutionCode, 'SIE-121-2026-TF');
assert.equal(merged.schedules.EDESUR.tariffs.BTD.source?.resolutionCode, 'QA-PLIEGO-2026');
assert.equal(current.schedules.EDESUR.tariffs.BTD.source, undefined, 'Extraction must not mutate the current matrix');
for (const invalid of [
  { ...document, effectiveDate: '2026-02-30' }, { ...document, resolutionCode: null }, { ...document, schedules: {} },
  { ...document, schedules: { EDESUR: { tariffs: { BTD: { currency: 'DOP', baseEnergyRateDOP: -10, fixedChargeDOP: 1 } } } } },
  { ...document, schedules: { EDESUR: { tariffs: { BTD: { currency: 'USD', baseEnergyRateDOP: 10, fixedChargeDOP: 1 } } } } },
  { ...document, schedules: { EDESUR: { tariffs: { BTS1: { currency: 'DOP', baseEnergyRateDOP: 10, fixedChargeDOP: 1, blocks: [{ minKWh: 0, maxKWh: 200, rateDOP: 6 }, { minKWh: 500, maxKWh: null, rateDOP: 8 }] } } } } },
]) assert.throws(() => mergeExtractedTariffs(invalid, current));

const persisted = JSON.parse(JSON.stringify(merged));
assert.equal(persisted.schedules.EDENORTE.tariffs.BTS1.blocks[3].maxKWh, null);
const rehydrated = normalizeStoredTariffMatrix(persisted);
const durable = JSON.parse(JSON.stringify(serializeSimulationStore({ ...useSimulationStore.getState(), projects: [], tariffMatrix: merged })));
hydrateSimulationStore(durable);
assert.equal(getReferenceEnergyRateUSD(durable.tariffMatrix, 'EDENORTE', 'BTS1', 2000, 60), getReferenceEnergyRateUSD(merged, 'EDENORTE', 'BTS1', 2000, 60), 'Actual store serialization and hydration preserve the final tariff block');
assert.equal(rehydrated.schedules.EDENORTE.tariffs.BTS1.blocks![3].maxKWh, Infinity);
assert.equal(getReferenceEnergyRateUSD(rehydrated, 'EDENORTE', 'BTS1', 2000, 60), getReferenceEnergyRateUSD(merged, 'EDENORTE', 'BTS1', 2000, 60), 'Round-trip JSON must keep the energy rate above 700 kWh');
const zeroDOP = structuredClone(merged);
zeroDOP.schedules.EDESUR.tariffs.BTD.baseEnergyRateDOP = 0;
assert.equal(getReferenceEnergyRateUSD(zeroDOP, 'EDESUR', 'BTD', 900, 60), 0, 'Zero DOP is a valid rate, not a trigger for a fallback');
zeroDOP.schedules.EDESUR.tariffs.BTD.currency = 'USD';
zeroDOP.schedules.EDESUR.tariffs.BTD.baseEnergyRateUSD = 0;
assert.equal(getReferenceEnergyRateUSD(zeroDOP, 'EDESUR', 'BTD', 900, 60), 0, 'Zero USD is also valid');
assert.equal(resolveAITariffSelection(merged, 'EDESUR', 'UNKNOWN'), null);
assert.equal(resolveAITariffSelection(merged, 'UNKNOWN', 'BTS1'), null);
assert.equal(resolveAITariffSelection(merged, 'CEPM', 'BTS1')?.code, 'RBT-1');
const context = buildAITariffContext(rehydrated, new Date('2026-10-07T00:00:00Z'));
assert(context.warnings.some((warning) => warning.includes('SIE-147-2026-TF') && warning.includes('septiembre 2026')), 'El pliego CEPM de septiembre pide confirmar vigencia en octubre');
assert.equal(context.schedules.find((schedule) => schedule.distributor === 'CEPM')?.tariffs.length, 4, 'No duplicate legacy codes in the AI reference');
assert.equal(JSON.stringify(context), JSON.stringify(buildAITariffContext(rehydrated, new Date('2026-10-07T00:00:00Z'))));

// Transporte sintético inyectado (nunca se parchea fetch): credenciales en cabecera y un único intento ante 401.
let calls = 0;
const unauthorized: GeminiTransport = async (url, _body, headers) => {
  calls++;
  assert(!url.includes('key='));
  assert.equal(headers['x-goog-api-key'], 'synthetic-test-key');
  throw new GeminiRequestError('Invalid credentials', 401);
};
await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ fileBase64: 'QA==', mimeType: 'application/pdf', apiKey: 'synthetic-test-key', transport: unauthorized }), /Invalid credentials/);
assert.equal(calls, 1, 'Never cascade requests on invalid authentication');
const answered: GeminiTransport = async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(document) }] } }] });
const parsed = await GeminiTariffService.extractTariffMatrixFromDocument({ fileBase64: 'QA==', mimeType: 'application/pdf', apiKey: 'synthetic-test-key', currentMatrix: current, transport: answered });
assert.equal(parsed.schedules.CEPM.tariffs['RBT-1'].baseEnergyRateDOP, 24.1);

let state: any = { sessionGeneration: 1, syncSettings: { authToken: 'synthetic-token', serverUrl: 'https://example.invalid', currentUser: { organizationId: 'qa' } } };
const set = (update: any) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
Object.assign(state, createTariffSlice(set, () => state, {} as any));
const fetchTariffs = SyncService.fetchTariffMatrix;
try {
  let release!: (value: any) => void;
  SyncService.fetchTariffMatrix = () => new Promise((resolve) => { release = resolve; });
  const pending = state.fetchTariffsFromServer();
  state.updateTariffMatrixHeader({ notes: 'Local edit during download' });
  release({ success: true, matrix: persisted });
  assert.equal((await pending).success, false);
  assert.equal(state.tariffMatrix.notes, 'Local edit during download', 'Cloud response must not overwrite a concurrent local edit');
  const previous = state.tariffMatrix;
  const oldSession = state.fetchTariffsFromServer();
  state.sessionGeneration++;
  release({ success: true, matrix: persisted });
  await oldSession;
  assert.equal(state.tariffMatrix, previous, 'Discard responses from a previous session');
} finally { SyncService.fetchTariffMatrix = fetchTariffs; }
console.log('PASS AI tariff extraction, provenance, persistence, transport and session race regressions');

const arbitraryBlocks=structuredClone(DEFAULT_RD_TARIFF_MATRIX);
arbitraryBlocks.schedules.EDESUR.tariffs.BTS1.blocks=[{minKWh:0,maxKWh:100,rateDOP:5},{minKWh:101,maxKWh:200,rateDOP:10},{minKWh:201,maxKWh:Infinity,rateDOP:15}];
assert.equal(getReferenceEnergyRateUSD(arbitraryBlocks,'EDESUR','BTS1',200,1),7.5,'Inclusive printed blocks must have contiguous continuous billing widths');

assert.equal(merged.schedules.EDESUR.tariffs.BTD.demandChargePerKWDOP,current.schedules.EDESUR.tariffs.BTD.demandChargePerKWDOP,'Partial row preserves unobserved demand charges');
assert.equal(merged.schedules.EDESUR.tariffs.BTD.source?.fieldSources?.demandChargePerKWDOP.resolutionCode,'SIE-121-2026-TF');
assert.equal(merged.schedules.EDESUR.tariffs.BTD.source?.fieldSources?.baseEnergyRateDOP.resolutionCode,'QA-PLIEGO-2026');
const updatedCEPM=structuredClone(DEFAULT_RD_TARIFF_MATRIX);updatedCEPM.schedules.CEPM.tariffs['RBT-1'].baseEnergyRateDOP=30;
assert.equal(getReferenceEnergyRateUSD(updatedCEPM,'CEPM','BTS1',900,60),.5,'Legacy aliases resolve current canonical schedule');

// Fase 5: el escáner de resoluciones extrae el cargo fijo por rango (BTS1: 0–100 y ≥101 kWh) y el cargo por uso de la red por distribuidora.
{
  const bts1 = { currency: 'DOP', baseEnergyRateDOP: 13.09, fixedChargeDOP: 128.59, netMeteringRetentionPct: 25,
    blocks: [{ minKWh: 0, maxKWh: 200, rateDOP: 6.05 }, { minKWh: 201, maxKWh: 300, rateDOP: 8.59 }, { minKWh: 301, maxKWh: 700, rateDOP: 12.89 }, { minKWh: 701, maxKWh: null, rateDOP: 13.09 }],
    fixedChargeTiersDOP: [{ minKWh: 0, maxKWh: 100, chargeDOP: 42.1 }, { minKWh: 101, maxKWh: null, chargeDOP: 128.59 }] };
  const phase5 = { resolutionCode: 'QA-FASE5', effectiveDate: '2026-10-01', publishedBy: 'Entidad QA', schedules: { EDESUR: { gridUseChargeDOPPerKWh: 3.9, tariffs: { BTS1: bts1 } } } };
  const scanned = mergeExtractedTariffs(phase5, DEFAULT_RD_TARIFF_MATRIX);
  assert.deepEqual(scanned.schedules.EDESUR.tariffs.BTS1.fixedChargeTiersDOP, bts1.fixedChargeTiersDOP);
  assert(scanned.schedules.EDESUR.tariffs.BTS1.source?.fields?.includes('fixedChargeTiersDOP'), 'el rango documentado queda en la procedencia');
  assert.equal(scanned.schedules.EDESUR.tariffs.BTS1.source?.fieldSources?.fixedChargeTiersDOP.resolutionCode, 'QA-FASE5');
  assert.equal(scanned.schedules.EDESUR.gridUseChargeDOPPerKWh, 3.9);
  assert.equal(scanned.schedules.EDESUR.gridUseChargeSource?.resolutionCode, 'QA-FASE5');
  // Distribuidoras que el documento no menciona: ni cargo ni procedencia inventados.
  assert.equal(scanned.schedules.EDENORTE.gridUseChargeDOPPerKWh, undefined);
  assert.equal(DEFAULT_RD_TARIFF_MATRIX.schedules.EDESUR.gridUseChargeDOPPerKWh, undefined, 'la extracción no muta la matriz actual ni la de fábrica');

  // Round-trip JSON: el cargo y su procedencia sobreviven y los rangos siguen siendo los del documento.
  const restored = normalizeStoredTariffMatrix(JSON.parse(JSON.stringify(scanned)));
  assert.equal(restored.schedules.EDESUR.gridUseChargeDOPPerKWh, 3.9);
  assert.equal(restored.schedules.EDESUR.gridUseChargeSource?.resolutionCode, 'QA-FASE5');
  assert.deepEqual(restored.schedules.EDESUR.tariffs.BTS1.fixedChargeTiersDOP, bts1.fixedChargeTiersDOP);
  assert.equal(restored.schedules.EDENORTE.gridUseChargeSource, undefined);

  // Un documento posterior sin el cargo lo conserva con su procedencia; con otro valor lo reemplaza.
  const later = mergeExtractedTariffs({ ...phase5, resolutionCode: 'QA-FASE5-B', schedules: { EDESUR: { tariffs: { BTD: { currency: 'DOP', baseEnergyRateDOP: 10, fixedChargeDOP: 1 } } } } }, scanned);
  assert.equal(later.schedules.EDESUR.gridUseChargeDOPPerKWh, 3.9);
  assert.equal(later.schedules.EDESUR.gridUseChargeSource?.resolutionCode, 'QA-FASE5', 'el cargo no leído conserva su fuente anterior');
  const replaced = mergeExtractedTariffs({ ...phase5, resolutionCode: 'QA-FASE5-C', schedules: { EDESUR: { gridUseChargeDOPPerKWh: 0 } } }, scanned);
  assert.equal(replaced.schedules.EDESUR.gridUseChargeDOPPerKWh, 0, 'cero explícito es un cargo válido');
  assert.equal(replaced.schedules.EDESUR.gridUseChargeSource?.resolutionCode, 'QA-FASE5-C');

  // Un cargo fijo nuevo sin rangos descarta los rangos anteriores (si no, quedarían rangos viejos con un cargo nuevo).
  const scalarOnly = mergeExtractedTariffs({ ...phase5, schedules: { EDESUR: { tariffs: { BTS1: { ...bts1, fixedChargeDOP: 130, fixedChargeTiersDOP: undefined } } } } }, scanned);
  assert.equal(scalarOnly.schedules.EDESUR.tariffs.BTS1.fixedChargeDOP, 130);
  assert.equal(scalarOnly.schedules.EDESUR.tariffs.BTS1.fixedChargeTiersDOP, undefined);
  const sameScalar = mergeExtractedTariffs({ ...phase5, schedules: { EDESUR: { tariffs: { BTS1: { ...bts1, fixedChargeTiersDOP: undefined } } } } }, scanned);
  assert.deepEqual(sameScalar.schedules.EDESUR.tariffs.BTS1.fixedChargeTiersDOP, bts1.fixedChargeTiersDOP, 'mismo cargo fijo: los rangos vigentes se conservan');

  const withBts1 = (patch: Record<string, unknown>) => ({ ...phase5, schedules: { EDESUR: { tariffs: { BTS1: { ...bts1, ...patch } } } } });
  const withCharge = (gridUseChargeDOPPerKWh: unknown) => ({ ...phase5, schedules: { EDESUR: { gridUseChargeDOPPerKWh, tariffs: {} } } });
  for (const [label, bad] of [
    ['rango que no empieza en 0', withBts1({ fixedChargeTiersDOP: [{ minKWh: 5, maxKWh: null, chargeDOP: 128.59 }] })],
    ['hueco entre rangos', withBts1({ fixedChargeTiersDOP: [{ minKWh: 0, maxKWh: 100, chargeDOP: 42.1 }, { minKWh: 150, maxKWh: null, chargeDOP: 128.59 }] })],
    ['sin rango final abierto', withBts1({ fixedChargeTiersDOP: [{ minKWh: 0, maxKWh: 100, chargeDOP: 42.1 }, { minKWh: 101, maxKWh: 500, chargeDOP: 128.59 }] })],
    ['cargo negativo', withBts1({ fixedChargeTiersDOP: [{ minKWh: 0, maxKWh: 100, chargeDOP: -1 }, { minKWh: 101, maxKWh: null, chargeDOP: 128.59 }] })],
    ['cargo no numérico', withBts1({ fixedChargeTiersDOP: [{ minKWh: 0, maxKWh: 100, chargeDOP: '42.1' }, { minKWh: 101, maxKWh: null, chargeDOP: 128.59 }] })],
    ['rangos vacíos', withBts1({ fixedChargeTiersDOP: [] })],
    ['cargo fijo escalar distinto del rango abierto', withBts1({ fixedChargeDOP: 99 })],
    ['rangos en una tarifa en US$', withBts1({ currency: 'USD', baseEnergyRateUSD: 0.2, fixedChargeUSD: 1, baseEnergyRateDOP: undefined, fixedChargeDOP: undefined, blocks: undefined })],
    ['cargo por uso negativo', withCharge(-0.1)],
    ['cargo por uso sobre el tope', withCharge(100.5)],
    ['cargo por uso en texto', withCharge('3.78')],
    ['cargo por uso no finito', withCharge(Number.NaN)],
  ] as const) assert.throws(() => mergeExtractedTariffs(bad, DEFAULT_RD_TARIFF_MATRIX), Error, label);
  assert.throws(() => mergeExtractedTariffs({ ...phase5, schedules: { EDESUR: {} } }, DEFAULT_RD_TARIFF_MATRIX), /tarifas/, 'una distribuidora sin tarifas ni cargo no cuenta como extracción');
  assert.equal(mergeExtractedTariffs({ ...phase5, schedules: { EDESUR: { gridUseChargeDOPPerKWh: null, tariffs: { BTD: { currency: 'DOP', baseEnergyRateDOP: 10, fixedChargeDOP: 1 } } } } }, scanned).schedules.EDESUR.gridUseChargeDOPPerKWh, 3.9, 'null = ausente: conserva el anterior');

  // Contexto de IA: rangos del cargo fijo y cargo por uso (de la matriz si lo trae; si no, el de fábrica) con su origen.
  const factoryContext = buildAITariffContext(DEFAULT_RD_TARIFF_MATRIX, new Date('2026-11-01T00:00:00Z'));
  const edesurFactory = factoryContext.gridUseCharges.find((entry) => entry.distributor === 'EDESUR')!;
  assert.deepEqual([edesurFactory.dopPerKWh, edesurFactory.resolutionCode], [3.78, 'SIE-121-2026-TF'], 'sin cargo en la matriz, el de fábrica');
  const scannedContext = buildAITariffContext(scanned, new Date('2026-11-01T00:00:00Z'));
  const edesurScanned = scannedContext.gridUseCharges.find((entry) => entry.distributor === 'EDESUR')!;
  assert.deepEqual([edesurScanned.dopPerKWh, edesurScanned.resolutionCode], [3.9, 'QA-FASE5'], 'el cargo escaneado de la organización manda sobre el de fábrica');
  assert.deepEqual(gridUseChargeReference(scanned, 'EDESUR'), { dopPerKWh: 3.9, resolutionCode: 'QA-FASE5', period: 'vigente desde 2026-10-01', origin: 'matrix' }, 'lo que muestra el modal de revisión');
  assert.equal(gridUseChargeReference(scanned, 'CEPM').origin, 'factory');
  assert.equal(gridUseChargeReference(scanned, 'CEPM').dopPerKWh, 5.73);
  assert.equal(scannedContext.gridUseCharges.find((entry) => entry.distributor === 'EDENORTE')!.dopPerKWh, 4.02);
  assert.deepEqual(scannedContext.schedules.find((s) => s.distributor === 'EDESUR')!.tariffs.find((t) => t.code === 'BTS1')!.fixedChargeTiersDOP, bts1.fixedChargeTiersDOP);
  assert.deepEqual(factoryContext.schedules.find((s) => s.distributor === 'EDESUR')!.tariffs.find((t) => t.code === 'BTS1')!.fixedChargeTiersDOP, [{ minKWh: 0, maxKWh: 100, chargeDOP: 42.1 }, { minKWh: 101, maxKWh: null, chargeDOP: 128.59 }], 'BTS1 de fábrica: dos rangos');
  assert.equal(factoryContext.schedules.find((s) => s.distributor === 'EDESUR')!.tariffs.find((t) => t.code === 'BTD')!.fixedChargeTiersDOP, undefined);

  // Transporte sintético: el pliego completo pasa por el servicio y por la misma validación.
  const phase5Transport: GeminiTransport = async (_url, body) => {
    assert.match(JSON.stringify(body), /gridUseChargeDOPPerKWh/, 'la instrucción pide el cargo por uso de la red');
    assert.match(JSON.stringify(body), /fixedChargeTiersDOP/, 'la instrucción pide el cargo fijo por rango');
    return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(phase5) }] } }] };
  };
  const viaService = await GeminiTariffService.extractTariffMatrixFromDocument({ fileBase64: 'QA==', mimeType: 'application/pdf', apiKey: 'synthetic-test-key', transport: phase5Transport });
  assert.equal(viaService.schedules.EDESUR.gridUseChargeDOPPerKWh, 3.9);
  assert.deepEqual(viaService.schedules.EDESUR.tariffs.BTS1.fixedChargeTiersDOP, bts1.fixedChargeTiersDOP);
}
console.log('PASS AI tariff scanner: fixed charge tiers and grid use charge per distributor');
