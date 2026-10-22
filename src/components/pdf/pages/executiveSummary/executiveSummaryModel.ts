import type { FinancialSummaryResult, ProjectSimulation } from '../../../../types';
import {
  getProjectPanels,
  getProjectInverters,
  getProjectBatteries,
  formatInvertersSummary,
  formatBatteriesSummary,
  calculateTotalInverterPowerKW,
  calculateTotalBatteryCapacityKWh,
} from '../../../../utils/equipmentSpecsUtils';

export /**
 * Truncates and formats equipment labels cleanly to fit small PDF summary boxes.
 * Removes redundant type names, trailing capacity repetitions, and safely limits
 * string length to avoid Chromium's print-to-pdf ellipsis clipping bug.
 */
function formatShortEquipmentLabel(model: string, count?: number, maxChars = 20): string {
  if (!model) return '';
  // 1. Remove prefixes like "Módulos", "Inversor(es)", "Batería(s)"
  let clean = model
    .replace(/^(?:m[oó]dulos?|inversor(?:es)?|bater[ií]as?)\s+/i, '')
    .trim();

  // 2. Remove duplicate trailing specs in parentheses like "(630W)", "(8.0Kw)", "(16.08kWh)", "(16 KwH-48 Vdc)"
  clean = clean.replace(/\s*\([^)]*(?:w|kw|kwh|vdc|v)[^)]*\)\s*$/i, '').trim();

  // 3. Prepend count if provided
  const prefix = count && count > 0 ? `${count} ` : '';
  const full = `${prefix}${clean}`;

  if (full.length <= maxChars) {
    return full;
  }
  return `${full.slice(0, maxChars - 1).trim()}…`;
}

/** Cifras del cuadro resumen ejecutivo, calculadas una vez para todas sus filas. */
export function executiveSummaryModel(project: ProjectSimulation, summary: FinancialSummaryResult) {
  // --- 1. Datos Generador FV ---
  const panels = getProjectPanels(project.specs);
  const primaryPanel = panels[0] || { powerW: 620, brandModel: 'Módulo Tier-1' };
  const totalPanels = panels.reduce((sum, p) => sum + (p.count || 0), 0);
  const systemCapacityKWp = summary.systemCapacityKWp || 0;
  const lossesPercent = project.specs.systemLosses ?? 25;
  const performanceRatio = Math.max(10, Math.round(100 - lossesPercent));

  // --- 2. Datos Conversión AC ---
  const inverters = getProjectInverters(project.specs);
  const totalInverterPowerKW = calculateTotalInverterPowerKW(project.specs);
  const invertersSummary = formatInvertersSummary(project.specs);
  const isZeroExport = project.rates.isZeroExport || false;
  const hasBattery = project.specs.hasBattery && calculateTotalBatteryCapacityKWh(project.specs) > 0;
  const batteries = getProjectBatteries(project.specs);
  const totalBatteryKWh = calculateTotalBatteryCapacityKWh(project.specs);
  const batteriesSummary = formatBatteriesSummary(project.specs);

  // --- 3. Datos Comerciales & Divisas ---
  const grossInvestmentUSD = summary.grossInvestmentUSD || 0;
  const totalBeforeLeyUSD =
    grossInvestmentUSD + (project.financials.applyITBISExemption ? summary.itbisSavedUSD || 0 : 0);
  const costPerWattUSD =
    systemCapacityKWp > 0 ? grossInvestmentUSD / (systemCapacityKWp * 1000) : project.specs.pricePerWattUSD || 0;
  const exchangeRate = project.rates.usdExchangeRate || project.specs.dopExchangeRate || 60.0;
  const tariffUSD = project.rates.energyCostPerKWh || 0.18;
  const tariffDOP = tariffUSD * exchangeRate;
  const tariffCode = project.rates.tariffCode || 'BTS2';

  // --- 4. Datos Ley 57-07 ---
  const isLeyEligible = project.financials.applyLey5707 !== false;
  const leyCreditUSD = isLeyEligible ? summary.ley5707CreditUSD || 0 : 0;
  // Base de equipos computables (Ley 57-07) calculada por el motor
  const equipmentPct =
    grossInvestmentUSD > 0 ? Math.min(100, Math.max(10, Math.round((summary.equipmentPortionUSD / grossInvestmentUSD) * 100))) : 40;

  // --- 5. Inversión Neta Final ---
  const netInvestmentUSD = summary.netInvestmentUSD || grossInvestmentUSD - leyCreditUSD;

  // --- 6. Retorno de Inversión (Payback) ---
  const paybackYearsRaw = summary.paybackYears || 0;
  const totalPaybackMonths = Math.max(1, Math.round(paybackYearsRaw * 12));
  const paybackYearsInt = Math.floor(totalPaybackMonths / 12);
  const paybackMonthsInt = totalPaybackMonths % 12;
  const paybackText = `${paybackYearsInt} ${paybackYearsInt === 1 ? 'Año' : 'Años'}${
    paybackMonthsInt > 0 ? ` y ${paybackMonthsInt} ${paybackMonthsInt === 1 ? 'Mes' : 'Meses'}` : ''
  }`;

  // Amortización sobre 25 años de vida útil
  const paybackPct = Math.min(100, Math.max(2, Math.round((paybackYearsRaw / 25) * 100)));
  const freePct = Math.max(0, 100 - paybackPct);
  const freeYears = Math.max(0, Math.round(25 - paybackYearsRaw));

  return { panels, primaryPanel, totalPanels, systemCapacityKWp, lossesPercent, performanceRatio, inverters, totalInverterPowerKW, invertersSummary, isZeroExport, hasBattery, batteries, totalBatteryKWh, batteriesSummary, grossInvestmentUSD, totalBeforeLeyUSD, costPerWattUSD, exchangeRate, tariffUSD, tariffDOP, tariffCode, isLeyEligible, leyCreditUSD, equipmentPct, netInvestmentUSD, paybackYearsRaw, totalPaybackMonths, paybackYearsInt, paybackMonthsInt, paybackText, paybackPct, freePct, freeYears };
}

export type ExecutiveSummaryModel = ReturnType<typeof executiveSummaryModel>;
