import { SystemSpecs, UtilityRates, FinancialParams, FinancialSummaryResult, CashFlowYear } from '../types';
import { calculateDCCapacityKWp, calculateMonthlySolarProduction } from './solarEngine';

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
  monthlyConsumptionKWh: number[]
): FinancialSummaryResult {
  const dcCapacityKWp = calculateDCCapacityKWp(specs.panelPowerW, specs.panelCount);

  // Calculate solar system investment
  const solarInvestmentUSD = financials.customCostUSD && financials.customCostUSD > 0
    ? financials.customCostUSD
    : Math.round(dcCapacityKWp * 1000 * financials.pricePerWattUSD * 100) / 100;

  // Calculate battery storage investment if active
  const batteryInvestmentUSD = specs.hasBattery ? (specs.batteryCostUSD || 0) : 0;

  // Total Gross Investment = Solar + Battery
  const grossInvestmentUSD = Math.round((solarInvestmentUSD + batteryInvestmentUSD) * 100) / 100;

  // Tax calculations
  const itbisSavedUSD = financials.applyITBISExemption
    ? Math.round(grossInvestmentUSD * 0.18 * 100) / 100
    : 0;

  const ley5707CreditUSD = financials.applyLey5707
    ? Math.round(grossInvestmentUSD * 0.40 * 100) / 100
    : 0;

  const netInvestmentUSD = Math.round((grossInvestmentUSD - ley5707CreditUSD) * 100) / 100;

  // Monthly energy balance calculation
  const monthlyResults = calculateMonthlySolarProduction(
    provinceName,
    specs,
    monthlyConsumptionKWh,
    rates.energyCostPerKWh,
    rates.gridExportFeePct
  );

  const annualConsumptionKWh = monthlyResults.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const annualProductionKWh = monthlyResults.reduce((sum, m) => sum + m.productionKWh, 0);
  const year1SavingsUSD = monthlyResults.reduce((sum, m) => sum + m.savingsUSD, 0);
  const energyCoveragePct = annualConsumptionKWh > 0
    ? Math.min(100, Math.round((annualProductionKWh / annualConsumptionKWh) * 1000) / 10)
    : 0;

  // 25-Year Cash Flow Projection
  const annualDegradationPct = specs.isDetailed ? specs.annualDegradation : 0.5;
  const annualInflationPct = rates.annualEnergyInflationPct || 3.5;
  const annualTaxCredit = financials.applyLey5707 ? ley5707CreditUSD / 3 : 0;

  const cashFlow25Years: CashFlowYear[] = [];
  const annualNetCashFlows: number[] = [];
  let cumulativeCashFlow = -grossInvestmentUSD;
  let paybackYears = 25.0;
  let paybackFound = false;

  for (let year = 1; year <= financials.projectLifespanYears; year++) {
    const degradationFactor = Math.pow(1 - (annualDegradationPct / 100), year - 1);
    const inflationFactor = Math.pow(1 + (annualInflationPct / 100), year - 1);

    const yearProd = Math.round(annualProductionKWh * degradationFactor);
    const yearSavings = Math.round(year1SavingsUSD * degradationFactor * inflationFactor * 100) / 100;
    const yearTaxCredit = year <= 3 ? Math.round(annualTaxCredit * 100) / 100 : 0;

    const netCashFlow = Math.round((yearSavings + yearTaxCredit) * 100) / 100;
    annualNetCashFlows.push(netCashFlow);

    const prevCumulative = cumulativeCashFlow;
    cumulativeCashFlow = Math.round((cumulativeCashFlow + netCashFlow) * 100) / 100;

    if (!paybackFound && cumulativeCashFlow >= 0) {
      paybackFound = true;
      const fraction = Math.abs(prevCumulative) / netCashFlow;
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
  let npvUSD = -grossInvestmentUSD;
  for (let t = 0; t < annualNetCashFlows.length; t++) {
    npvUSD += annualNetCashFlows[t] / Math.pow(1 + discountRate, t + 1);
  }
  npvUSD = Math.round(npvUSD * 100) / 100;

  // IRR (TIR) Calculation
  const irrPct = calculateIRR(grossInvestmentUSD, annualNetCashFlows);

  // 25-Year ROI % Calculation
  const totalNetReturns = annualNetCashFlows.reduce((sum, cf) => sum + cf, 0);
  const roi25YrPct = grossInvestmentUSD > 0
    ? Math.round(((totalNetReturns - grossInvestmentUSD) / grossInvestmentUSD) * 10000) / 100
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
  };
}
