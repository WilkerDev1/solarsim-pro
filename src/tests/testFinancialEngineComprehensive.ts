import { calculateFinancialSummary } from '../engine/financeEngine';
import { SystemSpecs, UtilityRates, FinancialParams } from '../types';

console.log('=====================================================');
console.log('🧪 RUNNING COMPREHENSIVE FINANCIAL ENGINE AUDIT');
console.log('=====================================================');

let allPassed = true;
function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(` ✅ PASS: ${testName}`);
  } else {
    console.error(` ❌ FAIL: ${testName} -> ${detail || 'Assertion failed'}`);
    allPassed = false;
  }
}

// Base Setup
const defaultSpecs: SystemSpecs = {
  isDetailed: false,
  panelPowerW: 620,
  panelCount: 11, // 6.82 kWp
  pricePerWattUSD: 1.13,
  inverterPowerKW: 8,
  inverterCount: 2,
  hasBattery: false,
  batteryCapacityKWh: 0,
  batteryCount: 0,
  batteryUnitPriceUSD: 1990,
  panelEfficiency: 21.8,
  tempCoeff: -0.35,
  systemLosses: 14.0,
  annualDegradation: 0.5,
  batteryDOD: 80,
};

const defaultRates: UtilityRates = {
  energyCostPerKWh: 0.22,
  distributor: 'EDEESTE',
  targetCoveragePct: 95,
  tariffCode: 'BTS1',
  currency: 'USD',
  usdExchangeRate: 60.0,
  gridExportFeePct: 25.0,
  annualEnergyInflationPct: 3.5,
};

const defaultFinancials: FinancialParams = {
  applyLey5707: true,
  applyITBISExemption: true,
  pricePerWattUSD: 1.13,
  discountRatePct: 10.0,
  projectLifespanYears: 25,
  co2FactorKgPerKWh: 0.481,
};

const monthlyConsumption = Array(12).fill(1000); // 12,000 kWh/year

// TEST 1: Solar Only (Simple Mode)
console.log('\n--- TEST 1: Solar Only (Simple Mode) ---');
const resSolarOnly = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  defaultSpecs,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

assert(resSolarOnly.systemCapacityKWp === 6.82, 'Capacidad DC correcta (6.82 kWp)');
const expectedSolarCost = 6.82 * 1000 * 1.13; // 7706.60
assert(Math.abs(resSolarOnly.grossInvestmentUSD - expectedSolarCost) < 0.1, 'Inversión Bruta Solar coincide');
assert(resSolarOnly.batteryInvestmentUSD === 0, 'Inversión Baterías es 0');
assert(resSolarOnly.itbisSavedUSD > 0, 'ITBIS Exonerado > 0 cuando applyITBISExemption es true');
assert(resSolarOnly.ley5707CreditUSD > 0, 'Crédito Ley 57-07 > 0 cuando applyLey5707 es true');
assert(
  resSolarOnly.netInvestmentUSD === Math.round((resSolarOnly.grossInvestmentUSD - resSolarOnly.ley5707CreditUSD) * 100) / 100,
  'netInvestmentUSD = Gross - Ley5707'
);

// TEST 2: Dynamic Storage Addition (3 Batteries)
console.log('\n--- TEST 2: Dynamic Storage Addition (3 Batteries) ---');
const specsWithBattery: SystemSpecs = {
  ...defaultSpecs,
  pricingMode: 'cost_matrix',
  hasBattery: true,
  batteryCount: 3,
  batteryCapacityKWh: 48,
  batteryUnitPriceUSD: 1990,
};

const financialsWithBattery: FinancialParams = {
  ...defaultFinancials,
  pricePerWattUSD: 2.59,
};

const resWithBattery = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsWithBattery,
  defaultRates,
  financialsWithBattery,
  monthlyConsumption
);

assert(resWithBattery.batteryInvestmentUSD > 0, 'Inversión Baterías > 0 en modo matriz de costos');
assert(
  resWithBattery.grossInvestmentUSD > resSolarOnly.grossInvestmentUSD,
  'Inversión con baterías en matriz de costos es mayor que sin baterías'
);

// In direct_watt mode, the price per watt is all-inclusive (turnkey)
const specsDirectWattWithBattery: SystemSpecs = {
  ...specsWithBattery,
  pricingMode: 'direct_watt',
  pricePerWattUSD: 1.38,
};
const resDirectWatt = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsDirectWattWithBattery,
  defaultRates,
  financialsWithBattery,
  monthlyConsumption
);
assert(
  Math.abs(resDirectWatt.grossInvestmentUSD - (6.82 * 1000 * 1.38)) < 0.1,
  'Inversión en modo Precio Directo es exactamente Capacidad * $/Wp (todo incluido sin sumar batería por fuera)'
);

