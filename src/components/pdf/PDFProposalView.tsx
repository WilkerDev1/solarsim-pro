import React, { useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ArrowLeft, Printer, Download, RefreshCw, Leaf, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

declare global {
  interface Window {
    electronAPI?: {
      printToPDF: () => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>;
    };
  }
}

export const PDFProposalView: React.FC = () => {
  const { getActiveProject, getFinancialSummary, setActiveView } = useSimulationStore();
  const project = getActiveProject();
  const summary = getFinancialSummary();
  const pdfRef = useRef<HTMLDivElement>(null);

  // Document Toggles
  const [showPage1, setShowPage1] = useState(true); // Análisis de Energía
  const [showPage2, setShowPage2] = useState(true); // Retorno de Inversión - Resumen
  const [showPage3, setShowPage3] = useState(true); // Flujo de Caja 25 Años
  const [showHeadersFooters, setShowHeadersFooters] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    if (!pdfRef.current) return;
    setIsExporting(true);

    try {
      const pageElements = pdfRef.current.querySelectorAll<HTMLElement>('.pdf-page');
      if (!pageElements || pageElements.length === 0) {
        setIsExporting(false);
        return;
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];

        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 1200,
        });

        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        if (i > 0) {
          pdf.addPage();
        }

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight));
      }

      pdf.save(`Propuesta_SolarSim_${project.client.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Error generating multi-page PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const currentDateStr = new Date().toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Calculate total pages for footer dynamically
  const activePagesCount = (showPage1 ? 1 : 0) + (showPage2 ? 1 : 0) + (showPage3 ? 1 : 0);
  let page1Num = 0;
  let page2Num = 0;
  let page3Num = 0;
  let currentNum = 0;

  if (showPage1) { currentNum++; page1Num = currentNum; }
  if (showPage2) { currentNum++; page2Num = currentNum; }
  if (showPage3) { currentNum++; page3Num = currentNum; }

  // Calculate equivalent trees planted (~16 trees per Ton CO2/yr)
  const treesPlanted = Math.round(summary.co2AvoidedTonsPerYear * 16);

  // Prepare data for Beneficio Acumulado chart (Year 0 to 25)
  const cf25 = summary.cashFlow25Years;
  const cumulativeChartData = [
    { yearLabel: '0', year: 0, cumulative: -summary.grossInvestmentUSD },
    ...cf25.map((c) => ({
      yearLabel: `${c.year}`,
      year: c.year,
      cumulative: c.cumulativeCashFlowUSD,
    })),
  ];

  // Totals for monthly energy table
  const totalConsumptionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const totalProductionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.productionKWh, 0);
  const totalSavingsKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.solarSelfConsumedKWh, 0);

  // Key milestones for Page 2
  const paybackYearObj = cf25.find((c) => c.year === Math.ceil(summary.paybackYears)) || cf25[2] || cf25[0];
  const year1Obj = cf25[0];
  const year10Obj = cf25[9] || cf25[0];
  const year25Obj = cf25[cf25.length - 1] || cf25[0];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-200">
      {/* Top Bar Navigation */}
      <header className="bg-white border-b border-slate-300 px-6 h-16 w-full flex justify-between items-center shrink-0 z-50 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveView('simulator')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer text-slate-600"
            title="Volver al Simulador"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="font-bold text-xl text-[#2D5A27] tracking-tight">SolarSim Pro</div>
          <div className="h-6 w-px bg-slate-300 mx-1"></div>
          <h1 className="text-xs font-semibold text-slate-600">
            {project.client.name} — Vista Previa de Propuesta PDF
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            Imprimir
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-[#2D5A27] text-white hover:bg-[#1f401b] rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Side Controls Toolbar */}
        <aside className="w-[280px] bg-white border-r border-slate-300 flex flex-col h-full shrink-0 shadow-xs">
          <div className="p-4 border-b border-slate-200 bg-slate-50/60">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Configuración del Documento</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Seleccionar páginas visibles</p>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-5">
            <div className="space-y-3">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Contenido del PDF</h3>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <span className="text-xs font-semibold text-slate-800">Pág 1: Análisis de Energía</span>
                <input
                  type="checkbox"
                  checked={showPage1}
                  onChange={(e) => setShowPage1(e.target.checked)}
                  className="rounded text-[#2D5A27] focus:ring-[#2D5A27] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <span className="text-xs font-semibold text-slate-800">Pág 2: Retorno de Inversión</span>
                <input
                  type="checkbox"
                  checked={showPage2}
                  onChange={(e) => setShowPage2(e.target.checked)}
                  className="rounded text-[#2D5A27] focus:ring-[#2D5A27] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <span className="text-xs font-semibold text-slate-800">Pág 3: Flujo de Caja 25 Años</span>
                <input
                  type="checkbox"
                  checked={showPage3}
                  onChange={(e) => setShowPage3(e.target.checked)}
                  className="rounded text-[#2D5A27] focus:ring-[#2D5A27] cursor-pointer"
                />
              </label>
            </div>

            <div className="h-px w-full bg-slate-200"></div>

            <div className="space-y-3">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Opciones de Formato</h3>
              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <span className="text-xs font-semibold text-slate-800">Mostrar Encabezados y Pies</span>
                <input
                  type="checkbox"
                  checked={showHeadersFooters}
                  onChange={(e) => setShowHeadersFooters(e.target.checked)}
                  className="rounded text-[#2D5A27] focus:ring-[#2D5A27] cursor-pointer"
                />
              </label>
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <button
              onClick={() => {
                useSimulationStore.setState({ activeProjectId: project.id });
              }}
              className="w-full py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualizar Vista Previa
            </button>
          </div>
        </aside>

        {/* PDF Page Canvas */}
        <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8 bg-slate-300/80">
          <div ref={pdfRef} className="flex flex-col gap-8 print:gap-0">
            
            {/* ---------------------------------------------------- */}
            {/* PÁGINA 1: ANÁLISIS DE ENERGÍA */}
            {/* ---------------------------------------------------- */}
            {showPage1 && (
              <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative font-sans print:shadow-none print:w-full print:min-h-screen">
                {/* Header */}
                {showHeadersFooters && (
                  <div className="px-10 py-8 border-b border-gray-200 flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900 mb-1">Análisis de Energía</h1>
                      <p className="text-xs text-gray-500 font-mono">
                        Proyecto: {project.client.projectId} | Fecha: {currentDateStr}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 font-bold text-xs mb-1 uppercase tracking-wider">
                        {project.client.name}
                      </div>
                      <p className="text-xs text-gray-500 font-medium">{project.client.location}</p>
                    </div>
                  </div>
                )}

                {/* Body */}
                <div className="px-10 py-8 flex-1 flex flex-col gap-8">
                  {/* Chart Section */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <h2 className="text-lg font-semibold text-gray-800">
                        Evolución Mensual de Energía
                      </h2>
                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-[#14532d]"></span>
                          <span className="text-slate-700">Consumo (kWh)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-[#22c55e]"></span>
                          <span className="text-slate-700">Producción Solar (kWh)</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full bg-gray-50/70 border border-gray-200 rounded-xl p-4 h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={summary.monthlyBreakdown} margin={{ top: 20, right: 10, left: 0, bottom: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#475569' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#475569' }} />
                          <Tooltip formatter={(val: number) => [`${Math.round(val).toLocaleString()} kWh`, '']} />
                          
                          <Bar dataKey="consumptionKWh" name="Consumo (kWh)" fill="#14532d" radius={[3, 3, 0, 0]}>
                            <LabelList dataKey="consumptionKWh" position="top" style={{ fontSize: '8px', fill: '#14532d', fontWeight: 'bold' }} formatter={(val: number) => Math.round(val)} />
                          </Bar>
                          <Bar dataKey="productionKWh" name="Producción Solar (kWh)" fill="#22c55e" radius={[3, 3, 0, 0]}>
                            <LabelList dataKey="productionKWh" position="top" style={{ fontSize: '8px', fill: '#15803d', fontWeight: 'bold' }} formatter={(val: number) => Math.round(val)} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Table Section */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-2">
                      Resumen Mensual
                    </h2>
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-xs">
                      <table className="w-full text-xs text-left">
                        <thead className="text-white uppercase bg-[#14532d] font-bold">
                          <tr>
                            <th className="px-4 py-2.5">Mes</th>
                            <th className="px-4 py-2.5 text-right">Consumo (kWh)</th>
                            <th className="px-4 py-2.5 text-right">Producción (kWh)</th>
                            <th className="px-4 py-2.5 text-right">Ahorro Energ. (kWh)</th>
                            <th className="px-4 py-2.5 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 font-mono text-gray-700">
                          {summary.monthlyBreakdown.map((row, idx) => {
                            const monthCoverage = row.consumptionKWh > 0
                              ? Math.min(100, (row.productionKWh / row.consumptionKWh) * 100)
                              : 0;
                            return (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                                <td className="px-4 py-2 font-sans font-semibold text-gray-800">{row.month}</td>
                                <td className="px-4 py-2 text-right">{row.consumptionKWh.toLocaleString()}</td>
                                <td className="px-4 py-2 text-right font-medium">{row.productionKWh.toFixed(1)}</td>
                                <td className="px-4 py-2 text-right font-medium">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                                <td className="px-4 py-2 text-right text-[#15803d] font-bold">
                                  {monthCoverage.toFixed(2)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="font-bold bg-gray-100 text-gray-900 border-t-2 border-gray-300 font-mono text-xs">
                          <tr>
                            <td className="px-4 py-2.5 font-sans">TOTAL</td>
                            <td className="px-4 py-2.5 text-right">{totalConsumptionKWh.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right">{totalProductionKWh.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right">{totalSavingsKWh.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-[#14532d]">{summary.energyCoveragePct.toFixed(2)}%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Impact Section */}
                  <div className="mt-auto bg-green-50/80 border border-green-200 rounded-xl p-5 flex gap-4 items-center">
                    <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center text-green-700 shadow-xs shrink-0">
                      <Leaf className="w-6 h-6" />
                    </div>
                    <div className="text-xs">
                      <h3 className="text-green-900 font-bold text-sm mb-0.5">Impacto Ambiental</h3>
                      <p className="text-green-800">
                        Reducción estimada de CO₂: <span className="font-bold">{summary.co2AvoidedTonsPerYear} Toneladas/año</span>. Esto equivale a plantar aproximadamente <span className="font-bold">{treesPlanted} árboles</span> anuales.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                {showHeadersFooters && (
                  <div className="px-10 py-5 border-t border-gray-200 flex justify-between items-center text-xs text-gray-400 mt-auto">
                    <span>Generado por SolarSim Pro</span>
                    <span>Página {page1Num} de {activePagesCount}</span>
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* PÁGINA 2: RETORNO DE INVERSIÓN - RESUMEN */}
            {/* ---------------------------------------------------- */}
            {showPage2 && (
              <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative font-sans print:shadow-none print:w-full print:min-h-screen">
                {/* Header */}
                {showHeadersFooters && (
                  <div className="px-10 py-8 border-b border-gray-200 flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900 mb-1">Retorno de Inversión - Resumen</h1>
                      <p className="text-xs text-gray-500 font-mono">
                        Proyecto: {project.client.projectId} | Fecha: {currentDateStr}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 font-bold text-xs mb-1 uppercase tracking-wider">
                        {project.client.name}
                      </div>
                      <p className="text-xs text-gray-500 font-medium">{project.client.location}</p>
                    </div>
                  </div>
                )}

                {/* Body */}
                <div className="px-10 py-8 flex-1 flex flex-col gap-8">
                  {/* Financial Indicators Grid */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-2">
                      Indicadores Financieros
                    </h2>
                    <div className="grid grid-cols-5 gap-3">
                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Payback</p>
                        <p className="text-xl font-bold text-gray-900 font-mono">
                          {summary.paybackYears} <span className="text-xs font-medium text-gray-500">Años</span>
                        </p>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">TIR</p>
                        <p className="text-xl font-bold text-[#15803d] font-mono">{summary.irrPct}%</p>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">VAN (10%)</p>
                        <p className="text-base font-bold text-gray-900 font-mono">
                          ${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Ahorro 25 Años</p>
                        <p className="text-base font-bold text-green-700 font-mono">
                          ${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">ROI</p>
                        <p className="text-xl font-bold text-gray-900 font-mono">{summary.roi25YrPct}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Parameters Table */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-2">
                      Cálculo de Ahorro y Retorno de Inversión
                    </h2>
                    <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <tbody className="divide-y divide-gray-200 text-gray-700 font-mono">
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 font-sans font-semibold text-gray-800 w-1/2">Cliente</td>
                            <td className="px-4 py-2.5 text-right font-bold uppercase">{project.client.name}</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2.5 font-sans font-semibold text-gray-800">Potencia Instalada (kWp)</td>
                            <td className="px-4 py-2.5 text-right font-bold">{summary.systemCapacityKWp.toFixed(2)} kWp</td>
                          </tr>
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 font-sans font-semibold text-gray-800">Inversión Inicial</td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                              ${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2.5 font-sans font-semibold text-gray-800">Incentivo Fiscal Estimado (Ley 57-07)</td>
                            <td className="px-4 py-2.5 text-right font-bold text-green-700">
                              -${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 font-sans font-semibold text-gray-800">Inversión Neta</td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                              ${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Milestones Table */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-2">
                      Resumen de Ahorro Anual y Retorno de Inversión
                    </h2>
                    <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="text-white uppercase bg-[#14532d] font-bold">
                          <tr>
                            <th className="px-4 py-2.5">Año</th>
                            <th className="px-4 py-2.5 text-right">Ahorro Energético (USD)</th>
                            <th className="px-4 py-2.5 text-right">Beneficio Acumulado (USD)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-gray-700 font-mono">
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 font-sans font-medium">Año 1</td>
                            <td className="px-4 py-2.5 text-right">${year1Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right text-red-600 font-semibold">
                              ${year1Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="bg-emerald-50/70 border-y border-emerald-200 font-bold">
                            <td className="px-4 py-2.5 font-sans text-[#14532d]">Año {paybackYearObj.year} (Payback)</td>
                            <td className="px-4 py-2.5 text-right">${paybackYearObj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right text-green-700 font-bold">
                              ${paybackYearObj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 font-sans font-medium">Año 10</td>
                            <td className="px-4 py-2.5 text-right">${year10Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right text-green-700 font-semibold">
                              ${year10Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="font-bold">
                            <td className="px-4 py-2.5 font-sans">Año 25</td>
                            <td className="px-4 py-2.5 text-right">${year25Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right text-green-700 font-bold">
                              ${year25Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Accumulated Benefit Chart */}
                  <div className="space-y-3 mt-auto">
                    <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-2">
                      Beneficio Acumulado (25 Años)
                    </h2>
                    <div className="h-[220px] w-full bg-gray-50/70 border border-gray-200 rounded-xl p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="yearLabel" tick={{ fontSize: 9, fill: '#64748b' }} />
                          <YAxis
                            tick={{ fontSize: 9, fill: '#64748b' }}
                            tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                          />
                          <Tooltip formatter={(val: number) => [`$${val.toLocaleString()} USD`, 'Beneficio Acumulado']} />
                          <Bar dataKey="cumulative" radius={[2, 2, 0, 0]}>
                            {cumulativeChartData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.cumulative < 0 ? '#ef4444' : '#16a34a'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                {showHeadersFooters && (
                  <div className="px-10 py-5 border-t border-gray-200 flex justify-between items-center text-xs text-gray-400 mt-auto">
                    <span>Generado por SolarSim Pro</span>
                    <span>Página {page2Num} de {activePagesCount}</span>
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* PÁGINA 3: FLUJO DE CAJA Y BENEFICIOS ACUMULADOS (25 AÑOS) */}
            {/* ---------------------------------------------------- */}
            {showPage3 && (
              <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative font-sans print:shadow-none print:w-full print:min-h-screen">
                {/* Header */}
                {showHeadersFooters && (
                  <div className="px-10 py-6 border-b border-gray-200 flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900 mb-1">
                        Flujo de Caja y Beneficios Acumulados (25 Años)
                      </h1>
                      <p className="text-xs text-gray-500 font-mono">
                        Proyecto: {project.client.projectId} | Fecha: {currentDateStr}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 font-bold text-xs mb-1 uppercase tracking-wider">
                        {project.client.name}
                      </div>
                      <p className="text-xs text-gray-500 font-medium">{project.client.location}</p>
                    </div>
                  </div>
                )}

                {/* Body */}
                <div className="px-10 py-6 flex-1 flex flex-col justify-between gap-6">
                  {/* Detailed Cash Flow Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs text-xs flex-1 flex flex-col">
                    <table className="w-full text-left border-collapse flex-1">
                      <thead className="text-white bg-[#14532d] font-bold uppercase tracking-wider text-[11px] shrink-0">
                        <tr>
                          <th className="px-4 py-3 w-12 text-center">Año</th>
                          <th className="px-4 py-3 text-right">Energía Generada (kWh)</th>
                          <th className="px-4 py-3 text-right">Ahorro (USD)</th>
                          <th className="px-4 py-3 text-right">Incentivo (USD)</th>
                          <th className="px-4 py-3 text-right">Flujo de Caja (USD)</th>
                          <th className="px-4 py-3 text-right font-bold">Beneficio Acumulado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                        {/* Year 0 Row */}
                        <tr className="bg-red-50/70 text-red-700 font-bold">
                          <td className="px-4 py-2.5 text-center font-sans">0</td>
                          <td className="px-4 py-2.5 text-right text-slate-400">-</td>
                          <td className="px-4 py-2.5 text-right text-slate-400">-</td>
                          <td className="px-4 py-2.5 text-right text-slate-400">-</td>
                          <td className="px-4 py-2.5 text-right text-red-600">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right text-red-600 font-bold">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>

                        {/* Years 1 to 25 */}
                        {cf25.map((row) => {
                          const isPaybackYear = row.year === Math.ceil(summary.paybackYears);
                          const isCumulativeNegative = row.cumulativeCashFlowUSD < 0;

                          return (
                            <tr
                              key={row.year}
                              className={
                                isPaybackYear
                                  ? 'bg-emerald-50/90 font-bold text-[#14532d] border-y border-emerald-300'
                                  : row.year % 2 === 0
                                  ? 'bg-slate-50/60'
                                  : 'bg-white'
                              }
                            >
                              <td className="px-4 py-2 text-center font-sans font-semibold">{row.year}</td>
                              <td className="px-4 py-2 text-right">{row.productionKWh.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right">${row.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="px-4 py-2 text-right text-[#16a34a] font-medium">
                                {row.taxCreditUSD > 0 ? `$${row.taxCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
                              </td>
                              <td className="px-4 py-2 text-right font-medium">${row.netCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td
                                className={`px-4 py-2 text-right font-bold ${
                                  isCumulativeNegative ? 'text-red-600' : 'text-[#16a34a]'
                                }`}
                              >
                                {isCumulativeNegative ? '-' : ''}${Math.abs(row.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Restored Full Summary Indicators Box */}
                  <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 shrink-0">
                    <h3 className="text-slate-800 font-bold text-xs mb-3 border-b border-slate-200 pb-1.5 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#14532d]" /> Indicadores Financieros del Proyecto
                    </h3>
                    <div className="grid grid-cols-4 gap-y-3 gap-x-4 text-xs font-mono">
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-sans mb-0.5">Payback</p>
                        <p className="font-bold text-slate-900">{summary.paybackYears} años</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-sans mb-0.5">TIR</p>
                        <p className="font-bold text-[#16a34a]">{summary.irrPct}%</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-sans mb-0.5">VAN (10%)</p>
                        <p className="font-bold text-slate-900">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-sans mb-0.5">Ahorro Total 25 Años</p>
                        <p className="font-bold text-[#16a34a]">${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-sans mb-0.5">ROI Total</p>
                        <p className="font-bold text-[#16a34a]">{summary.roi25YrPct}%</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-sans mb-0.5">Reducción CO2</p>
                        <p className="font-bold text-slate-900">{(summary.co2AvoidedTonsPerYear * 25).toFixed(1)} Ton</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-sans mb-0.5">Precio por Watt</p>
                        <p className="font-bold text-slate-900">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD).toFixed(3)} USD/W</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-sans mb-0.5">Capacidad DC</p>
                        <p className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)} kWp</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                {showHeadersFooters && (
                  <div className="px-10 py-5 border-t border-gray-200 flex justify-between items-center text-xs text-gray-400 mt-auto">
                    <span>Generado por SolarSim Pro</span>
                    <span>Página {page3Num} de {activePagesCount}</span>
                  </div>
                )}
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
};
