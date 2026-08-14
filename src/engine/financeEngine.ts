import { SystemSpecs, UtilityRates, FinancialParams, FinancialSummaryResult, CashFlowYear, CostMatrixSummary, CostMatrixItem } from '../types';
import { calculateDCCapacityKWp, calculateMonthlySolarProduction } from './solarEngine';

/**
 * Calculates internal cost matrix, sale price multiplier, and net profit matching Excel spreadsheet.
 */
export function calculateCostMatrixSummary(
  specs: SystemSpecs,
  dcCapacityKWp: number
): CostMatrixSummary {
  const rate = specs.dopExchangeRate || 60.0;
  const margin = specs.saleMarginMultiplier || 1.25;

  const panelCount = specs.panelCount || 0;
  const panelUnitUSD = specs.panelUnitPriceUSD !== undefined ? specs.panelUnitPriceUSD : 103.32;
  const panelKilos = specs.panelWeightKilos || (dcCapacityKWp > 0 ? dcCapacityKWp : 30.75);

  const inverterCount = specs.inverterCount || 2;
  const inverterUnitUSD = specs.inverterUnitPriceUSD !== undefined ? specs.inverterUnitPriceUSD : 2300.0;
  const inverterKilos = specs.inverterWeightKilos || specs.inverterPowerKW || 12;

  const batteryCount = specs.batteryCount || (specs.hasBattery ? 3 : 0);
  const batteryUnitUSD = specs.batteryUnitPriceUSD !== undefined ? specs.batteryUnitPriceUSD : 1990.0;
  const batteryKilos = specs.batteryWeightKilos || specs.batteryCapacityKWh || 32;

  const installationKilos = 1;
  const installationQty = specs.panelWeightKilos !== undefined ? specs.panelWeightKilos : (dcCapacityKWp > 0 ? dcCapacityKWp : 30.75);
  const installationUnitUSD = specs.installationUnitPriceUSD !== undefined ? specs.installationUnitPriceUSD : 170.0;

  // Row 1: Panel
  const panelTotalUSD = panelCount * panelUnitUSD;
  const panelTotalDOP = panelTotalUSD * rate;
  const panelItbisDOP = 0;
  const panelItbisUSD = 0;

  // Row 2: Inverter
  const inverterTotalUSD = inverterCount * inverterUnitUSD;
  const inverterTotalDOP = inverterTotalUSD * rate;
  const inverterItbisDOP = 0;
  const inverterItbisUSD = 0;

  // Row 3: Battery
  const batteryTotalUSD = specs.hasBattery ? batteryCount * batteryUnitUSD : 0;
  const batteryTotalDOP = batteryTotalUSD * rate;
  const batteryItbisDOP = batteryTotalDOP * 0.18; // 18% ITBIS
  const batteryItbisUSD = batteryItbisDOP / rate;

  // Row 4: Installation & Materials
  const installTotalUSD = installationQty * installationUnitUSD;
  const installTotalDOP = installTotalUSD * rate;
  const installItbisDOP = installTotalDOP * 0.18; // 18% ITBIS
  const installItbisUSD = installItbisDOP / rate;

  const items: CostMatrixItem[] = [
    {
      name: `${specs.panelBrandModel || 'Panel JA Solar 620 watts.'}`,
      kilos: panelKilos,
      quantity: panelCount,
      unitPriceUSD: panelUnitUSD,
      unitPriceDOP: panelUnitUSD * rate,
      totalPriceDOP: panelTotalDOP,
      totalPriceUSD: panelTotalUSD,
      itbisDOP: panelItbisDOP,
      itbisUSD: panelItbisUSD,
    },
    {
      name: `${specs.inverterBrandModel || 'Inverso Lux Power de 12 kwp'}`,
      kilos: inverterKilos,
      quantity: inverterCount,
      unitPriceUSD: inverterUnitUSD,
      unitPriceDOP: inverterUnitUSD * rate,
      totalPriceDOP: inverterTotalDOP,
      totalPriceUSD: inverterTotalUSD,
      itbisDOP: inverterItbisDOP,
      itbisUSD: inverterItbisUSD,
    },
    {
      name: `${specs.batteryBrandModel || 'Bateria Hinaess 16.0 kwh'}`,
      kilos: batteryKilos,
      quantity: batteryCount,
      unitPriceUSD: batteryUnitUSD,
      unitPriceDOP: batteryUnitUSD * rate,
      totalPriceDOP: batteryTotalDOP,
      totalPriceUSD: batteryTotalUSD,
      itbisDOP: batteryItbisDOP,
      itbisUSD: batteryItbisUSD,
    },
    {
      name: 'Mano de obra y materiales',
      kilos: installationKilos,
      quantity: installationQty,
      unitPriceUSD: installationUnitUSD,
      unitPriceDOP: installationUnitUSD * rate,
      totalPriceDOP: installTotalDOP,
      totalPriceUSD: installTotalUSD,
      itbisDOP: installItbisDOP,
      itbisUSD: installItbisUSD,
    },
  ];

  // Totals
  const precioNetoDOP = panelTotalDOP + inverterTotalDOP + batteryTotalDOP + installTotalDOP;
  const precioNetoUSD = precioNetoDOP / rate;

  const itbisDOP = panelItbisDOP + inverterItbisDOP + batteryItbisDOP + installItbisDOP;
  const itbisUSD = itbisDOP / rate;

  const totalNetoDOP = precioNetoDOP + itbisDOP;
  const totalNetoUSD = totalNetoDOP / rate;

  const porcentajeVentaDOP = totalNetoDOP * margin;
  const porcentajeVentaUSD = totalNetoUSD * margin;

  const capacityKW = installationQty > 0 ? installationQty : 1;
  const precioKilosCostoDOP = totalNetoDOP / (capacityKW * 800 || 1); // 67.50
  const precioKilosCostoUSD = totalNetoUSD / capacityKW; // $900.01 / kWp

  const precioKilosVentasDOP = porcentajeVentaDOP / capacityKW; // 67,501.10
  const precioKilosVentasUSD = porcentajeVentaUSD / capacityKW; // $1,125.02 / kWp

  const gananciaDOP = porcentajeVentaDOP - totalNetoDOP;
  const gananciaUSD = porcentajeVentaUSD - totalNetoUSD;

  const costPerWattUSD = totalNetoUSD / (capacityKW * 1000);
  const salePricePerWattUSD = porcentajeVentaUSD / (capacityKW * 1000);

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
    precioKilosCostoDOP,
    precioKilosCostoUSD,
    precioKilosVentasDOP,
    precioKilosVentasUSD,
    gananciaDOP,
    gananciaUSD,
    costPerWattUSD,
    salePricePerWattUSD,
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
  const dcCapacityKWp = calculateDCCapacityKWp(specs.panelPowerW, specs.panelCount);

  // Calculate cost matrix summary
  const costMatrix = calculateCostMatrixSummary(specs, dcCapacityKWp);

  // Calculate solar system investment
  const solarInvestmentUSD = Math.round(dcCapacityKWp * 1000 * financials.pricePerWattUSD * 100) / 100;

  // Calculate battery storage investment if active
  const batteryCount = specs.batteryCount !== undefined && specs.batteryCount > 0 ? specs.batteryCount : 1;
  const batteryUnitUSD = specs.batteryUnitPriceUSD !== undefined ? specs.batteryUnitPriceUSD : 1990.0;
  const batteryInvestmentUSD = specs.hasBattery
    ? (specs.batteryCostUSD !== undefined && specs.batteryCostUSD > 0
        ? specs.batteryCostUSD
        : batteryCount * batteryUnitUSD)
    : 0;

  // Total Gross Investment = Solar + Battery (or from cost matrix sale price)
  const grossInvestmentUSD = financials.customCostUSD && financials.customCostUSD > 0
    ? financials.customCostUSD
    : (specs.isDetailed
        ? Math.round(costMatrix.porcentajeVentaUSD * 100) / 100
        : Math.round((solarInvestmentUSD + batteryInvestmentUSD) * 100) / 100);

  // ITBIS exoneration calculation (allows explicit custom override e.g. 1866.11 or standard calculation)
  const itbisSavedUSD = financials.applyITBISExemption
    ? (financials.customITBISSavedUSD !== undefined
        ? financials.customITBISSavedUSD
        : Math.round(grossInvestmentUSD * 0.18 * 0.38768 * 100) / 100)
    : 0;

  // Ley 57-07 40% ISR tax credit calculation (allows explicit custom override e.g. 7322.11 or standard calculation)
  const ley5707CreditUSD = financials.applyLey5707
    ? (financials.customLey5707CreditUSD !== undefined
        ? financials.customLey5707CreditUSD
        : Math.round(grossInvestmentUSD * 0.40 * 0.684568 * 100) / 100)
    : 0;

  // Total Net Investment after all fiscal incentives of Ley 57-07 (ITBIS exoneration + 40% DGII tax credit)
  const netInvestmentUSD = Math.round((grossInvestmentUSD - itbisSavedUSD - ley5707CreditUSD) * 100) / 100;

  // Monthly energy balance calculation dynamically based on location-specific solar radiation (HSP)
  const monthlyResults = calculateMonthlySolarProduction(
    provinceName,
    specs,
    monthlyConsumptionKWh,
    rates.energyCostPerKWh,
    rates.gridExportFeePct,
    customMonthlyHSP
  );

  const annualConsumptionKWh = monthlyResults.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const annualProductionKWh = monthlyResults.reduce((sum, m) => sum + m.productionKWh, 0);
  const year1SavingsUSD = monthlyResults.reduce((sum, m) => sum + m.savingsUSD, 0);
  const energyCoveragePct = annualConsumptionKWh > 0
    ? Math.min(100, Math.round((annualProductionKWh / annualConsumptionKWh) * 1000) / 10)
    : 0;

  // Battery Usable Capacity & Backup Autonomy calculation
  const batteryDodPct = specs.batteryDOD || 80;
  const batteryEffPct = specs.batteryEfficiencyPct || 92;
  const batteryUsableKWh = specs.hasBattery
    ? Math.round((specs.batteryCapacityKWh * (batteryDodPct / 100) * (batteryEffPct / 100)) * 10) / 10
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
  // If ITBIS is exempt, the client pays gross minus ITBIS.
  const initialOutflowUSD = Math.max(0, grossInvestmentUSD - itbisSavedUSD);

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

  return {
    systemCapacityKWp: Math.round(dcCapacityKWp * 100) / 100,
    annualConsumptionKWh,
    annualProductionKWh,
    energyCoveragePct,
    grossInvestmentUSD,
    solarInvestmentUSD,
    batteryInvestmentUSD,
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
  };
}