// TEST 3: ITBIS Exemption Toggle
console.log('\n--- TEST 3: ITBIS Exemption Toggle (ON vs OFF) ---');
const financialsNoITBIS: FinancialParams = {
  ...financialsWithBattery,
  applyITBISExemption: false,
};

const resNoITBIS = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsWithBattery,
  defaultRates,
  financialsNoITBIS,
  monthlyConsumption
);

assert(resNoITBIS.itbisSavedUSD === 0, 'itbisSavedUSD es 0 cuando applyITBISExemption es false');
assert(
  resNoITBIS.netInvestmentUSD === Math.round((resWithBattery.netInvestmentUSD + resWithBattery.itbisSavedUSD) * 100) / 100,
  'Precio neto final aumenta exactamente por el monto del ITBIS cuando se desactiva la exoneración'
);
assert(
  resNoITBIS.paybackYears >= resWithBattery.paybackYears,
  'Payback es más largo sin exoneración de ITBIS'
);

// TEST 4: Ley 57-07 40% Tax Credit Toggle
console.log('\n--- TEST 4: Ley 57-07 40% Credit Toggle (ON vs OFF) ---');
const financialsNoLey: FinancialParams = {
  ...financialsWithBattery,
  applyLey5707: false,
};

const resNoLey = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsWithBattery,
  defaultRates,
  financialsNoLey,
  monthlyConsumption
);

assert(resNoLey.ley5707CreditUSD === 0, 'ley5707CreditUSD es 0 cuando applyLey5707 es false');
assert(
  resNoLey.netInvestmentUSD === resWithBattery.grossInvestmentUSD,
  'Inversión neta sin Ley 57-07 es igual a la inversión facturada de contrato'
);

// TEST 5: Cash Flow Year 0 and Multi-Year Integrity
console.log('\n--- TEST 5: 25-Year Cash Flow Projection Integrity ---');
assert(resWithBattery.cashFlow25Years.length === 25, '25 años de flujo de caja generados');
const cfYear1 = resWithBattery.cashFlow25Years[0];
const expectedAnnualTaxCredit = resWithBattery.ley5707CreditUSD / 3;
assert(
  Math.abs(cfYear1.taxCreditUSD - expectedAnnualTaxCredit) < 0.1,
  'Crédito fiscal de Año 1 es exactamente 1/3 de la deducción total'
);
const cfYear4 = resWithBattery.cashFlow25Years[3];
assert(cfYear4.taxCreditUSD === 0, 'Crédito fiscal es 0 después del Año 3');

// TEST 6: Battery Replacement Cost in Year 10
console.log('\n--- TEST 6: Battery Replacement Cost in Year 10 ---');
const specsWithReplacement: SystemSpecs = {
  ...specsWithBattery,
  batteryLifespanYears: 10,
  batteryReplacementCostUSD: 3500,
};

const resWithReplacement = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsWithReplacement,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

const cfYear10WithoutRep = resWithBattery.cashFlow25Years[9].netCashFlowUSD;
const cfYear10WithRep = resWithReplacement.cashFlow25Years[9].netCashFlowUSD;
assert(
  Math.abs(cfYear10WithoutRep - cfYear10WithRep - 3500) < 0.1,
  'Flujo de caja de Año 10 descuenta exactamente $3,500 de reemplazo de batería'
);

// TEST 7: Detailed Cost Matrix Mode
console.log('\n--- TEST 7: Detailed Cost Matrix Mode ---');
const specsDetailed: SystemSpecs = {
  ...specsWithBattery,
  isDetailed: true,
  panelUnitPriceUSD: 103.32,
  inverterUnitPriceUSD: 2300,
  batteryUnitPriceUSD: 1990,
  installationUnitPriceUSD: 170,
  saleMarginMultiplier: 1.25,
};

const resDetailed = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsDetailed,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

assert(resDetailed.costMatrix.items.length === 4, 'Matriz de costos contiene los 4 renglones');
assert(resDetailed.costMatrix.porcentajeVentaUSD > 0, 'Precio de venta con margen calculado');
assert(resDetailed.costMatrix.gananciaUSD > 0, 'Ganancia bruta calculada');
assert(resDetailed.grossInvestmentUSD === Math.round(resDetailed.costMatrix.porcentajeVentaUSD * 100) / 100, 'Inversión bruta usa la matriz en modo detallado');

// TEST 8: Zero Division / Extreme Values Resilience
console.log('\n--- TEST 8: Extreme Values and Zero-Division Resilience ---');
const zeroSpecs: SystemSpecs = {
  ...defaultSpecs,
  panelCount: 0,
};
// TEST 9: Custom Quotation Items with Exonerar ITBIS (Ley 57-07)
console.log('\n--- TEST 9: Custom Quotation Items with Exonerar ITBIS (Ley 57-07) ---');
const financialsWithCustomItems: FinancialParams = {
  ...defaultFinancials,
  customItems: [
    {
      id: 'custom_1',
      description: 'Estructura de Tejas de Barro',
      quantity: 1,
      unit: 'UD',
      unitPriceUSD: 500.0,
      exonerateITBIS: true, // ITBIS $90 exonerado por Ley 57-07
    },
    {
      id: 'custom_2',
      description: 'Herrajes Generales No Renovables',
      quantity: 1,
      unit: 'GL',
      unitPriceUSD: 300.0,
      exonerateITBIS: false, // NO exonerado: se cobra ITBIS 18% ($54) al cliente
    },
  ],
};

