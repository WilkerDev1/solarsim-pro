import assert from 'node:assert/strict';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { buildAITariffContext, resolveAITariffSelection } from '../utils/aiTariffContext';
import { normalizeStoredTariffMatrix } from '../utils/tariffExtraction';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { useSimulationStore } from '../store/useSimulationStore';
import { normalizeProposalDraft } from '../../shared/aiProposal';
import { averageBlockEnergyRateDOP, normalizeTariffCode, tariffChargeKind } from '../../shared/tariffRules';
import { getTariffDisplayName } from '../../shared/proposalPresentation';
import { mapTariffCodeOnDistributorChange, type GlobalTariffMatrix } from '../types/tariffs';
import { createDocumentTextContext } from '../../shared/documentTexts/context';
import { publishedDocumentTexts, regulatoryNoteDefault, resolveDocumentText, viewerText, docTextKey } from '../../shared/documentTexts';

/** Fase 1 del plan tarifario. */

// ── 1b. Matriz de fábrica: SIE-121-2026-TF (EDE, oct-dic 2026, art. 2) y SIE-147-2026-TF (CEPM, sep 2026) ──
const m = DEFAULT_RD_TARIFF_MATRIX;
assert.equal(m.resolutionCode, 'SIE-121-2026-TF');
assert.equal(m.effectiveDate, '2026-10-01');
assert.ok(m.notes?.includes('octubre-diciembre 2026') && m.notes.includes('SIE-147-2026-TF'));

