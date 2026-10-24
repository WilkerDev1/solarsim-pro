import assert from 'node:assert/strict';
import { calculateCostMatrixSummary, calculateFinancialSummary, calculateProjectFinancialSummary } from '../engine/financeEngine';
import { calculateMonthlySolarProduction } from '../engine/solarEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateTotalBatteryCapacityKWh, calculateTotalDCCapacityKWp, calculateTotalInverterPowerKW, calculateTotalPanelCount } from '../utils/equipmentSpecsUtils';
import { LEGACY_MIRROR_FIELDS, migrateLegacySpecs } from '../../shared/equipment';
import type { LegacyProjectSpecs, ProjectSimulation, SystemSpecs } from '../types';

/**
 * Oleada 2 del plan EquipmentModel: el motor lee los equipos solo de los grupos. Con specs que traen ÚNICAMENTE
 * grupos (sin espejo heredado) los resultados deben ser idénticos a los del mismo proyecto con el espejo.
 */
const ref = BENCHMARK_PROJECT;
const noMirror = (specs: SystemSpecs): SystemSpecs => {
  const copy: Record<string, unknown> = { ...specs };
  for (const key of LEGACY_MIRROR_FIELDS) delete copy[key];
  delete copy.selectedSupplierInfo;
  return copy as unknown as SystemSpecs;
};
const mirrorKeys = (specs: object) => LEGACY_MIRROR_FIELDS.filter((key) => key in specs);

const multiGroups: Partial<SystemSpecs> = {
  panels: [
    { id: 'pa', brandModel: 'Panel A 620', powerW: 620, count: 20, unitPriceUSD: 100, weightKilos: 28, annualDegradation: 0.4 },
    { id: 'pb', brandModel: 'Panel B 550', powerW: 550, count: 10, unitPriceUSD: 90 },
  ],
  inverters: [
    { id: 'ia', brandModel: 'Inversor 8', powerKW: 8, count: 1, unitPriceUSD: 2300 },
    { id: 'ib', brandModel: 'Inversor 5', powerKW: 5, unitPriceUSD: 1500 },
  ] as SystemSpecs['inverters'],
  batteries: [
    { id: 'ba', brandModel: 'Bat 10', capacityKWh: 10, count: 2, unitPriceUSD: 1800, dodPct: 90, efficiencyPct: 96 },
    { id: 'bb', brandModel: 'Bat 5', capacityKWh: 5, count: 1, unitPriceUSD: 900, dodPct: 70, efficiencyPct: 90 },
  ],
  hasBattery: true,
};
// Lo que la app escribía antes: grupos + espejo del primer grupo.
const multiWithMirror: LegacyProjectSpecs = {
  ...ref.specs, ...multiGroups,
  panelBrandModel: 'Panel A 620', panelPowerW: 620, panelCount: 20, panelUnitPriceUSD: 100, panelWeightKilos: 28,
  inverterBrandModel: 'Inversor 8', inverterPowerKW: 8, inverterCount: 1, inverterUnitPriceUSD: 2300,
  batteryBrandModel: 'Bat 10', batteryCapacityKWh: 10, batteryCount: 2, batteryUnitPriceUSD: 1800, batteryDOD: 90, batteryEfficiencyPct: 96,
};
// Banco con cantidad 0: el motor financiero recurría al escalar de capacidad del espejo.
const zeroCountWithMirror: LegacyProjectSpecs = {
  ...ref.specs,
  hasBattery: true,
  batteries: [{ id: 'bz', brandModel: 'Bat 10', capacityKWh: 10, count: 0, unitPriceUSD: 1800, dodPct: 85, efficiencyPct: 93 }],
  batteryBrandModel: 'Bat 10', batteryCapacityKWh: 10, batteryCount: 0, batteryUnitPriceUSD: 1800, batteryDOD: 85, batteryEfficiencyPct: 93,
};
const sparseLegacy = { ...ref.specs, panelUnitPriceUSD: undefined, inverterUnitPriceUSD: undefined, batteryUnitPriceUSD: undefined, batteryDOD: undefined, inverterCount: undefined, batteryCount: undefined } as unknown as SystemSpecs;

