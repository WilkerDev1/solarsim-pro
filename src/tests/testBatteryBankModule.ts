/**
 * Banco de baterías (ADR 0002): energía útil y autonomía salen de un solo módulo (`shared/equipment/battery.ts`).
 * Esta suite fija las salidas de los tres consumidores (solarEngine, financeEngine y la vista previa del perfil de
 * carga) para una matriz de casos; se escribió ANTES del refactor como prueba de caracterización y pasa igual
 * después, salvo el caso «Sí batería con banco de 0 kWh» (decisión (b) del ADR 0002).
 */
import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { computeLoadProfilePreview } from '../components/simulator/params/logic/loadProfilePreview';
import { batteryAutonomyHours, batteryBank, equipmentTotals, readEquipment } from '../../shared/equipment';
import type { LegacyProjectSpecs, ProjectSimulation } from '../types';

const base = structuredClone(BENCHMARK_PROJECT);
const g = (capacityKWh: number, count: number, extra: object = {}) => ({ id: `g-${capacityKWh}-${count}`, brandModel: 'B', capacityKWh, count, ...extra });
const withBank = (specs: object): LegacyProjectSpecs => ({ ...base.specs, hasBattery: true, batteries: undefined, ...specs } as unknown as LegacyProjectSpecs);

interface Observation {
  usableKWh: number;
  autonomyHours: number;
  legacyBattery: number;
  legacyExport: number;
  physicalBattery: number;
  physicalExport: number;
  previewDischarge: number;
  previewHasBattery: boolean;
}

const sum = (rows: object[], key: string) => Math.round(rows.reduce((total, row) => total + (Number((row as Record<string, unknown>)[key]) || 0), 0) * 1e6) / 1e6;
function observe(specs: LegacyProjectSpecs): Observation {
  const project = { ...base, specs } as unknown as ProjectSimulation;
  const finance = calculateProjectFinancialSummary(project);
  const run = (mode: 'legacy' | 'self_consumption') => calculateMonthlySolarProduction('Distrito Nacional', specs as never, base.monthlyConsumption, 0.2, 25, undefined, 'BTS2', false, mode);
  const legacy = run('legacy');
  const physical = run('self_consumption');
  const preview = computeLoadProfilePreview(project, 'BTS2', 3279);
  return {
    usableKWh: finance.batteryUsableKWh,
    autonomyHours: finance.batteryBackupAutonomyHours,
    legacyBattery: sum(legacy, 'batteryContributionKWh'),
    legacyExport: sum(legacy, 'gridExportedKWh'),
    physicalBattery: sum(physical, 'batteryContributionKWh'),
    physicalExport: sum(physical, 'gridExportedKWh'),
    previewDischarge: Math.round(preview.bessDischargeDaily * 1e6) / 1e6,
    previewHasBattery: preview.hasBattery,
  };
}