type Row = { fixed: [number, number] | number; energy: number[] | number; demand?: number; hfp?: number; hp?: number };
const SIE121: Record<string, Record<string, Row>> = {
  EDESUR: {
    BTS1: { fixed: [42.10, 128.59], energy: [6.05, 8.59, 12.89, 13.09] }, BTS2: { fixed: 128.96, energy: [8.62, 10.93, 13.26, 13.43] },
    BTD: { fixed: 210.15, energy: 9.02, demand: 1189.16 }, BTH: { fixed: 210.15, energy: 8.92, hfp: 357.24, hp: 1579.29 },
    MTD1: { fixed: 211.68, energy: 9.13, demand: 575.21 }, MTD2: { fixed: 211.68, energy: 8.75, demand: 448.41 }, MTH: { fixed: 211.68, energy: 8.64, hfp: 122.73, hp: 1025.25 },
  },
  EDENORTE: {
    BTS1: { fixed: [40.33, 126.81], energy: [5.97, 8.51, 13.83, 14.04] }, BTS2: { fixed: 127.18, energy: [9.57, 11.88, 14.22, 14.38] },
    BTD: { fixed: 207.14, energy: 9.83, demand: 1310.10 }, BTH: { fixed: 207.14, energy: 9.74, hfp: 393.45, hp: 1714.50 },
    MTD1: { fixed: 211.19, energy: 9.89, demand: 673.63 }, MTD2: { fixed: 211.19, energy: 9.52, demand: 546.82 }, MTH: { fixed: 211.19, energy: 9.42, hfp: 142.59, hp: 1131.61 },
  },
  EDEESTE: {
    BTS1: { fixed: [41.34, 127.83], energy: [6.17, 8.71, 13.04, 13.26] }, BTS2: { fixed: 128.20, energy: [8.79, 11.10, 13.43, 13.59] },
    BTD: { fixed: 208.78, energy: 9.07, demand: 1280.88 }, BTH: { fixed: 208.78, energy: 8.98, hfp: 376.09, hp: 1684.59 },
    MTD1: { fixed: 210.29, energy: 9.19, demand: 677.21 }, MTD2: { fixed: 210.29, energy: 8.81, demand: 550.40 }, MTH: { fixed: 210.29, energy: 8.70, hfp: 160.56, hp: 1142.36 },
  },
};
for (const [distributor, rows] of Object.entries(SIE121)) {
  const tariffs = m.schedules[distributor as 'EDESUR'].tariffs;
  assert.deepEqual(Object.keys(tariffs).sort(), Object.keys(rows).sort(), `${distributor}: mismas filas`);
  for (const [code, row] of Object.entries(rows)) {
    const t = tariffs[code];
    const label = `${distributor}/${code}`;
    assert.equal(t.code, code);
    assert.equal(t.currency, 'DOP');
    assert.equal(t.source, undefined, `${label}: la procedencia es la de la matriz (SIE-121)`);
    if (Array.isArray(row.fixed)) {
      assert.deepEqual(t.fixedChargeTiersDOP, [{ minKWh: 0, maxKWh: 100, chargeDOP: row.fixed[0] }, { minKWh: 101, maxKWh: null, chargeDOP: row.fixed[1] }], `${label}: cargo fijo por rango`);
      assert.equal(t.fixedChargeDOP, row.fixed[1], `${label}: cargo fijo escalar = rango ≥101 kWh`);
    } else {
      assert.equal(t.fixedChargeDOP, row.fixed, `${label}: cargo fijo`);
      assert.equal(t.fixedChargeTiersDOP, undefined);
    }
    if (Array.isArray(row.energy)) {
      assert.deepEqual(t.blocks, [
        { minKWh: 0, maxKWh: 200, rateDOP: row.energy[0] }, { minKWh: 201, maxKWh: 300, rateDOP: row.energy[1] },
        { minKWh: 301, maxKWh: 700, rateDOP: row.energy[2] }, { minKWh: 701, maxKWh: Infinity, rateDOP: row.energy[3] },
      ], `${label}: bloques`);
      assert.equal(t.baseEnergyRateDOP, row.energy[3], `${label}: tarifa plana = 4.º rango`);
    } else {
      assert.equal(t.baseEnergyRateDOP, row.energy, `${label}: energía`);
      assert.equal(t.blocks, undefined);
    }
    if (row.demand !== undefined) assert.equal(t.demandChargePerKWDOP, row.demand, `${label}: potencia`);
    if (row.hp !== undefined) {
      assert.equal(t.peakDemandChargePerKWDOP, row.hp, `${label}: potencia en punta`);
      assert.equal(t.offPeakDemandChargePerKWDOP, row.hfp, `${label}: potencia fuera de punta`);
      assert.equal(t.demandChargePerKWDOP, row.hp, `${label}: el escalar de potencia sigue siendo el de punta`);
    } else {
      assert.equal(t.peakDemandChargePerKWDOP, undefined);
    }
    assert.equal(t.peakEnergyRateDOP, undefined, `${label}: SIE-121 no publica energía en punta`);
    assert.equal(t.offPeakEnergyRateDOP, undefined);
    assert.equal(t.netMeteringRetentionPct, 25, `${label}: retención histórica intacta (fase 3)`);
  }
}

// CEPM: pliego reconocido de septiembre 2026 (SIE-147-2026-TF, art. 1). Cargos fijos y ESTRBT-2 no figuran: quedan marcados.
const cepm = m.schedules.CEPM.tariffs;
assert.equal(cepm['RBT-1'].baseEnergyRateDOP, 22.90);
assert.equal(cepm['RBT-2'].baseEnergyRateDOP, 14.00);
assert.equal(cepm['RBT-2'].demandChargePerKWDOP, 2251.45);
assert.equal(cepm['RMT-1'].currency, 'USD');
assert.equal(cepm['RMT-1'].baseEnergyRateUSD, 0.2789);
assert.equal(cepm['RMT-1'].demandChargePerKWUSD, undefined, 'SIE-147 no publica potencia para media tensión');
for (const code of ['RBT-1', 'RBT-2', 'RMT-1']) {
  const source = cepm[code].source!;
  assert.equal(source.resolutionCode, 'SIE-147-2026-TF', code);
  assert.equal(source.effectiveDate, '2026-09-01');
  assert.ok(source.fieldSources && Object.values(source.fieldSources).some((s) => s.resolutionCode !== 'SIE-147-2026-TF'), `${code}: cargos sin fuente marcados`);
}
assert.notEqual(cepm['ESTRBT-2'].source?.resolutionCode, 'SIE-147-2026-TF', 'ESTRBT-2 (CEB) no está en SIE-147');
assert.equal(cepm.BTS1.baseEnergyRateDOP, 22.90);
assert.equal(cepm.BTD.baseEnergyRateDOP, 14.00);
assert.equal(cepm.BTD.demandChargePerKWDOP, 2251.45);