const resCustom = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  defaultSpecs,
  defaultRates,
  financialsWithCustomItems,
  monthlyConsumption
);

const baseRes = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  defaultSpecs,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

// Base investment should increase by $500 (exonerated base) + $300 (non-exonerated base) + $54 (non-exonerated ITBIS charged to client) = $854.00
assert(
  Math.abs(resCustom.grossInvestmentUSD - (baseRes.grossInvestmentUSD + 854.0)) < 0.01,
  `Inversión bruta incluye $800 de ítems + $54 de ITBIS no exonerado ($${resCustom.grossInvestmentUSD} vs $${baseRes.grossInvestmentUSD + 854.0})`
);
assert(
  Math.abs(resCustom.itbisSavedUSD - (baseRes.itbisSavedUSD + 90.0)) < 0.01,
  `ITBIS exonerado por Ley 57-07 incluye los $90 del ítem exonerado ($${resCustom.itbisSavedUSD} vs $${baseRes.itbisSavedUSD + 90})`
);
assert(
  resCustom.customItemsTotalUSD === 800.0,
  `customItemsTotalUSD reporta base de $800.00`
);
assert(
  resCustom.customItemsITBISUSD === 90.0,
  `customItemsITBISUSD reporta $90.00 de ITBIS exonerado`
);
assert(
  resCustom.customItemsNonExoneratedITBISUSD === 54.0,
  `customItemsNonExoneratedITBISUSD reporta $54.00 de ITBIS no exonerado`
);

// --- TEST 10: Commercial Pre-Tax Subtotal & Zero Wholesale Cost Leakage ---
console.log('\n--- TEST 10: Commercial Pre-Tax Subtotal vs Wholesale Cost (Giovanni Gottardo Benchmark) ---');
const giovanniSpecs: SystemSpecs = {
  ...defaultSpecs,
  panelCount: 21,
  panelPowerW: 615,
  panelUnitPriceUSD: 80,
  inverterCount: 1,
  inverterUnitPriceUSD: 2300,
  hasBattery: true,
  batteryCount: 2,
  batteryCapacityKWh: 16.08,
  batteryUnitPriceUSD: 1990,
  installationUnitPriceUSD: 180,
  pricingMode: 'cost_matrix',
  saleMarginMultiplier: 1.40,
};

const giovanniFinancials: FinancialParams = {
  ...defaultFinancials,
  applyITBISExemption: true,
  applyLey5707: true,
  customItems: [
    {
      id: 'item-limiter',
      description: 'Limitador de potencia',
      quantity: 1,
      unit: 'UD',
      unitPriceUSD: 500,
      exonerateITBIS: false, // $90 de ITBIS no exonerado
      applyMargin: false, // Pass-through direct cost (1.00x)
    },
  ],
};

const resGiovanni = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  giovanniSpecs,
  defaultRates,
  giovanniFinancials,
  monthlyConsumption
);

// 1. Costo mayorista interno (confidencial)
const wholesaleCost = resGiovanni.costMatrix.precioNetoUSD;
const baseWholesaleCost = resGiovanni.costMatrix.basePrecioNetoUSD;
assert(
  Math.abs(baseWholesaleCost! - 10284.70) < 0.01,
  `Costo mayorista base (sin ítems extra) es exactamente $10,284.70 ($${baseWholesaleCost})`
);
assert(
  Math.abs(wholesaleCost - 10784.70) < 0.01,
  `Costo mayorista total (con ítem limitador de $500) es exactamente $10,784.70 ($${wholesaleCost})`
);

// 2. Subtotal comercial de venta antes de impuestos (lo que el cliente debe ver)
const commercialSubtotal = resGiovanni.commercialPreTaxSubtotalUSD!;
assert(
  Math.abs(commercialSubtotal - 16487.36) < 0.01,
  `Subtotal comercial antes de ITBIS es $16,487.36 ($${commercialSubtotal}), NO el costo mayorista ($10,284.70)`
);

// 3. Total General de Lista con ITBIS
const totalGeneralConITBIS = resGiovanni.grossInvestmentUSD + resGiovanni.itbisSavedUSD;
assert(
  Math.abs(totalGeneralConITBIS - 18166.14) < 0.01,
  `Total General con ITBIS es $18,166.14 ($${totalGeneralConITBIS})`
);

