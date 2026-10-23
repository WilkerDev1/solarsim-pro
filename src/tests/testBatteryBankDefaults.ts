/**
 * Eficiencia y DOD del banco de baterías: promedio ponderado por capacidad de cada grupo; un dato ausente o
 * inválido (0, '', NaN, negativo) lo resuelve el motor con el default de 90, no la interfaz.
 */
import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { buildNewItem } from '../components/simulator/params/sections/equipment/equipmentGroupModel';
import { createAIProposalBase, prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { getProjectBatteries } from '../utils/equipmentSpecsUtils';
import { buildCatalogSelectionUpdate } from '../components/simulator/params/logic/catalogSelection';
import { readFileSync } from 'node:fs';
import { editEquipmentGroup, normalizeEquipmentEdit, selectCatalogEquipment } from '../utils/equipmentGroups';
import * as shared from '../../shared/projectDefaults';
import { resolveBatteryBankDodPct, resolveBatteryBankEfficiencyPct, resolvePrimaryBatteryEfficiencyPct } from '../../shared/projectDefaults';
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
const dispatch = (specs: SystemSpecs) => JSON.stringify(calculateMonthlySolarProduction('Distrito Nacional', specs, base.monthlyConsumption, 0.2, 25, undefined, 'BTS2', false, 'self_consumption'));
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
const item = (extra: object = {}) => ({ id: 'n', type: 'battery', displayName: 'Nueva', brand: 'B', capacityKWh: 15, ...extra }) as SolarEquipmentItem;
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

// ── Dock: el campo de la batería principal edita el grupo 1 y el espejo ────────────────────
{
  const specs = bank({ dodPct: 90, efficiencyPct: 90 });
  const patch = editEquipmentGroup(specs, 'battery', { type: 'update', index: 0, patch: { efficiencyPct: 80 } });
  assert.equal(patch.batteryEfficiencyPct, 80, 'el espejo escalar sigue al primer grupo');
  const next = { ...specs, ...patch } as SystemSpecs;
  close(resolveBatteryBankEfficiencyPct(next), (32 * 80 + 15 * 90) / 47, 'el motor ve el cambio del dock con varios modelos');
  assert.equal(resolvePrimaryBatteryEfficiencyPct(next), 80);
}
for (const file of ['src/components/common/AIDatasheetScannerModal.tsx', 'src/components/common/EquipmentEditorModal.tsx', 'src/components/common/EquipmentManagerSettingsTab.tsx']) {
  const text = readFileSync(file, 'utf8');
  assert(!/batteryEfficiencyPct[^\n]{0,40}\b95\b/.test(text) && !text.includes('"battery" ? 95'), `${file} no fuerza 95`);
}

const draftBaseFor = () => createAIProposalBase(BENCHMARK_PROJECT, { defaultBatteryDOD: 90 } as never, 'Santiago');
// ── Borrador de IA: los escalares reflejan el primer grupo, no un promedio del banco ───────
{
  const draftBase = createAIProposalBase(BENCHMARK_PROJECT, { defaultBatteryDOD: 90 } as never, 'Santiago');
  const data = {
    monthlyConsumptionKWh: Array(12).fill(1000), averageMonthlyKWh: 1000, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1',
    panels: [{ id: 'p', brandModel: 'P', powerW: 600, count: 10 }], inverters: [{ id: 'i', brandModel: 'I', powerKW: 5, count: 1 }],
    batteries: [group('G1', 10, 1), group('G2', 10, 1, { dodPct: 80, efficiencyPct: 80 })],
  };
  const prepared = prepareProposalDraftProject(draftBase, data as never, DEFAULT_RD_TARIFF_MATRIX as never, { isNew: true });
  close(resolveBatteryBankDodPct(prepared.specs), 85, 'DOD del banco = (90 + 80) / 2, sin promediar dos veces');
  close(20 * (resolveBatteryBankDodPct(prepared.specs) / 100) * (resolveBatteryBankEfficiencyPct(prepared.specs) / 100), 10 * 0.9 * 0.9 + 10 * 0.8 * 0.8, 'energía útil del banco = Σ(C·DOD·η) = 14.5 kWh');
  assert.equal(prepared.specs.batteryDOD, 90, 'el escalar es el del primer grupo');
}

// ── Catálogo → proyecto con grupos: el precio de proveedor sincroniza la eficiencia del grupo principal ──
{
  const { useSimulationStore } = await import('../store/useSimulationStore');
  const store = () => useSimulationStore.getState();
  store().createNewProject({ name: 'Banco', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS2' });
  store().updateSpecs({ hasBattery: true, batteries: [group('A', 10, 1, { dodPct: 90, efficiencyPct: 95 }), group('B', 10, 1, { dodPct: 90, efficiencyPct: 90 })] } as Partial<SystemSpecs>);
  const offer = { id: 'sp', supplierName: 'Dist', priceUSD: 1500, updatedAt: '2026-10-21' };
  const entry = { id: 'cat-x', displayName: 'Nueva 10', type: 'battery', brand: 'QA', modelSeries: 'QA', createdAt: 'x', updatedAt: 'x', capacityKWh: 10, dodPct: 90, batteryEfficiencyPct: 85, supplierPrices: [offer] } as unknown as SolarEquipmentItem;
  store().applySupplierPriceToProject('battery', offer, entry);
  const specs = store().getActiveProject().specs;
  assert.equal(specs.batteries![0].efficiencyPct, 85, 'el grupo principal toma la eficiencia del catálogo');
  assert.equal(specs.batteryEfficiencyPct, 85);
  close(resolveBatteryBankEfficiencyPct(specs), 87.5, 'el motor ve el cambio');
}

// ── Edición escalar (asistente, importaciones) con varios modelos: va al grupo principal ────
{
  const specs = bank({ dodPct: 90, efficiencyPct: 90 }, { dodPct: 90, efficiencyPct: 95 });
  const next = normalizeEquipmentEdit(specs, { batteryEfficiencyPct: 80, batteryDOD: 70 });
  assert.equal(next.batteries![0].efficiencyPct, 80, 'la eficiencia escalar llega al primer grupo');
  assert.equal(next.batteries![0].dodPct, 70);
  assert.equal(next.batteries![1].efficiencyPct, 90, 'los demás grupos no cambian');
  assert.equal(next.batteryEfficiencyPct, 80);
  close(resolveBatteryBankEfficiencyPct(next), (32 * 0.7 * 80 + 15 * 0.9 * 90) / (32 * 0.7 + 15 * 0.9), 'el motor usa el valor editado');
}

// ── «+» con un modelo del catálogo: el grupo nuevo lleva sus DOD y eficiencia ───────────────
{
  const cat = [item({ id: 'c1', displayName: 'Otra', batteryEfficiencyPct: 95, dodPct: 85 })];
  const added = buildNewItem('battery', { ...base.specs, hasBattery: true } as SystemSpecs, cat);
  assert.equal(added.efficiencyPct, 95);
  assert.equal(added.dodPct, 85);
  const bare = buildNewItem('battery', { ...base.specs, hasBattery: true } as SystemSpecs, [item({ id: 'c2', displayName: 'Sin dato', batteryEfficiencyPct: 0 })]);
  assert.equal(bare.efficiencyPct, 90, 'catálogo sin eficiencia: 90');
}

// El escalar de un proyecto existente solo es el valor del grupo principal.
{
  const existing = { ...draftBaseFor(), specs: { ...draftBaseFor().specs, batteryDOD: 80, batteryEfficiencyPct: 85 } };
  const data = {
    monthlyConsumptionKWh: Array(12).fill(1000), averageMonthlyKWh: 1000, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1',
    panels: [{ id: 'p', brandModel: 'P', powerW: 600, count: 10 }], inverters: [{ id: 'i', brandModel: 'I', powerKW: 5, count: 1 }],
    batteries: [group('G1', 10, 1), group('G2', 10, 1)],
  };
  const prepared = prepareProposalDraftProject(existing, data as never, DEFAULT_RD_TARIFF_MATRIX as never, { isNew: false });
  assert.equal(prepared.specs.batteries![0].dodPct, 80);
  assert.equal(prepared.specs.batteries![1].dodPct, 90, 'el segundo grupo sin dato usa 90, no el escalar del principal');
  assert.equal(prepared.specs.batteries![1].efficiencyPct, 90);
}

// ── Reordenar o reemplazar la lista no cambia el resultado ─────────────────────────────────
{
  const A = group('A', 10, 1, { dodPct: 70, efficiencyPct: 80 });
  const B = group('B', 10, 1);
  const start = { ...base.specs, hasBattery: true, batteries: [A, B], batteryDOD: 70, batteryEfficiencyPct: 80 } as unknown as SystemSpecs;
  const ab = normalizeEquipmentEdit(start, { batteries: [A, B] } as Partial<SystemSpecs>);
  const ba = normalizeEquipmentEdit(start, { batteries: [B, A] } as Partial<SystemSpecs>);
  close(resolveBatteryBankDodPct(ab), resolveBatteryBankDodPct(ba), 'DOD igual con [A, B] y [B, A]');
  close(resolveBatteryBankEfficiencyPct(ab), resolveBatteryBankEfficiencyPct(ba), 'eficiencia igual con [A, B] y [B, A]');
  assert.equal(usable(ab), usable(ba), 'energía útil igual con [A, B] y [B, A]');
  close(20 * (resolveBatteryBankDodPct(ba) / 100) * (resolveBatteryBankEfficiencyPct(ba) / 100), 10 * 0.7 * 0.8 + 10 * 0.9 * 0.9, 'B usa 90/90: 13.7 kWh');
  assert.equal(ba.batteryDOD, undefined, 'el espejo se reinicia: el nuevo principal no tiene dato propio');
  assert.equal(ba.batteryEfficiencyPct, undefined);
}

// ── Porcentajes > 100 no son válidos ──────────────────────────────────────────────────────
{
  assert.equal(shared.resolveBatteryEfficiencyPct(150), 90);
  assert.equal(shared.resolveBatteryDodPct(101), 90);
  assert.equal(shared.resolveBatteryEfficiencyPct(100), 100);
  close(resolveBatteryBankEfficiencyPct(bank({ efficiencyPct: 150 })), (32 * 95 + 15 * 90) / 47, 'un grupo con eficiencia > 100 usa 90');
  assert(usable(bank({ dodPct: 500, efficiencyPct: 500 })) <= 47, 'la energía útil nunca supera la capacidad nominal');
}

console.log('testBatteryBankDefaults: ok');
