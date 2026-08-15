import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { PDF_BENEFITS_HOUSE_BASE64 } from '../../../assets/pdfGraphicAssets';
import { Sun, DollarSign, Leaf, Globe2, ShieldCheck, CheckCircle2, TrendingUp, Zap } from 'lucide-react';

interface PDFSolarBenefitsPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFSolarBenefitsPage: React.FC<PDFSolarBenefitsPageProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
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
      <div className="px-10 pt-3 pb-3 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 gap-3 min-h-0">
        {/* Section 2: Beneficios de la Energía Solar */}
        <div className="space-y-3">
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
            <div className="h-60 w-full relative overflow-hidden">
              <img
                src={PDF_BENEFITS_HOUSE_BASE64}
                alt="Modern luxury home with rooftop solar panels"
                className="w-full h-full object-cover object-center block"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-4 text-white">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600/90 backdrop-blur-xs px-2.5 py-1 rounded-md">
                  Energía Limpia y Autonomía Residencial
                </span>
              </div>
            </div>

            {/* 4 Pillars Grid inside card */}
            <div className="p-3 bg-white grid grid-cols-4 gap-2.5 border-t border-slate-100">
              <div className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200/80 text-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
                <h5 className="font-extrabold text-[10.5px] uppercase text-emerald-950">Ahorro en Factura</h5>
                <p className="text-[9px] text-slate-600 leading-tight">
                  Reducción inmediata de hasta un 95% del costo eléctrico mensual.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50/90 border border-blue-200/80 text-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <h5 className="font-extrabold text-[10.5px] uppercase text-blue-950">Plusvalía Inmueble</h5>
                <p className="text-[9px] text-slate-600 leading-tight">
                  Incremento directo del valor comercial del inmueble o negocio.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/80 text-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <h5 className="font-extrabold text-[10.5px] uppercase text-amber-950">Independencia</h5>
                <p className="text-[9px] text-slate-600 leading-tight">
                  Protección ante futuros incrementos tarifarios de las distribuidoras.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-teal-50/90 border border-teal-200/80 text-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Leaf className="w-3.5 h-3.5" />
                </div>
                <h5 className="font-extrabold text-[10.5px] uppercase text-teal-950">Sostenibilidad</h5>
                <p className="text-[9px] text-slate-600 leading-tight">
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

          <p className="text-slate-700 text-xs leading-relaxed font-medium">
            La <strong>Ley 57-07 sobre Incentivo al Desarrollo de Fuentes Renovables de Energía</strong> fue promulgada para transformar la matriz energética nacional y acelerar la transición hacia un modelo sostenible y soberano. Sus principales objetivos y beneficios son:
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/90 flex items-start gap-2.5 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-slate-900 mb-0.5">Fortalecer la Diversidad Energética</h5>
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  Ampliar la capacidad de generación eléctrica distribuida mediante fuentes no convencionales técnica y económicamente viables.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/90 flex items-start gap-2.5 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-slate-900 mb-0.5">Disminuir Dependencia de Fósiles</h5>
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  Reducir la vulnerabilidad económica del país ante fluctuaciones de precios internacionales de hidrocarburos.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/90 flex items-start gap-2.5 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-slate-900 mb-0.5">Crédito Fiscal al Impuesto Sobre la Renta</h5>
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  Permite deducir hasta un <strong>40% de la inversión en equipos</strong> del Impuesto Sobre la Renta (ISR), acelerando el retorno del capital invertido.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/90 flex items-start gap-2.5 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-slate-900 mb-0.5">Exención Arancelaria y de ITBIS</h5>
                <p className="text-[10px] text-slate-600 leading-relaxed">
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
