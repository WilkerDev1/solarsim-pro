import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateFinancialSummary } from '../engine/financeEngine';
import { migrateLegacySpecs } from '../../shared/equipment';
import { costMatrixPerCapacity } from '../components/pdf/pages/costMatrixPerCapacity';
import type { CostMatrixSummary, CustomQuotationItem, FinancialParams, LegacyProjectSpecs } from '../types';

/**
 * «Precio kilos costo / ventas» de la matriz de costos: por kWp y por W, en USD y en RD$, sobre la misma base (kWp DC).
 * Antes, el costo en RD$ dividía entre kWp × 800 (1000 / 1.25, el margen de fábrica fijo) y se rotulaba «/kWp»: no era
 * ni el costo por kWp ni por W. En el modo Directo $/W la ganancia restaba solo el costo del sistema base aunque la venta
 * incluyera los ítems adicionales.
 */

const close = (actual: number, expected: number, message: string, tolerance = 0.011) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`);

const specsFor = (overrides: Partial<LegacyProjectSpecs> = {}) => migrateLegacySpecs({
  isDetailed: true, pricePerWattUSD: 1.13, panelPowerW: 620, panelCount: 64, autoCalculatePanels: false, panelBrandModel: 'Panel (620W)',
  inverterPowerKW: 40, inverterCount: 1, inverterBrandModel: 'Inversor (40 kW)', hasBattery: true, batteryCapacityKWh: 16.06, batteryCount: 2,
  dopExchangeRate: 61, saleMarginMultiplier: 1.4, panelUnitPriceUSD: 100, inverterUnitPriceUSD: 4700, batteryUnitPriceUSD: 2400,
  installationUnitPriceUSD: 180, systemLosses: 14, annualDegradation: 0.5, batteryDOD: 90, pricingMode: 'cost_matrix',
  ...overrides,
} as LegacyProjectSpecs);

const extras: CustomQuotationItem[] = [
  { id: 'flete', description: 'Flete', quantity: 1, unitPriceUSD: 600, exonerateITBIS: false },
  { id: 'permiso', description: 'Permiso', quantity: 1, unitPriceUSD: 250, exonerateITBIS: true, applyMargin: false },
];

const summary = (specs = specsFor(), customItems: CustomQuotationItem[] = []) => calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specs,
  structuredClone(BENCHMARK_PROJECT.rates),
  { ...structuredClone(BENCHMARK_PROJECT.financials), customItems, customDiscounts: [], customCostUSD: undefined } as FinancialParams,
  Array(12).fill(4000),
);

// 1. Matriz de costos: todas las filas sobre los kWp DC, el RD$ = USD × tasa y el W = kWp / 1000.
{
  const result = summary();
  const m = result.costMatrix;
  const kWp = result.systemCapacityKWp;
  assert.ok(kWp > 39 && kWp < 40, `caso de prueba ~39.7 kWp (${kWp})`);
  close(m.precioKilosCostoUSD, m.totalNetoUSD / kWp, 'costo USD/kWp');
  close(m.precioKilosCostoDOP, m.totalNetoDOP / kWp, 'costo RD$/kWp = total neto RD$ / kWp');
  close(m.precioKilosCostoDOP, m.precioKilosCostoUSD * 61, 'costo RD$/kWp = USD/kWp × tasa', 0.05);
  close(m.costPerWattUSD, m.precioKilosCostoUSD / 1000, 'costo USD/W', 1e-6);
  close(m.costPerWattDOP, m.precioKilosCostoDOP / 1000, 'costo RD$/W', 1e-6);
  close(m.precioKilosVentasUSD, m.porcentajeVentaUSD / kWp, 'venta USD/kWp');
  close(m.precioKilosVentasDOP, m.porcentajeVentaDOP / kWp, 'venta RD$/kWp');
  close(m.salePerWattUSD, m.precioKilosVentasUSD / 1000, 'venta USD/W de la matriz', 1e-6);
  close(m.salePerWattDOP, m.precioKilosVentasDOP / 1000, 'venta RD$/W (la cifra del Excel)', 1e-6);
  close(m.salePerWattUSD, m.salePricePerWattUSD, 'en modo matriz coincide con el precio por W de la propuesta', 1e-4);
  assert.ok(m.precioKilosCostoDOP > 10_000, `el costo RD$ es por kWp, no ×800 (${m.precioKilosCostoDOP})`);

  // El costo por kWp no depende del margen; la venta sí.
  const higher = summary(specsFor({ saleMarginMultiplier: 1.6 })).costMatrix;
  close(higher.precioKilosCostoDOP, m.precioKilosCostoDOP, 'el costo no cambia con el margen');
  assert.ok(higher.salePerWattDOP > m.salePerWattDOP, 'la venta por W sube con el margen');
}

// 2. Sin paneles no hay «por kWp»: 0, no el total del proyecto.
{
  const m = summary(specsFor({ panelCount: 0 })).costMatrix;
  assert.ok(m.totalNetoUSD > 0, 'el proyecto tiene costos (inversor, baterías)');
  for (const key of ['precioKilosCostoUSD', 'precioKilosCostoDOP', 'precioKilosVentasUSD', 'precioKilosVentasDOP', 'costPerWattUSD', 'costPerWattDOP', 'salePerWattUSD', 'salePerWattDOP'] as const) {
    assert.equal(m[key], 0, `${key}: 0 sin potencia`);
  }
}

// 3. Modo Directo $/W con ítems adicionales: la ganancia resta el costo de todo lo que se vende.
{
  const direct = specsFor({ pricingMode: 'direct_watt', pricePerWattUSD: 1.3 });
  const plain = summary(direct).costMatrix;
  close(plain.gananciaUSD, plain.porcentajeVentaUSD - plain.totalNetoUSD, 'sin extras: venta − costo');

  const withExtras = summary(direct, extras).costMatrix;
  assert.ok(withExtras.totalNetoUSD > plain.totalNetoUSD, 'el costo total incluye los extras');
  close(withExtras.gananciaUSD, withExtras.porcentajeVentaUSD - withExtras.totalNetoUSD, 'con extras: venta − costo total (antes restaba solo el del sistema base)');
  close(withExtras.markupOnCostPct ?? 0, Math.round((withExtras.gananciaUSD / withExtras.totalNetoUSD) * 10000) / 100, 'markup sobre el costo total', 0.02);
  close(withExtras.marginOnSalePct ?? 0, Math.round((withExtras.gananciaUSD / withExtras.porcentajeVentaUSD) * 10000) / 100, 'margen sobre la venta', 0.02);

  // Las filas de venta por kWp y por W de la matriz usan la misma venta (subtotal comercial antes de ITBIS).
  const kWp = summary(direct, extras).systemCapacityKWp;
  close(withExtras.precioKilosVentasUSD, withExtras.porcentajeVentaUSD / kWp, 'venta USD/kWp');
  close(withExtras.salePerWattUSD, withExtras.precioKilosVentasUSD / 1000, 'venta USD/W de la matriz = USD/kWp / 1000', 1e-4);
  close(withExtras.salePerWattDOP, withExtras.precioKilosVentasDOP / 1000, 'venta RD$/W', 1e-4);
  close(withExtras.costPerWattDOP, withExtras.precioKilosCostoDOP / 1000, 'costo RD$/W', 1e-6);
}

// 4. Texto de las filas (pestaña y PDF): kWp y W en las dos monedas.
{
  const m = summary().costMatrix;
  const cost = costMatrixPerCapacity(m, 'cost');
  assert.match(cost.dop, /^RD\$ [\d.,]+ \/kWp \(RD\$ [\d.,]+ \/W\)$/);
  assert.match(cost.usd, /^\$[\d,]+\.\d{2} USD\/kWp \(\$\d+\.\d{2} USD\/W\)$/);
  assert.ok(cost.dop.includes(m.costPerWattDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), cost.dop);
  const sale = costMatrixPerCapacity(m, 'sale');
  assert.ok(sale.dop.includes(m.salePerWattDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), sale.dop);
  // Un resumen de una versión anterior sin los campos por W los deriva de los de kWp.
  const old = { ...m, costPerWattDOP: undefined, salePerWattUSD: undefined, salePerWattDOP: undefined } as unknown as CostMatrixSummary;
  assert.equal(costMatrixPerCapacity(old, 'sale').dop, sale.dop);
  assert.equal(costMatrixPerCapacity(old, 'cost').dop, cost.dop);
}

console.log('testCostMatrixPerCapacity: OK');