const CASES: Record<string, LegacyProjectSpecs> = {
  'un grupo 90/90': withBank({ batteries: [g(16, 2, { dodPct: 90, efficiencyPct: 90 })] }),
  'un grupo 80/95': withBank({ batteries: [g(10, 3, { dodPct: 80, efficiencyPct: 95 })] }),
  'grupos mixtos con DOD y eficiencia distintos': withBank({ batteries: [g(10, 1, { dodPct: 90, efficiencyPct: 90 }), g(10, 1, { dodPct: 80, efficiencyPct: 80 })] }),
  'tres grupos desiguales': withBank({ batteries: [g(16, 2, { dodPct: 95, efficiencyPct: 96 }), g(15, 1, { dodPct: 70, efficiencyPct: 85 }), g(5.12, 3, { dodPct: 60, efficiencyPct: 99 })] }),
  'DOD y eficiencia ausentes: 90/90': withBank({ batteries: [g(10, 2)] }),
  'DOD y eficiencia inválidos: 90/90': withBank({ batteries: [g(10, 2, { dodPct: 0, efficiencyPct: 150 }), g(8, 1, { dodPct: -3, efficiencyPct: NaN })] }),
  'un grupo con dato y otro sin él': withBank({ batteries: [g(16, 2, { dodPct: 70, efficiencyPct: 80 }), g(15, 1)] }),
  'capacidades fraccionarias (redondeo a 2 decimales)': withBank({ batteries: [g(5.123, 3, { dodPct: 85, efficiencyPct: 92 }), g(2.0049, 7, { dodPct: 75, efficiencyPct: 88 })] }),
  'sin batería con grupos guardados': { ...withBank({ batteries: [g(16, 2, { dodPct: 80, efficiencyPct: 80 })] }), hasBattery: false } as LegacyProjectSpecs,
  'sin batería ni grupos': { ...withBank({}), hasBattery: false } as LegacyProjectSpecs,
  'espejo heredado sin grupos': withBank({ batteryCapacityKWh: 12, batteryCount: 2, batteryDOD: 80, batteryEfficiencyPct: 92 }),
  'espejo heredado sin DOD ni eficiencia': withBank({ batteryCapacityKWh: 12, batteryCount: 1 }),
  'espejo heredado con cantidad 0 y sin grupos': withBank({ batteryCapacityKWh: 12, batteryCount: 0, batteryDOD: 80, batteryEfficiencyPct: 80 }),
  'respaldo del espejo: grupo guardado sin capacidad': withBank({ batteries: [g(0, 2, { dodPct: 90, efficiencyPct: 90 })], batteryCapacityKWh: 10, batteryDOD: 80, batteryEfficiencyPct: 85 }),
  'respaldo del espejo: grupo sin cantidad': withBank({ batteries: [g(0, 0)], batteryCapacityKWh: 10, batteryDOD: 70, batteryEfficiencyPct: 95 }),
  // Decisión (b), ADR 0002: «Sí batería» con un banco de 0 kWh es «sin almacenamiento» en todas partes.
  // Antes de 0002 el motor financiero usaba la capacidad del primer grupo (10 kWh × 0,8 × 0,8 = 6,4 kWh).
  'Sí batería con banco de 0 kWh (cantidad 0)': withBank({ batteries: [g(10, 0, { dodPct: 80, efficiencyPct: 80 })] }),
  'Sí batería con banco de 0 kWh (capacidad 0)': withBank({ batteries: [g(0, 3, { dodPct: 80, efficiencyPct: 80 })] }),
};

/**
 * Valores fijados con el código anterior al refactor. Única diferencia (decisión (b), ADR 0002): los bancos de 0 kWh
 * con «Sí batería» (cantidad 0) daban 7.7, 6.7 y 6.4 kWh de energía útil (1.7, 1.5 y 1.4 h) porque el motor financiero
 * recurría a la capacidad del primer grupo; ahora es 0 kWh y 0 h, como ya ocurría en el motor solar y en la vista previa.
 */
const EXPECTED: Record<string, Observation> = {
  "un grupo 90/90": { usableKWh: 25.9, autonomyHours: 5.8, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 9460.7, physicalExport: 15835, previewDischarge: 25.92, previewHasBattery: true },
  "un grupo 80/95": { usableKWh: 22.8, autonomyHours: 5.1, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 8322, physicalExport: 16973.7, previewDischarge: 22.8, previewHasBattery: true },
  "grupos mixtos con DOD y eficiencia distintos": { usableKWh: 14.5, autonomyHours: 3.2, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 5292.5, physicalExport: 20003.6, previewDischarge: 14.5, previewHasBattery: true },
  "tres grupos desiguales": { usableKWh: 47.2, autonomyHours: 10.5, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 17239.9, physicalExport: 8056.1, previewDischarge: 47.23284, previewHasBattery: true },
  "DOD y eficiencia ausentes: 90/90": { usableKWh: 16.2, autonomyHours: 3.6, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 5913, physicalExport: 19382.9, previewDischarge: 16.2, previewHasBattery: true },
  "DOD y eficiencia inválidos: 90/90": { usableKWh: 22.7, autonomyHours: 5.1, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 8278.3, physicalExport: 17018, previewDischarge: 22.68, previewHasBattery: true },
  "un grupo con dato y otro sin él": { usableKWh: 30.1, autonomyHours: 6.7, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 10975.8, physicalExport: 14321, previewDischarge: 30.07, previewHasBattery: true },
  "capacidades fraccionarias (redondeo a 2 decimales)": { usableKWh: 21.3, autonomyHours: 4.7, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 7766.6, physicalExport: 17529.4, previewDischarge: 21.278808, previewHasBattery: true },
  "sin batería con grupos guardados": { usableKWh: 0, autonomyHours: 0, legacyBattery: 0, legacyExport: 9767, physicalBattery: 0, physicalExport: 25296.1, previewDischarge: 0, previewHasBattery: false },
  "sin batería ni grupos": { usableKWh: 0, autonomyHours: 0, legacyBattery: 0, legacyExport: 9767, physicalBattery: 0, physicalExport: 25296.1, previewDischarge: 0, previewHasBattery: false },
  "espejo heredado sin grupos": { usableKWh: 17.7, autonomyHours: 3.9, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 6447.4, physicalExport: 18849, previewDischarge: 17.664, previewHasBattery: true },
  "espejo heredado sin DOD ni eficiencia": { usableKWh: 9.7, autonomyHours: 2.2, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 3547.7, physicalExport: 21748.4, previewDischarge: 9.72, previewHasBattery: true },
  "espejo heredado con cantidad 0 y sin grupos": { usableKWh: 0, autonomyHours: 0, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 0, physicalExport: 25296.1, previewDischarge: 0, previewHasBattery: false },
  "respaldo del espejo: grupo guardado sin capacidad": { usableKWh: 6.8, autonomyHours: 1.5, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 2482, physicalExport: 22814.1, previewDischarge: 6.8, previewHasBattery: true },
  "respaldo del espejo: grupo sin cantidad": { usableKWh: 0, autonomyHours: 0, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 0, physicalExport: 25296.1, previewDischarge: 0, previewHasBattery: false },
  "Sí batería con banco de 0 kWh (cantidad 0)": { usableKWh: 0, autonomyHours: 0, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 0, physicalExport: 25296.1, previewDischarge: 0, previewHasBattery: false },
  "Sí batería con banco de 0 kWh (capacidad 0)": { usableKWh: 0, autonomyHours: 0, legacyBattery: 0, legacyExport: 3906.7, physicalBattery: 0, physicalExport: 25296.1, previewDischarge: 0, previewHasBattery: false },
};

