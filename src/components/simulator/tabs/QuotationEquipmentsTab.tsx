import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { ShieldCheck, CheckCircle2, Check } from 'lucide-react';

interface QuotationEquipmentsTabProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  costTableCurrency: 'ALL' | 'USD' | 'DOP';
  setCostTableCurrency: (curr: 'ALL' | 'USD' | 'DOP') => void;
}

export const QuotationEquipmentsTab: React.FC<QuotationEquipmentsTabProps> = ({
  project,
  summary,
  costTableCurrency,
  setCostTableCurrency,
}) => {
  const currentDateStr = new Date().toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-6 shrink-0">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">N° COTIZACIÓN</span>
          <span className="text-lg font-bold text-slate-900">{project.client.quoteNumber || 'C-0030'}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">POTENCIA FOTOVOLTAICA</span>
          <span className="text-lg font-bold text-emerald-800">{summary.systemCapacityKWp.toFixed(2)} kWp</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">INVERSIÓN NETA (LEY 57-07)</span>
          <span className="text-lg font-bold text-emerald-700">${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">VALIDEZ OFERTA</span>
          <span className="text-lg font-bold text-amber-700">{project.client.quoteValidityDays || 7} Días</span>
        </div>
      </div>

      {/* Complete Interactive Invoice Proposal View */}
      <div className="bg-white border border-slate-300 rounded-2xl shadow-xl overflow-hidden font-sans shrink-0">
        {/* Header Electsun Dark Green Banner */}
        <div className="bg-[#14532d] text-white px-8 py-5 flex justify-between items-center">
          <div>
            <h2 className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              PROPUESTA TÉCNICA Y ECONÓMICA • ID: {project.client.projectId || 'SP-2024-089'}
            </h2>
            <h1 className="text-xl font-bold uppercase tracking-tight text-white mt-0.5">
              {project.client.name} — {summary.systemCapacityKWp.toFixed(2)}kWp
            </h1>
            <p className="text-[11px] text-emerald-100/90 mt-0.5">
              Ubicación: <span className="font-semibold text-white">{project.client.province || project.client.location}</span> | Fecha: <span className="font-semibold text-white">{currentDateStr}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5 justify-end">
              <span className="w-3.5 h-3.5 bg-emerald-400 rounded-full inline-block"></span> electsun
            </div>
            <p className="text-[10px] text-emerald-200 tracking-wider font-semibold">EL SOL A TU FAVOR</p>
          </div>
        </div>

        <div className="bg-[#1e6a3b] text-center text-white py-1.5 font-bold text-xs uppercase tracking-wider">
          COTIZACIÓN DE SISTEMA FOTOVOLTAICO
        </div>

        <div className="p-8 space-y-6 text-xs text-slate-800">
          {/* DATOS DEL CLIENTE */}
          <div>
            <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-2">
              DATOS DEL CLIENTE :
            </h3>
            <div className="grid grid-cols-2 gap-4 px-2 text-[11px]">
              <div className="space-y-1">
                <div><span className="font-bold text-slate-600">Cliente:</span> <span className="font-bold text-slate-900">{project.client.name}</span></div>
                <div><span className="font-bold text-slate-600">Contacto:</span> {project.client.company || project.client.name}</div>
                <div><span className="font-bold text-slate-600">Teléfono:</span> {project.client.contactPhone || '809-378-6590'}</div>
                <div><span className="font-bold text-slate-600">Dirección:</span> {project.client.address || 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.'}</div>
              </div>
              <div className="space-y-1 text-right">
                <div><span className="font-bold text-slate-600">N° Cotización:</span> <span className="font-bold text-slate-900">{project.client.quoteNumber || 'C-0030'}</span></div>
                <div><span className="font-bold text-slate-600">Fecha:</span> <span className="font-semibold text-slate-800">{currentDateStr}</span></div>
                <div><span className="font-bold text-slate-600">Válido por:</span> <span className="font-bold text-emerald-700">{project.client.quoteValidityDays || 7} Días</span></div>
              </div>
            </div>
          </div>

          {/* ESPECIFICACIONES DEL SISTEMA */}
          <div>
            <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-2">
              ESPECIFICACIONES DEL SISTEMA
            </h3>
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
              <div>
                <div><span className="font-bold text-slate-700">Potencia (kW-dc):</span> <span className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)}</span></div>
                <div><span className="font-bold text-slate-700">Tipo de instalación:</span> Fotovoltaica</div>
              </div>
              <div className="text-right">
                <div><span className="font-bold text-slate-700">Consumo mensual estimado (kWh):</span> <span className="font-bold text-slate-900">{Math.round(summary.annualConsumptionKWh / 12).toLocaleString()}</span></div>
                <div><span className="font-bold text-slate-700">EDES / Distribuidor:</span> <span className="font-bold text-emerald-800">{project.client.distributor || 'EDEESTE'}</span></div>
              </div>
            </div>
          </div>

          {/* EQUIPOS Y MATERIALES */}
          <div>
            <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-2">
              EQUIPOS Y MATERIALES
            </h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#14532d] text-white font-bold text-[10px] uppercase">
                  <tr>
                    <th className="px-3 py-2">DESCRIPCION</th>
                    <th className="px-3 py-2 text-center w-20">CANT.</th>
                    <th className="px-3 py-2 text-center w-20">UNIDAD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px] text-slate-800 font-semibold">
                  <tr className="bg-white">
                    <td className="px-3 py-2">{project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}</td>
                    <td className="px-3 py-2 text-center font-bold">{project.specs.panelCount}</td>
                    <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                  </tr>
                  <tr className="bg-slate-50/60">
                    <td className="px-3 py-2">{project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}</td>
                    <td className="px-3 py-2 text-center font-bold">{project.specs.inverterCount || 2}</td>
                    <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                  </tr>
                  {project.specs.hasBattery && (
                    <tr className="bg-white">
                      <td className="px-3 py-2">{project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}</td>
                      <td className="px-3 py-2 text-center font-bold">{project.specs.batteryCount || 3}</td>
                      <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50/60">
                    <td className="px-3 py-2">{project.specs.installationServicesDesc || 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).'}</td>
                    <td className="px-3 py-2 text-center font-bold">1</td>
                    <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                  </tr>
                  {(project.financials.customItems || []).map((cItem, cIdx) => (
                    <tr
                      key={cItem.id || cIdx}
                      className={cIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}
                    >
                      <td className="px-3 py-2">
                        <span className="font-semibold text-slate-900">
                          {cItem.description || `Ítem Adicional #${cIdx + 1}`}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-bold">{cItem.quantity || 1}</td>
                      <td className="px-3 py-2 text-center text-slate-500 font-normal">{cItem.unit || 'UD'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DESGLOSE FINANCIERO */}
          <div className="flex justify-end">
            <div className="w-[380px] bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-slate-700">
                <span className="font-semibold">SUB-TOTAL (USD) SIN ITBIS :</span>
                <span className="font-bold">${(summary.costMatrix?.precioNetoUSD || (summary.grossInvestmentUSD - summary.itbisSavedUSD)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-900 bg-slate-200/80 px-2 py-1 rounded font-bold">
                <span>TOTAL GENERAL (USD) :</span>
                <span>${(summary.grossInvestmentUSD + (project.financials.applyITBISExemption ? summary.itbisSavedUSD : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-semibold">
                <span>ITBIS A DESCONTAR POR LEY 57-07 US$ :</span>
                <span className="font-bold">${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between bg-[#14532d] text-white px-2 py-1 rounded font-bold">
                <span>TOTAL GENERAL (USD) SI CALIFICA LEY 57-07 :</span>
                <span>${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-800 pt-1 border-t border-slate-300">
                <span className="font-bold">PRECIO POR WATT (USD/W):</span>
                <span className="font-bold text-emerald-800">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD || (summary.solarInvestmentUSD / (summary.systemCapacityKWp * 1000)) || 1.13).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* INCENTIVOS DE LEY 57-07 */}
          <div>
            <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-1">
              INCENTIVOS DE LEY 57-07
            </h3>
            <p className="text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1 rounded mb-2">
              (Descuento de 40% para equipos energía renovables: Paneles solares, inversores y baterías)
            </p>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#14532d] text-white font-bold text-[10px] uppercase">
                  <tr>
                    <th className="px-3 py-1.5">CONCEPTO</th>
                    <th className="px-3 py-1.5 text-right">VALOR US $</th>
                    <th className="px-3 py-1.5 text-right w-20">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px] text-slate-800 font-semibold">
                  <tr className="bg-white font-bold">
                    <td className="px-3 py-1.5">TOTAL EQUIPOS ENERGIAS RENOVABLES (PANELES-INVERSORES-BATERIAS)</td>
                    <td className="px-3 py-1.5 text-right">${(summary.equipmentPortionUSD || summary.grossInvestmentUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-1.5 text-right">100%</td>
                  </tr>
                  <tr className="bg-slate-50/60">
                    <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 1ER AÑO</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700">13.33%</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 2DO AÑO</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700">13.33%</td>
                  </tr>
                  <tr className="bg-slate-50/60">
                    <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 3ER AÑO</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700">13.33%</td>
                  </tr>
                  <tr className="bg-emerald-50 text-emerald-900 font-bold">
                    <td className="px-3 py-1.5">TOTAL A DESCONTAR POR LA LEY 57-07 (40% DEL TOTAL)</td>
                    <td className="px-3 py-1.5 text-right text-emerald-800">${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-800">40.00%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* GARANTÍAS Y NOS ENCARGAMOS DE GESTIONAR GRID */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-[11px]">
              <h4 className="font-bold text-emerald-900 border-b border-slate-200 pb-1 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> GARANTÍAS
              </h4>
              <div>• <span className="font-bold">Paneles Solares:</span> 25 años (80.7% potencia mínima garantizada)</div>
              <div>• <span className="font-bold">Inversor:</span> 5 años</div>
              <div>• <span className="font-bold">Estructura de montaje:</span> 10 años</div>
              {project.specs.hasBattery && (
                <div>• <span className="font-bold">Batería:</span> 10 años</div>
              )}
              <div>• <span className="font-bold">Mano de obra:</span> 1 año</div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 space-y-1 text-[11px]">
              <h4 className="font-bold text-emerald-900 border-b border-emerald-200 pb-1 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> NOS ENCARGAMOS DE GESTIONAR
              </h4>
              <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" /> <span>Instalación del contador bidireccional en las EDES</span></div>
              <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" /> <span>Aprobación de crédito fiscal (CNE) y el Ministerio de Hacienda</span></div>
              <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" /> <span>Trámites completos ante organismos reguladores</span></div>
            </div>
          </div>

          {/* LEGAL SUBTEXT BETWEEN ASTERISKS */}
          <div className="text-center text-[10px] text-slate-500 font-semibold italic pt-1">
            * Equipos según disponibilidad de inventario | * Propuesta válida por {project.client.quoteValidityDays || 7} días | * Precios en USD *
          </div>
        </div>

        {/* Footer Electsun */}
        <div className="px-8 py-3 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-600 font-semibold">
          <div>Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do</div>
          <div className="font-bold text-slate-800">Propuesta Cotización Electsun</div>
        </div>
      </div>

      {/* TABLA DE COSTOS E INGRESOS INTERNOS (REPLICANDO HOJA DE CÁLCULO EXCEL) */}
      <div className="bg-white border border-slate-300 rounded-2xl shadow-xl overflow-hidden font-sans shrink-0">
        {/* Header Orange Banner matching Excel */}
        <div className="bg-amber-600 text-white px-6 py-3.5 flex flex-wrap gap-3 justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">table_chart</span>
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
                Factor Venta: <span className="text-white font-extrabold">{(summary.costMatrix.saleMarginMultiplier || 1.25).toFixed(2)}x</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Table matching Excel columns and Currency Filter */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Productos</th>
                  <th className="py-2.5 px-3 text-center text-red-600">kilos / Cap.</th>
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
            <div className="w-[500px] bg-slate-50 border border-slate-300 rounded-xl p-4 space-y-1.5 text-xs font-semibold shadow-xs">
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

              {/* Porcentaje de Venta */}
              <div className="flex justify-between text-red-600 font-extrabold bg-red-50 border border-red-200 px-2.5 py-1 rounded">
                <span>Porcentaje venta ({(summary.costMatrix.saleMarginMultiplier || 1.25).toFixed(2)}) :</span>
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

              {/* Precio Kilos Costo */}
              <div className="flex justify-between text-slate-800">
                <span>Precio kilos costo :</span>
                <span>
                  {costTableCurrency === 'USD' ? (
                    <strong className="text-slate-900">${summary.costMatrix.precioKilosCostoUSD.toFixed(2)} USD/kWp (${summary.costMatrix.costPerWattUSD.toFixed(2)} USD/W)</strong>
                  ) : costTableCurrency === 'DOP' ? (
                    <strong className="text-slate-900">RD$ {summary.costMatrix.precioKilosCostoDOP.toFixed(2)} /kWp</strong>
                  ) : (
                    <>RD$ {summary.costMatrix.precioKilosCostoDOP.toFixed(2)} &nbsp;|&nbsp; <strong className="text-slate-900">${summary.costMatrix.precioKilosCostoUSD.toFixed(2)} USD/kWp (${summary.costMatrix.costPerWattUSD.toFixed(2)} USD/W)</strong></>
                  )}
                </span>
              </div>

              {/* Precio Kilos Ventas */}
              <div className="flex justify-between text-slate-900 font-bold">
                <span>Precio kilos ventas :</span>
                <span>
                  {costTableCurrency === 'USD' ? (
                    <strong className="text-emerald-800">${summary.costMatrix.precioKilosVentasUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/kWp (${(summary.costMatrix.salePricePerWattUSD || 0).toFixed(2)} USD/W)</strong>
                  ) : costTableCurrency === 'DOP' ? (
                    <strong className="text-emerald-800">RD$ {summary.costMatrix.precioKilosVentasDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /kWp</strong>
                  ) : (
                    <>RD$ {summary.costMatrix.precioKilosVentasDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-emerald-800">${summary.costMatrix.precioKilosVentasUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/kWp (${(summary.costMatrix.salePricePerWattUSD || 0).toFixed(2)} USD/W)</strong></>
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
    </div>
  );
};
