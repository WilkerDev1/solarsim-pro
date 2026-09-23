import { SystemSpecs, UtilityRates, FinancialParams, FinancialSummaryResult, CashFlowYear, CostMatrixSummary, CostMatrixItem, CustomQuotationItem } from '../types';
import { calculateDCCapacityKWp, calculateMonthlySolarProduction } from './solarEngine';
import {
  getProjectPanels,
  getProjectInverters,
  getProjectBatteries,
  calculateTotalDCCapacityKWp,
  calculateTotalBatteryCapacityKWh,
} from '../utils/equipmentSpecsUtils';

/**
 * Calculates internal cost matrix, sale price multiplier, and net profit matching Excel spreadsheet.
 */
export function calculateCostMatrixSummary(
  specs: SystemSpecs,
  dcCapacityKWp: number,
  customItems?: CustomQuotationItem[]
): CostMatrixSummary {
  const rate = specs.dopExchangeRate || 60.0;
  const margin = specs.saleMarginMultiplier || 1.25;

  const panels = getProjectPanels(specs);
  const inverters = getProjectInverters(specs);
  const batteries = getProjectBatteries(specs);

  const realDCKWp = dcCapacityKWp > 0 ? dcCapacityKWp : calculateTotalDCCapacityKWp(specs);

  // Row 1..N: Panels
  let panelTotalUSD = 0;
  let panelTotalDOP = 0;
  const panelItbisDOP = 0;
  const panelItbisUSD = 0;

  const panelItems: CostMatrixItem[] = panels.map((p) => {
    const qty = p.count || 0;
    const unitUSD = p.unitPriceUSD !== undefined
      ? p.unitPriceUSD
      : (specs.panelUnitPriceUSD !== undefined ? specs.panelUnitPriceUSD : 103.32);
    const itemTotalUSD = qty * unitUSD;
    const itemTotalDOP = itemTotalUSD * rate;
    const itemKilos = Math.round((((p.powerW || 620) * qty) / 1000) * 1000) / 1000;
    panelTotalUSD += itemTotalUSD;
    panelTotalDOP += itemTotalDOP;

    return {
      name: p.brandModel || 'Panel JA Solar 620 watts.',
      kilos: itemKilos,
      quantity: qty,
      unitPriceUSD: unitUSD,
      unitPriceDOP: unitUSD * rate,
      totalPriceDOP: itemTotalDOP,
      totalPriceUSD: itemTotalUSD,
      itbisDOP: 0,
      itbisUSD: 0,
    };
  });

  // Row N+1..M: Inverters
  let inverterTotalUSD = 0;
  let inverterTotalDOP = 0;
  const inverterItbisDOP = 0;
  const inverterItbisUSD = 0;

  const inverterItems: CostMatrixItem[] = inverters.map((inv) => {
    const qty = inv.count !== undefined ? inv.count : 1;
    const unitUSD = inv.unitPriceUSD !== undefined
      ? inv.unitPriceUSD
      : (specs.inverterUnitPriceUSD !== undefined ? specs.inverterUnitPriceUSD : 2300.0);
    const itemTotalUSD = qty * unitUSD;
    const itemTotalDOP = itemTotalUSD * rate;
    const itemKilos = inv.powerKW || inv.weightKilos || 12;
    inverterTotalUSD += itemTotalUSD;
    inverterTotalDOP += itemTotalDOP;

    return {
      name: inv.brandModel || 'Inversor Lux Power de 12 kwp',
      kilos: itemKilos,
      quantity: qty,
      unitPriceUSD: unitUSD,
      unitPriceDOP: unitUSD * rate,
      totalPriceDOP: itemTotalDOP,
      totalPriceUSD: itemTotalUSD,
      itbisDOP: 0,
      itbisUSD: 0,
    };
  });

  // Row M+1..K: Batteries
  let batteryTotalUSD = 0;
  let batteryTotalDOP = 0;
  let batteryItbisDOP = 0;
  let batteryItbisUSD = 0;

  const batteryItems: CostMatrixItem[] = specs.hasBattery
    ? batteries.map((b) => {
        const qty = b.count !== undefined ? b.count : 1;
        const unitUSD = b.unitPriceUSD !== undefined
          ? b.unitPriceUSD
          : (specs.batteryUnitPriceUSD !== undefined ? specs.batteryUnitPriceUSD : 1990.0);
        const itemTotalUSD = qty * unitUSD;
        const itemTotalDOP = itemTotalUSD * rate;
        const itemItbisDOP = itemTotalDOP * 0.18; // 18% ITBIS
        const itemItbisUSD = itemItbisDOP / rate;
        const itemKilos = b.capacityKWh ? Math.round(b.capacityKWh * qty * 100) / 100 : (b.weightKilos || 32);

        batteryTotalUSD += itemTotalUSD;
        batteryTotalDOP += itemTotalDOP;
        batteryItbisDOP += itemItbisDOP;
        batteryItbisUSD += itemItbisUSD;

        return {
          name: b.brandModel || 'Bateria Hinaess 16.0 kwh',
          kilos: itemKilos,
          quantity: qty,
          unitPriceUSD: unitUSD,
          unitPriceDOP: unitUSD * rate,
          totalPriceDOP: itemTotalDOP,
          totalPriceUSD: itemTotalUSD,
          itbisDOP: itemItbisDOP,
          itbisUSD: itemItbisUSD,
        };
      })
    : [];

  // Row Final: Installation & Materials
  const installationKilos = 1;
  const installationQty = Math.round(realDCKWp * 1000) / 1000;
  const installationUnitUSD = specs.installationUnitPriceUSD !== undefined ? specs.installationUnitPriceUSD : 170.0;

  const installTotalUSD = installationQty * installationUnitUSD;
  const installTotalDOP = installTotalUSD * rate;
  const installItbisDOP = installTotalDOP * 0.18; // 18% ITBIS
  const installItbisUSD = installItbisDOP / rate;

  const installItem: CostMatrixItem = {
    name: 'Mano de obra y materiales',
    kilos: installationKilos,
    quantity: installationQty,
    unitPriceUSD: installationUnitUSD,
    unitPriceDOP: installationUnitUSD * rate,
    totalPriceDOP: installTotalDOP,
    totalPriceUSD: installTotalUSD,
    itbisDOP: installItbisDOP,
    itbisUSD: installItbisUSD,
  };

  // Row Additional: Custom Items & Materials (Otros ítems y materiales)
  let customItemsNetUSD = 0;
  let customItemsNetDOP = 0;
  let customItemsItbisUSD = 0;
  let customItemsItbisDOP = 0;

  const customMatrixItems: CostMatrixItem[] = (customItems || []).map((cItem, cIdx) => {
    const qty = cItem.quantity || 1;
    const unitUSD = cItem.unitPriceUSD || 0;
    const itemTotalUSD = qty * unitUSD;
    const itemTotalDOP = itemTotalUSD * rate;
    const isExonerated = cItem.exonerateITBIS !== undefined ? cItem.exonerateITBIS : (cItem.applyITBIS ?? true);
    const itemItbisDOP = isExonerated ? 0 : itemTotalDOP * 0.18;
    const itemItbisUSD = isExonerated ? 0 : itemTotalUSD * 0.18;

    customItemsNetUSD += itemTotalUSD;
    customItemsNetDOP += itemTotalDOP;
    customItemsItbisUSD += itemItbisUSD;
    customItemsItbisDOP += itemItbisDOP;

    return {
      name: cItem.description || `Ítem Adicional #${cIdx + 1}`,
      kilos: 1,
      quantity: qty,
      unitPriceUSD: unitUSD,
      unitPriceDOP: unitUSD * rate,
      totalPriceDOP: itemTotalDOP,
      totalPriceUSD: itemTotalUSD,
      itbisDOP: itemItbisDOP,
      itbisUSD: itemItbisUSD,
    };
  });

  const items: CostMatrixItem[] = [
    ...panelItems,
    ...inverterItems,
    ...batteryItems,
    installItem,
    ...customMatrixItems,
  ];

  // Base Totals (Paneles, Inversores, Baterías, Instalación sin ítems adicionales)
  const basePrecioNetoDOP = panelTotalDOP + inverterTotalDOP + batteryTotalDOP + installTotalDOP;
  const basePrecioNetoUSD = basePrecioNetoDOP / rate;

  const baseItbisDOP = panelItbisDOP + inverterItbisDOP + batteryItbisDOP + installItbisDOP;
  const baseItbisUSD = baseItbisDOP / rate;

  const baseTotalNetoDOP = basePrecioNetoDOP + baseItbisDOP;
  const baseTotalNetoUSD = baseTotalNetoDOP / rate;

  const basePorcentajeVentaDOP = baseTotalNetoDOP * margin;
  const basePorcentajeVentaUSD = baseTotalNetoUSD * margin;

  const baseGananciaDOP = basePorcentajeVentaDOP - baseTotalNetoDOP;
  const baseGananciaUSD = basePorcentajeVentaUSD - baseTotalNetoUSD;

  // Combined Totals (Including Custom Items)
  const precioNetoDOP = basePrecioNetoDOP + customItemsNetDOP;
  const precioNetoUSD = precioNetoDOP / rate;

  const itbisDOP = baseItbisDOP + customItemsItbisDOP;
  const itbisUSD = itbisDOP / rate;

  const totalNetoDOP = precioNetoDOP + itbisDOP;
  const totalNetoUSD = totalNetoDOP / rate;

  const porcentajeVentaDOP = totalNetoDOP * margin;
  const porcentajeVentaUSD = totalNetoUSD * margin;

  // Solar Only Subtotal (Paneles + Inversores + Instalación sin Baterías)
  const solarOnlyNetDOP = panelTotalDOP + inverterTotalDOP + installTotalDOP;
  const solarOnlyItbisDOP = panelItbisDOP + inverterItbisDOP + installItbisDOP;
  const solarOnlyTotalNetDOP = solarOnlyNetDOP + solarOnlyItbisDOP;
  const solarOnlyTotalNetUSD = solarOnlyTotalNetDOP / rate;
  const solarOnlyVentaDOP = solarOnlyTotalNetDOP * margin;
  const solarOnlyVentaUSD = solarOnlyTotalNetUSD * margin;

  const capacityKW = installationQty > 0 ? installationQty : (dcCapacityKWp > 0 ? dcCapacityKWp : 1);
  const precioKilosCostoDOP = totalNetoDOP / (capacityKW * 800 || 1);
  const precioKilosCostoUSD = totalNetoUSD / capacityKW;

  const precioKilosVentasDOP = porcentajeVentaDOP / capacityKW;
  const precioKilosVentasUSD = porcentajeVentaUSD / capacityKW;

  // Ganancia neta del proyecto: Diferencia entre Porcentaje Venta y Costo Total Neto (fórmula de referencia Excel)
  const gananciaDOP = porcentajeVentaDOP - totalNetoDOP;
  const gananciaUSD = porcentajeVentaUSD - totalNetoUSD;

  const costPerWattUSD = totalNetoUSD / (capacityKW * 1000);
  const salePricePerWattUSD = porcentajeVentaUSD / (capacityKW * 1000);
  const solarSalePricePerWattUSD = capacityKW > 0 ? Math.round((solarOnlyVentaUSD / (capacityKW * 1000)) * 100) / 100 : 1.13;

  const marginOnSalePct = porcentajeVentaUSD > 0 ? Math.round((gananciaUSD / porcentajeVentaUSD) * 10000) / 100 : 0;
  const markupOnCostPct = totalNetoUSD > 0 ? Math.round((gananciaUSD / totalNetoUSD) * 10000) / 100 : 0;

  // Equipment vs Labor Breakdown for Ley 57-07
  const equipmentCostUSD = panelTotalUSD + inverterTotalUSD + batteryTotalUSD;
  const equipmentTotalUSD = (panelTotalDOP + inverterTotalDOP + batteryTotalDOP + batteryItbisDOP) / rate;
  const equipmentVentaUSD = equipmentTotalUSD * margin;

  const laborCostUSD = installTotalUSD;
  const laborTotalUSD = (installTotalDOP + installItbisDOP) / rate;
  const laborVentaUSD = laborTotalUSD * margin;

  return {
    dopExchangeRate: rate,
    saleMarginMultiplier: margin,
    items,
    precioNetoDOP,
    precioNetoUSD,
    itbisDOP,
    itbisUSD,
    totalNetoDOP,
    totalNetoUSD,
    porcentajeVentaDOP,
    porcentajeVentaUSD,
    solarOnlyVentaUSD,
    precioKilosCostoDOP,
    precioKilosCostoUSD,
    precioKilosVentasDOP,
    precioKilosVentasUSD,
    gananciaDOP,
    gananciaUSD,
    marginOnSalePct,
    markupOnCostPct,
    costPerWattUSD,
    salePricePerWattUSD,
    solarSalePricePerWattUSD,
    equipmentCostUSD,
    equipmentTotalUSD,
    equipmentVentaUSD,
    laborCostUSD,
    laborTotalUSD,
    laborVentaUSD,
    basePrecioNetoUSD,
    basePrecioNetoDOP,
    baseItbisUSD,
    baseItbisDOP,
    baseTotalNetoUSD,
    baseTotalNetoDOP,
    basePorcentajeVentaUSD,
    basePorcentajeVentaDOP,
    baseGananciaUSD,
    baseGananciaDOP,
    customItemsNetUSD,
    customItemsNetDOP,
    customItemsItbisUSD,
    customItemsItbisDOP,
  };
}

