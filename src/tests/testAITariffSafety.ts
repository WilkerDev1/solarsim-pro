import assert from 'node:assert/strict';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { buildAITariffContext, resolveAITariffSelection } from '../utils/aiTariffContext';
import { mergeExtractedTariffs, normalizeStoredTariffMatrix } from '../utils/tariffExtraction';
import { GeminiTariffService } from '../services/geminiTariffService';
import { createTariffSlice } from '../store/slices/tariffSlice';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { useSimulationStore } from '../store/useSimulationStore';
import { SyncService } from '../services/syncService';

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
assert.equal(merged.schedules.EDENORTE.tariffs.BTS1.source?.resolutionCode, 'SIE-176-2025-TF');
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
assert(context.warnings.some((warning) => warning.includes('enero-marzo')));
assert.equal(context.schedules.find((schedule) => schedule.distributor === 'CEPM')?.tariffs.length, 4, 'No duplicate legacy codes in the AI reference');
assert.equal(JSON.stringify(context), JSON.stringify(buildAITariffContext(rehydrated, new Date('2026-10-07T00:00:00Z'))));

const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = (async (input: any, init: RequestInit) => {
  calls++;
  assert(!String(input).includes('key='));
  assert.equal((init.headers as Record<string, string>)['x-goog-api-key'], 'synthetic-test-key');
  return new Response(JSON.stringify({ error: { message: 'Invalid credentials' } }), { status: 401 });
}) as typeof fetch;
try {
  await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ fileBase64: 'QA==', mimeType: 'application/pdf', apiKey: 'synthetic-test-key' }), /Invalid credentials/);
  assert.equal(calls, 1, 'Never cascade requests on invalid authentication');
  globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(document) }] } }] }), { status: 200 })) as typeof fetch;
  const parsed = await GeminiTariffService.extractTariffMatrixFromDocument({ fileBase64: 'QA==', mimeType: 'application/pdf', apiKey: 'synthetic-test-key', currentMatrix: current });
  assert.equal(parsed.schedules.CEPM.tariffs['RBT-1'].baseEnergyRateDOP, 24.1);
} finally { globalThis.fetch = originalFetch; }

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
assert.equal(merged.schedules.EDESUR.tariffs.BTD.source?.fieldSources?.demandChargePerKWDOP.resolutionCode,'SIE-176-2025-TF');
assert.equal(merged.schedules.EDESUR.tariffs.BTD.source?.fieldSources?.baseEnergyRateDOP.resolutionCode,'QA-PLIEGO-2026');
const updatedCEPM=structuredClone(DEFAULT_RD_TARIFF_MATRIX);updatedCEPM.schedules.CEPM.tariffs['RBT-1'].baseEnergyRateDOP=30;
assert.equal(getReferenceEnergyRateUSD(updatedCEPM,'CEPM','BTS1',900,60),.5,'Legacy aliases resolve current canonical schedule');
