import React, { useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Download, Printer, ArrowLeft, Sun, CheckCircle2, Shield, Leaf, FileCheck, Layers } from 'lucide-react';
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

  const [showCover, setShowCover] = useState(true);
  const [showEnergy, setShowEnergy] = useState(true);
  const [showFinancials, setShowFinancials] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    if (window.electronAPI && window.electronAPI.printToPDF) {
      setIsExporting(true);
      try {
        await window.electronAPI.printToPDF();
      } catch (e) {
        console.error('Electron print error:', e);
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // Client-side fallback using html2canvas & jsPDF
    if (!pdfRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Propuesta_Solaris_${project.client.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 flex h-[calc(100vh-64px)] overflow-hidden bg-slate-200">
      {/* Side Toolbar (Document Settings) */}
      <aside className="w-[300px] bg-white border-r border-outline-variant/60 flex flex-col h-full shrink-0 shadow-md z-10">
        <div className="p-4 border-b border-outline-variant">
          <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider">Configuración del Documento</h2>
          <p className="text-xs text-secondary mt-0.5">Personaliza las secciones del informe exportable</p>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold text-secondary uppercase tracking-wider">Secciones Incluidas</h3>

            <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <span className="text-xs font-semibold text-on-surface">Portada Ejecutiva</span>
              <input
                type="checkbox"
                checked={showCover}
                onChange={(e) => setShowCover(e.target.checked)}
                className="rounded text-primary focus:ring-primary"
              />
            </label>

            <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <span className="text-xs font-semibold text-on-surface">Análisis Energético</span>
              <input
                type="checkbox"
                checked={showEnergy}
                onChange={(e) => setShowEnergy(e.target.checked)}
                className="rounded text-primary focus:ring-primary"
              />
            </label>

            <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <span className="text-xs font-semibold text-on-surface">Retorno Financiero y Ley 57-07</span>
              <input
                type="checkbox"
                checked={showFinancials}
                onChange={(e) => setShowFinancials(e.target.checked)}
                className="rounded text-primary focus:ring-primary"
              />
            </label>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="w-full py-2.5 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Generando PDF...' : 'Descargar PDF Vectorial'}
            </button>

            <button
              onClick={handlePrint}
              className="w-full py-2.5 bg-white border border-outline-variant text-on-surface font-semibold text-xs rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir Propuesta
            </button>
          </div>
        </div>
      </aside>

      {/* Printable PDF Canvas Area */}
      <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8">
        <div
          ref={pdfRef}
          className="w-[820px] bg-white shadow-2xl rounded-sm flex flex-col border border-slate-300 print:w-full print:shadow-none font-sans"
        >
          {/* Header */}
          <div className="px-10 py-8 border-b-2 border-emerald-700 flex justify-between items-start bg-slate-50/40">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sun className="w-6 h-6 text-primary" />
                <span className="text-xl font-bold text-primary tracking-tight">Solaris Pro</span>
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">Propuesta Comercial Fotovoltaica</h1>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Proyecto ID: {project.client.projectId} | Fecha: {new Date().toLocaleDateString('es-DO')}
              </p>
            </div>

            <div className="text-right">
              <div className="inline-block bg-primary/10 border border-primary/20 text-primary font-bold text-xs px-3 py-1.5 rounded-md mb-1">
                {project.client.name}
              </div>
              <p className="text-xs text-slate-600 font-medium">{project.client.province}, Rep. Dom.</p>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          {showCover && (
            <div className="p-10 border-b border-slate-200">
              <h2 className="text-base font-bold text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                <FileCheck className="w-5 h-5" /> Resumen Ejecutivo de la Propuesta
              </h2>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Capacidad Instalada</span>
                  <span className="text-lg font-bold font-mono text-primary">{summary.systemCapacityKWp} kWp</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Generación Anual</span>
                  <span className="text-lg font-bold font-mono text-slate-800">{summary.annualProductionKWh.toLocaleString()} kWh</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Inversión Neta (Ley 57-07)</span>
                  <span className="text-lg font-bold font-mono text-emerald-700">${summary.netInvestmentUSD.toLocaleString()} USD</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Retorno de Inversión</span>
                  <span className="text-lg font-bold font-mono text-primary">{summary.paybackYears} años (TIR {summary.irrPct}%)</span>
                </div>
              </div>

              {/* Hardware Summary */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-lg p-4 text-xs text-emerald-950">
                <h4 className="font-bold text-emerald-900 mb-2 uppercase tracking-wide">Especificaciones Técnicas del Sistema</h4>
                <div className="grid grid-cols-3 gap-2 font-medium">
                  <div>• Paneles: {project.specs.panelCount} módulos ({project.specs.panelPowerW}W)</div>
                  <div>• Inversor: {project.specs.inverterPowerKW} kW AC</div>
                  <div>• Baterías: {project.specs.hasBattery ? `${project.specs.batteryCapacityKWh} kWh Storage` : 'No incluye'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Monthly Energy Balance */}
          {showEnergy && (
            <div className="p-10 border-b border-slate-200">
              <h2 className="text-base font-bold text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5" /> Balance Mensual de Producción y Consumo
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse border border-slate-200">
                  <thead className="bg-slate-100 font-bold text-slate-800 border-b border-slate-200">
                    <tr>
                      <th className="p-2 border-r border-slate-200">Mes</th>
                      <th className="p-2 text-right border-r border-slate-200">Consumo (kWh)</th>
                      <th className="p-2 text-right border-r border-slate-200">Producción (kWh)</th>
                      <th className="p-2 text-right border-r border-slate-200">Autoconsumo (kWh)</th>
                      <th className="p-2 text-right">Ahorro Estimado ($ USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {summary.monthlyBreakdown.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="p-2 border-r border-slate-200 font-semibold">{row.month}</td>
                        <td className="p-2 text-right border-r border-slate-200 font-mono">{row.consumptionKWh.toLocaleString()}</td>
                        <td className="p-2 text-right border-r border-slate-200 font-mono text-emerald-700 font-bold">{row.productionKWh.toLocaleString()}</td>
                        <td className="p-2 text-right border-r border-slate-200 font-mono">{row.solarSelfConsumedKWh.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono text-primary font-bold">${row.savingsUSD.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                      <td className="p-2 border-r border-slate-200">TOTAL ANUAL</td>
                      <td className="p-2 text-right border-r border-slate-200 font-mono">{summary.annualConsumptionKWh.toLocaleString()}</td>
                      <td className="p-2 text-right border-r border-slate-200 font-mono text-emerald-700">{summary.annualProductionKWh.toLocaleString()}</td>
                      <td className="p-2 text-right border-r border-slate-200 font-mono">--</td>
                      <td className="p-2 text-right font-mono text-primary">${summary.year1SavingsUSD.toLocaleString()} USD</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Section 3: Financial Return & Ley 57-07 */}
          {showFinancials && (
            <div className="p-10 space-y-6">
              <h2 className="text-base font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-5 h-5" /> Retorno Financiero e Incentivos Ley 57-07
              </h2>

              <div className="grid grid-cols-2 gap-6">
                {/* Tax Breakdown Box */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                  <h4 className="font-bold text-slate-900 border-b pb-1">Desglose Fiscal e Inversión</h4>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span>Inversión Bruta (Turnkey):</span>
                    <span className="font-mono font-bold">${summary.grossInvestmentUSD.toLocaleString()} USD</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 text-emerald-700">
                    <span>Ahorro Exoneración 100% ITBIS (18%):</span>
                    <span className="font-mono font-bold">-${summary.itbisSavedUSD.toLocaleString()} USD</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60 text-emerald-700">
                    <span>Crédito Fiscal 40% ISR (Ley 57-07):</span>
                    <span className="font-mono font-bold">-${summary.ley5707CreditUSD.toLocaleString()} USD</span>
                  </div>
                  <div className="flex justify-between py-1 pt-2 text-sm font-bold text-primary border-t border-slate-300">
                    <span>Inversión Neta Final:</span>
                    <span className="font-mono">${summary.netInvestmentUSD.toLocaleString()} USD</span>
                  </div>
                </div>

                {/* Financial KPIs Box */}
                <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-lg text-xs space-y-2">
                  <h4 className="font-bold text-emerald-900 border-b border-emerald-200 pb-1">Indicadores Financieros Clave</h4>
                  <div className="flex justify-between py-1 border-b border-emerald-200/60">
                    <span>Período de Payback:</span>
                    <span className="font-mono font-bold text-emerald-800">{summary.paybackYears} años</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-200/60">
                    <span>Tasa Interna de Retorno (TIR / IRR):</span>
                    <span className="font-mono font-bold text-emerald-800">{summary.irrPct}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-200/60">
                    <span>Valor Actual Neto (VAN / NPV @ 10%):</span>
                    <span className="font-mono font-bold text-emerald-800">${summary.npvUSD.toLocaleString()} USD</span>
                  </div>
                  <div className="flex justify-between py-1 pt-2 text-sm font-bold text-primary border-t border-emerald-300">
                    <span>ROI a 25 Años:</span>
                    <span className="font-mono">{summary.roi25YrPct}%</span>
                  </div>
                </div>
              </div>

              {/* Environmental Note */}
              <div className="p-4 bg-emerald-100/60 border border-emerald-300 rounded-lg flex items-center gap-4 text-xs text-emerald-950">
                <Leaf className="w-8 h-8 text-emerald-700 shrink-0" />
                <div>
                  <span className="font-bold block text-sm text-emerald-900">Impacto Ambiental Positivo</span>
                  Este sistema evita la emisión estimada de <span className="font-bold">{summary.co2AvoidedTonsPerYear} toneladas de CO₂</span> al año, equivalentes a plantar aproximadamente <span className="font-bold">{Math.round(summary.co2AvoidedTonsPerYear * 45)} árboles</span> maduros.
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="p-6 bg-slate-100 border-t border-slate-200 text-center text-[10px] text-slate-500 font-mono">
            Solaris Pro Engine v4.2 • Cumplimiento con Ley 57-07 y Res. SIE-007-2026-REG • Documento confidencial generado para {project.client.name}
          </div>
        </div>
      </main>
    </div>
  );
};