/**
 * Solves Internal Rate of Return (IRR / TIR) using Newton-Raphson method.
 */
function calculateIRR(initialInvestment: number, cashFlows: number[]): number {
  let rate = 0.15; // Initial guess 15%
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let iter = 0; iter < maxIterations; iter++) {
    let npv = -initialInvestment;
    let dnpv = 0; // derivative of NPV with respect to rate

    for (let t = 0; t < cashFlows.length; t++) {
      const year = t + 1;
      const factor = Math.pow(1 + rate, year);
      npv += cashFlows[t] / factor;
      dnpv -= (year * cashFlows[t]) / (factor * (1 + rate));
    }

    if (Math.abs(npv) < tolerance) {
      return Math.round(rate * 10000) / 100; // Return % e.g. 31.97%
    }

    if (Math.abs(dnpv) < 1e-10) break;

    const newRate = rate - npv / dnpv;
    if (newRate <= -1 || isNaN(newRate)) break;
    rate = newRate;
  }

  return Math.round(rate * 10000) / 100;
}

/**
 * Calculates complete financial and regulatory proposal model.
 */
export function calculateFinancialSummary(
  provinceName: string,
  specs: SystemSpecs,
  rates: UtilityRates,
  financials: FinancialParams,
  monthlyConsumptionKWh: number[],
  customMonthlyHSP?: number[]
): FinancialSummaryResult {
  const dcCapacityKWp = calculateTotalDCCapacityKWp(specs);

  // Custom Quotation Items calculation (Additional Equipment, Materials, and Services)
  const customItems = financials.customItems || [];

  // Calculate cost matrix summary including custom quotation items
  const costMatrix = calculateCostMatrixSummary(specs, dcCapacityKWp, customItems);

  // Pricing Mode: 'cost_matrix' (default) vs 'direct_watt' (manual $/W or $/kW base price)
  const isDirectWatt = specs.pricingMode === 'direct_watt' || (!specs.isDetailed && specs.pricingMode !== 'cost_matrix');
  const effectivePricePerWatt = specs.pricePerWattUSD !== undefined && specs.pricePerWattUSD > 0
    ? specs.pricePerWattUSD
    : (financials.pricePerWattUSD !== undefined && financials.pricePerWattUSD > 0 ? financials.pricePerWattUSD : 1.13);

  const customItemsTotalUSD = Math.round(customItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPriceUSD || 0)), 0) * 100) / 100;
  
  // ITBIS differentiation: Exonerated by Ley 57-07 vs Charged to Client
  let exoneratedCustomITBISUSD = 0;
  let nonExoneratedCustomITBISUSD = 0;

  for (const item of customItems) {
    const itemTotal = (item.quantity || 0) * (item.unitPriceUSD || 0);
    const isExonerated = item.exonerateITBIS !== undefined ? item.exonerateITBIS : (item.applyITBIS ?? true);
    if (isExonerated) {
      exoneratedCustomITBISUSD += itemTotal * 0.18;
    } else {
      nonExoneratedCustomITBISUSD += itemTotal * 0.18;
    }
  }

  exoneratedCustomITBISUSD = Math.round(exoneratedCustomITBISUSD * 100) / 100;
  nonExoneratedCustomITBISUSD = Math.round(nonExoneratedCustomITBISUSD * 100) / 100;
  const customItemsITBISUSD = exoneratedCustomITBISUSD;

  // Base Gross Investment:
  // 1. If explicit custom override is set, use it.
  // 2. If direct_watt mode: Total turnkey sale price is directly (dcCapacityKWp * 1000 * effectivePricePerWatt) - all inclusive.
  // 3. If cost_matrix mode: Turnkey total sale price of base system (excluding pass-through custom items to avoid double counting).
  const baseGrossInvestmentUSD = financials.customCostUSD && financials.customCostUSD > 0
    ? financials.customCostUSD
    : (isDirectWatt
        ? Math.round(dcCapacityKWp * 1000 * effectivePricePerWatt * 100) / 100
        : Math.round((costMatrix.basePorcentajeVentaUSD ?? (costMatrix.porcentajeVentaUSD - customItemsTotalUSD)) * 100) / 100);

  // If item is not exonerated, ITBIS is charged to the client in the final gross price
  const grossInvestmentUSD = Math.round((baseGrossInvestmentUSD + customItemsTotalUSD + nonExoneratedCustomITBISUSD) * 100) / 100;
  const commercialPreTaxSubtotalUSD = Math.round((baseGrossInvestmentUSD + customItemsTotalUSD) * 100) / 100;

  // Synchronize Cost Matrix with Direct Price in direct_watt mode
  if (isDirectWatt) {
    if (specs.directPriceSurplusTarget === 'labor') {
      // Equipment portion stays with base margin multiplier
      const baseEquipmentVenta = Math.round((costMatrix.equipmentVentaUSD || 0) * 100) / 100;
      const surplusLaborVenta = Math.max(0, Math.round((baseGrossInvestmentUSD - baseEquipmentVenta) * 100) / 100);

      costMatrix.porcentajeVentaUSD = commercialPreTaxSubtotalUSD;
      costMatrix.porcentajeVentaDOP = Math.round(commercialPreTaxSubtotalUSD * costMatrix.dopExchangeRate * 100) / 100;
      costMatrix.gananciaUSD = Math.round((baseGrossInvestmentUSD - (costMatrix.baseTotalNetoUSD || costMatrix.totalNetoUSD)) * 100) / 100;
      costMatrix.gananciaDOP = Math.round(costMatrix.gananciaUSD * costMatrix.dopExchangeRate * 100) / 100;
      costMatrix.marginOnSalePct = commercialPreTaxSubtotalUSD > 0 ? Math.round((costMatrix.gananciaUSD / commercialPreTaxSubtotalUSD) * 10000) / 100 : 0;
      costMatrix.markupOnCostPct = (costMatrix.baseTotalNetoUSD || costMatrix.totalNetoUSD) > 0 ? Math.round((costMatrix.gananciaUSD / (costMatrix.baseTotalNetoUSD || costMatrix.totalNetoUSD)) * 10000) / 100 : 0;
      costMatrix.precioKilosVentasUSD = dcCapacityKWp > 0 ? Math.round((commercialPreTaxSubtotalUSD / dcCapacityKWp) * 100) / 100 : 0;
      costMatrix.precioKilosVentasDOP = Math.round(costMatrix.precioKilosVentasUSD * costMatrix.dopExchangeRate * 100) / 100;
      costMatrix.salePricePerWattUSD = effectivePricePerWatt;
      costMatrix.laborVentaUSD = surplusLaborVenta;
      costMatrix.equipmentVentaUSD = Math.min(baseGrossInvestmentUSD, baseEquipmentVenta);
    } else {
      // Default: 'margin' -> Implied margin multiplier across the board
      const baseNetCost = costMatrix.baseTotalNetoUSD || costMatrix.totalNetoUSD;
      const impliedMargin = baseNetCost > 0 ? Math.round((baseGrossInvestmentUSD / baseNetCost) * 10000) / 10000 : costMatrix.saleMarginMultiplier;
      costMatrix.saleMarginMultiplier = impliedMargin;
      costMatrix.porcentajeVentaUSD = commercialPreTaxSubtotalUSD;
      costMatrix.porcentajeVentaDOP = Math.round(commercialPreTaxSubtotalUSD * costMatrix.dopExchangeRate * 100) / 100;
      costMatrix.gananciaUSD = Math.round((baseGrossInvestmentUSD - baseNetCost) * 100) / 100;
      costMatrix.gananciaDOP = Math.round(costMatrix.gananciaUSD * costMatrix.dopExchangeRate * 100) / 100;
      costMatrix.marginOnSalePct = commercialPreTaxSubtotalUSD > 0 ? Math.round((costMatrix.gananciaUSD / commercialPreTaxSubtotalUSD) * 10000) / 100 : 0;
      costMatrix.markupOnCostPct = baseNetCost > 0 ? Math.round((costMatrix.gananciaUSD / baseNetCost) * 10000) / 100 : 0;
      costMatrix.precioKilosVentasUSD = dcCapacityKWp > 0 ? Math.round((commercialPreTaxSubtotalUSD / dcCapacityKWp) * 100) / 100 : 0;
      costMatrix.precioKilosVentasDOP = Math.round(costMatrix.precioKilosVentasUSD * costMatrix.dopExchangeRate * 100) / 100;
      costMatrix.salePricePerWattUSD = effectivePricePerWatt;
      costMatrix.equipmentVentaUSD = Math.round((costMatrix.equipmentTotalUSD || 0) * impliedMargin * 100) / 100;
      costMatrix.laborVentaUSD = Math.round((costMatrix.laborTotalUSD || 0) * impliedMargin * 100) / 100;
    }
  }

  // Labor Portion (Mano de obra y materiales con margen e ITBIS)
  const laborPortionUSD = Math.round(((costMatrix.laborVentaUSD || 0) + customItemsTotalUSD) * 100) / 100;

  // Equipment Portion (Paneles, Inversores y Baterías con margen) - Base estricta para Ley 57-07 (excluye mano de obra y custom items)
  const equipmentPortionUSD = Math.round((costMatrix.equipmentVentaUSD || (baseGrossInvestmentUSD - (costMatrix.laborVentaUSD || 0))) * 100) / 100;

  // Solar and Battery investment components breakdown
  const batteryInvestmentUSD = specs.hasBattery
    ? (isDirectWatt
        ? 0
        : Math.max(0, Math.round((costMatrix.porcentajeVentaUSD - (costMatrix.solarOnlyVentaUSD || costMatrix.porcentajeVentaUSD)) * 100) / 100))
    : 0;

  const solarInvestmentUSD = isDirectWatt
    ? baseGrossInvestmentUSD
    : Math.round((costMatrix.solarOnlyVentaUSD || baseGrossInvestmentUSD) * 100) / 100;

  // ITBIS exoneration calculation (allows explicit custom override e.g. 1866.11 or dynamic calculation from cost matrix)
  const matrixITBISUSD = costMatrix.baseItbisUSD !== undefined ? costMatrix.baseItbisUSD : (costMatrix.itbisUSD || 0);
  const commercialITBISUSD = Math.round(matrixITBISUSD * (costMatrix.saleMarginMultiplier || specs.saleMarginMultiplier || 1.25) * 100) / 100;

  const baseITBISSaved = financials.customITBISSavedUSD !== undefined
    ? financials.customITBISSavedUSD
    : commercialITBISUSD;

  const itbisSavedUSD = financials.applyITBISExemption
    ? Math.round((baseITBISSaved + customItemsITBISUSD) * 100) / 100
    : 0;

  // Ley 57-07 40% ISR tax credit: APPLIES STRICTLY TO RENEWABLE EQUIPMENT (Panels, Inverters, Batteries) - EXCLUDES LABOR
  const ley5707CreditUSD = financials.applyLey5707
    ? (financials.customLey5707CreditUSD !== undefined
        ? financials.customLey5707CreditUSD
        : Math.round(equipmentPortionUSD * 0.40 * 100) / 100)
    : 0;

  // Total Contract Price Payable by Client at Year 0:
  // If ITBIS is exempt under Ley 57-07, client pays grossInvestmentUSD.
  // If ITBIS exemption is toggled off, client pays the non-exempt ITBIS (baseITBISSaved).
  const contractPriceUSD = financials.applyITBISExemption
    ? grossInvestmentUSD
    : Math.round((grossInvestmentUSD + baseITBISSaved) * 100) / 100;

  // Total Net Investment after 3 years of DGII ISR tax credit deduction:
  const netInvestmentUSD = Math.round((contractPriceUSD - ley5707CreditUSD) * 100) / 100;

  // Monthly energy balance calculation dynamically based on location-specific solar radiation (HSP)
  const monthlyResults = calculateMonthlySolarProduction(
    provinceName,
    specs,
    monthlyConsumptionKWh,
    rates.energyCostPerKWh,
    rates.gridExportFeePct,
    customMonthlyHSP,
    rates.tariffCode,
    rates.isZeroExport
  );

  const annualConsumptionKWh = monthlyResults.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const annualProductionKWh = monthlyResults.reduce((sum, m) => sum + m.productionKWh, 0);
  const year1SavingsUSD = monthlyResults.reduce((sum, m) => sum + m.savingsUSD, 0);
  const energyCoveragePct = annualConsumptionKWh > 0
    ? Math.round((annualProductionKWh / annualConsumptionKWh) * 1000) / 10
    : 0;

  // Battery Usable Capacity & Backup Autonomy calculation
  const batteryDodPct = specs.batteryDOD || 80;
  const batteryEffPct = specs.batteryEfficiencyPct || 92;
  const totalBatteryKWh = calculateTotalBatteryCapacityKWh(specs);
  const batteryUsableKWh = specs.hasBattery
    ? Math.round(((totalBatteryKWh || specs.batteryCapacityKWh) * (batteryDodPct / 100) * (batteryEffPct / 100)) * 10) / 10
    : 0;

  const avgDailyConsumptionKWh = annualConsumptionKWh > 0 ? annualConsumptionKWh / 365 : 100;
  const avgHourlyLoadKW = avgDailyConsumptionKWh / 24;
  const batteryBackupAutonomyHours = (specs.hasBattery && avgHourlyLoadKW > 0)
    ? Math.round((batteryUsableKWh / avgHourlyLoadKW) * 10) / 10
    : 0;

  // 25-Year Cash Flow Projection
  const annualDegradationPct = specs.isDetailed ? specs.annualDegradation : 0.5;
  const annualInflationPct = rates.annualEnergyInflationPct || 3.5;
  const annualTaxCredit = financials.applyLey5707 ? ley5707CreditUSD / 3 : 0;

  // Initial cash outflow for the client at Year 0:
  // contractPriceUSD is the actual turnkey amount agreed and payable by the client under the proposal.
  const initialOutflowUSD = contractPriceUSD;

  const cashFlow25Years: CashFlowYear[] = [];
  const annualNetCashFlows: number[] = [];
  let cumulativeCashFlow = -initialOutflowUSD;
  let paybackYears = 25.0;
  let paybackFound = false;

  for (let year = 1; year <= financials.projectLifespanYears; year++) {
    const degradationFactor = Math.pow(1 - (annualDegradationPct / 100), year - 1);
    const inflationFactor = Math.pow(1 + (annualInflationPct / 100), year - 1);

    const yearProd = Math.round(annualProductionKWh * degradationFactor);
    const yearSavings = Math.round(year1SavingsUSD * degradationFactor * inflationFactor * 100) / 100;
    const yearTaxCredit = year <= 3 ? Math.round(annualTaxCredit * 100) / 100 : 0;

    let yearReplacementCost = 0;
    if (specs.hasBattery && specs.batteryReplacementCostUSD && specs.batteryReplacementCostUSD > 0) {
      const replacementYear = specs.batteryLifespanYears || 10;
      if (year === replacementYear) {
        yearReplacementCost = specs.batteryReplacementCostUSD;
      }
    }

    const netCashFlow = Math.round((yearSavings + yearTaxCredit - yearReplacementCost) * 100) / 100;
    annualNetCashFlows.push(netCashFlow);

    const prevCumulative = cumulativeCashFlow;
    cumulativeCashFlow = Math.round((cumulativeCashFlow + netCashFlow) * 100) / 100;

    if (!paybackFound && cumulativeCashFlow >= 0) {
      paybackFound = true;
      const fraction = netCashFlow > 0 ? Math.abs(prevCumulative) / netCashFlow : 0;
      paybackYears = Math.round(((year - 1) + fraction) * 10) / 10;
    }

    cashFlow25Years.push({
      year,
      productionKWh: yearProd,
      savingsUSD: yearSavings,
      taxCreditUSD: yearTaxCredit,
      netCashFlowUSD: netCashFlow,
      cumulativeCashFlowUSD: cumulativeCashFlow,
    });
  }

  const total25YearSavingsUSD = Math.round(cashFlow25Years.reduce((sum, cf) => sum + cf.savingsUSD, 0) * 100) / 100;

  // NPV (VAN) Calculation
  const discountRate = financials.discountRatePct / 100;
  let npvUSD = -initialOutflowUSD;
  for (let t = 0; t < annualNetCashFlows.length; t++) {
    npvUSD += annualNetCashFlows[t] / Math.pow(1 + discountRate, t + 1);
  }
  npvUSD = Math.round(npvUSD * 100) / 100;

  // IRR (TIR) Calculation
  const irrPct = calculateIRR(initialOutflowUSD, annualNetCashFlows);

  // 25-Year ROI % Calculation
  const totalNetReturns = annualNetCashFlows.reduce((sum, cf) => sum + cf, 0);
  const roi25YrPct = initialOutflowUSD > 0
    ? Math.round(((totalNetReturns - initialOutflowUSD) / initialOutflowUSD) * 10000) / 100
    : 0;

  // CO2 avoided calculation (tons/year)
  const co2AvoidedTonsPerYear = Math.round((annualProductionKWh * (financials.co2FactorKgPerKWh || 0.481) / 1000) * 10) / 10;

  // Effective sale price per Watt and per kWp (dynamic across both cost matrix and direct watt modes):
  const salePricePerWattUSD = dcCapacityKWp > 0
    ? Math.round((grossInvestmentUSD / (dcCapacityKWp * 1000)) * 10000) / 10000
    : (costMatrix.salePricePerWattUSD || effectivePricePerWatt || 1.13);

  const salePricePerKWpUSD = dcCapacityKWp > 0
    ? Math.round((grossInvestmentUSD / dcCapacityKWp) * 100) / 100
    : (costMatrix.precioKilosVentasUSD || Math.round(salePricePerWattUSD * 1000 * 100) / 100);

  return {
    systemCapacityKWp: Math.round(dcCapacityKWp * 100) / 100,
    annualConsumptionKWh,
    annualProductionKWh,
    energyCoveragePct,
    grossInvestmentUSD,
    contractPriceUSD,
    initialOutflowUSD,
    salePricePerWattUSD,
    salePricePerKWpUSD,
    solarInvestmentUSD,
    batteryInvestmentUSD,
    equipmentPortionUSD,
    laborPortionUSD,
    itbisSavedUSD,
    ley5707CreditUSD,
    netInvestmentUSD,
    year1SavingsUSD: Math.round(year1SavingsUSD * 100) / 100,
    total25YearSavingsUSD,
    paybackYears,
    irrPct,
    npvUSD,
    roi25YrPct,
    co2AvoidedTonsPerYear,
    monthlyBreakdown: monthlyResults,
    cashFlow25Years,
    costMatrix,
    batteryUsableKWh,
    batteryBackupAutonomyHours,
    customItemsTotalUSD,
    customItemsITBISUSD,
    customItemsNonExoneratedITBISUSD: nonExoneratedCustomITBISUSD,
    commercialPreTaxSubtotalUSD,
    customItemsList: customItems,
  };
}