// El contexto IA avisa del periodo y de los cargos sin fuente; no menciona el pliego anterior.
const lateContext = buildAITariffContext(m, new Date('2027-01-15T00:00:00Z'));
assert.ok(lateContext.warnings.some((w) => w.includes('SIE-121-2026-TF') && w.includes('octubre-diciembre 2026')), JSON.stringify(lateContext.warnings));
assert.ok(lateContext.warnings.some((w) => w.includes('CEPM/RBT-1')));
assert.ok(!buildAITariffContext(m, new Date('2026-11-16T00:00:00Z')).warnings.some((w) => w.includes('SIE-121-2026-TF')), 'Dentro del trimestre no avisa del periodo EDE');

// La matriz que el usuario u organización ya tienen guardada no cambia: solo cambia la referencia de fábrica.
const oldStored: GlobalTariffMatrix = JSON.parse(JSON.stringify({
  resolutionCode: 'SIE-176-2025-TF', effectiveDate: '2026-01-01', lastUpdatedAt: '2026-01-01T00:00:00.000Z', publishedBy: 'SIE',
  schedules: Object.fromEntries(Object.entries(m.schedules).map(([d, s]) => [d, { ...s, tariffs: { BTS1: { code: d === 'CEPM' ? 'RBT-1' : 'BTS1', name: 'BTS1', description: '', currency: 'DOP', baseEnergyRateDOP: 11.85, fixedChargeDOP: 127.83, blocks: [{ minKWh: 0, maxKWh: 200, rateDOP: 6.17 }, { minKWh: 201, maxKWh: Infinity, rateDOP: 13.26 }], netMeteringRetentionPct: 25 }, ...(d === 'CEPM' ? { 'RBT-1': { code: 'RBT-1', name: 'RBT-1', description: '', currency: 'DOP', baseEnergyRateDOP: 22.9, fixedChargeDOP: 250, netMeteringRetentionPct: 25 } } : {}) } }])),
}));
const restored = normalizeStoredTariffMatrix(oldStored);
assert.equal(restored.resolutionCode, 'SIE-176-2025-TF');
assert.equal(restored.schedules.EDESUR.tariffs.BTS1.baseEnergyRateDOP, 11.85);
assert.equal(restored.schedules.EDESUR.tariffs.BTS1.blocks![1].rateDOP, 13.26);
const durable: any = JSON.parse(JSON.stringify(serializeSimulationStore({ ...useSimulationStore.getState(), projects: [], tariffMatrix: oldStored })));
hydrateSimulationStore(durable);
assert.equal(durable.tariffMatrix.resolutionCode, 'SIE-176-2025-TF', 'Al abrir la app, la matriz guardada no se sustituye por la de fábrica');
assert.equal(durable.tariffMatrix.schedules.EDENORTE.tariffs.BTS1.baseEnergyRateDOP, 11.85);
// La matriz de fábrica sobrevive a JSON (tramos abiertos) sin perder los campos nuevos.
const factoryRoundTrip = normalizeStoredTariffMatrix(JSON.parse(JSON.stringify(m)));
assert.deepEqual(factoryRoundTrip.schedules.EDENORTE.tariffs.BTS1.fixedChargeTiersDOP, m.schedules.EDENORTE.tariffs.BTS1.fixedChargeTiersDOP);
assert.equal(factoryRoundTrip.schedules.EDENORTE.tariffs.BTS1.blocks![3].maxKWh, Infinity);
assert.equal(factoryRoundTrip.schedules.EDESUR.tariffs.MTH.offPeakDemandChargePerKWDOP, 122.73);
assert.equal(factoryRoundTrip.schedules.CEPM.tariffs['RMT-1'].baseEnergyRateUSD, 0.2789);

console.log('Tarifas 1b: matriz de fábrica SIE-121-2026-TF y SIE-147-2026-TF; lo guardado no cambia.');