const fixtures: Record<string, { withMirror: SystemSpecs; groupsOnly: SystemSpecs }> = {
  referenceCase: { withMirror: ref.specs, groupsOnly: migrateLegacySpecs(ref.specs) },
  sparseLegacy: { withMirror: sparseLegacy, groupsOnly: migrateLegacySpecs(sparseLegacy) },
  multiGroup: { withMirror: multiWithMirror, groupsOnly: noMirror(multiWithMirror) },
  zeroCountBank: { withMirror: zeroCountWithMirror, groupsOnly: migrateLegacySpecs(zeroCountWithMirror) },
  noBattery: { withMirror: { ...ref.specs, hasBattery: false }, groupsOnly: migrateLegacySpecs({ ...ref.specs, hasBattery: false }) },
};

const compute = (specs: SystemSpecs) => {
  const kWp = calculateTotalDCCapacityKWp(specs);
  const project: ProjectSimulation = { ...ref, specs };
  return {
    totals: [kWp, calculateTotalPanelCount(specs), calculateTotalInverterPowerKW(specs), calculateTotalBatteryCapacityKWh(specs)],
    production: (['legacy', 'self_consumption'] as const).map((mode) =>
      calculateMonthlySolarProduction(ref.client.province, specs, ref.monthlyConsumption, ref.rates.energyCostPerKWh, ref.rates.gridExportFeePct ?? 25, undefined, ref.rates.tariffCode, false, mode)),
    costMatrix: calculateCostMatrixSummary(specs, kWp),
    financial: (['legacy', 'self_consumption'] as const).map((mode) =>
      calculateFinancialSummary(ref.client.province, specs, ref.rates, ref.financials, ref.monthlyConsumption, undefined, mode)),
    projectSummary: calculateProjectFinancialSummary(project),
  };
};

for (const [name, { withMirror, groupsOnly }] of Object.entries(fixtures)) {
  assert.deepEqual(mirrorKeys(groupsOnly), [], `${name}: la fixture de solo grupos no trae espejo`);
  assert.ok(groupsOnly.panels?.length && groupsOnly.inverters?.length, `${name}: trae grupos`);
  const expected = compute(withMirror);
  const actual = compute(groupsOnly);
  assert.deepEqual(actual.totals, expected.totals, `${name}: totales de equipos`);
  assert.deepEqual(actual.production, expected.production, `${name}: producción mensual`);
  assert.deepEqual(actual.costMatrix, expected.costMatrix, `${name}: matriz de costos`);
  assert.deepEqual(actual.financial, expected.financial, `${name}: resumen financiero`);
  assert.deepEqual(actual.projectSummary, expected.projectSummary, `${name}: resumen del proyecto`);
  const usable = actual.financial[0].batteryUsableKWh;
  assert.ok(Number.isFinite(usable), `${name}: la energía útil del banco es un número (${usable})`);
}

// El caso de referencia conserva sus cifras auditadas con y sin espejo.
{
  const summary = calculateFinancialSummary(ref.client.province, fixtures.referenceCase.groupsOnly, ref.rates, ref.financials, ref.monthlyConsumption);
  assert.equal(summary.systemCapacityKWp, 23.56);
  assert.deepEqual(summary, calculateFinancialSummary(ref.client.province, ref.specs, ref.rates, ref.financials, ref.monthlyConsumption));
}

// Multi-grupo: la matriz lista ambos modelos de cada tipo; un inversor sin cantidad cuenta 1.
{
  const items = calculateCostMatrixSummary(fixtures.multiGroup.groupsOnly, 0).items;
  const byName = (name: string) => items.find((item) => item.name === name);
  assert.equal(byName('Panel B 550')?.quantity, 10);
  assert.equal(byName('Inversor 5')?.quantity, 1);
  assert.equal(byName('Bat 5')?.unitPriceUSD, 900);
}

console.log('Engine reads equipment from groups only: same results as the mirrored project.');