// 4. ITBIS a descontar por Ley 57-07 (dinámico de matriz con margen 1.40x)
assert(
  Math.abs(resGiovanni.itbisSavedUSD - 1588.78) < 0.01,
  `ITBIS a descontar por Ley 57-07 es $1,588.78 ($${resGiovanni.itbisSavedUSD})`
);

// 5. Total a pagar por el cliente con Ley 57-07
assert(
  Math.abs(resGiovanni.grossInvestmentUSD - 16577.36) < 0.01,
  `Total a pagar final con Ley 57-07 es $16,577.36 ($${resGiovanni.grossInvestmentUSD})`
);
assert(
  Math.abs(resGiovanni.costMatrix.porcentajeVentaUSD - 16577.36) < 0.01,
  `Cost Matrix porcentajeVentaUSD coincide exactamente con grossInvestmentUSD ($${resGiovanni.costMatrix.porcentajeVentaUSD})`
);

// 6. Validar que la brecha Total General - Subtotal sea estrictamente el ITBIS total ($1,678.78), NUNCA 7.4K
const itbisGap = Math.round((totalGeneralConITBIS - commercialSubtotal) * 100) / 100;
assert(
  Math.abs(itbisGap - 1678.78) < 0.01,
  `Brecha entre Total General y Subtotal es exactamente el ITBIS ($1,678.78 vs $${itbisGap}), NUNCA 7.4K`
);

// TEST 11: Dynamic Sale Price Per Watt & Per KWp Reactivity (María Teresa Benchmark)
console.log('\n--- TEST 11: Dynamic Sale Price Per Watt & Per KWp Reactivity ---');
const specsMariaTeresa: SystemSpecs = {
  ...defaultSpecs,
  panelPowerW: 615,
  panelCount: 11, // 6.765 kWp
  pricingMode: 'cost_matrix',
  pricePerWattUSD: 1.13, // Legacy static value that should NOT freeze dynamic prices
  panelUnitPriceUSD: 104,
  inverterUnitPriceUSD: 1700,
  inverterCount: 1,
  hasBattery: true,
  batteryCount: 1,
  batteryCapacityKWh: 14.3,
  batteryUnitPriceUSD: 1880,
  installationUnitPriceUSD: 160,
  saleMarginMultiplier: 1.40, // 40% margin initially
};

// 1. Initial 40% margin calculation
const resMT40 = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsMariaTeresa,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

assert(resMT40.systemCapacityKWp === 6.77, `Capacidad DC correcta (6.77 kWp vs ${resMT40.systemCapacityKWp})`);
assert(Math.abs(resMT40.grossInvestmentUSD - 8875.48) < 0.1, `Inversión bruta al 40% es $8,875.48 ($${resMT40.grossInvestmentUSD})`);
assert(Math.abs(resMT40.salePricePerWattUSD - 1.31) < 0.02, `Precio de venta $/W al 40% es ~$1.31 ($${resMT40.salePricePerWattUSD})`);
assert(Math.abs(resMT40.salePricePerKWpUSD - 1311.97) < 1.0, `Precio de venta $/kWp al 40% es ~$1,311.97 ($${resMT40.salePricePerKWpUSD})`);

// 2. Updating margin to 32.5% (1.325x) - verify dynamic recalculation without manual sync
const specsMT325: SystemSpecs = {
  ...specsMariaTeresa,
  saleMarginMultiplier: 1.325,
};

const resMT325 = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsMT325,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

assert(Math.abs(resMT325.grossInvestmentUSD - 8400.01) < 0.1, `Inversión bruta al 32.5% se actualiza a $8,400.01 ($${resMT325.grossInvestmentUSD})`);
assert(Math.abs(resMT325.salePricePerWattUSD - 1.24) < 0.02, `Precio de venta $/W al 32.5% se actualiza a ~$1.24 ($${resMT325.salePricePerWattUSD}), NUNCA congelado en 1.13`);
assert(Math.abs(resMT325.salePricePerKWpUSD - 1241.69) < 1.0, `Precio de venta $/kWp al 32.5% se actualiza a ~$1,241.69 ($${resMT325.salePricePerKWpUSD})`);

// 3. Direct Watt mode verification
const specsDirectWatt: SystemSpecs = {
  ...specsMariaTeresa,
  pricingMode: 'direct_watt',
  pricePerWattUSD: 1.18,
};

const resDirect = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsDirectWatt,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

assert(resDirect.salePricePerWattUSD === 1.18, `Modo Directo $/W respeta valor manual exacto ($${resDirect.salePricePerWattUSD})`);
assert(resDirect.salePricePerKWpUSD === 1180, `Modo Directo $/kWp respeta 1,180.00 ($${resDirect.salePricePerKWpUSD})`);

