import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import {
  getProjectPanels,
  getProjectInverters,
  getProjectBatteries,
  formatInvertersSummary,
  formatPanelsSummary,
  formatBatteriesSummary,
  calculateTotalInverterPowerKW,
  calculateTotalBatteryCapacityKWh,
} from '../../../utils/equipmentSpecsUtils';

interface PDFExecutiveSummaryPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFExecutiveSummaryPage: React.FC<PDFExecutiveSummaryPageProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
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
  const totalBatteryKWh = calculateTotalBatteryCapacityKWh(project.specs);
  const batteriesSummary = formatBatteriesSummary(project.specs);

  // --- 3. Datos Comerciales & Divisas ---
  const grossInvestmentUSD = summary.grossInvestmentUSD || 0;
  const costPerWattUSD =
    systemCapacityKWp > 0 ? grossInvestmentUSD / (systemCapacityKWp * 1000) : project.specs.pricePerWattUSD || 0;
  const exchangeRate = project.rates.usdExchangeRate || project.specs.dopExchangeRate || 60.0;
  const tariffUSD = project.rates.energyCostPerKWh || 0.18;
  const tariffDOP = tariffUSD * exchangeRate;
  const tariffCode = project.rates.tariffCode || 'BTS2';

  // --- 4. Datos Ley 57-07 ---
  const isLeyEligible = project.financials.applyLey5707 !== false;
  const leyCreditUSD = isLeyEligible ? summary.ley5707CreditUSD || 0 : 0;
  // Base de equipos computables estimada
  const equipmentCostEst = leyCreditUSD > 0 ? leyCreditUSD / 0.4 : grossInvestmentUSD * 0.4;
  const equipmentPct =
    grossInvestmentUSD > 0 ? Math.min(100, Math.max(10, Math.round((equipmentCostEst / grossInvestmentUSD) * 100))) : 40;

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

  return (
    <div className="pdf-page w-[850px] h-[1202px] min-h-[1202px] max-h-[1202px] bg-white shadow-xl flex flex-col shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
      {/* Marca de agua institucional */}
      <PDFWatermark
        opacity={project.customization?.watermarkOpacity ?? 0.15}
        customWatermarkBase64={project.customization?.watermarkLogoBase64}
      />

      {/* Encabezado Superior Oficial */}
      {showHeadersFooters && (
        <PDFHeaderBanner
          activeTheme={activeTheme}
          projectId={project.client.projectId}
          clientName={project.client.name}
          systemCapacityKWp={summary.systemCapacityKWp}
          location={project.client.province || project.client.location}
          currentDateStr={currentDateStr}
          pageTitle="CUADRO RESUMEN DE INVERSIÓN Y RETORNO"
          customization={project.customization}
        />
      )}

      {/* Contenido Principal de la Página */}
      <div className="px-9 py-6 flex-1 flex flex-col justify-between relative z-10 min-h-0">
        {/* Cabecera del Cuadro Ejecutivo */}
        <div className="border-b border-slate-200 pb-3">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Cuadro Resumen de Inversión y Retorno
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Pipeline ejecutivo del dimensionamiento fotovoltaico, balance económico y marco de la Ley 57-07.
          </p>
        </div>

        {/* 6 FILAS DE PIPELINE HORIZONTAL STREAMLINE */}
        <div className="space-y-4 flex-1 flex flex-col justify-center py-3">
          {/* FILA 01: GENERADOR FOTOVOLTAICO */}
          <article
            className="bg-white border border-slate-200 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5 border-l-4"
            style={{ borderLeftColor: activeTheme.primary }}
          >
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div
                className="w-10 h-10 flex items-center justify-center font-mono font-black text-sm shrink-0 border"
                style={{
                  backgroundColor: `${activeTheme.primary}15`,
                  borderColor: `${activeTheme.primary}35`,
                  color: activeTheme.primary,
                }}
              >
                01
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
                  CAPACIDAD Y MÓDULOS
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5 flex-1 border-l border-slate-200 pl-4">
              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block">Capacidad Panel</span>
                <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">
                  {primaryPanel.powerW} Wp
                </span>
                <span className="text-[10px] text-slate-500 font-medium block truncate" title={primaryPanel.brandModel}>
                  {primaryPanel.brandModel ? primaryPanel.brandModel.replace(/^m[oó]dulo\s+/i, '') : 'Tier-1 Monocristalino'}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block">Cantidad Paneles</span>
                <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">
                  {totalPanels} Unidades
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">Superficie optimizada</span>
              </div>

              <div
                className="p-2.5 border"
                style={{
                  backgroundColor: `${activeTheme.primary}10`,
                  borderColor: `${activeTheme.primary}35`,
                }}
              >
                <span className="text-[10.5px] font-bold block" style={{ color: activeTheme.primary }}>
                  Potencia a Instalar
                </span>
                <span className="text-base font-black font-mono block mt-0.5" style={{ color: activeTheme.primary }}>
                  {systemCapacityKWp.toFixed(3)}
                </span>
                <span className="text-[10px] font-extrabold block" style={{ color: activeTheme.primary }}>
                  kWp DC Total
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block">Eficiencia (PR)</span>
                <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">
                  {performanceRatio}%
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">Performance Ratio</span>
              </div>
            </div>
          </article>

          {/* FILA 02: CONVERSIÓN Y POTENCIA AC */}
          <article
            className="bg-white border border-slate-200 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5 border-l-4"
            style={{ borderLeftColor: activeTheme.secondary || activeTheme.primary }}
          >
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div
                className="w-10 h-10 flex items-center justify-center font-mono font-black text-sm shrink-0 border"
                style={{
                  backgroundColor: `${activeTheme.secondary || activeTheme.primary}15`,
                  borderColor: `${activeTheme.secondary || activeTheme.primary}35`,
                  color: activeTheme.secondary || activeTheme.primary,
                }}
              >
                02
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
                  INVERSORES & CONEXIÓN
                </h3>
              </div>
            </div>

            <div className={`grid ${hasBattery ? 'grid-cols-3' : 'grid-cols-2'} gap-2.5 flex-1 border-l border-slate-200 pl-4`}>
              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block">Inversores kW/AC</span>
                <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">
                  {totalInverterPowerKW > 0 ? `${totalInverterPowerKW} kW AC` : `${systemCapacityKWp.toFixed(1)} kW AC`}
                </span>
                <span className="text-[10px] text-slate-500 font-medium block truncate" title={invertersSummary}>
                  {invertersSummary || 'Potencia nominal AC sincronizada'}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block">Régimen de Inyección</span>
                <span className="text-sm font-black text-slate-900 block mt-0.5">
                  {isZeroExport ? 'Inyección Cero (Zero Export)' : 'Suministro Bidireccional'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">
                  {project.rates.distributor || 'Distribuidora'} • Reglamentación SIE
                </span>
              </div>

              {hasBattery && (
                <div className="bg-slate-50 p-2.5 border border-slate-200">
                  <span className="text-[10.5px] text-slate-500 font-bold block">Almacenamiento BESS</span>
                  <span className="text-sm font-black text-emerald-700 font-mono block mt-0.5">
                    {totalBatteryKWh} kWh LiFePO4
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium block truncate" title={batteriesSummary}>
                    {batteriesSummary}
                  </span>
                </div>
              )}
            </div>
          </article>

          {/* FILA 03: INVERSIÓN BRUTA Y PARÁMETROS COMERCIALES (DARK CARD) */}
          <article className="bg-slate-900 border border-slate-800 border-l-4 border-l-amber-500 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5 text-white">
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div className="w-10 h-10 bg-amber-500 text-slate-950 flex items-center justify-center font-mono font-black text-sm shrink-0">
                03
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wide leading-tight">
                  INVERSIÓN BRUTA
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2.5 flex-1 border-l border-slate-800 pl-4">
              <div className="bg-slate-800/90 p-2.5 border border-slate-700">
                <span className="text-[10.5px] text-slate-400 font-medium block">Precio por Watt</span>
                <span className="text-sm font-black text-amber-400 font-mono block mt-0.5">
                  ${costPerWattUSD.toFixed(2)} USD
                </span>
                <span className="text-[10px] text-slate-400 block">Por Watt instalado</span>
              </div>

              <div className="bg-slate-800/90 p-2.5 border border-slate-700">
                <span className="text-[10.5px] text-slate-400 font-medium block">Tasa RD$ / USD</span>
                <span className="text-sm font-black text-white font-mono block mt-0.5">
                  {exchangeRate.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400 block">Tasa de cambio ref.</span>
              </div>

              <div className="bg-slate-800/90 p-2.5 border border-slate-700">
                <span className="text-[10.5px] text-slate-400 font-medium block">Precio kWh Tarifa</span>
                <span className="text-sm font-black text-white font-mono block mt-0.5">
                  RD$ {tariffDOP.toFixed(2)}
                </span>
                <span className="text-[10px] text-emerald-400 block font-semibold">Tarifa {tariffCode}</span>
              </div>

              <div className="bg-amber-500 p-2.5 border border-amber-400 flex flex-col justify-center text-slate-950">
                <span className="text-[10.5px] text-amber-950 font-bold block">Inversión Bruta USD</span>
                <span className="text-base font-black text-slate-950 font-mono leading-tight mt-0.5">
                  ${grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9.5px] text-amber-950 font-semibold block mt-0.5">Total antes de ley</span>
              </div>
            </div>
          </article>

          {/* FILA 04: INCENTIVOS FISCALES LEY 57-07 */}
          <article className="bg-emerald-50/30 border border-slate-200 border-l-4 border-l-emerald-600 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div className="w-10 h-10 bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center font-mono font-black text-sm shrink-0">
                04
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
                  INCENTIVO FISCAL
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 flex-1 border-l border-slate-200 pl-4">
              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block">Aplica a la Ley</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2.5 h-2.5 rounded-none bg-emerald-600"></span>
                  <span className="text-xs font-extrabold text-emerald-800 uppercase tracking-wide">
                    {isLeyEligible ? 'SÍ (ELEGIBLE 100%)' : 'NO APLICADO'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium block mt-0.5">Exención ITBIS y aranceles</span>
              </div>

              <div className="bg-slate-50 p-2.5 border border-slate-200">
                <span className="text-[10.5px] text-slate-500 font-bold block">Porcentaje Equipos</span>
                <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">
                  {equipmentPct}%
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">Base computable deducible</span>
              </div>

              <div className="bg-emerald-100/90 p-2.5 border border-emerald-300 flex flex-col justify-center">
                <span className="text-[10.5px] text-emerald-950 font-bold block">Beneficio Ley 57-07</span>
                <span className="text-base font-black text-emerald-800 font-mono leading-tight mt-0.5">
                  -${leyCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
                <span className="text-[9.5px] text-emerald-700 font-bold block mt-0.5">Deducción directa ISR (40%)</span>
              </div>
            </div>
          </article>

          {/* FILA 05: INVERSIÓN NETA FINAL (DIFERENCIA) */}
          <article
            className="text-white rounded-none p-5 shadow-md border-l-4 border-slate-800 flex items-center justify-between gap-4"
            style={{
              backgroundColor: activeTheme.primary,
              borderLeftColor: activeTheme.secondary || '#38bdf8',
            }}
          >
            <div className="flex items-center gap-3.5 min-w-[240px]">
              <div className="w-11 h-11 rounded-none bg-black/25 text-white flex items-center justify-center font-mono font-black text-base shrink-0 shadow-2xs">
                05
              </div>
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-wide leading-tight">
                  DIFERENCIA (INVERSIÓN NETA)
                </h2>
                <p className="text-xs font-mono text-blue-100 mt-1">
                  ${grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bruto - $
                  {leyCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Beneficio Ley 57-07
                </p>
              </div>
            </div>

            <div className="flex-1 border-l border-white/25 pl-6 flex items-center justify-end gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl lg:text-5xl font-black tracking-tight font-mono text-white">
                  ${netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-lg font-bold font-mono text-white/90">USD</span>
              </div>
            </div>
          </article>

          {/* FILA 06: RETORNO DE INVERSIÓN (PAYBACK) */}
          <article className="bg-white border border-slate-200 border-l-4 border-l-amber-500 rounded-none p-4 shadow-2xs flex items-center justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-[220px]">
              <div className="w-10 h-10 bg-amber-500 text-white flex items-center justify-center font-mono font-black text-sm shrink-0">
                06
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide leading-tight">
                  RETORNO DE INVERSIÓN
                </h3>
              </div>
            </div>

            <div className="flex-1 border-l border-slate-200 pl-4 flex items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-amber-600 tracking-tight font-mono leading-none">
                    {paybackText}
                  </span>
                  <span className="text-xs font-bold text-slate-500 font-mono">
                    ({totalPaybackMonths} meses)
                  </span>
                </div>

                {/* Barra de amortización lineal */}
                <div className="flex items-center gap-2.5 pt-0.5">
                  <div className="w-64 h-3 bg-slate-200 overflow-hidden flex border border-slate-300">
                    <div
                      className="bg-amber-500 h-full transition-all"
                      style={{ width: `${paybackPct}%` }}
                      title={`Retorno de inversión: ${paybackText}`}
                    ></div>
                    <div
                      className="bg-emerald-600 h-full transition-all"
                      style={{ width: `${freePct}%` }}
                      title={`Generación neta libre de costo: ${freeYears} años`}
                    ></div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-600 font-bold">
                    {paybackPct}% inversión / {freePct}% libre
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-none text-xs font-semibold text-slate-700">
                <span className="w-2.5 h-2.5 bg-amber-500 shrink-0"></span>
                <span>
                  Vida útil garantizada: <strong className="text-slate-950 font-bold">25 años</strong> ({freeYears}+ años de ganancia neta)
                </span>
              </div>
            </div>
          </article>
        </div>

        {/* Nota Institucional Inferior */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[9.5px] text-slate-500 font-mono">
          <span>
            * Estimación calculada conforme al marco regulatorio dominicano, Resolución SIE-007 y Ley 57-07.
          </span>
          <span className="font-semibold text-slate-600">
            Régimen de Medición Neta • Certificación CNE / SIE
          </span>
        </div>
      </div>

      {/* Pie de página Oficial */}
      {showHeadersFooters && (
        <PDFFooter
          pageNum={pageNum}
          totalPages={totalPages}
          customization={project.customization}
        />
      )}
    </div>
  );
};
