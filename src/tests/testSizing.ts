// F2b: dimensionado como funciones puras del dominio (`src/domain/sizing.ts`), con los supuestos declarados en un solo sitio
// (`SIZING_ASSUMPTIONS`) y visibles en cada resultado. Casos numéricos hechos a mano.
import assert from 'node:assert/strict';
import {
  SIZING_ASSUMPTIONS, chooseCatalogEquipment, designConsumption, nightProfileBatteryRequirementKWh, recommendBatteryCount,
  recommendInverterCount, recommendPanelCount, resolveSizingBasis, suggestedGroupPanelCount, annualSpecificYieldKWhPerKWp,
} from '../domain/sizing';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { applyProjectEdits } from '../domain/projectEditTransaction';
import type { SolarEquipmentItem } from '../types/equipment';

const close = (actual: number, expected: number, label: string, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected}`);

// ── 1. Supuestos declarados ─────────────────────────────────────────────────────────────────
assert.equal(SIZING_ASSUMPTIONS.newProposalBasis, 'peak_month');
assert.equal(SIZING_ASSUMPTIONS.targetDcAcRatio, 1.2);
assert.equal(SIZING_ASSUMPTIONS.battery.activeRule, 'peak_daily_fraction');
assert.equal(SIZING_ASSUMPTIONS.battery.peakDailyFraction, 0.75);
assert.equal(SIZING_ASSUMPTIONS.battery.nightProfileMargin, 0.25);

// ── 2. Base de dimensionado ─────────────────────────────────────────────────────────────────
// Lo guardado sin el campo usa la base heredada (promedio real): abrir una propuesta guardada calcula lo mismo que antes.
assert.equal(resolveSizingBasis({}), 'average');
assert.equal(resolveSizingBasis({ sizingBasis: 'peak_month' }), 'peak_month');
assert.equal(resolveSizingBasis({ sizingBasis: 'otra' as never }), 'average');
const months = [1100, 1050, 1200, 1300, 1400, 1500, 1550, 1500, 1400, 1300, 1200, 1100]; // 15.600 kWh/año, pico en julio
const average = designConsumption(months, 'average');
assert.equal(average.annualKWh, 15600);
assert.deepEqual(average.monthly, months);
const peak = designConsumption(months, 'peak_month');
assert.equal(peak.annualKWh, 18600, '12 × 1.550');
assert.equal(peak.peakMonthIndex, 6);
assert.equal(peak.peakMonthKWh, 1550);
assert.deepEqual(peak.monthly, Array(12).fill(1550));

// Paneles, a mano: HSP propio 5,0 todos los meses y pérdidas 14 % ⇒ rendimiento 5 × 365 × 0,86 = 1.569,5 kWh/kWp·año.
// Mes pico: 18.600 × 0,95 = 17.670 kWh ⇒ 11,2584 kWp ⇒ 11.258,4 / 550 = 20,47 ⇒ 21 paneles.
// Promedio: 15.600 × 0,95 = 14.820 kWh ⇒ 9,4426 kWp ⇒ 17,17 ⇒ 18 paneles.
const hsp = Array(12).fill(5);
const panelsPeak = recommendPanelCount({ province: 'Santo Domingo / Distrito Nacional', monthlyConsumption: months, panelPowerW: 550, coveragePct: 95, lossesPct: 14, customMonthlyHSP: hsp, basis: 'peak_month' });
assert.equal(panelsPeak.count, 21);
close(panelsPeak.annualSpecificYieldKWhPerKWp, 1569.5, 'rendimiento específico');
assert.equal(panelsPeak.designAnnualKWh, 18600);
assert.equal(panelsPeak.basis, 'peak_month');
assert.ok(panelsPeak.assumptions.some((a) => a.key === 'sizingBasis' && a.value === 'peak_month'), 'el resultado dice qué base usó');
const panelsAverage = recommendPanelCount({ province: 'Santo Domingo / Distrito Nacional', monthlyConsumption: months, panelPowerW: 550, coveragePct: 95, lossesPct: 14, customMonthlyHSP: hsp, basis: 'average' });
assert.equal(panelsAverage.count, 18);

// La base heredada no cambia lo que ya hacía el autodimensionado de una edición (invariante de las propuestas guardadas).
{
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = 'sizing-legacy';
  p.specs = { ...p.specs, autoCalculatePanels: true };
  const before = calculateProjectFinancialSummary(p);
  const edited = applyProjectEdits(p, [{ path: 'rates.targetCoveragePct', value: 95 }, { path: 'monthlyConsumption', value: months }], { equipmentCatalog: [] });
  assert.ok(edited.ok);
  const legacyCount = recommendPanelCount({ province: p.client.province, monthlyConsumption: months, panelPowerW: 620, coveragePct: 95, lossesPct: 14, customMonthlyHSP: undefined, basis: 'average' }).count;
  assert.equal(edited.project.specs.panels?.[0].count, legacyCount, 'sin sizingBasis la edición dimensiona con el promedio, como antes');
  assert.ok(before.systemCapacityKWp > 0);
  // Con la base del mes pico, la misma edición dimensiona con 12 × pico.
  const peakProject = { ...p, specs: { ...p.specs, sizingBasis: 'peak_month' as const } };
  const peakEdited = applyProjectEdits(peakProject, [{ path: 'monthlyConsumption', value: months }], { equipmentCatalog: [] });
  assert.ok(peakEdited.ok);
  const peakCount = recommendPanelCount({ province: p.client.province, monthlyConsumption: months, panelPowerW: 620, coveragePct: 95, lossesPct: 14, customMonthlyHSP: undefined, basis: 'peak_month' }).count;
  assert.equal(peakEdited.project.specs.panels?.[0].count, peakCount);
  assert.ok(peakCount > legacyCount);
}

// ── 3. Inversor por relación DC/AC objetivo ─────────────────────────────────────────────────
// 30 × 620 W = 18,6 kWp; con 1,20 la potencia AC objetivo es 15,5 kW ⇒ 15,5 / 8 = 1,94 ⇒ 2 inversores ⇒ DC/AC 18,6 / 16 = 1,1625.
const inv = recommendInverterCount({ dcKWp: 18.6, unitPowerKW: 8 });
assert.equal(inv.count, 2);
close(inv.targetAcKW, 15.5, 'AC objetivo');
assert.equal(inv.acKW, 16);
close(inv.dcAcRatio, 1.1625, 'DC/AC resultante');
assert.equal(inv.targetRatio, 1.2);
assert.ok(inv.assumptions.some((a) => a.key === 'targetDcAcRatio' && a.value === 1.2));
// 23,56 kWp con 10 kW ⇒ 19,63 kW ⇒ 2 inversores; 5,5 kWp con 8 kW ⇒ 4,58 kW ⇒ 1 (mínimo uno).
assert.equal(recommendInverterCount({ dcKWp: 23.56, unitPowerKW: 10 }).count, 2);
assert.equal(recommendInverterCount({ dcKWp: 5.5, unitPowerKW: 8 }).count, 1);
// La relación se cambia por parámetro: con 1,30, 18,6 / 1,3 = 14,31 kW ⇒ 2 inversores de 8 kW; 24 kWp / 1,3 = 18,46 ⇒ 3.
assert.equal(recommendInverterCount({ dcKWp: 24, unitPowerKW: 8, targetRatio: 1.3 }).count, 3);
assert.equal(recommendInverterCount({ dcKWp: 24, unitPowerKW: 8 }).count, 3, '24 / 1,2 = 20 kW ⇒ 2,5 ⇒ 3');
assert.equal(recommendInverterCount({ dcKWp: 0, unitPowerKW: 8 }).count, 0, 'sin paneles no hay inversor que dimensionar');
assert.equal(recommendInverterCount({ dcKWp: 10, unitPowerKW: 0 }).count, 0, 'un inversor sin potencia no se dimensiona');

// ── 4. Baterías: energía útil ≥ 75 % del consumo diario del mes pico ────────────────────────
// Julio (31 días) con 1.550 kWh ⇒ 50 kWh/día ⇒ 37,5 kWh. Unidad de 10 kWh, DOD 90 %, eficiencia 95 % ⇒ 8,55 kWh útiles:
// 4 unidades = 34,2 (no llega); 5 = 42,75 ⇒ 5.
const unit = { capacityKWh: 10, dodPct: 90, efficiencyPct: 95 };
const bat = recommendBatteryCount({ unit, monthlyConsumption: months });
assert.equal(bat.rule, 'peak_daily_fraction');
close(bat.requiredKWh, 37.5, 'energía útil exigida');
assert.equal(bat.count, 5);
close(bat.usableKWh, 42.75, 'energía útil del banco', 1e-9);
assert.ok(bat.assumptions.some((a) => a.key === 'peakDailyFraction' && a.value === 0.75));
// Pico en febrero (28 días): 1.400 / 28 = 50 kWh/día ⇒ también 37,5 kWh ⇒ 5 unidades. Los días son los del mes pico.
const february = [1000, 1400, ...Array(10).fill(1000)];
close(recommendBatteryCount({ unit, monthlyConsumption: february }).requiredKWh, 37.5, 'febrero');
// Unidad de 16,08 kWh con DOD 90 y eficiencia 90 (las de fábrica): 13,0248 útiles ⇒ 37,5 / 13,0248 = 2,88 ⇒ 3.
assert.equal(recommendBatteryCount({ unit: { capacityKWh: 16.08 }, monthlyConsumption: months }).count, 3);
assert.equal(recommendBatteryCount({ unit, monthlyConsumption: Array(12).fill(0) }).count, 0, 'sin consumo no hay banco que dimensionar');
assert.equal(recommendBatteryCount({ unit: { capacityKWh: 0 }, monthlyConsumption: months }).count, 0);
// Alternativa preparada y sin activar: noche real según el perfil horario + 25 %. Consumo diario 50, diurno 40 % ⇒ noche 30 kWh × 1,25 = 37,5.
close(nightProfileBatteryRequirementKWh({ monthlyConsumption: months, daytimeLoadRatioPct: 40 }), 37.5, 'noche + 25 %');
const night = recommendBatteryCount({ unit, monthlyConsumption: months, rule: 'night_profile', daytimeLoadRatioPct: 75 });
// 50 × 0,25 × 1,25 = 15,625 kWh ⇒ 2 unidades (17,1).
assert.equal(night.rule, 'night_profile');
close(night.requiredKWh, 15.625, 'regla de noche');
assert.equal(night.count, 2);

// ── 5. Elección de equipo y precio ──────────────────────────────────────────────────────────
const offer = (id: string, priceUSD: number, stockStatus?: 'in_stock' | 'out_of_stock') => ({ id, supplierName: id, priceUSD, updatedAt: '2026-01-01', ...(stockStatus ? { stockStatus } : {}) });
const item = (id: string, powerW: number, extra: Partial<SolarEquipmentItem> = {}): SolarEquipmentItem =>
  ({ id, type: 'panel', displayName: `Panel ${id}`, brand: 'B', modelSeries: 'M', powerW, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra }) as SolarEquipmentItem;
const catalog = [
  item('a', 550, { supplierPrices: [offer('a1', 100)] }), // 0,182 USD/W
  item('b', 600, { supplierPrices: [offer('b1', 90, 'out_of_stock'), offer('b2', 102)] }), // agotada ⇒ 102 ⇒ 0,170 USD/W
  item('c', 700, { preferredSupplierId: 'c2', supplierPrices: [offer('c1', 100), offer('c2', 140)] }), // preferida ⇒ 140
  item('d', 620, { supplierPrices: [] }),
];
// El modelo pedido (ajustes) con precio: ese modelo y su oferta preferida.
const chosenPreferred = chooseCatalogEquipment(catalog, 'panel', { preferredName: 'Panel c' });
assert.equal(chosenPreferred.item?.id, 'c');
assert.deepEqual([chosenPreferred.price.kind, chosenPreferred.price.priceUSD], ['supplier', 140], 'la oferta preferida del proveedor');
// Sin modelo pedido: la oferta preferida si la hay…
assert.equal(chooseCatalogEquipment(catalog, 'panel', {}).item?.id, 'c');
// …y si no, la más barata en stock (por vatio), nunca una agotada.
const noPreferred = catalog.filter((e) => e.id !== 'c');
const cheapest = chooseCatalogEquipment(noPreferred, 'panel', {});
assert.equal(cheapest.item?.id, 'b');
assert.equal(cheapest.price.priceUSD, 102);
// Sin ofertas: precio genérico del catálogo, señalado como tal.
const genericOnly = chooseCatalogEquipment([item('d', 620)], 'panel', { genericFor: (id) => (id === 'd' ? { priceUSD: 88 } as never : null) });
assert.deepEqual([genericOnly.item?.id, genericOnly.price.kind, genericOnly.price.priceUSD], ['d', 'generic', 88]);
assert.match(genericOnly.price.label, /genérico/i);
// Sin oferta ni genérico: sin precio (nunca inventado).
const none = chooseCatalogEquipment([item('d', 620)], 'panel', { preferredName: 'Panel d' });
assert.deepEqual([none.item?.id, none.price.kind, none.price.priceUSD], ['d', 'none', undefined]);
assert.equal(chooseCatalogEquipment([], 'panel', {}).item, undefined);

// ── 6. La cantidad sugerida de un grupo (antes en el JSX de la revisión del borrador) ─────────
// Rendimiento 1.500 kWh/kWp, meta 15.000 kWh, otro grupo de 4 × 500 W (2 kWp = 3.000 kWh) ⇒ faltan 12.000 kWh ⇒ 8 kWp ⇒ 16 de 500 W.
assert.equal(suggestedGroupPanelCount({ targetAnnualKWh: 15000, annualSpecificYieldKWhPerKWp: 1500, groups: [{ powerW: 500, count: 4 }, { powerW: 500, count: 1 }], index: 1 }), 16);
assert.equal(suggestedGroupPanelCount({ targetAnnualKWh: 1000, annualSpecificYieldKWhPerKWp: 1500, groups: [{ powerW: 500, count: 4 }, { powerW: 500, count: 1 }], index: 1 }), 0, 'los demás grupos ya cubren la meta');

// ── Revisión de F2b ─────────────────────────────────────────────────────────────────────────
// Desempate del mes pico declarado como supuesto (hallazgo 5): con meses iguales manda el de mayor consumo DIARIO (menos
// días), que con doce meses iguales es febrero. Por eso el consumo estimado de fábrica (12 × 1.000) pide la batería de
// 1.000 / 28 × 0,75 = 26,79 kWh útiles y no la de enero (1.000 / 31 × 0,75 = 24,19 kWh).
assert.equal(SIZING_ASSUMPTIONS.peakMonthTieBreak, 'highest_daily');
const flat = designConsumption(Array(12).fill(1000), 'peak_month');
assert.equal(flat.peakMonthIndex, 1, 'empate total: febrero (28 días)');
assert.equal(designConsumption([900, 1000, 950, 1000, 0, 0, 0, 0, 0, 0, 0, 0], 'average').peakMonthIndex, 1, 'febrero y abril empatan en 1.000: gana febrero (1.000/28 > 1.000/30)');
const tied = recommendBatteryCount({ unit: { capacityKWh: 16.08, dodPct: 90, efficiencyPct: 90 }, monthlyConsumption: Array(12).fill(1000) });
close(tied.requiredKWh, 1000 / 28 * 0.75, 'requerido con el desempate declarado');
assert.equal(tied.count, 3, '3 × 13,0248 = 39,07 kWh útiles ≥ 26,79 (con enero bastarían 2)');
assert.ok(tied.assumptions.some((a) => a.key === 'peakMonthTieBreak'), 'el resultado cita el desempate');
// El rendimiento específico (kWh/kWp·año) sale del dimensionado del dominio, no de una llamada suelta al motor.
for (const [province, losses] of [['Santiago', 14], ['Santo Domingo / Distrito Nacional', undefined]] as const)
  assert.equal(annualSpecificYieldKWhPerKWp(province, losses), calculateRecommendedPanelCount(province, Array(12).fill(0), 620, 95, losses).annualSpecificYieldKWhPerKWp);
assert.equal(annualSpecificYieldKWhPerKWp('Santiago', 14, Array(12).fill(5)), calculateRecommendedPanelCount('Santiago', Array(12).fill(0), 620, 95, 14, Array(12).fill(5)).annualSpecificYieldKWhPerKWp);

console.log('PASS: dimensionado puro: base del mes pico, inversor por DC/AC 1,20, baterías por el 75 % del día pico y elección de equipo sin precios inventados.');
