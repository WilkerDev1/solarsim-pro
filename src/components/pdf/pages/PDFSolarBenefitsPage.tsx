import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { PDF_BENEFITS_HOUSE_BASE64 } from '../../../assets/pdfGraphicAssets';
import { Sun, DollarSign, Leaf, Globe2, ShieldCheck, CheckCircle2 } from 'lucide-react';

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
    <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
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
      <div className="px-10 py-6 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 gap-5">
        {/* Section 2: Beneficios de la Energía Solar */}
        <div className="space-y-3">
          <div
            className="py-1 px-3 rounded-md text-white font-bold text-xs uppercase tracking-wider inline-block shadow-2xs"
            style={{ backgroundColor: activeTheme.primary }}
          >
            2. BENEFICIOS DE LA ENERGÍA SOLAR
          </div>

          {/* Visual House Illustration with 4 Feature Pills */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 relative shadow-sm">
            <div className="h-44 w-full relative">
              <img
                src={PDF_BENEFITS_HOUSE_BASE64}
                alt="Modern luxury home with rooftop solar panels"
                className="w-full h-full object-cover object-center opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent" />
            </div>

            {/* 4 Pillars Grid inside card */}
            <div className="p-3.5 bg-white grid grid-cols-4 gap-2.5 border-t border-slate-100">
              <div className="p-2 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
                <h5 className="font-extrabold text-[10px] uppercase text-emerald-950">Ahorro en Factura</h5>
                <p className="text-[9px] text-slate-600 leading-tight">
                  Reducción drástica del gasto energético mensual desde el primer mes.
                </p>
              </div>

              <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200/80 text-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Sun className="w-3.5 h-3.5" />
                </div>
                <h5 className="font-extrabold text-[10px] uppercase text-amber-950">Recurso Inagotable</h5>
                <p className="text-[9px] text-slate-600 leading-tight">
                  Energía abundante y predecible durante todo el año en RD (5.5 HSP).
                </p>
              </div>

              <div className="p-2 rounded-xl bg-teal-50/80 border border-teal-200/80 text-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Leaf className="w-3.5 h-3.5" />
                </div>
                <h5 className="font-extrabold text-[10px] uppercase text-teal-950">Cero Contaminación</h5>
                <p className="text-[9px] text-slate-600 leading-tight">
                  Operación 100% silenciosa y sin emisión de gases de efecto invernadero.
                </p>
              </div>

              <div className="p-2 rounded-xl bg-blue-50/80 border border-blue-200/80 text-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto shadow-2xs">
                  <Globe2 className="w-3.5 h-3.5" />
                </div>
                <h5 className="font-extrabold text-[10px] uppercase text-blue-950">Sostenibilidad</h5>
                <p className="text-[9px] text-slate-600 leading-tight">
                  Revaloriza tu propiedad y protege contra aumentos tarifarios futuros.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2.1: Objetivos de la Ley 57-07 */}
        <div className="space-y-3 pt-2">
          <div
            className="py-1 px-3 rounded-md text-white font-bold text-xs uppercase tracking-wider inline-block shadow-2xs"
            style={{ backgroundColor: activeTheme.primary }}
          >
            2.1. OBJETIVOS E INCENTIVOS DE LA LEY 57-07 DE ENERGÍAS RENOVABLES
          </div>

          <p className="text-slate-700 text-xs leading-relaxed font-medium">
            La <strong>Ley 57-07 sobre Incentivo al Desarrollo de Fuentes Renovables de Energía</strong> fue promulgada para transformar la matriz energética nacional y acelerar la transición hacia un modelo sostenible y soberano. Sus principales objetivos y beneficios son:
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-slate-900 mb-0.5">Fortalecer la Diversidad Energética</h5>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Ampliar la capacidad de generación eléctrica distribuida mediante fuentes no convencionales técnica y económicamente viables.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-slate-900 mb-0.5">Disminuir Dependencia de Fósiles</h5>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Reducir la vulnerabilidad económica del país ante fluctuaciones de precios internacionales de hidrocarburos.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-slate-900 mb-0.5">Crédito Fiscal al Impuesto Sobre la Renta</h5>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Permite deducir hasta un <strong>40% de la inversión en equipos</strong> del Impuesto Sobre la Renta (ISR), acelerando el retorno del capital invertido.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-slate-900 mb-0.5">Exención Arancelaria y de ITBIS</h5>
                <p className="text-[11px] text-slate-600 leading-snug">
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
