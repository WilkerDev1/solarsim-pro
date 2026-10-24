import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import {
  ASSUMPTION_RULES, DEFAULT_ANNUAL_DEGRADATION_PCT, DEFAULT_DETAILED_SYSTEM_LOSSES_PCT, DEFAULT_DISCOUNT_RATE_PCT, DEFAULT_ENERGY_INFLATION_PCT,
  DEFAULT_PROJECT_LIFESPAN_YEARS, DEFAULT_QUOTE_VALIDITY_DAYS, isValidAssumption, resolveAssumption, resolveAssumptions, type AssumptionKey,
} from '../../shared/assumptions';
import { resolveBatteryDodPct } from '../../shared/projectDefaults';
import type { ProjectSimulation } from '../types';

/** ADR 0003: tabla de rangos, precedencia (los ajustes del usuario solo siembran proyectos nuevos) y «nuevo ≡ importado vacío». */
const original = store.getState();
try {
  // 1. La tabla: ausente, no finito, negativo o fuera de rango ⇒ default, para todos los campos.
  for (const [key, rule] of Object.entries(ASSUMPTION_RULES) as [AssumptionKey, (typeof ASSUMPTION_RULES)[AssumptionKey]][]) {
    for (const bad of [undefined, null, NaN, Infinity, -Infinity, -1, rule.max + 1]) {
      assert.equal(resolveAssumption(key, bad), rule.default, `${key}: ${String(bad)} cae al default`);
    }
    // El 0 solo es dato donde la tabla lo permite (decisión (b)).
    assert.equal(resolveAssumption(key, 0), rule.zeroIsMissing ? rule.default : 0, `${key}: tratamiento del 0`);
    assert.equal(isValidAssumption(key, rule.max), true, `${key}: el máximo es válido`);
    assert.equal(resolveAssumption(key, undefined, rule.max), rule.max, `${key}: el primer candidato válido gana`);
  }
  // Conteos de años y días: un entero. Una fracción no es válida y cae al default.
  const counts: AssumptionKey[] = ['projectLifespanYears', 'batteryReplacementYear', 'quoteValidityDays'];
  for (const key of counts) {
    assert.equal(ASSUMPTION_RULES[key].integer, true, `${key}: es un conteo entero`);
    assert.equal(resolveAssumption(key, 7.5), ASSUMPTION_RULES[key].default, `${key}: 7.5 cae al default`);
    assert.equal(resolveAssumption(key, 7.5, 8), 8, `${key}: el siguiente candidato entero gana`);
    assert.equal(resolveAssumption(key, 7), 7);
  }
  assert.equal(resolveAssumption('discountRatePct', 7.5), 7.5, 'los porcentajes admiten decimales');
  assert.equal(resolveAssumptions({ financials: { projectLifespanYears: 25.5 }, specs: { batteryLifespanYears: 7.5 }, client: { quoteValidityDays: 7.5 } }).projectLifespanYears, DEFAULT_PROJECT_LIFESPAN_YEARS);
  const zerosKept: AssumptionKey[] = ['annualEnergyInflationPct', 'discountRatePct', 'systemLossesPct', 'annualDegradationPct', 'installationUsdPerKwp'];
  const zerosMissing: AssumptionKey[] = ['dopExchangeRate', 'projectLifespanYears', 'quoteValidityDays', 'targetCoveragePct', 'pricePerWattUSD', 'saleMarginMultiplier'];
  for (const key of zerosKept) assert.equal(ASSUMPTION_RULES[key].zeroIsMissing, false, `${key}: 0 explícito se respeta`);
  for (const key of zerosMissing) assert.equal(ASSUMPTION_RULES[key].zeroIsMissing, true, `${key}: 0 cuenta como falta`);

  // 2. Un proyecto vacío resuelve a las constantes; los ajustes del usuario no entran (decisión (c)).
  store.setState({ defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, annualEnergyTariffEscalationPct: 9, discountRatePct: 30, lifespanYears: 10, defaultQuoteValidityDays: 30, defaultTargetCoveragePct: 70, defaultSystemLosses: 10 } });
  const empty = resolveAssumptions({});
  assert.deepEqual(empty, {
    dopExchangeRate: 60, systemLossesPct: 25, annualEnergyInflationPct: DEFAULT_ENERGY_INFLATION_PCT, discountRatePct: DEFAULT_DISCOUNT_RATE_PCT,
    projectLifespanYears: DEFAULT_PROJECT_LIFESPAN_YEARS, targetCoveragePct: 95, gridExportFeePct: 25, quoteValidityDays: DEFAULT_QUOTE_VALIDITY_DAYS,
    annualDegradationPct: DEFAULT_ANNUAL_DEGRADATION_PCT, batteryReplacementYear: 10, pricePerWattUSD: 1.13, saleMarginMultiplier: 1.25, installationUsdPerKwp: 170, co2FactorKgPerKWh: 0.481,
  });
  assert.equal(resolveAssumptions({ specs: { isDetailed: true } }).systemLossesPct, DEFAULT_DETAILED_SYSTEM_LOSSES_PCT, 'modo detallado sin pérdidas: 14');
  assert.equal(resolveAssumptions({ specs: { isDetailed: true, systemLosses: 0 } }).systemLossesPct, 0, 'pérdidas 0 explícitas se respetan');
  assert.equal(resolveAssumptions({ specs: {}, rates: { usdExchangeRate: 58 } }).dopExchangeRate, 58, 'cambio: specs, luego rates, luego default');
  assert.equal(resolveAssumptions({ specs: { dopExchangeRate: 61 }, rates: { usdExchangeRate: 58 } }).dopExchangeRate, 61);
  assert.equal(resolveAssumptions({ specs: { pricePerWattUSD: 0 }, financials: { pricePerWattUSD: 1.5 } }).pricePerWattUSD, 1.5, '$/W: specs, luego finanzas, luego default');
  assert.equal(resolveAssumptions({ rates: { annualEnergyInflationPct: 0 } }).annualEnergyInflationPct, 0, 'inflación 0 explícita se respeta');
  // Degradación: modo simple pondera los grupos; modo detallado usa la configurada.
  const groups = [{ powerW: 500, count: 10, annualDegradation: 0.2 }, { powerW: 500, count: 10, annualDegradation: 0.6 }];
  assert.ok(Math.abs(resolveAssumptions({ specs: { isDetailed: false, annualDegradation: 0.5, panels: groups } }).annualDegradationPct - 0.4) < 1e-9);
  assert.equal(resolveAssumptions({ specs: { isDetailed: true, annualDegradation: 0.5, panels: groups } }).annualDegradationPct, 0.5);

  // 3. Fábrica: proyecto nuevo con los ajustes de fábrica ≡ proyecto importado vacío, campo por campo.
  store.setState({ projects: [], activeProjectId: '', defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS } });
  store.getState().createNewProject({ name: 'Nuevo de fábrica' });
  const created = store.getState().projects[0];
  const imported = importMinimal({ client: { name: 'Importado vacío' }, specs: {}, rates: {} });
  assert.deepEqual(resolveAssumptions(imported), resolveAssumptions(created), 'nuevo ≡ importado vacío');
  assert.deepEqual(resolveAssumptions(created), { ...empty, annualEnergyInflationPct: 3.5 }, 'y ambos son las constantes compartidas');
  // También sin objetos anidados vacíos: el archivo más pequeño que acepta la importación.
  assert.deepEqual(resolveAssumptions(importMinimal({ client: { name: 'Mínimo' }, specs: { isDetailed: false }, rates: { distributor: 'EDESUR' }, financials: {} })), resolveAssumptions(created));

  // 4. Un archivo guardado conserva lo suyo: 0 explícitos se respetan, el resto de lo que falta toma la constante (no los ajustes).
  store.setState({ projects: [], defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, discountRatePct: 30, annualEnergyTariffEscalationPct: 9 } });
  const kept = importMinimal({ client: { name: 'Con ceros' }, specs: { isDetailed: true, systemLosses: 0 }, rates: { annualEnergyInflationPct: 0 }, financials: { discountRatePct: 0 } });
  const keptAssumptions = resolveAssumptions(kept);
  assert.equal(keptAssumptions.annualEnergyInflationPct, 0);
  assert.equal(keptAssumptions.discountRatePct, 0);
  assert.equal(keptAssumptions.systemLossesPct, 0);
  assert.equal(keptAssumptions.projectLifespanYears, DEFAULT_PROJECT_LIFESPAN_YEARS);
  const legacy = importMinimal({ client: { name: 'Sin datos' }, specs: { isDetailed: true }, rates: {}, financials: {} });
  assert.equal(resolveAssumptions(legacy).discountRatePct, DEFAULT_DISCOUNT_RATE_PCT, 'los ajustes del usuario (30 %) no entran en una propuesta importada');
  assert.equal(resolveAssumptions(legacy).systemLossesPct, DEFAULT_DETAILED_SYSTEM_LOSSES_PCT);

  // 5. Los ajustes del usuario siembran los proyectos NUEVOS.
  store.setState({ projects: [], defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, discountRatePct: 30, annualEnergyTariffEscalationPct: 9, defaultQuoteValidityDays: 15, defaultSystemLosses: 18, defaultTargetCoveragePct: 80, defaultApplySieRetention: false } });
  store.getState().createNewProject({ name: 'Con ajustes' });
  const seeded = resolveAssumptions(store.getState().projects[0]);
  assert.deepEqual([seeded.discountRatePct, seeded.annualEnergyInflationPct, seeded.quoteValidityDays, seeded.systemLossesPct, seeded.targetCoveragePct, seeded.gridExportFeePct], [30, 9, 15, 18, 80, 0]);
  assert.equal(resolveBatteryDodPct(undefined), 90, 'DOD de batería: sin cambios (fuera de este ADR)');
  console.log('PASS: supuestos resueltos: tabla de rangos, precedencia y fábrica (nuevo ≡ importado vacío).');
} finally {
  store.setState(original, true);
}

function importMinimal(file: object): ProjectSimulation {
  store.setState({ projects: [] });
  const result = store.getState().importProjectsFromJSON(file);
  assert.equal(result.success, true);
  return store.getState().projects[0];
}
