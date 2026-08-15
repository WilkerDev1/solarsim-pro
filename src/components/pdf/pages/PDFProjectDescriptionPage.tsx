import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { FileText, ShieldAlert, Sparkles, Zap, BatteryCharging } from 'lucide-react';

interface PDFProjectDescriptionPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFProjectDescriptionPage: React.FC<PDFProjectDescriptionPageProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const cust = project.customization || {};
  const regulatoryText = cust.regulatoryNote || DEFAULT_DOCUMENT_CUSTOMIZATION.regulatoryNote || '';
  const paragraphs = regulatoryText.split('\n\n').filter(Boolean);

  const clientName = project.client.name || 'Cliente';
  const panelModel = project.specs.panelBrandModel || `Módulos Monocristalinos TOPCon (${project.specs.panelPowerW}W)`;
  const inverterModel = project.specs.inverterBrandModel || `Inversor Solar Inteligente (${project.specs.inverterPowerKW || (summary.systemCapacityKWp * 0.9).toFixed(1)} kW)`;
  const batteryModel = project.specs.batteryBrandModel || `Batería de Litio LiFePO4 (${project.specs.batteryCapacityKWh} kWh)`;

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
      <div className="px-10 pt-3.5 pb-3 flex-1 flex flex-col justify-start text-xs text-slate-800 relative z-10 gap-3 min-h-0">
        {/* Top Section: Technical Proposal Narrative */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: activeTheme.primary }}>
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white shadow-2xs"
              style={{ backgroundColor: activeTheme.primary }}
            >
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-tight text-slate-900">
                Resumen Ejecutivo de la Solución Propuesta
              </h2>
              <span className="text-[9.5px] text-slate-500 font-medium">
                Criterios de dimensionamiento técnico para {clientName}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200 bg-white/90 shadow-xs space-y-2.5 leading-relaxed text-justify">
            <p className="text-slate-700 text-xs">
              El consumo promedio anual de <strong className="text-slate-950 font-bold">{clientName}</strong> es de{' '}
              <strong className="text-slate-950 font-mono font-bold">{summary.annualConsumptionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh</strong>, por lo que se le propone la instalación de{' '}
              <strong className="font-bold text-slate-950">{project.specs.panelCount} {panelModel}</strong>, alcanzando una potencia DC instalada de{' '}
              <strong className="font-bold font-mono text-slate-950" style={{ color: activeTheme.primary }}>
                {summary.systemCapacityKWp.toFixed(2)} kWp
              </strong>. La producción energética estimada para este sistema es de{' '}
              <strong className="font-bold font-mono text-slate-950">{summary.annualProductionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh anuales</strong>, representando el{' '}
              <strong className="font-bold text-emerald-700">{summary.energyCoveragePct.toFixed(1)}%</strong> del consumo total del cliente.
            </p>

            <p className="text-slate-700 text-xs">
              Adicionalmente, se contempla la instalación de <strong className="text-slate-950">{project.specs.inverterCount || 1} {inverterModel}</strong>
              {project.specs.hasBattery && project.specs.batteryCapacityKWh > 0 ? (
                <>
                  {' '}y <strong className="text-slate-950">{project.specs.batteryCount || 1} {batteryModel}</strong>
                </>
              ) : ''}, junto con todos los componentes necesarios (estructuras de montaje en aluminio anodizado, cableado fotovoltaico resistente a rayos UV, protecciones en CC/CA, interruptores de desconexión y supresores de sobretensión) para garantizar un funcionamiento seguro, eficiente y duradero del sistema.
            </p>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-2xs shrink-0"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-bold text-slate-400 block">Potencia DC</span>
                <span className="text-xs font-black font-mono text-slate-900 block">
                  {summary.systemCapacityKWp.toFixed(2)} kWp
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-600 text-white shadow-2xs shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-bold text-slate-400 block">Cobertura Solar</span>
                <span className="text-xs font-black font-mono text-emerald-700 block">
                  {summary.energyCoveragePct.toFixed(1)}% Anual
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-600 text-white shadow-2xs shrink-0">
                <BatteryCharging className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[9.5px] uppercase font-bold text-slate-400 block">Generación Anual</span>
                <span className="text-xs font-black font-mono text-blue-900 block">
                  {Math.round(summary.annualProductionKWh).toLocaleString()} kWh
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Regulatory & Net Metering Callout Box (Yellow Background) */}
        <div className="rounded-2xl border-2 border-amber-300/80 bg-amber-50/70 p-3.5 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wider mb-1">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>Marco Regulatorio y Condiciones de Operación (SIE / EDES)</span>
          </div>

          <div className="space-y-1.5 text-amber-950/90 text-[10.5px] leading-snug text-justify font-medium">
            {paragraphs.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
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
