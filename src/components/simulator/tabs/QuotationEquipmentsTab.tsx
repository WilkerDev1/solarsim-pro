import React from 'react';
import { supplyPresentation, supplySummaryText } from '../../../../shared/offGridSupply';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { ShieldCheck, CheckCircle2, Check } from 'lucide-react';
import { getProjectPanels, getProjectInverters, getProjectBatteries } from '../../../utils/equipmentSpecsUtils';
import { MANUAL_BRAND_PLACEHOLDER, QUOTATION_PANEL_BRAND_FALLBACK, SAMPLE_PHONE_MARKER, SAMPLE_QUOTE_NUMBER, resolveSaleMarginMultiplier } from '../../../../shared/projectDefaults';
import { resolveAssumptions } from '../../../../shared/assumptions';
import { visibleQuotationItems } from '../../../../shared/quotationItems';
import { formatProposalDate } from '../../../utils/formatDateUtils';
import { CostMatrixTable } from './CostMatrixTable';

interface QuotationEquipmentsTabProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  costTableCurrency: 'ALL' | 'USD' | 'DOP';
  setCostTableCurrency: (curr: 'ALL' | 'USD' | 'DOP') => void;
}

const cleanInstallationDesc = (desc?: string): string => {
  const defaultDesc = 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).';
  if (!desc || typeof desc !== 'string' || !desc.trim()) return defaultDesc;
  if (desc.includes('Notas del Sistema:')) {
    const base = desc.split('Notas del Sistema:')[0].trim().replace(/\.\s*$/, '');
    return base ? `${base}.` : defaultDesc;
  }
  return desc;
};

