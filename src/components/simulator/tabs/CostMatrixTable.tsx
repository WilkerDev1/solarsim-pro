import React from 'react';
import { Table2 } from 'lucide-react';
import { resolveSaleMarginMultiplier } from '../../../../shared/projectDefaults';
import type { FinancialSummaryResult, ProjectSimulation } from '../../../types';
import { costMatrixPerCapacity } from '../../pdf/pages/costMatrixPerCapacity';

export type CostTableCurrency = 'ALL' | 'USD' | 'DOP';

interface CostMatrixTableProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  currency: CostTableCurrency;
  onCurrencyChange: (currency: CostTableCurrency) => void;
}

/**
 * Tabla interna de costos e ingresos de la propuesta (réplica de la hoja de cálculo: productos, precios y totales en USD,
 * RD$ o ambos, margen y ganancia). Solo lee `summary.costMatrix`: la usan la pestaña de cotización del simulador y el
 * visor de solo lectura de la propuesta dentro del editor de cotizaciones. Cambiar la moneda es estado de quien la muestra.
 */
export const CostMatrixTable: React.FC<CostMatrixTableProps> = ({ project, summary, currency: costTableCurrency, onCurrencyChange: setCostTableCurrency }) => (
  /* TABLA DE COSTOS E INGRESOS INTERNOS (REPLICANDO HOJA DE CÁLCULO EXCEL) */
    <div className="bg-white border border-slate-300 rounded-2xl shadow-xl overflow-hidden font-sans shrink-0">
      {/* Header Orange Banner matching Excel */}
      <div className="bg-amber-600 text-white px-6 py-3.5 flex flex-wrap gap-3 justify-between items-center">
        <div className="flex items-center gap-3">
          <h3 className="font-extrabold text-sm uppercase tracking-wider text-white flex items-center gap-2">
            <Table2 className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            CLIENTE: {project.client.name} — Costos proyectos
          </h3>
          <span className="bg-amber-700/80 text-amber-100 text-[10px] px-2.5 py-0.5 rounded font-bold uppercase tracking-wider border border-amber-500/50">
            Uso Interno Confidencial
          </span>
        </div>

        {/* Selector de Moneda (USD / DOP / Dual) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-amber-800/60 p-0.5 rounded-lg border border-amber-400/40 shadow-inner">
            <button
              type="button"
              aria-pressed={costTableCurrency === 'USD'}
              onClick={() => setCostTableCurrency('USD')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all cursor-pointer ${
                costTableCurrency === 'USD'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-amber-100 hover:text-white hover:bg-amber-700/50'
              }`}
              title="Ver tabla y totales en Dólares Estadounidenses (USD)"
            >
              💵 USD ($)
            </button>
            <button
              type="button"
              aria-pressed={costTableCurrency === 'DOP'}
              onClick={() => setCostTableCurrency('DOP')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all cursor-pointer ${
                costTableCurrency === 'DOP'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-amber-100 hover:text-white hover:bg-amber-700/50'
              }`}
              title="Ver tabla y totales en Pesos Dominicanos (RD$)"
            >
              🇩🇴 DOP (RD$)
            </button>
            <button
              type="button"
              aria-pressed={costTableCurrency === 'ALL'}
              onClick={() => setCostTableCurrency('ALL')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all cursor-pointer ${
                costTableCurrency === 'ALL'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-amber-100 hover:text-white hover:bg-amber-700/50'
              }`}
              title="Ver desglose completo dual en ambas monedas"
            >
              🌐 Dual (Ambas)
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-bold text-amber-100 border-l border-amber-500/50 pl-3">
            <div>
              Tasa USD: <span className="text-white font-extrabold">{summary.costMatrix.dopExchangeRate} DOP</span>
            </div>
            <div>
              Factor Venta: <span className="text-white font-extrabold">{resolveSaleMarginMultiplier(summary.costMatrix.saleMarginMultiplier).toFixed(2)}x</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Table matching Excel columns and Currency Filter */}
        <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Productos</th>
                <th className="py-2.5 px-3 text-center text-red-600">KW</th>
                <th className="py-2.5 px-3 text-center text-red-600">Cantidad</th>
                
                {(costTableCurrency === 'USD' || costTableCurrency === 'ALL') && (
                  <th className="py-2.5 px-3 text-right text-red-600">Precio Unit. USD</th>
                )}
                {(costTableCurrency === 'DOP' || costTableCurrency === 'ALL') && (
                  <th className="py-2.5 px-3 text-right">Precio Unit. RD</th>
                )}
                {(costTableCurrency === 'DOP' || costTableCurrency === 'ALL') && (
                  <th className="py-2.5 px-3 text-right font-bold">Precio Total RD</th>
                )}
                {(costTableCurrency === 'USD' || costTableCurrency === 'ALL') && (
                  <th className="py-2.5 px-3 text-right font-bold">Precio Total USD</th>
                )}
                {(costTableCurrency === 'DOP' || costTableCurrency === 'ALL') && (
                  <th className="py-2.5 px-3 text-right text-red-600">ITBIS RD</th>
                )}
                {(costTableCurrency === 'USD' || costTableCurrency === 'ALL') && (
                  <th className="py-2.5 px-3 text-right text-red-600">ITBIS USD</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800 font-semibold text-xs">
              {summary.costMatrix.items.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="py-2.5 px-3 font-bold text-slate-900">{item.name}</td>
                  <td className="py-2.5 px-3 text-center text-red-600 font-bold">{item.kilos}</td>
                  <td className="py-2.5 px-3 text-center text-red-600 font-bold">{item.quantity}</td>
                  
                  {(costTableCurrency === 'USD' || costTableCurrency === 'ALL') && (
                    <td className="py-2.5 px-3 text-right text-red-600 font-bold">
                      ${item.unitPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  )}
                  {(costTableCurrency === 'DOP' || costTableCurrency === 'ALL') && (
                    <td className="py-2.5 px-3 text-right">
                      ${item.unitPriceDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  )}
                  {(costTableCurrency === 'DOP' || costTableCurrency === 'ALL') && (
                    <td className="py-2.5 px-3 text-right font-bold">
                      ${item.totalPriceDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  )}
                  {(costTableCurrency === 'USD' || costTableCurrency === 'ALL') && (
                    <td className="py-2.5 px-3 text-right font-bold">
                      ${item.totalPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  )}
                  {(costTableCurrency === 'DOP' || costTableCurrency === 'ALL') && (
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      {item.itbisDOP > 0 ? `$${item.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                  )}
                  {(costTableCurrency === 'USD' || costTableCurrency === 'ALL') && (
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      {item.itbisUSD > 0 ? `$${item.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Totals Box matching bottom right of Excel */}
        <div className="flex justify-end pt-2">
          <div className="w-full max-w-[500px] bg-slate-50 border border-slate-300 rounded-xl p-4 space-y-1.5 text-xs font-semibold shadow-xs">
            {/* Precio Neto */}
            <div className="flex justify-between text-slate-700">
              <span>Precio Neto :</span>
              <span>
                {costTableCurrency === 'USD' ? (
                  <strong className="text-slate-900">${summary.costMatrix.precioNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                ) : costTableCurrency === 'DOP' ? (
                  <strong className="text-slate-900">RD$ {summary.costMatrix.precioNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                ) : (
                  <>RD$ {summary.costMatrix.precioNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-slate-900">${summary.costMatrix.precioNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
                )}
              </span>
            </div>

            {/* ITBIS Total */}
            <div className="flex justify-between text-slate-700">
              <span>ITBIS Total :</span>
              <span>
                {costTableCurrency === 'USD' ? (
                  <strong className="text-slate-900">${summary.costMatrix.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                ) : costTableCurrency === 'DOP' ? (
                  <strong className="text-slate-900">RD$ {summary.costMatrix.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                ) : (
                  <>RD$ {summary.costMatrix.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-slate-900">${summary.costMatrix.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
                )}
              </span>
            </div>

            {/* Total Neto (Costo Total) */}
            <div className="flex justify-between text-slate-900 font-bold bg-slate-200/80 px-2.5 py-1 rounded">
              <span>Total Neto (Costo Total) :</span>
              <span>
                {costTableCurrency === 'USD' ? (
                  <strong>${summary.costMatrix.totalNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                ) : costTableCurrency === 'DOP' ? (
                  <strong>RD$ {summary.costMatrix.totalNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                ) : (
                  <>RD$ {summary.costMatrix.totalNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong>${summary.costMatrix.totalNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
                )}
              </span>
            </div>

            {/* Porcentaje de Venta (Lista vs Descuento vs Final) */}
            {(summary.costMatrix.totalDiscountUSD || 0) > 0 ? (
              <>
                <div className="flex justify-between text-slate-700">
                  <span>Precio de Lista (antes de desc.) :</span>
                  <span>
                    {costTableCurrency === 'USD' ? (
                      <strong className="text-slate-900">${(summary.costMatrix.listPorcentajeVentaUSD || summary.costMatrix.porcentajeVentaUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                    ) : costTableCurrency === 'DOP' ? (
                      <strong className="text-slate-900">RD$ {(summary.costMatrix.listPorcentajeVentaDOP || summary.costMatrix.porcentajeVentaDOP).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    ) : (
                      <>RD$ {(summary.costMatrix.listPorcentajeVentaDOP || summary.costMatrix.porcentajeVentaDOP).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-slate-900">${(summary.costMatrix.listPorcentajeVentaUSD || summary.costMatrix.porcentajeVentaUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-bold">
                  <span>Descuento :</span>
                  <span>
                    {costTableCurrency === 'USD' ? (
                      <strong>-${(summary.costMatrix.totalDiscountUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                    ) : costTableCurrency === 'DOP' ? (
                      <strong>-RD$ {summary.costMatrix.totalDiscountDOP?.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    ) : (
                      <>-RD$ {summary.costMatrix.totalDiscountDOP?.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong>-${(summary.costMatrix.totalDiscountUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-red-600 font-extrabold bg-red-50 border border-red-200 px-2.5 py-1 rounded">
                  <span>Precio Venta Final (con desc.) :</span>
                  <span>
                    {costTableCurrency === 'USD' ? (
                      <strong>${summary.costMatrix.porcentajeVentaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                    ) : costTableCurrency === 'DOP' ? (
                      <strong>RD$ {summary.costMatrix.porcentajeVentaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    ) : (
                      <>RD$ {summary.costMatrix.porcentajeVentaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong>${summary.costMatrix.porcentajeVentaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-red-600 font-extrabold bg-red-50 border border-red-200 px-2.5 py-1 rounded">
                <span>Porcentaje venta ({resolveSaleMarginMultiplier(summary.costMatrix.saleMarginMultiplier).toFixed(2)}) :</span>
                <span>
                  {costTableCurrency === 'USD' ? (
                    <strong>${summary.costMatrix.porcentajeVentaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                  ) : costTableCurrency === 'DOP' ? (
                    <strong>RD$ {summary.costMatrix.porcentajeVentaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  ) : (
                    <>RD$ {summary.costMatrix.porcentajeVentaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong>${summary.costMatrix.porcentajeVentaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
                  )}
                </span>
              </div>
            )}

            {/* Precio Kilos Costo */}
            <div className="flex justify-between text-slate-800">
              <span>Precio kilos costo :</span>
              <span>
                {costTableCurrency === 'USD' ? (
                  <strong className="text-slate-900">{costMatrixPerCapacity(summary.costMatrix, 'cost').usd}</strong>
                ) : costTableCurrency === 'DOP' ? (
                  <strong className="text-slate-900">{costMatrixPerCapacity(summary.costMatrix, 'cost').dop}</strong>
                ) : (
                  <>{costMatrixPerCapacity(summary.costMatrix, 'cost').dop} &nbsp;|&nbsp; <strong className="text-slate-900">{costMatrixPerCapacity(summary.costMatrix, 'cost').usd}</strong></>
                )}
              </span>
            </div>

            {/* Precio Kilos Ventas */}
            <div className="flex justify-between text-slate-900 font-bold">
              <span>Precio kilos ventas :</span>
              <span>
                {costTableCurrency === 'USD' ? (
                  <strong className="text-emerald-800">{costMatrixPerCapacity(summary.costMatrix, 'sale').usd}</strong>
                ) : costTableCurrency === 'DOP' ? (
                  <strong className="text-emerald-800">{costMatrixPerCapacity(summary.costMatrix, 'sale').dop}</strong>
                ) : (
                  <>{costMatrixPerCapacity(summary.costMatrix, 'sale').dop} &nbsp;|&nbsp; <strong className="text-emerald-800">{costMatrixPerCapacity(summary.costMatrix, 'sale').usd}</strong></>
                )}
              </span>
            </div>

            {/* DATOS DE MARGEN DE GANANCIA Y RENTABILIDAD */}
            <div className="flex justify-between items-center text-amber-950 font-bold bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg text-xs">
              <span>Métricas de Margen :</span>
              <div className="flex items-center gap-2">
                <span className="bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded text-[11px] font-extrabold">
                  +{summary.costMatrix.markupOnCostPct !== undefined ? summary.costMatrix.markupOnCostPct.toFixed(1) : ((summary.costMatrix.saleMarginMultiplier - 1) * 100).toFixed(1)}% s/costo (Markup)
                </span>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[11px] font-extrabold border border-amber-300/60">
                  {summary.costMatrix.marginOnSalePct !== undefined ? summary.costMatrix.marginOnSalePct.toFixed(1) : ((summary.costMatrix.gananciaUSD / (summary.costMatrix.porcentajeVentaUSD || 1)) * 100).toFixed(1)}% s/venta (Margen)
                </span>
              </div>
            </div>

            {/* Ganancia Proyectada */}
            <div className="flex justify-between text-emerald-950 font-black bg-emerald-100 border border-emerald-300 px-2.5 py-1.5 rounded-lg text-sm mt-1">
              <span>Ganancia Proyectada :</span>
              <span>
                {costTableCurrency === 'USD' ? (
                  <strong className="text-emerald-800">${summary.costMatrix.gananciaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong>
                ) : costTableCurrency === 'DOP' ? (
                  <strong className="text-emerald-800">RD$ {summary.costMatrix.gananciaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                ) : (
                  <>RD$ {summary.costMatrix.gananciaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-emerald-800">${summary.costMatrix.gananciaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
);
