import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { Wrench, Activity, LineChart, Sparkles, Award, Shield, Users } from 'lucide-react';

interface PDFAboutUsPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFAboutUsPage: React.FC<PDFAboutUsPageProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const cust = project.customization || {};
  const companyName = cust.companyName || DEFAULT_DOCUMENT_CUSTOMIZATION.companyName || 'ELECTSUN';
  const aboutUsIntroText = cust.aboutUsIntroText || DEFAULT_DOCUMENT_CUSTOMIZATION.aboutUsIntroText || '';
  const whyChooseUsText = cust.whyChooseUsText || DEFAULT_DOCUMENT_CUSTOMIZATION.whyChooseUsText || '';

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
          pageTitle="1. ¿QUIÉNES SOMOS? Y NUESTROS SERVICIOS"
          customization={project.customization}
        />
      )}

      {/* Body */}
      <div className="px-10 py-3.5 flex-1 flex flex-col justify-start gap-3 text-xs text-slate-800 relative z-10 min-h-0">
        {/* 1. ¿Quiénes Somos? Section */}
        <div className="space-y-1.5">
          <div
            className="inline-block px-3 py-1 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            1. ¿QUIÉNES SOMOS?
          </div>
          <p className="text-slate-700 text-xs leading-relaxed text-justify font-medium">
            {aboutUsIntroText}
          </p>
        </div>

        {/* NUESTROS SERVICIOS Grid */}
        <div className="space-y-1.5">
          <div className="text-center">
            <h3
              className="text-xs font-black uppercase tracking-wider"
              style={{ color: activeTheme.primary }}
            >
              NUESTROS SERVICIOS PRINCIPALES
            </h3>
            <div className="w-14 h-0.5 mx-auto mt-1" style={{ backgroundColor: activeTheme.secondary }} />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {/* Card 1 */}
            <div className="rounded-xl border border-slate-200 bg-white/95 p-2 flex flex-col justify-between shadow-xs">
              <div>
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-white mb-1 shadow-2xs"
                  style={{ backgroundColor: activeTheme.primary }}
                >
                  <Wrench className="w-3 h-3" />
                </div>
                <h4 className="font-extrabold text-[10.5px] uppercase tracking-tight text-slate-900 leading-snug mb-1">
                  Instalación Profesional
                </h4>
                <p className="text-[9px] text-slate-600 leading-tight mb-1.5">
                  Ejecutamos la instalación bajo los más altos estándares técnicos y normativas eléctricas de seguridad.
                </p>
              </div>
              <ul className="text-[8px] text-slate-600 space-y-0.5 border-t border-slate-100 pt-1 font-medium">
                <li>• Levantamiento técnico</li>
                <li>• Planos y diseño de ingeniería</li>
                <li>• Puesta en marcha certificada</li>
                <li>• Inducción al usuario</li>
              </ul>
            </div>

            {/* Card 2 */}
            <div className="rounded-xl border border-slate-200 bg-white/95 p-2 flex flex-col justify-between shadow-xs">
              <div>
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-white mb-1 shadow-2xs"
                  style={{ backgroundColor: activeTheme.primary }}
                >
                  <Activity className="w-3 h-3" />
                </div>
                <h4 className="font-extrabold text-[10.5px] uppercase tracking-tight text-slate-900 leading-snug mb-1">
                  Mantenimiento y Monitoreo
                </h4>
                <p className="text-[9px] text-slate-600 leading-tight mb-1.5">
                  Planes preventivos y predictivos para asegurar la máxima generación de los equipos.
                </p>
              </div>
              <ul className="text-[8px] text-slate-600 space-y-0.5 border-t border-slate-100 pt-1 font-medium">
                <li>• Monitoreo 24/7 en la nube</li>
                <li>• Limpieza de módulos solares</li>
                <li>• Termografía y diagnóstico</li>
                <li>• Soporte técnico continuo</li>
              </ul>
            </div>

            {/* Card 3 */}
            <div className="rounded-xl border border-slate-200 bg-white/95 p-2 flex flex-col justify-between shadow-xs">
              <div>
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-white mb-1 shadow-2xs"
                  style={{ backgroundColor: activeTheme.primary }}
                >
                  <LineChart className="w-3 h-3" />
                </div>
                <h4 className="font-extrabold text-[10.5px] uppercase tracking-tight text-slate-900 leading-snug mb-1">
                  Consultoría y Asesoría
                </h4>
                <p className="text-[9px] text-slate-600 leading-tight mb-1.5">
                  Acompañamiento estratégico mediante análisis técnicos y modelos financieros rigurosos.
                </p>
              </div>
              <ul className="text-[8px] text-slate-600 space-y-0.5 border-t border-slate-100 pt-1 font-medium">
                <li>• Estudios de factibilidad</li>
                <li>• Análisis de curvas de carga</li>
                <li>• Gestión de incentivos Ley 57-07</li>
                <li>• Trámites ante CNE y EDES</li>
              </ul>
            </div>

            {/* Card 4 */}
            <div className="rounded-xl border border-slate-200 bg-white/95 p-2 flex flex-col justify-between shadow-xs">
              <div>
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-white mb-1 shadow-2xs"
                  style={{ backgroundColor: activeTheme.primary }}
                >
                  <Sparkles className="w-3 h-3" />
                </div>
                <h4 className="font-extrabold text-[10.5px] uppercase tracking-tight text-slate-900 leading-snug mb-1">
                  Proyectos Especiales
                </h4>
                <p className="text-[9px] text-slate-600 leading-tight mb-1.5">
                  Soluciones fotovoltaicas a la medida para microgrids, almacenamiento y bombeo solar.
                </p>
              </div>
              <ul className="text-[8px] text-slate-600 space-y-0.5 border-t border-slate-100 pt-1 font-medium">
                <li>• Sistemas híbridos con baterías</li>
                <li>• Microredes aisladas e industriales</li>
                <li>• Modernización y repotenciación</li>
                <li>• Integración con generadores</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 1.1 ¿Por Qué Elegirnos? Section */}
        <div className="space-y-1.5">
          <div
            className="inline-block px-3 py-1 rounded-md font-black text-xs uppercase tracking-wider shadow-xs"
            style={{
              backgroundColor: activeTheme.primary,
              color: '#ffffff',
              lineHeight: '1.3',
            }}
          >
            1.1 ¿POR QUÉ ELEGIRNOS?
          </div>
          <p className="text-slate-700 text-xs leading-relaxed font-medium">
            {whyChooseUsText}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/80 space-y-1">
              <div className="flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <h5 className="font-bold text-xs text-slate-900">Innovación Constante</h5>
              </div>
              <p className="text-[9.5px] text-slate-600 leading-tight">
                Utilizamos exclusivamente tecnología Tier-1 de última generación (N-Type TOPCon, microinversores y baterías LiFePO4).
              </p>
            </div>

            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/80 space-y-1">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <h5 className="font-bold text-xs text-slate-900">Compromiso Ambiental</h5>
              </div>
              <p className="text-[9.5px] text-slate-600 leading-tight">
                Cada proyecto reduce de manera verificable miles de toneladas de CO2 y fomenta la transición energética nacional.
              </p>
            </div>

            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/80 space-y-1">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <h5 className="font-bold text-xs text-slate-900">Soporte Cercano</h5>
              </div>
              <p className="text-[9.5px] text-slate-600 leading-tight">
                Asistencia personalizada y gestión integral de permisos, medición neta y garantías durante toda la vida del sistema.
              </p>
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