export const QuotationEquipmentsTab: React.FC<QuotationEquipmentsTabProps> = ({
  project,
  summary,
  costTableCurrency,
  setCostTableCurrency,
}) => {
  const currentDateStr = React.useMemo(
    () => formatProposalDate(project?.client?.quoteDate || project?.customization?.quoteDate),
    [project?.client?.quoteDate, project?.customization?.quoteDate]
  );

  return (
    <div className="space-y-6 shrink-0">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] [&>*]:min-w-0 [&>*]:[overflow-wrap:anywhere] gap-3 shrink-0">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">N° COTIZACIÓN</span>
          <span className="text-lg font-bold text-slate-900">{project.client.quoteNumber || SAMPLE_QUOTE_NUMBER}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">POTENCIA FOTOVOLTAICA</span>
          <span className="text-lg font-bold text-emerald-800">{((summary?.systemCapacityKWp) || 0).toFixed(2)} kWp</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">INVERSIÓN NETA (LEY 57-07)</span>
          <span className="text-lg font-bold text-emerald-700">${((summary?.netInvestmentUSD) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">VALIDEZ OFERTA</span>
          <span className="text-lg font-bold text-amber-700">{resolveAssumptions(project).quoteValidityDays} Días</span>
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
          {project.specs.pricingMode !== "direct_watt" && [...(project.specs.panels || []),...(project.specs.inverters || []),...(project.specs.hasBattery ? project.specs.batteries || [] : [])].some(item=>item.unitPriceUSD === undefined) && <p role="alert" className="border border-amber-300 bg-amber-50 text-amber-900 p-3">Hay equipos sin costo registrado. Completa los precios antes de emitir esta cotización.</p>}
          {project.aiSource?.notes && <section aria-label="Notas técnicas del borrador"><h3 className="font-semibold mb-2">Notas técnicas revisadas</h3><p className="whitespace-pre-wrap">{project.aiSource.notes}</p></section>}
          {/* DATOS DEL CLIENTE */}
          <div>
            <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-2">
              DATOS DEL CLIENTE :
            </h3>
            <div className="grid grid-cols-2 gap-4 px-2 text-[11px]">
              <div className="space-y-1">
                <div><span className="font-bold text-slate-600">Cliente:</span> <span className="font-bold text-slate-900">{project.client.name}</span></div>
                <div><span className="font-bold text-slate-600">Contacto:</span> {project.customization?.contactName || project.client.contactPerson || project.client.company || project.client.name}</div>
                <div><span className="font-bold text-slate-600">Teléfono:</span> {project.customization?.clientPhone || (project.client.contactPhone && !project.client.contactPhone.includes(SAMPLE_PHONE_MARKER) ? project.client.contactPhone : '') || '—'}</div>
                <div><span className="font-bold text-slate-600">Dirección:</span> {project.client.address || `${project.client.province || project.client.location || 'Santo Domingo'}, RD`}</div>
              </div>
              <div className="space-y-1 text-right">
                <div><span className="font-bold text-slate-600">N° Cotización:</span> <span className="font-bold text-slate-900">{project.client.quoteNumber || SAMPLE_QUOTE_NUMBER}</span></div>
                <div><span className="font-bold text-slate-600">Fecha:</span> <span className="font-semibold text-slate-800">{currentDateStr}</span></div>
                <div><span className="font-bold text-slate-600">Válido por:</span> <span className="font-bold text-emerald-700">{resolveAssumptions(project).quoteValidityDays} Días</span></div>
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
                <div><span className="font-bold text-slate-700">{supplyPresentation(project.rates).kind === 'utility' ? 'EDES / Distribuidor:' : 'Suministro:'}</span> <span className="font-bold text-emerald-800">{supplySummaryText(project.rates, project.client.distributor || 'EDEESTE')}</span></div>
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
                  {getProjectPanels(project.specs).map((panel, idx) => (
                    <tr key={panel.id || `panel-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2">{panel.brandModel || QUOTATION_PANEL_BRAND_FALLBACK}</td>
                      <td className="px-3 py-2 text-center font-bold">{panel.count}</td>
                      <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                    </tr>
                  ))}
                  {getProjectInverters(project.specs).map((inv, idx) => (
                    <tr key={inv.id || `inv-${idx}`} className={idx % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}>
                      <td className="px-3 py-2">{inv.brandModel || MANUAL_BRAND_PLACEHOLDER.inverter}</td>
                      <td className="px-3 py-2 text-center font-bold">{inv.count || 1}</td>
                      <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                    </tr>
                  ))}
                  {project.specs.hasBattery && getProjectBatteries(project.specs).map((bat, idx) => (
                    <tr key={bat.id || `bat-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2">{bat.brandModel || MANUAL_BRAND_PLACEHOLDER.battery}</td>
                      <td className="px-3 py-2 text-center font-bold">{bat.count || 1}</td>
                      <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/60">
                    <td className="px-3 py-2">{cleanInstallationDesc(project.specs.installationServicesDesc)}</td>
                    <td className="px-3 py-2 text-center font-bold">1</td>
                    <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                  </tr>
                  {visibleQuotationItems(project.financials.customItems).map((cItem, cIdx) => (
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
                <span className="font-bold">${summary.commercialPreTaxSubtotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-900 bg-slate-200/80 px-2 py-1 rounded font-bold">
                <span>TOTAL GENERAL (USD) :</span>
                <span>${(summary.listGrossInvestmentUSD + (project.financials.applyITBISExemption ? summary.itbisSavedUSD : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-semibold">
                <span>ITBIS A DESCONTAR POR LEY 57-07 US$ :</span>
                <span className="font-bold">${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {(summary.totalDiscountUSD || 0) > 0 && (
                <div className="flex justify-between text-rose-600 bg-rose-50/80 px-2 py-1 rounded font-bold border border-rose-200">
                  <span className="flex items-center gap-1">
                    DESCUENTO :
                    {summary.equipmentDiscountUSD ? (
                      <span className="text-[9.5px] font-normal text-amber-700">(Equipos Ley 57-07)</span>
                    ) : null}
                  </span>
                  <span>-${summary.totalDiscountUSD?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                </div>
              )}
              <div className="flex justify-between bg-[#14532d] text-white px-2 py-1 rounded font-bold">
                <span>TOTAL GENERAL (USD) SI CALIFICA LEY 57-07 :</span>
                <span>${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-800 pt-1 border-t border-slate-300">
                <span className="font-bold">PRECIO POR WATT (USD/W):</span>
                <span className="font-bold text-emerald-800">
                  ${(summary.salePricePerWattUSD ?? (summary.systemCapacityKWp > 0 ? summary.grossInvestmentUSD / (summary.systemCapacityKWp * 1000) : 0)).toFixed(2)}
                </span>
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
            * Equipos según disponibilidad de inventario | * Propuesta válida por {resolveAssumptions(project).quoteValidityDays} días | * Precios en USD *
          </div>
        </div>

        {/* Footer Electsun */}
        <div className="px-8 py-3 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-600 font-semibold">
          <div>Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do</div>
          <div className="font-bold text-slate-800">Propuesta Cotización Electsun</div>
        </div>
      </div>

      <CostMatrixTable project={project} summary={summary} currency={costTableCurrency} onCurrencyChange={setCostTableCurrency} />
    </div>
  );
};