// --- TEST 12: Custom Items in Cost Matrix (Jenny Rodríguez Cáceres - Comisión Gilda Audit Case) ---
console.log('\n--- TEST 12: Custom Items in Cost Matrix (Jenny Rodríguez - Comisión Gilda) ---');
const jennySpecs: SystemSpecs = {
  ...defaultSpecs,
  panelCount: 13,
  panelPowerW: 630,
  panelUnitPriceUSD: 107.0,
  inverterCount: 1,
  inverterPowerKW: 8.0,
  inverterUnitPriceUSD: 1860.0,
  hasBattery: true,
  batteryCount: 2,
  batteryCapacityKWh: 5.12,
  batteryUnitPriceUSD: 860.0,
  installationUnitPriceUSD: 180.0,
  pricingMode: 'cost_matrix',
  saleMarginMultiplier: 1.40,
  dopExchangeRate: 60.0,
};

const jennyFinancials: FinancialParams = {
  ...defaultFinancials,
  applyITBISExemption: true,
  applyLey5707: true,
  customItems: [
    {
      id: 'custom-comision-gilda',
      description: 'Comision Gilda',
      quantity: 1,
      unit: 'UD',
      unitPriceUSD: 1200.0,
      exonerateITBIS: false, // Se cobra ITBIS 18% = $216.00 al cliente
    },
  ],
};

const resJenny = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  jennySpecs,
  defaultRates,
  jennyFinancials,
  monthlyConsumption
);

// 1. Validar que el ítem adicional esté en la tabla de la matriz de costos y la potencia en kW de paneles
const panelRow = resJenny.costMatrix.items[0];
assert(panelRow?.kilos === 8.19, `Potencia de paneles en matriz es 8.19 kW (${panelRow?.kilos} kW)`);

const customRow = resJenny.costMatrix.items.find((item) => item.name === 'Comision Gilda');
assert(!!customRow, 'La fila "Comision Gilda" está presente en costMatrix.items');
assert(customRow?.quantity === 1, 'Cantidad del ítem en matriz es 1');
assert(customRow?.unitPriceUSD === 1200.0, 'Precio unitario USD del ítem en matriz es $1,200.00');
assert(customRow?.totalPriceUSD === 1200.0, 'Precio total USD del ítem en matriz es $1,200.00');
assert(customRow?.itbisUSD === 216.0, 'ITBIS USD no exonerado del ítem en matriz es $216.00');

// 2. Validar totales de la matriz de costos coincidiendo al 100% con Excel (Imagen 2)
assert(
  Math.abs(resJenny.costMatrix.precioNetoUSD - 7645.20) < 0.01,
  `Precio Neto de la matriz incluye ítem extra: $7,645.20 ($${resJenny.costMatrix.precioNetoUSD})`
);
assert(
  Math.abs(resJenny.costMatrix.itbisUSD - 790.96) < 0.01,
  `ITBIS Total de la matriz incluye ITBIS del ítem: $790.96 ($${resJenny.costMatrix.itbisUSD})`
);
assert(
  Math.abs(resJenny.costMatrix.totalNetoUSD - 8436.16) < 0.01,
  `Total Neto (Costo Total) de la matriz es $8,436.16 ($${resJenny.costMatrix.totalNetoUSD})`
);
assert(
  Math.abs(resJenny.costMatrix.porcentajeVentaUSD - 11810.62) < 0.01,
  `Porcentaje venta (1.40x) de la matriz coincide exactamente con Excel: $11,810.62 ($${resJenny.costMatrix.porcentajeVentaUSD})`
);
assert(
  Math.abs(resJenny.costMatrix.gananciaUSD - 3374.46) < 0.01,
  `Ganancia Proyectada del proyecto coincide exactamente con Excel: $3,374.46 ($${resJenny.costMatrix.gananciaUSD})`
);
assert(
  Math.abs(resJenny.costMatrix.precioKilosVentasUSD - 1442.08) < 0.01,
  `Precio kilos ventas USD coincide con Excel: $1,442.08/kW ($${resJenny.costMatrix.precioKilosVentasUSD})`
);
assert(
  Math.abs(resJenny.costMatrix.porcentajeVentaDOP - 708637.10) < 0.1,
  `Porcentaje venta DOP coincide con Excel: RD$ 708,637.10 ($${resJenny.costMatrix.porcentajeVentaDOP})`
);
assert(
  Math.abs(resJenny.costMatrix.gananciaDOP - 202467.74) < 0.1,
  `Ganancia Proyectada DOP coincide con Excel: RD$ 202,467.74 ($${resJenny.costMatrix.gananciaDOP})`
);

// 3. Validar cotización comercial con margen aplicado (Modo Con Margen)
assert(
  Math.abs(resJenny.costMatrix.porcentajeVentaUSD - 11810.62) < 0.01,
  `Porcentaje venta (1.40x) de la matriz coincide exactamente con Excel: $11,810.62 ($${resJenny.costMatrix.porcentajeVentaUSD})`
);
assert(
  Math.abs(resJenny.grossInvestmentUSD - 11810.62) < 0.01,
  `Total General Cotización coincide 100% con Hoja de Costos: $11,810.62 ($${resJenny.grossInvestmentUSD})`
);
assert(
  Math.abs(resJenny.commercialPreTaxSubtotalUSD! - 11594.62) < 0.01,
  `Sub-total sin ITBIS en Cotización (con margen) es $11,594.62 ($${resJenny.commercialPreTaxSubtotalUSD})`
);