if (process.env.PRINT_OBSERVATIONS) {
  console.log(JSON.stringify(Object.fromEntries(Object.entries(CASES).map(([name, specs]) => [name, observe(specs)])), null, 2));
} else {
  for (const [name, specs] of Object.entries(CASES)) {
    assert.deepEqual(observe(specs), EXPECTED[name], name);
  }
  // ── El módulo directamente ──
  const close = (a: number, b: number, msg: string) => assert(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
  for (const [name, specs] of Object.entries(CASES)) {
    const equipment = readEquipment(specs);
    const bank = batteryBank(equipment);
    assert.equal(bank.nominalKWh, equipmentTotals(equipment).batteryNominalKWh, `${name}: la capacidad nominal es la de equipmentTotals (2 decimales)`);
    assert.equal(bank.hasStorage, bank.nominalKWh > 0, `${name}: almacena si hay capacidad`);
    if (!bank.hasStorage) assert.equal(bank.usableKWh, 0, `${name}: sin almacenamiento no hay energía útil`);
  }
  const mixed = batteryBank(readEquipment(CASES['grupos mixtos con DOD y eficiencia distintos']));
  close(mixed.dodPct, 85, 'DOD ponderado por capacidad');
  close(mixed.usableKWh, 10 * 0.9 * 0.9 + 10 * 0.8 * 0.8, 'energía útil = Σ(Cᵢ·DODᵢ·ηᵢ)');
  const fractional = batteryBank(readEquipment(CASES['capacidades fraccionarias (redondeo a 2 decimales)']));
  assert.equal(fractional.nominalKWh, 29.4, '5.123×3 + 2.0049×7 = 29.4003 → 29.4');
  const emptyBank = batteryBank(readEquipment(CASES['sin batería con grupos guardados']));
  assert.deepEqual(emptyBank, { hasStorage: false, nominalKWh: 0, dodPct: 90, efficiencyPct: 90, usableKWh: 0 }, 'hasBattery falso: banco vacío con los defaults');
  assert.equal(batteryBank(readEquipment(CASES['Sí batería con banco de 0 kWh (cantidad 0)'])).dodPct, 80, 'banco sin capacidad: DOD del primer grupo');
  // Autonomía: usa la energía útil a 0,1 kWh (como el resumen financiero) y 0 sin almacenamiento o sin carga.
  const bank = batteryBank(readEquipment(CASES['un grupo 90/90']));
  assert.equal(batteryAutonomyHours(bank, 100), Math.round((25.9 / (100 / 24)) * 10) / 10);
  assert.equal(batteryAutonomyHours(bank, 0), 0);
  assert.equal(batteryAutonomyHours(emptyBank, 100), 0);
  console.log(`PASS: ${Object.keys(CASES).length} casos del banco de baterías (motor solar, motor financiero y vista previa).`);
}
