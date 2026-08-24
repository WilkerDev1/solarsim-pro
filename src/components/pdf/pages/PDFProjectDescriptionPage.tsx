import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { FileText, ShieldAlert, Sparkles, Zap, BatteryCharging } from 'lucide-react';
import { renderFormattedMarkdown } from '../../../utils/textFormatter';

import { InlineEditableText } from '../common/InlineEditableText';

interface PDFProjectDescriptionPageProps {
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

export const PDFProjectDescriptionPage: React.FC<PDFProjectDescriptionPageProps> = ({
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

  // Compute regulatory note paragraphs dynamically based on project conditions (tariff, export fee, zero-export)
  const getRegulatoryParagraphs = (): string[] => {
    if (cust.regulatoryNote && cust.regulatoryNote !== DEFAULT_DOCUMENT_CUSTOMIZATION.regulatoryNote) {
      return cust.regulatoryNote.split('\n\n').filter(Boolean);
    }

    const isZeroExport = !!project.rates.isZeroExport;
    const tariff = project.rates.tariffCode || 'BTS2';
    const isMonomic = tariff === 'BTS1' || tariff === 'BTS2';
    const exportFee = project.rates.gridExportFeePct ?? 25;

    const p1 = isZeroExport
      ? 'El sistema fotovoltaico operará bajo la modalidad de Inyección Cero (Zero-Export con limitador antivertido), suministrando energía prioritariamente a los consumos internos del inmueble y evitando cualquier inyección de excedentes hacia la red eléctrica de distribución.'
      : 'La energía generada mensualmente se descontará del consumo tomado de la red pública (EDES) o de la planta eléctrica. Cuando la producción supere el consumo, el excedente se acreditará como descuento en su factura eléctrica bajo el régimen de Medición Neta.';

    const p2 = 'La presente propuesta ha sido elaborada conforme a la Resolución SIE-007-2026-REG y se basa en criterios técnicos y el historial de consumo del cliente.';

    const p3 = 'Los ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.';

    let p4 = '';
    if (isZeroExport) {
      p4 = `Al operar con limitador antivertido (inyección cero)${project.specs.hasBattery ? ' y almacenamiento en baterías de litio' : ''}, la totalidad de la energía solar se aprovecha internamente, por lo que el proyecto no genera cargos por derecho de uso de la red bajo la normativa vigente.`;
    } else if (isMonomic) {
      p4 = `Para los clientes con tarifas ${tariff}, el análisis económico considera el cargo por derecho de uso de la red, equivalente al ${exportFee} % del valor de la energía excedente exportada, conforme a la normativa vigente (Resolución SIE-007-2026-REG). Por esta razón, el sistema se diseña para maximizar el autoconsumo y minimizar la exportación de energía, obteniendo así el mayor beneficio económico posible.${project.specs.hasBattery ? '' : ' Cuando resulte conveniente, se recomendará la incorporación de baterías de litio para incrementar el aprovechamiento de la energía generada.'}`;
    } else {
      p4 = `Para clientes con tarifa binómica (${tariff}), el análisis económico contempla el régimen de Medición Neta con compensación 1:1 de energía activa, dado que los costos de capacidad y disponibilidad de red se remuneran formalmente a través del cargo fijo por potencia contratada y demanda máxima, no aplicando retención por uso de red conforme a la regulación vigente.`;
    }

    return [p1, p2, p3, p4];
  };

  const paragraphs = getRegulatoryParagraphs();

  const rawClientName = project.client.name || 'Cliente';
  const clientName = rawClientName.replace(/\s*\((?:Copia|Copia Importada|COPIA|V\d+|C\d+)\)\s*/gi, '').trim();
  const panelModel = project.specs.panelBrandModel || `Módulos Monocristalinos TOPCon (${project.specs.panelPowerW}W)`;
  const inverterModel = project.specs.inverterBrandModel || `Inversor Solar Inteligente (${project.specs.inverterPowerKW || (summary.systemCapacityKWp * 0.9).toFixed(1)} kW)`;
  const batteryModel = project.specs.batteryBrandModel || `Batería de Litio LiFePO4 (${project.specs.batteryCapacityKWh} kWh)`;

  const defaultParagraph1 = `El consumo promedio anual de **${clientName}** es de **${summary.annualConsumptionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh**, por lo que se le propone la instalación de **${project.specs.panelCount} ${panelModel}**, alcanzando una potencia DC instalada de **${summary.systemCapacityKWp.toFixed(2)} kWp**. La producción energética estimada para este sistema es de **${summary.annualProductionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh anuales**, representando el **${summary.energyCoveragePct.toFixed(1)}%** del consumo total del cliente.`;

  const defaultParagraph2 = `Adicionalmente, se contempla la instalación de **${project.specs.inverterCount || 1} ${inverterModel}**${project.specs.hasBattery && project.specs.batteryCapacityKWh > 0 ? ` y **${project.specs.batteryCount || 1} ${batteryModel}**` : ''} ${cust.projectEngineeringScopeText !== undefined && cust.projectEngineeringScopeText.trim() !== '' ? cust.projectEngineeringScopeText.trim() : DEFAULT_DOCUMENT_CUSTOMIZATION.projectEngineeringScopeText}`;

  const defaultRegulatoryText = paragraphs.join('\n\n');

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
          pageTitle="4. DESCRIPCIÓN DEL PROYECTO & NORMATIVA SIE"
          customization={project.customization}
        />
      )}

