/**
 * Eficiencia y DOD del banco de baterías: promedio ponderado por capacidad de cada grupo; un dato ausente o
 * inválido (0, '', NaN, negativo) lo resuelve el motor con el default de 90, no la interfaz.
 */
import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { getProjectBatteries } from '../utils/equipmentSpecsUtils';
import { buildCatalogSelectionUpdate } from '../components/simulator/params/logic/catalogSelection';
import { selectCatalogEquipment } from '../utils/equipmentGroups';
import { resolveBatteryBankDodPct, resolveBatteryBankEfficiencyPct } from '../../shared/projectDefaults';
import type { ProjectSimulation, SystemSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';

const base = structuredClone(BENCHMARK_PROJECT);
const group = (id: string, capacityKWh: number, count: number, extra: object = {}) => ({ id, brandModel: id, capacityKWh, count, ...extra });
const bank = (second: object, firstExtra: object = { dodPct: 90, efficiencyPct: 95 }, scalar: object = {}): SystemSpecs => ({
  ...base.specs, hasBattery: true, batteryDOD: 90, batteryEfficiencyPct: undefined, ...scalar,
  batteries: [group('A', 16, 2, firstExtra), group('B', 15, 1, second)],
} as unknown as SystemSpecs);
const close = (a: number, b: number, msg: string) => assert(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// ── Helper compartido ──────────────────────────────────────────────────────────────────────
close(resolveBatteryBankEfficiencyPct(bank({ dodPct: 90 })), (32 * 95 + 15 * 90) / 47, 'banco mixto: 2×16 kWh al 95 % + 1×15 kWh sin dato');
assert.equal(Math.round(resolveBatteryBankEfficiencyPct(bank({})) * 10) / 10, 93.4);
for (const invalid of [undefined, 0, '', NaN, -5, null]) {
  close(resolveBatteryBankEfficiencyPct(bank({ efficiencyPct: invalid })), (32 * 95 + 15 * 90) / 47, `grupo con eficiencia ${String(invalid)} usa 90`);
}
close(resolveBatteryBankEfficiencyPct(bank({ efficiencyPct: 80 })), (32 * 95 + 15 * 80) / 47, 'cada grupo pesa por capacidad × cantidad');
close(resolveBatteryBankDodPct(bank({ dodPct: 70 }, { dodPct: 90 })), (32 * 90 + 15 * 70) / 47, 'DOD ponderado');
close(resolveBatteryBankDodPct(bank({}, { dodPct: 80 })), (32 * 80 + 15 * 90) / 47, 'DOD sin dato: 90');
// Un solo modelo y sin grupos: igual que hoy (el escalar, con el default si falta).
const single = { ...base.specs, hasBattery: true, batteries: [group('A', 10, 1, { efficiencyPct: 93 })], batteryEfficiencyPct: 93 } as unknown as SystemSpecs;
assert.equal(resolveBatteryBankEfficiencyPct(single), 93);
assert.equal(resolveBatteryBankEfficiencyPct({ ...base.specs, batteries: undefined, batteryEfficiencyPct: 88 } as SystemSpecs), 88, 'sin grupos: escalar');
assert.equal(resolveBatteryBankEfficiencyPct({ ...base.specs, batteries: undefined, batteryEfficiencyPct: undefined } as SystemSpecs), 90, 'sin grupos ni escalar: 90');
assert.equal(resolveBatteryBankEfficiencyPct({ ...base.specs, batteries: [], batteryEfficiencyPct: 91 } as unknown as SystemSpecs), 91);
assert.equal(resolveBatteryBankEfficiencyPct({ ...base.specs, batteries: [group('A', 0, 0)], batteryEfficiencyPct: 87 } as unknown as SystemSpecs), 87, 'capacidad total 0: escalar');
assert.equal(resolveBatteryBankDodPct({ ...base.specs, batteries: undefined, batteryDOD: 0 } as SystemSpecs), 90);
// El primer grupo sin dato propio hereda el escalar (espejo del primer grupo), los demás usan 90.
close(resolveBatteryBankEfficiencyPct(bank({}, {}, { batteryEfficiencyPct: 80 })), (32 * 80 + 15 * 90) / 47, 'primer grupo hereda el espejo');

// ── Motor: financeEngine, solarEngine y equipmentSpecsUtils ────────────────────────────────
const project = (specs: SystemSpecs): ProjectSimulation => ({ ...base, specs });
const usable = (specs: SystemSpecs) => calculateProjectFinancialSummary(project(specs)).batteryUsableKWh;
const dispatch = (specs: SystemSpecs) => JSON.stringify(calculateMonthlySolarProduction('Distrito Nacional', specs, base.monthlyConsumption, 0.2, 25, undefined, 'BTS2', false));
const referenceBank = bank({ dodPct: 90, efficiencyPct: 90 });
for (const missing of [undefined, 0, '', NaN]) {
  const candidate = bank({ dodPct: 90, efficiencyPct: missing });
  assert.equal(usable(candidate), usable(referenceBank), `financeEngine: modelo #2 con eficiencia ${String(missing)} se calcula con 90`);
  assert.equal(dispatch(candidate), dispatch(referenceBank), `solarEngine: modelo #2 con eficiencia ${String(missing)} se calcula con 90`);
  // Como principal (banco de un solo modelo con grupo sin dato).
  const primary = { ...base.specs, hasBattery: true, batteryDOD: 90, batteryEfficiencyPct: undefined, batteries: [group('P', 10, 1, { dodPct: 90, efficiencyPct: missing })] } as unknown as SystemSpecs;
  const primaryRef = { ...primary, batteries: [group('P', 10, 1, { dodPct: 90, efficiencyPct: 90 })] } as unknown as SystemSpecs;
  assert.equal(usable(primary), usable(primaryRef), `financeEngine: principal con eficiencia ${String(missing)}`);
  assert.equal(dispatch(primary), dispatch(primaryRef), `solarEngine: principal con eficiencia ${String(missing)}`);
  assert.equal(getProjectBatteries(primary).length, 1);
}
// El banco mixto pondera de verdad: ya no se usa la eficiencia del primero para todos.
const mixed = bank({ dodPct: 90, efficiencyPct: 70 });
const expectedUsable = Math.round(47 * 0.9 * (((32 * 95 + 15 * 70) / 47) / 100) * 10) / 10;
assert.equal(usable(mixed), expectedUsable, 'energía útil con eficiencia ponderada');
assert.notEqual(dispatch(mixed), dispatch(bank({ dodPct: 90, efficiencyPct: 95 })), 'solarEngine ve la eficiencia del segundo modelo');
// DOD ponderado en el motor.
assert.equal(usable(bank({ dodPct: 60, efficiencyPct: 95 })), Math.round(47 * (((32 * 90 + 15 * 60) / 47) / 100) * 0.95 * 10) / 10);
// Un solo modelo da lo de siempre.
assert.equal(usable({ ...base.specs, hasBattery: true, batteries: undefined, batteryCapacityKWh: 10, batteryCount: 1, batteryDOD: 80, batteryEfficiencyPct: 92 } as SystemSpecs), 7.4);

// ── Catálogo: batería sin eficiencia ───────────────────────────────────────────────────────
const item = (extra: object = {}) => ({ id: 'n', type: 'battery', displayName: 'Nueva', brand: 'B', capacityKWh: 10, ...extra }) as SolarEquipmentItem;
for (const missing of [undefined, 0, '', NaN]) {
  const catalogItem = item({ batteryEfficiencyPct: missing, dodPct: missing });
  const primary = buildCatalogSelectionUpdate({ ...base.specs } as SystemSpecs, 'battery', catalogItem);
  assert.equal(primary.batteryEfficiencyPct, 90, `principal desde catálogo con eficiencia ${String(missing)}: 90, no 0 ni 95`);
  assert.equal(primary.batteryDOD, 90);
  const specs = bank({ dodPct: 90 });
  const edit = selectCatalogEquipment(specs, 'battery', 1, catalogItem, { efficiencyPct: undefined, dodPct: undefined });
  const next = { ...specs, ...edit } as SystemSpecs;
  assert.equal(resolveBatteryBankEfficiencyPct(next), resolveBatteryBankEfficiencyPct(bank({ efficiencyPct: 90 })), 'modelo #2 sin eficiencia en el banco: 90 en el motor');
}

console.log('testBatteryBankDefaults: ok');
