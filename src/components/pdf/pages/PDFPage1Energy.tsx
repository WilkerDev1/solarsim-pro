import React from 'react';
import { Leaf } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';

interface PDFPage1EnergyProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum?: number;
  totalPages?: number;
  isEditMode?: boolean;
  updateDocumentCustomization?: (customization: Partial<DocumentCustomization>) => void;
  updateSpecs?: (specs: Partial<ProjectSimulation['specs']>) => void;
}

export const PDFPage1Energy: React.FC<PDFPage1EnergyProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum = 1,
  totalPages = 1,
  isEditMode,
  updateDocumentCustomization,
  updateSpecs,
}) => {
  const showSelfConsumption = project.customization?.showSelfConsumptionInProposal !== undefined
    ? project.customization.showSelfConsumptionInProposal
    : (project.specs?.showSelfConsumptionBreakdown !== false);
  const treesPlanted = Math.round(summary.co2AvoidedTonsPerYear * 16);
  const totalConsumptionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const totalProductionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.productionKWh, 0);
  const totalSelfConsumedKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.solarSelfConsumedKWh, 0);
  const totalExportedKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.gridExportedKWh, 0);
  const totalEffectiveSavedKWh = summary.monthlyBreakdown.reduce(
    (sum, m) => sum + (m.effectiveSavedKWh || (m.solarSelfConsumedKWh + (m.netExportCreditKWh || 0))),
    0
  );

  return (
    <div className="pdf-page w-[850px] h-[1202px] min-h-[1202px] max-h-[1202px] bg-white shadow-xl flex flex-col shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
      {/* Background Watermark */}
      <PDFWatermark
        opacity={project.customization?.watermarkOpacity ?? 0.15}
        customWatermarkBase64={project.customization?.watermarkLogoBase64}
      />

      {/* Header Banner */}
      {showHeadersFooters && (
        <PDFHeaderBanner
          activeTheme={activeTheme}
          projectId={project.client.projectId}
          clientName={project.client.name}
          systemCapacityKWp={summary.systemCapacityKWp}
          location={project.client.province || project.client.location}
          currentDateStr={currentDateStr}
          pageTitle="ANÁLISIS DE ENERGÍA Y CONSUMO"
          customization={project.customization}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col px-7 py-3 overflow-hidden">
        {/* Chart Section */}
        <div className="space-y-2 mb-3">
          <div className="flex justify-between items-center border-b border-gray-100 pb-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                Evolución Mensual de Energía
              </h2>
              {/* Interactive toggle on preview (hidden in print/export) */}
              <button
                type="button"
                onClick={() => {
                  const nextVal = !showSelfConsumption;
                  if (updateDocumentCustomization) {
                    updateDocumentCustomization({ showSelfConsumptionInProposal: nextVal });
                  }
                  if (updateSpecs) {
                    updateSpecs({ showSelfConsumptionBreakdown: nextVal });
                  }
                }}
                className={`print:hidden text-[9px] font-bold px-2 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-1 ${
                  showSelfConsumption
                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                    : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                }`}
                title="Alternar entre desglose con autoconsumo e inyección o formato clásico (solo consumo y producción)"
              >
                {showSelfConsumption ? '⚡ Autoconsumo: Visible' : '🏛️ Modo Clásico'}
              </button>
            </div>
            <div className="flex items-center gap-3.5 text-[11px] font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: activeTheme.primary }}></span>
                <span className="text-slate-700">Consumo (kWh)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: activeTheme.barColor }}></span>
                <span className="text-slate-700">Producción Solar (kWh)</span>
              </div>
              {showSelfConsumption && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-[#2563eb] rounded-full inline-block"></span>
                  <span className="w-2 h-2 rounded-full bg-[#2563eb] inline-block -ml-2.5"></span>
                  <span className="text-blue-700 font-bold ml-1">Autoconsumo en Sitio</span>
                </div>
              )}
            </div>
          </div>

          <div className="w-full bg-gray-50/70 border border-gray-200 rounded-xl p-3 h-[255px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={summary.monthlyBreakdown} margin={{ top: 20, right: 10, left: 0, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9.5, fill: '#475569', fontWeight: 'bold' }} />
                <YAxis tick={{ fontSize: 9.5, fill: '#475569', fontWeight: 'bold' }} />
                <Tooltip formatter={(val: number) => [`${Math.round(val).toLocaleString()} kWh`, '']} />

                <Bar dataKey="consumptionKWh" name="Consumo (kWh)" fill={activeTheme.primary} radius={[3, 3, 0, 0]}>
                  <LabelList
                    dataKey="consumptionKWh"
                    position="top"
                    style={{ fontSize: '7.5px', fill: activeTheme.primary, fontWeight: 'bold' }}
                    formatter={(val: number) => Math.round(val)}
                  />
                </Bar>
                <Bar dataKey="productionKWh" name="Producción Solar (kWh)" fill={activeTheme.barColor} radius={[3, 3, 0, 0]}>
                  <LabelList
                    dataKey="productionKWh"
                    position="top"
                    style={{ fontSize: '7.5px', fill: activeTheme.secondary, fontWeight: 'bold' }}
                    formatter={(val: number) => Math.round(val)}
                  />
                </Bar>
                {showSelfConsumption && (
                  <Line
                    type="monotone"
                    dataKey="solarSelfConsumedKWh"
                    name="Autoconsumo en Sitio (kWh)"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#2563eb', strokeWidth: 1, stroke: '#ffffff' }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table Section */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1.5 uppercase tracking-wider">
            Resumen Mensual de Energía & Balance de Ahorro
          </h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left">
              <thead className="text-white uppercase font-bold text-[10px]" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-3 py-1.5">Mes</th>
                  <th className="px-3 py-1.5 text-right">Consumo (kWh)</th>
                  <th className="px-3 py-1.5 text-right">Producción (kWh)</th>
                  {showSelfConsumption && (
                    <>
                      <th className="px-3 py-1.5 text-right">Autoconsumo (kWh)</th>
                      <th className="px-3 py-1.5 text-right">Inyección (kWh)</th>
                    </>
                  )}
                  <th className="px-3 py-1.5 text-right">Ahorro Fact. (kWh)</th>
                  <th className="px-3 py-1.5 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-semibold text-gray-700 text-[10.5px]">
                {summary.monthlyBreakdown.map((row, idx) => {
                  const monthCoverage = row.consumptionKWh > 0
                    ? (row.productionKWh / row.consumptionKWh) * 100
                    : 0;
                  return (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                      <td className="px-3 py-1 font-bold text-gray-800">{row.month}</td>
                      <td className="px-3 py-1 text-right font-medium">{row.consumptionKWh.toLocaleString()}</td>
                      <td className="px-3 py-1 text-right font-medium">{row.productionKWh.toFixed(1)}</td>
                      {showSelfConsumption && (
                        <>
                          <td className="px-3 py-1 text-right font-medium text-blue-800">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                          <td className="px-3 py-1 text-right font-medium text-gray-600">{row.gridExportedKWh.toFixed(1)}</td>
                        </>
                      )}
                      <td className="px-3 py-1 text-right font-bold text-emerald-800">
                        {(row.effectiveSavedKWh ?? (row.solarSelfConsumedKWh + (row.netExportCreditKWh || 0))).toFixed(1)}
                      </td>
                      <td className="px-3 py-1 text-right font-bold" style={{ color: activeTheme.secondary }}>
                        {monthCoverage.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="font-bold bg-gray-100 text-gray-900 border-t-2 border-gray-300 text-xs">
                <tr>
                  <td className="px-3 py-1.5 uppercase font-extrabold">TOTAL</td>
                  <td className="px-3 py-1.5 text-right">{totalConsumptionKWh.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right">{totalProductionKWh.toFixed(1)}</td>
                  {showSelfConsumption && (
                    <>
                      <td className="px-3 py-1.5 text-right text-blue-900">{totalSelfConsumedKWh.toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{totalExportedKWh.toFixed(1)}</td>
                    </>
                  )}
                  <td className="px-3 py-1.5 text-right font-extrabold text-emerald-900">{totalEffectiveSavedKWh.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right font-extrabold" style={{ color: activeTheme.primary }}>
                    {summary.energyCoveragePct.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Impact Section */}
        <div className={`mt-auto border rounded-xl p-3 flex gap-3.5 items-center ${activeTheme.accentLightBg} ${activeTheme.accentBorder}`}>
          <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-xs shrink-0" style={{ color: activeTheme.primary }}>
            <Leaf className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <h3 className="font-bold text-xs mb-0.5" style={{ color: activeTheme.primary }}>Impacto Ambiental</h3>
            <p className="text-slate-800 text-[11px]">
              Reducción estimada de CO₂: <span className="font-bold">{summary.co2AvoidedTonsPerYear} Toneladas/año</span>. Esto equivale a plantar aproximadamente <span className="font-bold">{treesPlanted} árboles</span> anuales.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
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