// 4. Validar modo Pass-Through directo (sin margen)
const jennyFinancialsPassThrough: FinancialParams = {
  ...jennyFinancials,
  customItems: [
    {
      ...jennyFinancials.customItems![0],
      applyMargin: false,
    },
  ],
};
const resJennyPass = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  jennySpecs,
  defaultRates,
  jennyFinancialsPassThrough,
  monthlyConsumption
);
assert(
  Math.abs(resJennyPass.commercialPreTaxSubtotalUSD! - 11028.22) < 0.01,
  `Sub-total sin ITBIS en Cotización (pass-through) es $11,028.22 ($${resJennyPass.commercialPreTaxSubtotalUSD})`
);
assert(
  Math.abs(resJennyPass.grossInvestmentUSD - 11244.22) < 0.01,
  `Total General Cotización (pass-through) es $11,244.22 ($${resJennyPass.grossInvestmentUSD})`
);
assert(
  Math.abs(resJennyPass.costMatrix.porcentajeVentaUSD - 11244.22) < 0.01,
  `Hoja de Costos (pass-through) coincide 100% con Cotización: $11,244.22 ($${resJennyPass.costMatrix.porcentajeVentaUSD})`
);

// --- TEST 13: Initial Cash Outflow & Cash Flow Year 0 Integrity (Mildred Moquete Audit Case) ---
console.log('\n--- TEST 13: Initial Cash Outflow & Cash Flow Year 0 Integrity (Mildred Moquete Case) ---');
assert(
  resJennyPass.contractPriceUSD === resJennyPass.grossInvestmentUSD,
  `contractPriceUSD coincide con grossInvestmentUSD ($${resJennyPass.contractPriceUSD} vs $${resJennyPass.grossInvestmentUSD}) cuando aplica Ley 57-07`
);
assert(
  resJennyPass.initialOutflowUSD === resJennyPass.contractPriceUSD,
  `initialOutflowUSD coincide con contractPriceUSD ($${resJennyPass.initialOutflowUSD} vs $${resJennyPass.contractPriceUSD})`
);

// Validar que en cashFlow25Years[0], el acumulado del Año 1 es exactamente -initialOutflowUSD + netCashFlowUSD
const y1 = resJennyPass.cashFlow25Years[0];
const expectedY1Cum = Math.round((-resJennyPass.initialOutflowUSD + y1.netCashFlowUSD) * 100) / 100;
assert(
  Math.abs(y1.cumulativeCashFlowUSD - expectedY1Cum) < 0.01,
  `Año 1 acumulado (${y1.cumulativeCashFlowUSD}) es exactamente -initialOutflowUSD + netCashFlowUSD (${expectedY1Cum}), SIN doble descuento de ITBIS`
);

// Validar caso específico con exoneración de ITBIS
const moqueteContractPrice = 19100.88;
const moqueteY1NetCashFlow = 5962.36;
const moqueteExpectedY1Cum = Math.round((-moqueteContractPrice + moqueteY1NetCashFlow) * 100) / 100;
assert(
  moqueteExpectedY1Cum === -13138.52,
  `Caso Mildred Moquete: -$19,100.88 + $5,962.36 da exactamente -$13,138.52 (${moqueteExpectedY1Cum})`
);

// --- TEST 14: Universal Project Duplication and Dynamic Equipment Recalculation ---
console.log('\n--- TEST 14: Universal Project Duplication and Dynamic Equipment Recalculation ---');

// Project A: Large system with 3 batteries
const projectASpecs: SystemSpecs = {
  ...defaultSpecs,
  panelCount: 38,
  panelPowerW: 620, // 23.56 kWp
  panelUnitPriceUSD: 103.32,
  inverterPowerKW: 8,
  inverterCount: 2,
  inverterUnitPriceUSD: 2300,
  hasBattery: true,
  batteryCount: 3,
  batteryCapacityKWh: 16.08,
  batteryUnitPriceUSD: 1990,
  installationUnitPriceUSD: 170,
  pricingMode: 'cost_matrix',
  saleMarginMultiplier: 1.25,
};

const projectAFinancials: FinancialParams = {
  ...defaultFinancials,
  applyITBISExemption: true,
  applyLey5707: true,
};

const resProjectA = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  projectASpecs,
  defaultRates,
  projectAFinancials,
  monthlyConsumption
);

