import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import {
  classifyTariffMatrix,
  factoryTariffUpdateNotice,
  RETIRED_FACTORY_TARIFF_MATRICES,
  tariffMatrixFingerprint,
  upgradeRetiredFactoryTariffMatrix,
} from '../data/factoryTariffMatrixVersions';
import { mergeExtractedTariffs, normalizeStoredTariffMatrix } from '../utils/tariffExtraction';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { useSimulationStore } from '../store/useSimulationStore';
import { createTariffSlice } from '../store/slices/tariffSlice';
import { SyncService } from '../services/syncService';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import type { GlobalTariffMatrix } from '../types/tariffs';

/**
 * Una instalación anterior guarda la matriz de fábrica de v2.0.0–v2.7.4 (SIE-176-2025-TF). Si nadie la tocó, al
 * hidratar pasa a la vigente; una personalizada se conserva con un aviso; las propuestas guardadas no cambian.
 */

// La matriz de fábrica de v2.7.4 tal como queda en disco (JSON: el tramo abierto es null).
const v274Raw = readFileSync(path.join(process.cwd(), 'src/tests/fixtures/factoryTariffMatrix-SIE-176-2025-TF.json'), 'utf8');
const v274 = (): GlobalTariffMatrix => JSON.parse(v274Raw);
assert.equal(v274().resolutionCode, 'SIE-176-2025-TF');
assert.equal(v274().schedules.EDENORTE.tariffs.BTS1.baseEnergyRateDOP, 11.85, 'fixture: la de v2.7.4 copiaba EDEESTE en EDENORTE');

// ── Criterio: huella de todos los valores salvo lastUpdatedAt ──
const retired = RETIRED_FACTORY_TARIFF_MATRICES.find((m) => m.resolutionCode === 'SIE-176-2025-TF');
assert.ok(retired, 'la matriz de v2.7.4 está registrada como fábrica anterior');
assert.equal(retired.fingerprint, tariffMatrixFingerprint(v274()), 'la huella registrada es la de la matriz de v2.7.4');
assert.equal(classifyTariffMatrix(v274()), 'retired_factory');
assert.equal(classifyTariffMatrix(normalizeStoredTariffMatrix(v274())), 'retired_factory', 'también tras normalizar (Infinity restaurado)');
assert.equal(classifyTariffMatrix({ ...v274(), lastUpdatedAt: '2026-11-01T10:00:00.000Z' }), 'retired_factory', 'subirla o descargarla solo cambia lastUpdatedAt');
assert.equal(classifyTariffMatrix(DEFAULT_RD_TARIFF_MATRIX), 'current_factory');
// Guarda: si cambia la matriz de fábrica, la huella de la anterior (esta) se añade a RETIRED_FACTORY_TARIFF_MATRICES,
// su JSON a src/tests/fixtures/ y se actualiza este valor. Si no, las instalaciones existentes se quedarían con ella.
assert.equal(tariffMatrixFingerprint(DEFAULT_RD_TARIFF_MATRIX), 'da32999072b2f16a', 'cambió la matriz de fábrica: registra la anterior como retirada');
assert.ok(RETIRED_FACTORY_TARIFF_MATRICES.every((m) => m.fingerprint !== 'da32999072b2f16a'));
assert.equal(classifyTariffMatrix(normalizeStoredTariffMatrix(JSON.parse(JSON.stringify(DEFAULT_RD_TARIFF_MATRIX)))), 'current_factory');
assert.equal(upgradeRetiredFactoryTariffMatrix(v274()), DEFAULT_RD_TARIFF_MATRIX);