      {/* Body */}
      <div className="px-10 pt-3.5 pb-3 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 min-h-0">
        {/* Top Section: Technical Proposal Narrative */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 border-b pb-2.5" style={{ borderColor: activeTheme.primary }}>
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-2xs"
              style={{ backgroundColor: activeTheme.primary }}
            >
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h2 className="text-xs font-black uppercase tracking-tight text-slate-900">
                Resumen Ejecutivo de la Solución Propuesta
              </h2>
              <InlineEditableText
                value={cust.projectSummarySubtitle}
                defaultValue={`Criterios de dimensionamiento técnico para ${clientName}`}
                onSave={(val) => updateDocumentCustomization?.({ projectSummarySubtitle: val })}
                isEditMode={isEditMode}
                multiline={false}
                label="Subtítulo del Resumen Técnico"
                className="text-[10px] text-slate-500 font-semibold block"
                boldClassName="text-slate-800 font-bold"
                isCustomized={!!cust.projectSummarySubtitle}
                onReset={() => updateDocumentCustomization?.({ projectSummarySubtitle: '' })}
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3 leading-relaxed text-justify">
            <InlineEditableText
              value={cust.customProjectSummaryParagraph1}
              defaultValue={defaultParagraph1}
              onSave={(val) => updateDocumentCustomization?.({ customProjectSummaryParagraph1: val })}
              isEditMode={isEditMode}
              multiline={true}
              label="Párrafo 1 (Consumo y Producción)"
              className="text-slate-700 text-[11.5px] font-medium block whitespace-pre-line leading-relaxed text-justify"
              boldClassName="text-slate-950 font-bold"
              isCustomized={!!cust.customProjectSummaryParagraph1}
              onReset={() => updateDocumentCustomization?.({ customProjectSummaryParagraph1: '' })}
            />

            <InlineEditableText
              value={cust.customProjectSummaryParagraph2}
              defaultValue={defaultParagraph2}
              onSave={(val) => updateDocumentCustomization?.({ customProjectSummaryParagraph2: val })}
              isEditMode={isEditMode}
              multiline={true}
              label="Párrafo 2 (Equipos y Alcance de Instalación)"
              className="text-slate-700 text-[11.5px] font-medium block whitespace-pre-line leading-relaxed text-justify"
              boldClassName="text-slate-950 font-bold"
              isCustomized={!!cust.customProjectSummaryParagraph2}
              onReset={() => updateDocumentCustomization?.({ customProjectSummaryParagraph2: '' })}
            />
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-center gap-3 shadow-xs">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-2xs shrink-0"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-slate-400 block">Potencia DC</span>
                <span className="text-sm font-black font-mono text-slate-900 block">
                  {summary.systemCapacityKWp.toFixed(2)} kWp
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-center gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-600 text-white shadow-2xs shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-slate-400 block">Cobertura Solar</span>
                <span className="text-sm font-black font-mono text-emerald-700 block">
                  {summary.energyCoveragePct.toFixed(1)}% Anual
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-center gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-600 text-white shadow-2xs shrink-0">
                <BatteryCharging className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-slate-400 block">Generación Anual</span>
                <span className="text-sm font-black font-mono text-blue-900 block">
                  {Math.round(summary.annualProductionKWh).toLocaleString()} kWh
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Regulatory & Net Metering Callout Box (Yellow Background) */}
        <div className="rounded-2xl border-2 border-amber-300/80 bg-amber-50/80 p-4 shadow-xs space-y-2.5 relative overflow-hidden">
          <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wider">
            <ShieldAlert className="w-4.5 h-4.5 text-amber-600" />
            <span>Marco Regulatorio y Condiciones de Operación (SIE / EDES)</span>
          </div>

          <div className="space-y-2 text-amber-950/90 text-[11.5px] leading-relaxed text-justify font-medium">
            <InlineEditableText
              value={cust.regulatoryNote}
              defaultValue={defaultRegulatoryText}
              onSave={(val) => updateDocumentCustomization?.({ regulatoryNote: val })}
              isEditMode={isEditMode}
              multiline={true}
              label="Marco Regulatorio SIE (Párrafos)"
              className="text-amber-950/90 text-[11.5px] leading-relaxed text-justify font-medium block whitespace-pre-line"
              boldClassName="font-bold text-amber-950"
              isCustomized={!!(cust.regulatoryNote && cust.regulatoryNote !== DEFAULT_DOCUMENT_CUSTOMIZATION.regulatoryNote)}
              onReset={() => updateDocumentCustomization?.({ regulatoryNote: DEFAULT_DOCUMENT_CUSTOMIZATION.regulatoryNote })}
            />
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