// Verify Project A dynamic ITBIS is calculated from equipment (not hardcoded)
assert(resProjectA.itbisSavedUSD > 2000, `Project A ITBIS exonerado es dinámico ($${resProjectA.itbisSavedUSD} > 2000)`);
assert(resProjectA.grossInvestmentUSD === resProjectA.costMatrix.porcentajeVentaUSD, 'Project A Cotización y Hoja de Costos coinciden');

// Simulate cloning project and modifying equipment: removing batteries, changing inverter to 10kW
const clonedSpecs: SystemSpecs = {
  ...projectASpecs,
  panelCount: 16,
  panelPowerW: 590, // 9.44 kWp
  inverterCount: 1,
  inverterPowerKW: 10,
  inverterUnitPriceUSD: 1800,
  hasBattery: false,
  batteryCount: 0,
};

// Cloned financials: MUST NOT carry any ghost overrides
const clonedFinancials: FinancialParams = {
  ...projectAFinancials,
};
delete (clonedFinancials as any).customITBISSavedUSD;
delete (clonedFinancials as any).customLey5707CreditUSD;
delete (clonedFinancials as any).customCostUSD;

const resCloned = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  clonedSpecs,
  defaultRates,
  clonedFinancials,
  monthlyConsumption
);

// Dynamic recalculation validations
assert(resCloned.systemCapacityKWp === 9.44, `Capacidad clonada es 9.44 kWp (${resCloned.systemCapacityKWp})`);
assert(resCloned.batteryInvestmentUSD === 0, 'Inversión en baterías es 0 tras removerlas');
assert(resCloned.itbisSavedUSD < resProjectA.itbisSavedUSD, `ITBIS exonerado se redujo proporcionalmente ($${resCloned.itbisSavedUSD} < $${resProjectA.itbisSavedUSD})`);
assert(resCloned.itbisSavedUSD > 0, `ITBIS exonerado para 9.44 kWp es positivo ($${resCloned.itbisSavedUSD})`);
// TEST 15: Commercial Discounts (Fixed vs Percentage, Profit Recalculation, Cash Flow Year 0 & DGII Ley 57-07)
console.log('\n--- TEST 15: Commercial Discounts (Fixed vs Percentage, Real Profit & DGII Base) ---');
const specsDiscountTest: SystemSpecs = {
  ...defaultSpecs,
  panelCount: 16,
  panelPowerW: 620, // 9.92 kWp
  pricingMode: 'cost_matrix',
  panelUnitPriceUSD: 105,
  inverterUnitPriceUSD: 1650,
  inverterCount: 1,
  hasBattery: true,
  batteryCount: 1,
  batteryCapacityKWh: 16.08,
  batteryUnitPriceUSD: 2000,
  installationUnitPriceUSD: 160,
  saleMarginMultiplier: 1.40, // 40% margin
};

// 1. Base project without discounts
const resBaseNoDiscount = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsDiscountTest,
  defaultRates,
  defaultFinancials,
  monthlyConsumption
);

const baseListPrice = resBaseNoDiscount.grossInvestmentUSD;
const baseNetCost = resBaseNoDiscount.costMatrix.totalNetoUSD;
const baseProfit = resBaseNoDiscount.costMatrix.gananciaUSD;
const baseEquipPortion = resBaseNoDiscount.equipmentPortionUSD;
const baseLeyCredit = resBaseNoDiscount.ley5707CreditUSD;

assert(resBaseNoDiscount.totalDiscountUSD === 0, 'Sin descuentos, totalDiscountUSD es 0');
assert(Math.abs(baseProfit - (baseListPrice - baseNetCost)) < 0.05, 'Ganancia base es listPrice - netCost');

// 2. Commercial fixed discount of $2,500 USD targeted as "general" (Cortesía / Pronto pago)
const financialsGeneralDiscount: FinancialParams = {
  ...defaultFinancials,
  customDiscounts: [
    {
      id: 'disc-gen-1',
      description: 'Cortesía comercial por pronto pago',
      type: 'fixed',
      value: 2500,
      target: 'general',
    },
  ],
};

const resGenDiscount = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsDiscountTest,
  defaultRates,
  financialsGeneralDiscount,
  monthlyConsumption
);

