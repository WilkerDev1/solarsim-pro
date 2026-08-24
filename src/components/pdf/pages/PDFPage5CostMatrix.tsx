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
    <div className="pdf-page bg-white w-[850px] h-[1202px] min-h-[1202px] max-h-[1202px] shadow-2xl relative overflow-hidden flex flex-col font-sans shrink-0 border border-amber-300 print:shadow-none print:w-full print:min-h-screen">
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

      <div className="px-8 pt-3 pb-3 flex-1 flex flex-col justify-start gap-2.5 relative z-10 min-h-0">
        <div className="space-y-2.5">
          {/* Banner Confidencial */}
          <div className="bg-amber-600 text-white p-2.5 rounded-xl flex justify-between items-center shadow-sm">
            <div>
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-white">
                CLIENTE: {(project.client.name || 'Cliente').replace(/\s*\((?:Copia|Copia Importada|COPIA|V\d+|C\d+)\)\s*/gi, '').trim()} — Desglose de Costos de Proyecto
              </h3>
              <p className="text-[10px] text-amber-100 font-medium">
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
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 uppercase text-[9px]">
                <tr>
                  <th className="py-1 px-2">Productos</th>
                  <th className="py-1 px-1.5 text-center text-red-600">kilos / Cap.</th>
                  <th className="py-1 px-1.5 text-center text-red-600">Cantidad</th>
                  <th className="py-1 px-2 text-right text-red-600">Precio Unit. USD</th>
                  <th className="py-1 px-2 text-right">Precio Unit. RD</th>
                  <th className="py-1 px-2 text-right font-bold">Precio Total RD</th>
                  <th className="py-1 px-2 text-right font-bold">Precio Total USD</th>
                  <th className="py-1 px-1.5 text-right text-red-600">ITBIS RD</th>
                  <th className="py-1 px-1.5 text-right text-red-600">ITBIS USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800 font-semibold text-[10px]">
                {summary.costMatrix.items.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="py-1 px-2 font-bold text-slate-900">{item.name}</td>
                    <td className="py-1 px-1.5 text-center text-red-600 font-bold">{item.kilos}</td>
                    <td className="py-1 px-1.5 text-center text-red-600 font-bold">{item.quantity}</td>
                    <td className="py-1 px-2 text-right text-red-600 font-bold">
                      ${item.unitPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-1 px-2 text-right">
                      ${item.unitPriceDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-1 px-2 text-right font-bold">
                      ${item.totalPriceDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-1 px-2 text-right font-bold">
                      ${item.totalPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-1 px-1.5 text-right text-slate-500">
                      {item.itbisDOP > 0 ? `$${item.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="py-1 px-1.5 text-right text-slate-500">
                      {item.itbisUSD > 0 ? `$${item.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resumen Final de Rentabilidad */}
          <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-0.5">
              <div className="flex justify-between text-slate-700 text-[10.5px]">
                <span>Precio Neto :</span>
                <span>
                  RD$ {summary.costMatrix.precioNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong className="text-slate-900">${summary.costMatrix.precioNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <div className="flex justify-between text-slate-700 text-[10.5px]">
                <span>ITBIS Total :</span>
                <span>
                  RD$ {summary.costMatrix.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong className="text-slate-900">${summary.costMatrix.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold bg-slate-200/80 px-2 py-0.5 rounded text-[10.5px]">
                <span>Total Neto (Costo Total) :</span>
                <span>
                  RD$ {summary.costMatrix.totalNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong>${summary.costMatrix.totalNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <div className="flex justify-between text-red-600 font-extrabold bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[10.5px]">
                <span>Porcentaje venta ({summary.costMatrix.saleMarginMultiplier}) :</span>
                <span>
                  RD$ {summary.costMatrix.porcentajeVentaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong>${summary.costMatrix.porcentajeVentaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2 space-y-0.5">
              <div className="flex justify-between text-slate-700 text-[10.5px]">
                <span>Precio kilos costo :</span>
                <span>
                  RD$ {summary.costMatrix.precioKilosCostoDOP.toFixed(2)} &nbsp;|&nbsp;{' '}
                  <strong className="text-slate-900">
                    ${summary.costMatrix.precioKilosCostoUSD.toFixed(2)} USD/kWp (${summary.costMatrix.costPerWattUSD.toFixed(2)} USD/W)
                  </strong>
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold text-[10.5px]">
                <span>Precio kilos ventas :</span>
                <span>
                  RD$ {summary.costMatrix.precioKilosVentasDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp;{' '}
                  <strong className="text-emerald-800">
                    ${summary.costMatrix.precioKilosVentasUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/kWp (${(summary.costMatrix.salePricePerWattUSD || 0).toFixed(2)} USD/W)
                  </strong>
                </span>
              </div>
              <div className="flex justify-between items-center text-amber-950 font-bold bg-amber-100/70 border border-amber-300/80 px-2 py-0.5 rounded text-[10px]">
                <span>Margen Rentabilidad :</span>
                <span>
                  +{summary.costMatrix.markupOnCostPct !== undefined ? summary.costMatrix.markupOnCostPct.toFixed(1) : ((summary.costMatrix.saleMarginMultiplier - 1) * 100).toFixed(1)}% s/costo (Markup) &nbsp;|&nbsp;{' '}
                  {summary.costMatrix.marginOnSalePct !== undefined ? summary.costMatrix.marginOnSalePct.toFixed(1) : ((summary.costMatrix.gananciaUSD / (summary.costMatrix.porcentajeVentaUSD || 1)) * 100).toFixed(1)}% s/venta
                </span>
              </div>
              <div className="flex justify-between text-emerald-950 font-black bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg text-xs mt-0.5">
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
