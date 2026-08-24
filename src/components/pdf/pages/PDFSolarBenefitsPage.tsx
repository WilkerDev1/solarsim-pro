import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { PDF_BENEFITS_HOUSE_BASE64 } from '../../../assets/pdfGraphicAssets';
import { Sun, DollarSign, Leaf, Globe2, ShieldCheck, CheckCircle2, TrendingUp, Zap } from 'lucide-react';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { InlineEditableText } from '../common/InlineEditableText';

interface PDFSolarBenefitsPageProps {
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

export const PDFSolarBenefitsPage: React.FC<PDFSolarBenefitsPageProps> = ({
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
          pageTitle="2. BENEFICIOS DE LA ENERGÍA SOLAR Y LEY 57-07"
          customization={project.customization}
        />
      )}
      {/* Body */}
      <div className="px-10 pt-3 pb-3 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 min-h-0">
        {/* Section 2: Beneficios de la Energía Solar */}
        <div className="space-y-2.5">
          <div
            className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            2. BENEFICIOS DE LA ENERGÍA SOLAR
          </div>

          {/* Visual House Illustration with Full Width and 4 Feature Pills */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white relative shadow-sm">
            <div className="h-64 w-full relative overflow-hidden">
              <img
                src={PDF_BENEFITS_HOUSE_BASE64}
                alt="Modern luxury home with rooftop solar panels"
                className="w-full h-full object-cover object-center block"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3.5 left-4 text-white">
                <span className="text-[11px] font-black uppercase tracking-wider bg-emerald-600/90 backdrop-blur-xs px-3 py-1.5 rounded-md shadow-xs">
                  Energía Limpia y Autonomía Residencial
                </span>
              </div>
            </div>

            {/* 4 Pillars Grid inside card - Enchanced & Spacious */}
            <div className="p-3.5 bg-white grid grid-cols-4 gap-3 border-t border-slate-100">
              <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200/80 text-center space-y-1.5 shadow-2xs">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <DollarSign className="w-4 h-4" />
                </div>
                <h5 className="font-black text-[11px] uppercase tracking-tight text-emerald-950">Ahorro en Factura</h5>
                <p className="text-[10px] text-slate-600 leading-snug font-medium">
                  Reducción inmediata de hasta un 95% del costo eléctrico mensual.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/90 border border-blue-200/80 text-center space-y-1.5 shadow-2xs">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h5 className="font-black text-[11px] uppercase tracking-tight text-blue-950">Plusvalía Inmueble</h5>
                <p className="text-[10px] text-slate-600 leading-snug font-medium">
                  Incremento directo del valor comercial del inmueble o negocio.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-center space-y-1.5 shadow-2xs">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Zap className="w-4 h-4" />
                </div>
                <h5 className="font-black text-[11px] uppercase tracking-tight text-amber-950">Independencia</h5>
                <p className="text-[10px] text-slate-600 leading-snug font-medium">
                  Protección ante futuros incrementos tarifarios de las distribuidoras.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-teal-50/90 border border-teal-200/80 text-center space-y-1.5 shadow-2xs">
                <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Leaf className="w-4 h-4" />
                </div>
                <h5 className="font-black text-[11px] uppercase tracking-tight text-teal-950">Sostenibilidad</h5>
                <p className="text-[10px] text-slate-600 leading-snug font-medium">
                  Energía 100% limpia sin emisiones contaminantes a la atmósfera.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2.1: Objetivos de la Ley 57-07 */}
        <div className="space-y-2.5">
          <div
            className="inline-block px-3.5 py-1.5 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            2.1. OBJETIVOS E INCENTIVOS DE LA LEY 57-07 DE ENERGÍAS RENOVABLES
          </div>

          <InlineEditableText
            value={cust.ley5707ObjectivesIntroText}
            defaultValue={DEFAULT_DOCUMENT_CUSTOMIZATION.ley5707ObjectivesIntroText}
            onSave={(val) => updateDocumentCustomization?.({ ley5707ObjectivesIntroText: val })}
            isEditMode={isEditMode}
            multiline={true}
            label="Objetivos Ley 57-07 (Intro)"
            className="text-slate-700 text-[11.5px] leading-relaxed font-medium block whitespace-pre-line"
            boldClassName="text-slate-950 font-bold"
            isCustomized={!!cust.ley5707ObjectivesIntroText}
            onReset={() => updateDocumentCustomization?.({ ley5707ObjectivesIntroText: '' })}
          />

          <div className="grid grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-start gap-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-black text-xs text-slate-900 mb-1">Fortalecer la Diversidad Energética</h5>
                <p className="text-[10.5px] text-slate-600 leading-relaxed font-medium">
                  Ampliar la capacidad de generación eléctrica distribuida mediante fuentes no convencionales técnica y económicamente viables.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-start gap-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-black text-xs text-slate-900 mb-1">Disminuir Dependencia de Fósiles</h5>
                <p className="text-[10.5px] text-slate-600 leading-relaxed font-medium">
                  Reducir la vulnerabilidad económica del país ante fluctuaciones de precios internacionales de hidrocarburos.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-start gap-3 shadow-xs">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-black text-xs text-slate-900 mb-1">Crédito Fiscal al Impuesto Sobre la Renta</h5>
                <p className="text-[10.5px] text-slate-600 leading-relaxed font-medium">
                  Permite deducir hasta un <strong>40% de la inversión en equipos</strong> del Impuesto Sobre la Renta (ISR), acelerando el retorno del capital invertido.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 flex items-start gap-3 shadow-xs">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-black text-xs text-slate-900 mb-1">Exención Arancelaria y de ITBIS</h5>
                <p className="text-[10.5px] text-slate-600 leading-relaxed font-medium">
                  Exención del 100% de impuestos a la importación y aranceles sobre equipos solares certificados para proyectos residenciales e industriales.
                </p>
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