assert(resGenDiscount.totalDiscountUSD === 2500, 'Total descuento registrado es exactamente $2,500.00 USD');
assert(resGenDiscount.equipmentDiscountUSD === 0, 'Descuento imputado a equipos es 0 en descuento general');
assert(
  Math.abs(resGenDiscount.grossInvestmentUSD - (baseListPrice - 2500)) < 0.05,
  `Inversión final descontada es exactamente $${baseListPrice - 2500} ($${resGenDiscount.grossInvestmentUSD})`
);
// Wholesale cost must remain identical
assert(
  Math.abs(resGenDiscount.costMatrix.totalNetoUSD - baseNetCost) < 0.01,
  `Costo mayorista neto NO cambia con descuento ($${resGenDiscount.costMatrix.totalNetoUSD} == $${baseNetCost})`
);
// Real profit drops by exactly $2,500
assert(
  Math.abs(resGenDiscount.costMatrix.gananciaUSD - (baseProfit - 2500)) < 0.05,
  `Ganancia real disminuye en exactamente $2,500 ($${resGenDiscount.costMatrix.gananciaUSD} vs $${baseProfit - 2500})`
);
// Real markup and margin recalculation
const expectedRealMarkup = ((baseProfit - 2500) / baseNetCost) * 100;
assert(
  Math.abs((resGenDiscount.costMatrix.markupOnCostPct || 0) - expectedRealMarkup) < 0.2,
  `Markup real se recalcula correctamente (${resGenDiscount.costMatrix.markupOnCostPct}% vs ${expectedRealMarkup.toFixed(2)}%)`
);
// DGII equipment base remains 100% intact under general discount
assert(
  Math.abs(resGenDiscount.equipmentPortionUSD - baseEquipPortion) < 0.01,
  `Base de equipos Ley 57-07 se mantiene intacta ante descuento general ($${resGenDiscount.equipmentPortionUSD} == $${baseEquipPortion})`
);
assert(
  Math.abs(resGenDiscount.ley5707CreditUSD - baseLeyCredit) < 0.01,
  `Crédito fiscal Ley 57-07 se mantiene intacto ante descuento general ($${resGenDiscount.ley5707CreditUSD} == $${baseLeyCredit})`
);
// Cash flow Year 0 initial outflow reflects discounted price
assert(
  resGenDiscount.initialOutflowUSD === resGenDiscount.contractPriceUSD && resGenDiscount.contractPriceUSD === resGenDiscount.grossInvestmentUSD,
  'Flujo de caja Año 0 initialOutflowUSD coincide con monto pagable real con descuento'
);

// 3. Commercial discount of $2,000 USD targeted at "equipment" (Descuento en Equipos)
const financialsEquipDiscount: FinancialParams = {
  ...defaultFinancials,
  customDiscounts: [
    {
      id: 'disc-eq-1',
      description: 'Descuento especial en equipos solares',
      type: 'fixed',
      value: 2000,
      target: 'equipment',
    },
  ],
};

const resEquipDiscount = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsDiscountTest,
  defaultRates,
  financialsEquipDiscount,
  monthlyConsumption
);

assert(resEquipDiscount.equipmentDiscountUSD === 2000, 'equipmentDiscountUSD es $2,000.00 USD');
assert(
  Math.abs(resEquipDiscount.equipmentPortionUSD - (baseEquipPortion - 2000)) < 0.05,
  `Base elegible de equipos Ley 57-07 se reduce en exactamente $2,000 ($${resEquipDiscount.equipmentPortionUSD} vs $${baseEquipPortion - 2000})`
);
const expectedReducedLeyCredit = Math.round((baseEquipPortion - 2000) * 0.40 * 100) / 100;
assert(
  Math.abs(resEquipDiscount.ley5707CreditUSD - expectedReducedLeyCredit) < 0.05,
  `Crédito Ley 57-07 se reduce acorde a la nueva base elegible ($${resEquipDiscount.ley5707CreditUSD} vs $${expectedReducedLeyCredit})`
);

// 4. Percentage discount (10%)
const financialsPctDiscount: FinancialParams = {
  ...defaultFinancials,
  customDiscounts: [
    {
      id: 'disc-pct-1',
      description: 'Descuento de cierre 10%',
      type: 'percentage',
      value: 10,
      target: 'general',
    },
  ],
};

const resPctDiscount = calculateFinancialSummary(
  'Santo Domingo / Distrito Nacional',
  specsDiscountTest,
  defaultRates,
  financialsPctDiscount,
  monthlyConsumption
);

const expectedPctDiscountUSD = Math.round(baseListPrice * 0.10 * 100) / 100;
assert(
  Math.abs(resPctDiscount.totalDiscountUSD! - expectedPctDiscountUSD) < 0.05,
  `Descuento del 10% calcula exactamente $${expectedPctDiscountUSD} ($${resPctDiscount.totalDiscountUSD})`
);
assert(
  Math.abs(resPctDiscount.grossInvestmentUSD - (baseListPrice - expectedPctDiscountUSD)) < 0.05,
  `Inversión final con 10% descuento es $${baseListPrice - expectedPctDiscountUSD} ($${resPctDiscount.grossInvestmentUSD})`
);
assert(
  resPctDiscount.grossInvestmentUSD === resPctDiscount.costMatrix.porcentajeVentaUSD,
  'Inversión bruta coincide 100% con costMatrix.porcentajeVentaUSD'
);

console.log('\n=====================================================');
if (allPassed) {
  console.log('🎉 ALL FINANCIAL ENGINE AUDIT TESTS PASSED (100% SUCCESS)');
} else {
  console.error('❌ SOME TESTS FAILED. PLEASE REVIEW AUDIT LOGS.');
}
console.log('=====================================================\n');
