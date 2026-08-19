import React from 'react';
import { ShieldCheck, CheckCircle2, Check } from 'lucide-react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';

interface PDFPage2QuotationProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFPage2Quotation: React.FC<PDFPage2QuotationProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const cust = project.customization || {};

  const contactName = cust.contactName || project.client.name || 'Contacto';
  const rawClientPhone = cust.clientPhone || project.client.contactPhone || '809-378-6590';
  const clientPhone = (rawClientPhone.includes('555-0199') || rawClientPhone.includes('5550199')) ? (project.client.contactPhone || '809-378-6590') : rawClientPhone;
  const panelWarranty = cust.panelWarrantyText || DEFAULT_DOCUMENT_CUSTOMIZATION.panelWarrantyText || '25 Años';
  const inverterWarranty = cust.inverterWarrantyText || DEFAULT_DOCUMENT_CUSTOMIZATION.inverterWarrantyText || '5 a 10 Años';
  const batteryWarranty = cust.batteryWarrantyText || DEFAULT_DOCUMENT_CUSTOMIZATION.batteryWarrantyText || '5 a 10 Años';
  const workmanshipWarranty = cust.workmanshipWarrantyText || DEFAULT_DOCUMENT_CUSTOMIZATION.workmanshipWarrantyText || '1 Año';
  const servicesText = cust.servicesIncludedText || DEFAULT_DOCUMENT_CUSTOMIZATION.servicesIncludedText || '';
  const validityNote = cust.validityNote || `* Equipos según disponibilidad de inventario | * Propuesta válida por ${project.client.quoteValidityDays || 7} días | * Precios en USD *`;

  // Split services text into bullets if separated by comma or semicolon
  const serviceItems = servicesText
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

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
          pageTitle="COTIZACIÓN DE SISTEMA FOTOVOLTAICO"
          customization={project.customization}
        />
      )}

      {/* Body */}
      <div className="px-10 pt-2.5 pb-3 flex-1 flex flex-col gap-2 text-xs text-slate-800 font-sans relative z-10 min-h-0">
        {/* DATOS DEL CLIENTE */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold uppercase mb-1 rounded-xs"
            style={{
              backgroundColor: activeTheme.tertiary ? activeTheme.tertiary : '#f1f5f9',
              color: activeTheme.tertiary ? '#ffffff' : activeTheme.primary,
              borderLeft: activeTheme.tertiary ? undefined : `4px solid ${activeTheme.primary}`,
            }}
          >
            DATOS DEL CLIENTE :
          </h3>
          <div className="grid grid-cols-2 gap-4 px-2 text-[10.5px]">
            <div className="space-y-0.5">
              <div>
                <span className="font-bold text-slate-600">Cliente:</span>{' '}
                <span className="font-bold text-slate-900">{project.client.name}</span>
              </div>
              <div>
                <span className="font-bold text-slate-600">Contacto:</span> {contactName}
              </div>
              <div>
                <span className="font-bold text-slate-600">Teléfono:</span> {clientPhone}
              </div>
              <div>
                <span className="font-bold text-slate-600">Dirección:</span>{' '}
                {project.client.address || 'Santo Domingo, República Dominicana'}
              </div>
            </div>
            <div className="space-y-0.5 text-right">
              <div>
                <span className="font-bold text-slate-600">N° Cotización:</span>{' '}
                <span className="font-bold text-slate-900">{project.client.quoteNumber || 'C-0030'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-600">Fecha:</span>{' '}
                <span className="font-semibold text-slate-800">{currentDateStr}</span>
              </div>
              <div>
                <span className="font-bold text-slate-600">Válido por:</span>{' '}
                <span className="font-bold" style={{ color: activeTheme.secondary }}>
                  {project.client.quoteValidityDays || 7} Días
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ESPECIFICACIONES DEL SISTEMA */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold uppercase mb-1 rounded-xs"
            style={{
              backgroundColor: activeTheme.tertiary ? activeTheme.tertiary : '#f1f5f9',
              color: activeTheme.tertiary ? '#ffffff' : activeTheme.primary,
              borderLeft: activeTheme.tertiary ? undefined : `4px solid ${activeTheme.primary}`,
            }}
          >
            ESPECIFICACIONES DEL SISTEMA
          </h3>
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-2 rounded-lg border border-slate-200 text-[10.5px]">
            <div>
              <div>
                <span className="font-bold text-slate-700">Potencia (kW-dc):</span>{' '}
                <span className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)} kWp</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">Tipo de instalación:</span> Fotovoltaica
              </div>
            </div>
            <div className="text-right">
              <div>
                <span className="font-bold text-slate-700">Consumo mensual estimado:</span>{' '}
                <span className="font-bold text-slate-900">
                  {Math.round(summary.annualConsumptionKWh / 12).toLocaleString()} kWh
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-700">Distribuidor Eléctrico:</span>{' '}
                <span className="font-bold" style={{ color: activeTheme.primary }}>
                  {project.client.distributor || 'EDEESTE'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* EQUIPOS Y MATERIALES */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold uppercase mb-1 rounded-xs"
            style={{
              backgroundColor: activeTheme.tertiary ? activeTheme.tertiary : '#f1f5f9',
              color: activeTheme.tertiary ? '#ffffff' : activeTheme.primary,
              borderLeft: activeTheme.tertiary ? undefined : `4px solid ${activeTheme.primary}`,
            }}
          >
            EQUIPOS Y MATERIALES
          </h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="text-white font-bold text-[9.5px] uppercase" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-3 py-1.5">DESCRIPCIÓN</th>
                  <th className="px-3 py-1.5 text-center w-20">CANT.</th>
                  <th className="px-3 py-1.5 text-center w-20">UNIDAD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[10.5px] text-slate-800 font-semibold">
                <tr className="bg-white">
                  <td className="px-3 py-1">{project.specs.panelBrandModel || 'Módulos Fotovoltaicos Tier 1'}</td>
                  <td className="px-3 py-1 text-center font-bold">{project.specs.panelCount}</td>
                  <td className="px-3 py-1 text-center text-slate-500 font-normal">UD</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1">{project.specs.inverterBrandModel || 'Inversor Solar On-Grid / Híbrido'}</td>
                  <td className="px-3 py-1 text-center font-bold">{project.specs.inverterCount || 1}</td>
                  <td className="px-3 py-1 text-center text-slate-500 font-normal">UD</td>
                </tr>
                {project.specs.hasBattery && (
                  <tr className="bg-white">
                    <td className="px-3 py-1">{project.specs.batteryBrandModel || 'Banco de Baterías Litio LiFePO4'}</td>
                    <td className="px-3 py-1 text-center font-bold">{project.specs.batteryCount || 1}</td>
                    <td className="px-3 py-1 text-center text-slate-500 font-normal">UD</td>
                  </tr>
                )}
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1">
                    {project.specs.installationServicesDesc ||
                      'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, protecciones AC/DC, desconectivo y puesta en marcha).'}
                  </td>
                  <td className="px-3 py-1 text-center font-bold">1</td>
                  <td className="px-3 py-1 text-center text-slate-500 font-normal">UD</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* DESGLOSE FINANCIERO RIGHT ALIGNED */}
        <div className="flex justify-end">
          <div className="w-[380px] bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1 text-[10.5px]">
            <div className="flex justify-between text-slate-700">
              <span className="font-semibold">SUB-TOTAL (USD) SIN ITBIS :</span>
              <span className="font-bold">
                ${(summary.costMatrix?.precioNetoUSD || (summary.grossInvestmentUSD - summary.itbisSavedUSD)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded font-bold">
              <span>TOTAL GENERAL (USD) :</span>
              <span>${(summary.grossInvestmentUSD + (project.financials.applyITBISExemption ? summary.itbisSavedUSD : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-semibold" style={{ color: activeTheme.secondary }}>
              <span>ITBIS A DESCONTAR POR LEY 57-07 US$ :</span>
              <span className="font-bold">${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-white px-2 py-0.5 rounded font-bold" style={{ backgroundColor: activeTheme.primary }}>
              <span>TOTAL GENERAL (USD) SI CALIFICA LEY 57-07 :</span>
              <span>${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-slate-800 pt-0.5 border-t border-slate-300">
              <span className="font-bold">PRECIO POR WATT (USD/W):</span>
              <span className="font-bold" style={{ color: activeTheme.primary }}>
                ${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD || (summary.solarInvestmentUSD / (summary.systemCapacityKWp * 1000)) || 1.13).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* INCENTIVOS DE LEY 57-07 */}
        <div>
          <h3
            className="bg-slate-100 px-2.5 py-0.5 text-[10.5px] font-bold uppercase border-l-4 mb-0.5"
            style={{ color: activeTheme.primary, borderColor: activeTheme.primary }}
          >
            INCENTIVOS DE LEY 57-07
          </h3>
          <p className="text-[9.5px] font-bold bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-0.5 rounded mb-1">
            (Descuento de 40% para equipos energía renovables: Paneles solares, inversores y baterías)
          </p>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="text-white font-bold text-[9.5px] uppercase" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-3 py-1">CONCEPTO</th>
                  <th className="px-3 py-1 text-right">VALOR US $</th>
                  <th className="px-3 py-1 text-right w-20">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[10.5px] text-slate-800 font-semibold">
                <tr className="bg-white font-bold">
                  <td className="px-3 py-1">TOTAL EQUIPOS ENERGÍAS RENOVABLES (PANELES-INVERSORES-BATERÍAS)</td>
                  <td className="px-3 py-1 text-right">${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-1 text-right">100%</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 1ER AÑO</td>
                  <td className="px-3 py-1 text-right" style={{ color: activeTheme.secondary }}>
                    ${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1 text-right" style={{ color: activeTheme.secondary }}>13.33%</td>
                </tr>
                <tr className="bg-white">
                  <td className="px-3 py-1">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 2DO AÑO</td>
                  <td className="px-3 py-1 text-right" style={{ color: activeTheme.secondary }}>
                    ${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1 text-right" style={{ color: activeTheme.secondary }}>13.33%</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 3ER AÑO</td>
                  <td className="px-3 py-1 text-right" style={{ color: activeTheme.secondary }}>
                    ${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1 text-right" style={{ color: activeTheme.secondary }}>13.33%</td>
                </tr>
                <tr className={`font-bold ${activeTheme.accentLightBg}`} style={{ color: activeTheme.primary }}>
                  <td className="px-3 py-1">TOTAL A DESCONTAR POR LA LEY 57-07 (40% DEL TOTAL)</td>
                  <td className="px-3 py-1 text-right" style={{ color: activeTheme.primary }}>
                    ${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1 text-right" style={{ color: activeTheme.primary }}>40.00%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* GARANTÍAS Y NOS ENCARGAMOS DE GESTIONAR GRID */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5 text-[10.5px]">
            <h4
              className="font-bold border-b border-slate-200 pb-0.5 mb-0.5 uppercase tracking-wider flex items-center gap-1.5"
              style={{ color: activeTheme.primary }}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> GARANTÍAS
            </h4>
            <div>• <span className="font-bold">Paneles Solares:</span> {panelWarranty}</div>
            <div>• <span className="font-bold">Inversor:</span> {inverterWarranty}</div>
            {project.specs.hasBattery && (
              <div>• <span className="font-bold">Batería:</span> {batteryWarranty}</div>
            )}
            <div>• <span className="font-bold">Mano de Obra y Soporte:</span> {workmanshipWarranty}</div>
          </div>

          <div className={`border rounded-lg p-2 space-y-0.5 text-[10.5px] ${activeTheme.accentLightBg} ${activeTheme.accentBorder}`}>
            <h4
              className="font-bold border-b pb-0.5 mb-0.5 uppercase tracking-wider flex items-center gap-1.5"
              style={{ color: activeTheme.primary, borderColor: activeTheme.primary }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: activeTheme.primary }} /> NOS ENCARGAMOS DE GESTIONAR
            </h4>
            {serviceItems.length > 0 ? (
              serviceItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-1">
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: activeTheme.primary }} />
                  <span>{item}</span>
                </div>
              ))
            ) : (
              <>
                <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: activeTheme.primary }} /> <span>Instalación del contador bidireccional en las EDES</span></div>
                <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: activeTheme.primary }} /> <span>Aprobación de crédito fiscal (CNE) y el Ministerio de Hacienda</span></div>
                <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: activeTheme.primary }} /> <span>Trámites completos ante organismos reguladores</span></div>
              </>
            )}
          </div>
        </div>

        {/* LEGAL SUBTEXT */}
        <div className="text-center text-[9.5px] text-slate-500 font-semibold italic pt-0.5">
          {validityNote}
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
