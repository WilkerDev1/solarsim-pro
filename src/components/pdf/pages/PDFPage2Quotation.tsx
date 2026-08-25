import React from 'react';
import { ShieldCheck, CheckCircle2, Check } from 'lucide-react';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { InlineEditableText } from '../common/InlineEditableText';

interface PDFPage2QuotationProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
  isEditMode?: boolean;
  updateDocumentCustomization?: (customization: Partial<DocumentCustomization>) => void;
}

export const PDFPage2Quotation: React.FC<PDFPage2QuotationProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
  isEditMode = false,
  updateDocumentCustomization,
}) => {
  const cust = project.customization || {};

  const cleanClientName = (project.client.name || 'Cliente').replace(/\s*\((?:Copia|Copia Importada|COPIA|V\d+|C\d+)\)\s*/gi, '').trim();
  const contactName = cust.contactName || cleanClientName || 'Contacto';
  const rawClientPhone = cust.clientPhone || project.client.contactPhone || '809-378-6590';
  const clientPhone = (rawClientPhone.includes('555-0199') || rawClientPhone.includes('5550199')) ? (project.client.contactPhone || '809-378-6590') : rawClientPhone;
  const panelWarranty = cust.panelWarrantyText || DEFAULT_DOCUMENT_CUSTOMIZATION.panelWarrantyText || '25 Años';
  const inverterWarranty = cust.inverterWarrantyText || DEFAULT_DOCUMENT_CUSTOMIZATION.inverterWarrantyText || '5 a 10 Años';
  const batteryWarranty = cust.batteryWarrantyText || DEFAULT_DOCUMENT_CUSTOMIZATION.batteryWarrantyText || '5 a 10 Años';
  const workmanshipWarranty = cust.workmanshipWarrantyText || DEFAULT_DOCUMENT_CUSTOMIZATION.workmanshipWarrantyText || '1 Año';
  const servicesText = cust.servicesIncludedText || DEFAULT_DOCUMENT_CUSTOMIZATION.servicesIncludedText || '';
  const defaultValidityNote = `* Equipos según disponibilidad de inventario | * Propuesta válida por ${project.client.quoteValidityDays || 7} días | * Precios en USD *`;
  const validityNote = cust.validityNote || defaultValidityNote;

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
                <span className="font-bold text-slate-900">{cleanClientName}</span>
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
                <span className="font-bold text-slate-600">Fecha de Emisión:</span> {currentDateStr}
              </div>
              <div>
                <span className="font-bold text-slate-600">N° Cotización:</span>{' '}
                <span className="font-bold font-mono text-slate-900">{project.client.quoteNumber || 'C-0001'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-600">ID Proyecto:</span>{' '}
                <span className="font-bold font-mono text-slate-900">{project.client.projectId || 'SP-2026-001'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-600">Distribuidora / Tarifa:</span>{' '}
                <span className="font-bold text-slate-900">{project.rates.distributor || 'EDES'} • {project.rates.tariffCode}</span>
              </div>
            </div>
          </div>
        </div>

        {/* DETALLE TÉCNICO Y SUMINISTRO PRINCIPAL */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold uppercase mb-1 rounded-xs"
            style={{
              backgroundColor: activeTheme.tertiary ? activeTheme.tertiary : '#f1f5f9',
              color: activeTheme.tertiary ? '#ffffff' : activeTheme.primary,
              borderLeft: activeTheme.tertiary ? undefined : `4px solid ${activeTheme.primary}`,
            }}
          >
            DESCRIPCIÓN DEL SISTEMA FOTOVOLTAICO :
          </h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="text-white font-bold text-[9.5px] uppercase" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-3 py-1">ÍTEM</th>
                  <th className="px-3 py-1">DESCRIPCIÓN DE EQUIPOS Y SERVICIOS</th>
                  <th className="px-3 py-1 text-center w-14">CANT.</th>
                  <th className="px-3 py-1 text-right w-24">POTENCIA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[10.5px] text-slate-800">
                <tr className="bg-white">
                  <td className="px-3 py-1 font-bold text-slate-500">1</td>
                  <td className="px-3 py-1 font-medium">
                    <span className="font-bold text-slate-900">Módulos Solares Fotovoltaicos:</span>{' '}
                    {project.specs.panelBrandModel || 'Módulos Tier-1 Monocristalinos'} ({project.specs.panelPowerW}W)
                  </td>
                  <td className="px-3 py-1 text-center font-bold font-mono">{project.specs.panelCount}</td>
                  <td className="px-3 py-1 text-right font-bold font-mono">{summary.systemCapacityKWp.toFixed(2)} kWp</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1 font-bold text-slate-500">2</td>
                  <td className="px-3 py-1 font-medium">
                    <span className="font-bold text-slate-900">Inversor Solar Inteligente:</span>{' '}
                    {project.specs.inverterBrandModel || 'Inversor On-Grid / Híbrido'}
                  </td>
                  <td className="px-3 py-1 text-center font-bold font-mono">{project.specs.inverterCount || 1}</td>
                  <td className="px-3 py-1 text-right font-bold font-mono">
                    {project.specs.inverterPowerKW || (summary.systemCapacityKWp * 0.9).toFixed(1)} kW
                  </td>
                </tr>
                {project.specs.hasBattery && project.specs.batteryCapacityKWh > 0 && (
                  <tr className="bg-white">
                    <td className="px-3 py-1 font-bold text-slate-500">3</td>
                    <td className="px-3 py-1 font-medium">
                      <span className="font-bold text-slate-900">Almacenamiento en Baterías LiFePO4:</span>{' '}
                      {project.specs.batteryBrandModel || 'Batería de Litio Solar'}
                    </td>
                    <td className="px-3 py-1 text-center font-bold font-mono">{project.specs.batteryCount || 1}</td>
                    <td className="px-3 py-1 text-right font-bold font-mono">{project.specs.batteryCapacityKWh} kWh</td>
                  </tr>
                )}
                <tr className={project.specs.hasBattery && project.specs.batteryCapacityKWh > 0 ? 'bg-slate-50/60' : 'bg-white'}>
                  <td className="px-3 py-1 font-bold text-slate-500">
                    {project.specs.hasBattery && project.specs.batteryCapacityKWh > 0 ? '4' : '3'}
                  </td>
                  <td className="px-3 py-1 font-medium text-slate-700" colSpan={3}>
                    <span className="font-bold text-slate-900">Estructura y Materiales Eléctricos:</span>{' '}
                    {cust.projectEngineeringScopeText !== undefined && cust.projectEngineeringScopeText.trim() !== ''
                      ? cust.projectEngineeringScopeText.trim()
                      : DEFAULT_DOCUMENT_CUSTOMIZATION.projectEngineeringScopeText}
                  </td>
                </tr>
                {(project.financials.customItems || []).map((cItem, cIdx) => {
                  const itemNumber = (project.specs.hasBattery && project.specs.batteryCapacityKWh > 0 ? 5 : 4) + cIdx;
                  const isEven = itemNumber % 2 === 0;
                  return (
                    <tr key={cItem.id || cIdx} className={isEven ? 'bg-slate-50/60' : 'bg-white'}>
                      <td className="px-3 py-1 font-bold text-slate-500">{itemNumber}</td>
                      <td className="px-3 py-1 font-medium">
                        <span className="font-bold text-slate-900">{cItem.description || `Ítem Adicional #${cIdx + 1}`}</span>
                      </td>
                      <td className="px-3 py-1 text-center font-bold font-mono">{cItem.quantity || 1}</td>
                      <td className="px-3 py-1 text-right font-bold font-mono">{cItem.unit || 'UD'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* DESGLOSE FINANCIERO DE PRECIOS */}
        <div className="flex justify-end my-0.5">
          <div className="w-[360px] bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1 text-[10px]">
            <div className="flex justify-between text-slate-700">
              <span className="font-bold">SUB-TOTAL (USD) SIN ITBIS :</span>
              <span className="font-bold font-mono">
                ${(summary.costMatrix?.precioNetoUSD || (summary.grossInvestmentUSD - summary.itbisSavedUSD)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded font-bold">
              <span>TOTAL GENERAL (USD) :</span>
              <span className="font-mono">
                ${(summary.grossInvestmentUSD + (project.financials.applyITBISExemption ? summary.itbisSavedUSD : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between font-bold" style={{ color: activeTheme.secondary }}>
              <span>ITBIS A DESCONTAR POR LEY 57-07 US$ :</span>
              <span className="font-mono">
                ${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div
              className="flex justify-between text-white px-2 py-0.5 rounded font-bold"
              style={{ backgroundColor: activeTheme.primary }}
            >
              <span>TOTAL GENERAL (USD) SI CALIFICA LEY 57-07 :</span>
              <span className="font-mono">
                ${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-slate-800 pt-0.5 border-t border-slate-300">
              <span className="font-bold">PRECIO POR WATT (USD/W):</span>
              <span className="font-bold font-mono" style={{ color: activeTheme.primary }}>
                ${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD || (summary.solarInvestmentUSD / (summary.systemCapacityKWp * 1000)) || 1.13).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* CONDICIONES ECONÓMICAS Y BENEFICIOS LEY 57-07 */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold uppercase mb-0.5 rounded-xs"
            style={{
              backgroundColor: activeTheme.tertiary ? activeTheme.tertiary : '#f1f5f9',
              color: activeTheme.tertiary ? '#ffffff' : activeTheme.primary,
              borderLeft: activeTheme.tertiary ? undefined : `4px solid ${activeTheme.primary}`,
            }}
          >
            INVERSIÓN Y APLICACIÓN DE INCENTIVOS FISCALES LEY 57-07 :
          </h3>
          <p className="text-[9.5px] text-slate-500 mb-1 px-1 font-medium">
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
                  <td className="px-3 py-1 text-right">${(summary.equipmentPortionUSD || summary.grossInvestmentUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1 text-[10.5px]">
            <h4
              className="font-bold border-b border-slate-200 pb-0.5 mb-0.5 uppercase tracking-wider flex items-center gap-1.5"
              style={{ color: activeTheme.primary }}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> GARANTÍAS
            </h4>
            <div className="flex items-center gap-1 leading-snug">
              <span className="font-bold text-slate-800 shrink-0">• Paneles Solares:</span>
              <InlineEditableText
                value={cust.panelWarrantyText}
                defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.panelWarrantyText}
                onSave={(val) => updateDocumentCustomization?.({ panelWarrantyText: val })}
                isEditMode={isEditMode}
                multiline={false}
                label="Garantía Paneles"
                className="font-medium inline-block"
                boldClassName="font-bold text-slate-950"
                isCustomized={!!cust.panelWarrantyText}
                onReset={() => updateDocumentCustomization?.({ panelWarrantyText: '' })}
              />
            </div>
            <div className="flex items-center gap-1 leading-snug">
              <span className="font-bold text-slate-800 shrink-0">• Inversor:</span>
              <InlineEditableText
                value={cust.inverterWarrantyText}
                defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.inverterWarrantyText}
                onSave={(val) => updateDocumentCustomization?.({ inverterWarrantyText: val })}
                isEditMode={isEditMode}
                multiline={false}
                label="Garantía Inversor"
                className="font-medium inline-block"
                boldClassName="font-bold text-slate-950"
                isCustomized={!!cust.inverterWarrantyText}
                onReset={() => updateDocumentCustomization?.({ inverterWarrantyText: '' })}
              />
            </div>
            {project.specs.hasBattery && (
              <div className="flex items-center gap-1 leading-snug">
                <span className="font-bold text-slate-800 shrink-0">• Batería:</span>
                <InlineEditableText
                  value={cust.batteryWarrantyText}
                  defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.batteryWarrantyText}
                  onSave={(val) => updateDocumentCustomization?.({ batteryWarrantyText: val })}
                  isEditMode={isEditMode}
                  multiline={false}
                  label="Garantía Batería"
                  className="font-medium inline-block"
                  boldClassName="font-bold text-slate-950"
                  isCustomized={!!cust.batteryWarrantyText}
                  onReset={() => updateDocumentCustomization?.({ batteryWarrantyText: '' })}
                />
              </div>
            )}
            <div className="flex items-center gap-1 leading-snug">
              <span className="font-bold text-slate-800 shrink-0">• Mano de Obra:</span>
              <InlineEditableText
                value={cust.workmanshipWarrantyText}
                defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.workmanshipWarrantyText}
                onSave={(val) => updateDocumentCustomization?.({ workmanshipWarrantyText: val })}
                isEditMode={isEditMode}
                multiline={false}
                label="Garantía Mano de Obra"
                className="font-medium inline-block"
                boldClassName="font-bold text-slate-950"
                isCustomized={!!cust.workmanshipWarrantyText}
                onReset={() => updateDocumentCustomization?.({ workmanshipWarrantyText: '' })}
              />
            </div>
          </div>

          <div className={`border rounded-lg p-2 space-y-0.5 text-[10.5px] ${activeTheme.accentLightBg} ${activeTheme.accentBorder}`}>
            <h4
              className="font-bold border-b pb-0.5 mb-0.5 uppercase tracking-wider flex items-center gap-1.5"
              style={{ color: activeTheme.primary, borderColor: activeTheme.primary }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: activeTheme.primary }} /> NOS ENCARGAMOS DE GESTIONAR
            </h4>
            <InlineEditableText
              value={cust.servicesIncludedText}
              defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.servicesIncludedText}
              onSave={(val) => updateDocumentCustomization?.({ servicesIncludedText: val })}
              isEditMode={isEditMode}
              multiline={true}
              label="Servicios Gestionados"
              className="text-[10.5px] leading-relaxed block"
              boldClassName="font-bold text-slate-950"
              isCustomized={!!cust.servicesIncludedText}
              onReset={() => updateDocumentCustomization?.({ servicesIncludedText: '' })}
            />
          </div>
        </div>

        {/* LEGAL SUBTEXT */}
        <div className="text-center text-[9.5px] text-slate-500 font-semibold italic pt-0.5">
          <InlineEditableText
            value={cust.validityNote}
            defaultValue={defaultValidityNote}
            onSave={(val) => updateDocumentCustomization?.({ validityNote: val })}
            isEditMode={isEditMode}
            multiline={false}
            label="Nota Legal y Términos"
            className="text-center text-[9.5px] text-slate-500 font-semibold italic block pt-0.5"
            boldClassName="font-bold text-slate-700"
            isCustomized={!!cust.validityNote}
            onReset={() => updateDocumentCustomization?.({ validityNote: '' })}
          />
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
