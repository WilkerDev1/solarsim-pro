import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { PDF_ROOF_DETAIL_BASE64 } from '../../../assets/pdfGraphicAssets';
import { Sun, ArrowRight, Cpu, Home, BatteryCharging, Gauge, Zap } from 'lucide-react';

interface PDFTechnicalIntroPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

export const PDFTechnicalIntroPage: React.FC<PDFTechnicalIntroPageProps> = ({
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
          pageTitle="3. ¿QUÉ ES UN SISTEMA FOTOVOLTAICO? Y DESCRIPCIÓN TÉCNICA"
          customization={project.customization}
        />
      )}

      {/* Body */}
      <div className="px-10 py-6 flex-1 flex flex-col justify-between text-xs text-slate-800 relative z-10 gap-4">
        {/* Section 3: ¿Qué es y Cómo Funciona? */}
        <div className="space-y-3">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-2.5 flex-1">
              <div
                className="py-1 px-3 rounded-md text-white font-bold text-xs uppercase tracking-wider inline-block shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                3. ¿QUÉ ES UN SISTEMA FOTOVOLTAICO?
              </div>
              <p className="text-slate-700 text-xs leading-relaxed font-medium">
                Un sistema solar fotovoltaico es el conjunto integrado de equipos de alta ingeniería diseñados para capturar los fotones de la radiación solar y transformarlos directamente en electricidad de corriente continua (CC), para luego acondicionarla en corriente alterna (CA) utilizable en electrodomésticos, maquinaria e inyección a la red pública.
              </p>

              <div
                className="py-1 px-3 rounded-md text-white font-bold text-xs uppercase tracking-wider inline-block shadow-2xs mt-1"
                style={{ backgroundColor: activeTheme.primary }}
              >
                3.1 ¿CÓMO FUNCIONA?
              </div>
              <p className="text-slate-700 text-xs leading-relaxed font-medium">
                La energía generada depende de las Horas de Sol Pico (HSP) disponibles en la localidad ({project.client.province || 'RD'}), la orientación e inclinación de los módulos, y la eficiencia de conversión de las celdas fotovoltaicas de silicio monocristalino tipo N (TOPCon).
              </p>
            </div>

            {/* 3D Solar Panel Detail Render */}
            <div className="w-56 h-48 rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 shadow-sm shrink-0 flex items-center justify-center p-1">
              <img
                src={PDF_ROOF_DETAIL_BASE64}
                alt="3D Solar array on tile roof"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Descripción Técnica & Diagrama de Flujo */}
        <div className="space-y-3">
          <div
            className="py-1 px-3 rounded-md text-white font-bold text-xs uppercase tracking-wider inline-block shadow-2xs"
            style={{ backgroundColor: activeTheme.primary }}
          >
            4. DESCRIPCIÓN TÉCNICA Y DIAGRAMA DE FLUJO ENERGÉTICO
          </div>

          {/* Electrical Architecture Flow Diagram */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/90 shadow-sm space-y-4">
            {/* Top Flow Row */}
            <div className="grid grid-cols-5 gap-2 items-center text-center">
              {/* 1. Radiación Solar */}
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-300 text-slate-800 space-y-1">
                <Sun className="w-6 h-6 text-amber-500 mx-auto" />
                <span className="text-[10px] font-black uppercase tracking-tight block">Radiación Solar</span>
                <span className="text-[9px] text-slate-500 block">Fotones de Luz</span>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center text-slate-400">
                <span className="text-[9px] font-bold font-mono">CC</span>
                <ArrowRight className="w-4 h-4 text-emerald-600" />
              </div>

              {/* 2. Paneles Solares */}
              <div className="p-2.5 rounded-xl bg-slate-900 text-white space-y-1 shadow-xs">
                <Zap className="w-6 h-6 text-amber-400 mx-auto" />
                <span className="text-[10px] font-black uppercase tracking-tight block">Paneles Solares</span>
                <span className="text-[9px] text-slate-300 font-mono block font-bold">
                  {summary.systemCapacityKWp.toFixed(2)} kWp CC
                </span>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center text-slate-400">
                <span className="text-[9px] font-bold font-mono">CC → CA</span>
                <ArrowRight className="w-4 h-4 text-emerald-600" />
              </div>

              {/* 3. Inversor Central */}
              <div className="p-2.5 rounded-xl bg-emerald-700 text-white space-y-1 shadow-xs">
                <Cpu className="w-6 h-6 text-emerald-200 mx-auto" />
                <span className="text-[10px] font-black uppercase tracking-tight block">Inversor Solar</span>
                <span className="text-[9px] text-emerald-100 font-mono block font-bold">
                  {project.specs.inverterPowerKW || (summary.systemCapacityKWp * 0.9).toFixed(1)} kW (CA)
                </span>
              </div>
            </div>

            {/* Bottom Flow Row (Destinations & Interactions) */}
            <div className="grid grid-cols-3 gap-3 border-t border-slate-200/80 pt-3">
              {/* Uso Doméstico */}
              <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Home className="w-4 h-4 text-emerald-600" />
                  <span>1. Autoconsumo Inmediato</span>
                </div>
                <p className="text-[10px] text-slate-600 leading-snug">
                  La energía producida se consume en tiempo real en la propiedad, reduciendo al instante la compra de electricidad a la distribuidora.
                </p>
              </div>

              {/* Baterías (si aplica) */}
              <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <BatteryCharging className="w-4 h-4 text-cyan-600" />
                  <span>2. Respaldo y Baterías</span>
                </div>
                <p className="text-[10px] text-slate-600 leading-snug">
                  {project.specs.batteryCapacityKWh > 0
                    ? `Banco de baterías de ${project.specs.batteryCapacityKWh} kWh almacena excedentes para consumo nocturno y cortes de energía.`
                    : 'Permite incorporar bancos de litio opcionales para maximizar el autoconsumo y garantizar respaldo 24/7.'}
                </p>
              </div>

              {/* Medición Neta EDES */}
              <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Gauge className="w-4 h-4 text-blue-600" />
                  <span>3. Medición Neta (Net Metering)</span>
                </div>
                <p className="text-[10px] text-slate-600 leading-snug">
                  El medidor bidireccional registra la energía inyectada a la red cuando hay exceso de sol, acreditando créditos en kWh en la factura mensual.
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
