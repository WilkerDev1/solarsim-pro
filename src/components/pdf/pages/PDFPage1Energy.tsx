import React from 'react';
import { Leaf } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
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
  pageNum: number;
  totalPages: number;
}

export const PDFPage1Energy: React.FC<PDFPage1EnergyProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const treesPlanted = Math.round(summary.co2AvoidedTonsPerYear * 16);
  const totalConsumptionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const totalProductionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.productionKWh, 0);
  const totalSavingsKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.solarSelfConsumedKWh, 0);

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

      {/* Body */}
      <div className="px-10 pt-3 pb-14 flex-1 flex flex-col gap-2.5 relative z-10 min-h-0">
        {/* Chart Section */}
        <div className="space-y-2">
          <div className="flex justify-between items-center border-b border-gray-100 pb-1.5">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              Evolución Mensual de Energía
            </h2>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: activeTheme.primary }}></span>
                <span className="text-slate-700">Consumo (kWh)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: activeTheme.barColor }}></span>
                <span className="text-slate-700">Producción Solar (kWh)</span>
              </div>
            </div>
          </div>

          <div className="w-full bg-gray-50/70 border border-gray-200 rounded-xl p-3 h-[255px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.monthlyBreakdown} margin={{ top: 20, right: 10, left: 0, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9.5, fill: '#475569', fontWeight: 'bold' }} />
                <YAxis tick={{ fontSize: 9.5, fill: '#475569', fontWeight: 'bold' }} />
                <Tooltip formatter={(val: number) => [`${Math.round(val).toLocaleString()} kWh`, '']} />

                <Bar dataKey="consumptionKWh" name="Consumo (kWh)" fill={activeTheme.primary} radius={[3, 3, 0, 0]}>
                  <LabelList
                    dataKey="consumptionKWh"
                    position="top"
                    style={{ fontSize: '8px', fill: activeTheme.primary, fontWeight: 'bold' }}
                    formatter={(val: number) => Math.round(val)}
                  />
                </Bar>
                <Bar dataKey="productionKWh" name="Producción Solar (kWh)" fill={activeTheme.barColor} radius={[3, 3, 0, 0]}>
                  <LabelList
                    dataKey="productionKWh"
                    position="top"
                    style={{ fontSize: '8px', fill: activeTheme.secondary, fontWeight: 'bold' }}
                    formatter={(val: number) => Math.round(val)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table Section */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1.5 uppercase tracking-wider">
            Resumen Mensual de Energía
          </h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left">
              <thead className="text-white uppercase font-bold text-[10.5px]" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-4 py-1.5">Mes</th>
                  <th className="px-4 py-1.5 text-right">Consumo (kWh)</th>
                  <th className="px-4 py-1.5 text-right">Producción (kWh)</th>
                  <th className="px-4 py-1.5 text-right">Ahorro Energ. (kWh)</th>
                  <th className="px-4 py-1.5 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-semibold text-gray-700 text-[11px]">
                {summary.monthlyBreakdown.map((row, idx) => {
                  const monthCoverage = row.consumptionKWh > 0
                    ? Math.min(100, (row.productionKWh / row.consumptionKWh) * 100)
                    : 0;
                  return (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                      <td className="px-4 py-1 font-bold text-gray-800">{row.month}</td>
                      <td className="px-4 py-1 text-right font-medium">{row.consumptionKWh.toLocaleString()}</td>
                      <td className="px-4 py-1 text-right font-medium">{row.productionKWh.toFixed(1)}</td>
                      <td className="px-4 py-1 text-right font-medium">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                      <td className="px-4 py-1 text-right font-bold" style={{ color: activeTheme.secondary }}>
                        {monthCoverage.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="font-bold bg-gray-100 text-gray-900 border-t-2 border-gray-300 text-xs">
                <tr>
                  <td className="px-4 py-1.5 uppercase font-extrabold">TOTAL</td>
                  <td className="px-4 py-1.5 text-right">{totalConsumptionKWh.toLocaleString()}</td>
                  <td className="px-4 py-1.5 text-right">{totalProductionKWh.toLocaleString()}</td>
                  <td className="px-4 py-1.5 text-right">{totalSavingsKWh.toLocaleString()}</td>
                  <td className="px-4 py-1.5 text-right font-extrabold" style={{ color: activeTheme.primary }}>
                    {summary.energyCoveragePct.toFixed(2)}%
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
