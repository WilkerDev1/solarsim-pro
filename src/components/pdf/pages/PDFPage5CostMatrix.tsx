import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';

interface PDFPage5CostMatrixProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFPage5CostMatrix: React.FC<PDFPage5CostMatrixProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  return (
    <div className="pdf-page bg-white w-[850px] min-h-[1100px] shadow-2xl relative overflow-hidden flex flex-col font-sans shrink-0 border border-amber-300 print:shadow-none print:w-full print:min-h-screen">
      {/* Background Watermark */}
      <PDFWatermark
        opacity={project.customization?.watermarkOpacity ?? 0.15}
        customWatermarkBase64={project.customization?.watermarkLogoBase64}
      />

      {/* Page Header */}
      {showHeadersFooters && (
        <PDFHeaderBanner
          activeTheme={activeTheme}
          projectId={project.client.projectId}
          clientName={project.client.name}
          systemCapacityKWp={summary.systemCapacityKWp}
          location={project.client.province || project.client.location}
          currentDateStr={currentDateStr}
          pageTitle="ANÁLISIS DE COSTOS Y MARGEN DE GANANCIA (INFORMACIÓN CONFIDENCIAL)"
          customization={project.customization}
        />
      )}

      <div className="p-8 flex-1 flex flex-col justify-between space-y-6 relative z-10">
        <div className="space-y-5">
          {/* Banner Confidencial */}
          <div className="bg-amber-600 text-white p-4 rounded-xl flex justify-between items-center shadow-sm">
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-white">
                CLIENTE: {project.client.name} — Desglose de Costos de Proyecto
              </h3>
              <p className="text-[11px] text-amber-100 font-medium">
                Documento de Control Interno de Precios, ITBIS y Margen de Rentabilidad
              </p>
            </div>
            <div className="text-right text-xs font-bold text-amber-100">
              <div>
                Tasa Cambio: <span className="text-white font-extrabold">{summary.costMatrix.dopExchangeRate} DOP/USD</span>
              </div>
              <div>
                Factor Venta: <span className="text-white font-extrabold">{summary.costMatrix.saleMarginMultiplier}</span>
              </div>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Productos</th>
                  <th className="py-2.5 px-3 text-center text-red-600">kilos / Cap.</th>
                  <th className="py-2.5 px-3 text-center text-red-600">Cantidad</th>
                  <th className="py-2.5 px-3 text-right text-red-600">Precio Unit. USD</th>
                  <th className="py-2.5 px-3 text-right">Precio Unit. RD</th>
                  <th className="py-2.5 px-3 text-right font-bold">Precio Total RD</th>
                  <th className="py-2.5 px-3 text-right font-bold">Precio Total USD</th>
                  <th className="py-2.5 px-3 text-right text-red-600">ITBIS RD</th>
                  <th className="py-2.5 px-3 text-right text-red-600">ITBIS USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800 font-semibold text-xs">
                {summary.costMatrix.items.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{item.name}</td>
                    <td className="py-2.5 px-3 text-center text-red-600 font-bold">{item.kilos}</td>
                    <td className="py-2.5 px-3 text-center text-red-600 font-bold">{item.quantity}</td>
                    <td className="py-2.5 px-3 text-right text-red-600 font-bold">
                      ${item.unitPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      ${item.unitPriceDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      ${item.totalPriceDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      ${item.totalPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      {item.itbisDOP > 0 ? `$${item.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      {item.itbisUSD > 0 ? `$${item.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Box */}
          <div className="flex justify-end pt-2">
            <div className="w-[480px] bg-slate-50 border border-slate-300 rounded-xl p-4 space-y-1.5 text-xs font-semibold">
              <div className="flex justify-between text-slate-700">
                <span>Precio Neto :</span>
                <span>
                  RD$ {summary.costMatrix.precioNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong className="text-slate-900">${summary.costMatrix.precioNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>ITBIS Total :</span>
                <span>
                  RD$ {summary.costMatrix.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong className="text-slate-900">${summary.costMatrix.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold bg-slate-200/80 px-2.5 py-1 rounded">
                <span>Total Neto (Costo Total) :</span>
                <span>
                  RD$ {summary.costMatrix.totalNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong>${summary.costMatrix.totalNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <div className="flex justify-between text-red-600 font-extrabold bg-red-50 border border-red-200 px-2.5 py-1 rounded">
                <span>Porcentaje venta ({summary.costMatrix.saleMarginMultiplier}) :</span>
                <span>
                  RD$ {summary.costMatrix.porcentajeVentaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong>${summary.costMatrix.porcentajeVentaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <div className="flex justify-between text-slate-800">
                <span>Precio kilos costo :</span>
                <span>
                  RD$ {summary.costMatrix.precioKilosCostoDOP.toFixed(2)} &nbsp;|&nbsp;{' '}
                  <strong className="text-slate-900">
                    ${summary.costMatrix.precioKilosCostoUSD.toFixed(2)} USD/kWp (${summary.costMatrix.costPerWattUSD.toFixed(2)} USD/W)
                  </strong>
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold">
                <span>Precio kilos ventas :</span>
                <span>
                  RD$ {summary.costMatrix.precioKilosVentasDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong className="text-emerald-800">
                    ${summary.costMatrix.precioKilosVentasUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/kWp (${summary.costMatrix.salePricePerWattUSD.toFixed(2)} USD/W)
                  </strong>
                </span>
              </div>
              <div className="flex justify-between text-emerald-950 font-black bg-emerald-100 border border-emerald-300 px-2.5 py-1.5 rounded-lg text-sm mt-1">
                <span>Ganancia Proyectada :</span>
                <span>
                  RD$ {summary.costMatrix.gananciaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong className="text-emerald-800">
                    ${summary.costMatrix.gananciaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>
              </div>
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
    </div>
  );
};