// Personalizadas: una fila editada, la cabecera editada o una procedencia del escáner ya no son de fábrica.
const editedRow = v274();
editedRow.schedules.EDENORTE.tariffs.BTS1.fixedChargeDOP = 130;
const editedHeader = { ...v274(), notes: 'Revisado por la organización' };
const scannedOld = mergeExtractedTariffs({
  resolutionCode: 'SIE-176-2025-TF', effectiveDate: '2026-01-01', publishedBy: 'Superintendencia de Electricidad (SIE)',
  schedules: { CEPM: { tariffs: { 'RBT-1': { currency: 'DOP', baseEnergyRateDOP: 22.9, fixedChargeDOP: 250 } } } },
}, normalizeStoredTariffMatrix(v274()));
const scannedNew = mergeExtractedTariffs({
  resolutionCode: 'SIE-150-2027-TF', effectiveDate: '2027-01-01', publishedBy: 'Superintendencia de Electricidad (SIE)',
  schedules: { EDESUR: { tariffs: { BTD: { currency: 'DOP', baseEnergyRateDOP: 9.5, fixedChargeDOP: 215 } } } },
}, DEFAULT_RD_TARIFF_MATRIX);
for (const [label, matrix] of [['fila editada', editedRow], ['cabecera editada', editedHeader], ['escaneada', scannedOld], ['escaneada nueva', scannedNew]] as const) {
  assert.equal(classifyTariffMatrix(matrix), 'custom', label);
  assert.equal(upgradeRetiredFactoryTariffMatrix(matrix), matrix, `${label}: se devuelve intacta`);
}

// Aviso: personalizada con vigencia anterior a la de fábrica; no con la de fábrica ni con una resolución más nueva.
assert.deepEqual(factoryTariffUpdateNotice(editedRow), {
  savedResolutionCode: 'SIE-176-2025-TF', savedEffectiveDate: '2026-01-01',
  factoryResolutionCode: 'SIE-121-2026-TF', factoryEffectiveDate: '2026-10-01',
});
assert.ok(factoryTariffUpdateNotice(scannedOld), 'escaneada de una resolución anterior: aviso');
assert.equal(factoryTariffUpdateNotice(scannedNew), null, 'escaneada de una resolución más nueva: sin aviso');
assert.equal(factoryTariffUpdateNotice(DEFAULT_RD_TARIFF_MATRIX), null);
assert.equal(factoryTariffUpdateNotice(v274()), null, 'la de fábrica anterior no avisa: se actualiza sola');

// ── Hidratación ──
const durableState = (overrides: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(serializeSimulationStore({ ...useSimulationStore.getState(), ...overrides } as any)));

// Propuesta guardada: sus cifras y sus tarifas no dependen de la matriz.
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'proj-saved-before-upgrade' }; // el id de referencia se purga al hidratar
const beforeRates = structuredClone(project.rates);

const fromV274: any = durableState({ projects: [project], activeProjectId: project.id, tariffMatrix: v274() });
fromV274.organizationWorkspaces = {
  'org:a': { ...fromV274.organizationWorkspaces?.local, projects: [], tariffMatrix: v274() },
  'org:b': { projects: [], tariffMatrix: editedRow },
};
hydrateSimulationStore(fromV274);
assert.equal(fromV274.tariffMatrix.resolutionCode, 'SIE-121-2026-TF', 'la matriz de fábrica anterior sin tocar pasa a la vigente');
assert.equal(fromV274.tariffMatrix.schedules.EDENORTE.tariffs.BTS1.blocks[3].maxKWh, Infinity);
assert.equal(getReferenceEnergyRateUSD(fromV274.tariffMatrix, 'EDENORTE', 'BTS-1', 1200, 1), 14.04, 'EDENORTE BTS-1 a 1,200 kWh: 14.04 RD$/kWh');
assert.equal(fromV274.tariffSyncStatus === 'error', false);
assert.equal(fromV274.organizationWorkspaces['org:a'].tariffMatrix.resolutionCode, 'SIE-121-2026-TF', 'también en los espacios de otras organizaciones');
assert.equal(fromV274.organizationWorkspaces['org:b'].tariffMatrix.schedules.EDENORTE.tariffs.BTS1.fixedChargeDOP, 130, 'el espacio con matriz personalizada se conserva');
const hydratedProject = fromV274.projects.find((p: any) => p.id === project.id);
assert.deepEqual(hydratedProject.rates, beforeRates, 'las tarifas guardadas en la propuesta no cambian');

const custom: any = durableState({ projects: [project], activeProjectId: project.id, tariffMatrix: editedRow });
hydrateSimulationStore(custom);
// Misma propuesta hidratada con una matriz que no se sustituye: el proyecto y sus cifras son idénticos.
const keptProject = custom.projects.find((p: any) => p.id === project.id);
assert.deepEqual(hydratedProject, keptProject, 'actualizar la matriz no toca ninguna propuesta guardada');
assert.equal(JSON.stringify(calculateProjectFinancialSummary(hydratedProject)), JSON.stringify(calculateProjectFinancialSummary(keptProject)), 'las cifras de la propuesta no cambian');
assert.equal(custom.tariffMatrix.resolutionCode, 'SIE-176-2025-TF', 'la personalizada se conserva');
assert.equal(custom.tariffMatrix.schedules.EDENORTE.tariffs.BTS1.fixedChargeDOP, 130);
assert.ok(factoryTariffUpdateNotice(custom.tariffMatrix), 'y el aviso aparece');

const scanned: any = durableState({ projects: [], tariffMatrix: scannedOld });
hydrateSimulationStore(scanned);
assert.equal(scanned.tariffMatrix.schedules.CEPM.tariffs['RBT-1'].source.resolutionCode, 'SIE-176-2025-TF', 'la escaneada conserva su procedencia');
assert.equal(scanned.tariffMatrix.schedules.EDENORTE.tariffs.BTS1.baseEnergyRateDOP, 11.85);
assert.ok(factoryTariffUpdateNotice(scanned.tariffMatrix));

const empty: any = durableState({ projects: [] });
delete empty.tariffMatrix;
hydrateSimulationStore(empty);
assert.equal(empty.tariffMatrix.resolutionCode, 'SIE-121-2026-TF', 'sin matriz: la de fábrica');
assert.equal(factoryTariffUpdateNotice(empty.tariffMatrix), null);

// ── Matriz de la organización (servidor) ──
let state: any = { sessionGeneration: 1, tariffMatrix: DEFAULT_RD_TARIFF_MATRIX, syncSettings: { authToken: 'synthetic-token', serverUrl: 'https://example.invalid', currentUser: { organizationId: 'qa', role: 'ADMIN' } } };
const set = (update: any) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
Object.assign(state, createTariffSlice(set, () => state, {} as any));
const originalFetch = SyncService.fetchTariffMatrix;
const originalSync = SyncService.syncTariffMatrix;
const uploads: GlobalTariffMatrix[] = [];
try {
  SyncService.syncTariffMatrix = async (_url, _token, matrix) => { uploads.push(matrix); return { success: true }; };
  // La organización guarda la de fábrica anterior: el cliente calcula con la vigente y no escribe en el servidor.
  SyncService.fetchTariffMatrix = async () => ({ success: true, matrix: { ...v274(), lastUpdatedAt: '2026-05-01T00:00:00.000Z' } });
  const outdated = await state.fetchTariffsFromServer();
  assert.equal(outdated.success, true);
  assert.equal(state.tariffMatrix, DEFAULT_RD_TARIFF_MATRIX, 'se calcula con la de fábrica vigente');
  assert.deepEqual(state.organizationTariffOutdated, { resolutionCode: 'SIE-176-2025-TF', effectiveDate: '2026-01-01' });
  assert.match(outdated.message, /SIE-176-2025-TF/);
  assert.equal(uploads.length, 0, 'sin acción explícita no se escribe en el servidor');
  // Acción explícita (Ajustes): subir la vigente a la organización.
  const upgraded = await state.syncTariffsWithServer();
  assert.equal(upgraded.success, true);
  assert.equal(uploads.length, 1);
  assert.equal(classifyTariffMatrix(uploads[0]), 'current_factory');
  assert.equal(state.organizationTariffOutdated, null, 'tras subirla el aviso de la organización desaparece');

  // Una matriz de la organización personalizada se usa tal cual.
  SyncService.fetchTariffMatrix = async () => ({ success: true, matrix: editedRow });
  await state.fetchTariffsFromServer();
  assert.equal(state.tariffMatrix.schedules.EDENORTE.tariffs.BTS1.fixedChargeDOP, 130);
  assert.equal(state.organizationTariffOutdated, null);
} finally {
  SyncService.fetchTariffMatrix = originalFetch;
  SyncService.syncTariffMatrix = originalSync;
}

console.log('Tarifas: la matriz de fábrica anterior sin tocar pasa a la vigente; la personalizada se conserva con aviso; las propuestas no cambian.');
