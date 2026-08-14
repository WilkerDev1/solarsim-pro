import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { Phone, MapPin, Globe, Instagram, MapPinned } from 'lucide-react';
import { ELECTSUN_LOGO_COLOR_BASE64, ELECTSUN_LOGO_WHITE_BASE64 } from '../../../assets/electsunLogo';
import { PDF_COVER_HERO_BASE64 } from '../../../assets/pdfGraphicAssets';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';

interface PDFCoverPageProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  currentDateStr: string;
}

export const PDFCoverPage: React.FC<PDFCoverPageProps> = ({
  project,
  summary,
  activeTheme,
  currentDateStr,
}) => {
  const cust = project.customization || {};
  const companyName = cust.companyName || DEFAULT_DOCUMENT_CUSTOMIZATION.companyName || 'electsun';
  const companySlogan = cust.companySlogan || DEFAULT_DOCUMENT_CUSTOMIZATION.companySlogan || 'El sol a tu favor';
  const companyPhone = cust.companyPhone || DEFAULT_DOCUMENT_CUSTOMIZATION.companyPhone || '+1 (809) 555-0199';
  const companyFooterText = cust.companyFooterText || DEFAULT_DOCUMENT_CUSTOMIZATION.companyFooterText || 'Calle Ercilia Pepín #1, Plaza Toledo, Local 307, Arroyo Manzano, Sto. Dgo. Rep. Dom.';
  const companyWebsite = cust.companyWebsite || DEFAULT_DOCUMENT_CUSTOMIZATION.companyWebsite || 'electsun.com.do';
  const companyInstagram = cust.companyInstagram || DEFAULT_DOCUMENT_CUSTOMIZATION.companyInstagram || 'Electsunrd';

  const isDefaultElectsun = companyName.toLowerCase().trim() === 'electsun';
  // Use color or white logo directly without capsule background
  const headerLogoSrc = cust.headerLogoBase64 || ELECTSUN_LOGO_COLOR_BASE64;

  const clientName = (project.client.name || 'Centro Médico Hispánico').toUpperCase();
  const clientLocation = project.client.province || project.client.location || 'Santo Domingo / Distrito Nacional';
  const panelModelText = `${project.specs.panelCount} Módulos Tier-1 (${project.specs.panelPowerW}W)`;

  return (
    <div className="pdf-page w-[850px] min-h-[1100px] bg-white shadow-2xl flex flex-col justify-between shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
      {/* 1. Header Overlay (Transparent High-Resolution Logo on Top-Right) */}
      <div className="absolute top-0 right-0 w-full flex justify-end p-9 z-30 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          {cust.headerLogoBase64 || isDefaultElectsun ? (
            <img
              src={headerLogoSrc}
              alt={companyName}
              className="h-16 max-h-[70px] w-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
            />
          ) : (
            <div className="flex flex-col text-right drop-shadow-md">
              <span
                className="text-3xl font-black tracking-tight uppercase"
                style={{ color: activeTheme.primary }}
              >
                {companyName}
              </span>
              <span className="text-xs font-bold text-white uppercase tracking-widest">
                {companySlogan}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Geometric Hero Section with Exact Polygon Clip-paths */}
      <div className="relative h-[530px] w-full z-0 overflow-hidden bg-slate-900">
        {/* Subtle dot-grid texture on background */}
        <div
          className="absolute inset-0 opacity-25 pointer-events-none z-0"
          style={{
            backgroundImage: 'radial-gradient(#ffffff 1.2px, transparent 1.2px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Underlying Colored Polygons (Zero white gaps) */}
        <div
          className="absolute right-0 bottom-12 w-2/3 h-1/2 z-0"
          style={{
            backgroundColor: activeTheme.primary,
            clipPath: 'polygon(100% 0, 100% 100%, 18% 100%)',
            opacity: 0.95,
          }}
        />

        <div
          className="absolute right-0 bottom-0 w-1/2 h-1/3 z-0"
          style={{
            backgroundColor: activeTheme.secondary,
            clipPath: 'polygon(100% 0, 100% 100%, 48% 100%)',
            opacity: 0.95,
          }}
        />

        {/* Main Image Polygon on Top */}
        <div
          className="absolute inset-0 z-10 overflow-hidden"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 100% 65%, 40% 100%, 0% 100%)',
          }}
        >
          <img
            src={PDF_COVER_HERO_BASE64}
            alt="Solar rooftop installation at sunset"
            className="w-full h-full object-cover object-center"
          />
          {/* Subtle blend overlay */}
          <div
            className="absolute inset-0 opacity-20 mix-blend-multiply"
            style={{ backgroundColor: activeTheme.primary }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25" />
        </div>

        {/* Top-Left Project Tag (Directly Relevant to Proposal) */}
        <div className="absolute top-10 left-12 z-20 space-y-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-1 rounded-full shadow-md"
              style={{ backgroundColor: activeTheme.secondary }}
            />
            <span className="text-xs font-black tracking-[0.25em] text-white uppercase drop-shadow-md">
              SISTEMA SOLAR FOTOVOLTAICO
            </span>
          </div>

          <div
            className="backdrop-blur-md text-white px-4 py-2 inline-flex items-center gap-2 rounded-sm border-l-4 shadow-xl"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              borderLeftColor: activeTheme.secondary,
            }}
          >
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
              ENERGÍA SOLAR
            </span>
            <span className="text-xs font-bold text-white/90 uppercase tracking-wider">
              • LEY 57-07
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Content Area with Dot-Grid & Dual-Tone Complementary Typography */}
      <main className="flex-1 px-12 pt-7 pb-4 flex flex-col justify-center relative z-10 bg-white">
        {/* Dot-Grid Texture */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#94a3b8 1.2px, transparent 1.2px)',
            backgroundSize: '20px 20px',
          }}
        />

        <div className="flex w-full gap-10 relative z-10 items-center">
          {/* Left Column: Title & Dual-Tone Details */}
          <div className="flex-1 flex flex-col justify-center">
            {/* Header Dual-Tone Tag */}
            <div className="flex items-center gap-3 mb-3">
              <span
                className="w-12 h-1 rounded-full inline-block"
                style={{ backgroundColor: activeTheme.secondary }}
              />
              <span
                className="text-xs font-black tracking-[0.3em] uppercase"
                style={{ color: activeTheme.primary }}
              >
                PROPUESTA TÉCNICA Y ECONÓMICA
              </span>
            </div>

            {/* Client Name in Large Imposing Typography */}
            <h1
              className="text-5xl font-black uppercase leading-[1.1] tracking-tight mb-3 drop-shadow-xs"
              style={{ color: activeTheme.primary }}
            >
              {clientName}
            </h1>

            {/* Location */}
            <div className="flex items-center gap-2 text-slate-600 text-sm font-bold mb-6">
              <MapPinned
                className="w-4 h-4 shrink-0"
                style={{ color: activeTheme.secondary }}
              />
              <span>{clientLocation}</span>
            </div>

            {/* Technical Capacity Callout (Dual-Tone) */}
            <div
              className="inline-flex items-center gap-5 py-3.5 border-b-2 max-w-[360px]"
              style={{ borderBottomColor: activeTheme.primary }}
            >
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-5xl font-black tracking-tight font-mono"
                  style={{ color: activeTheme.primary }}
                >
                  {summary.systemCapacityKWp.toFixed(2)}
                </span>
                <span
                  className="text-2xl font-black uppercase font-sans"
                  style={{ color: activeTheme.secondary }}
                >
                  kWp
                </span>
              </div>

              <div
                className="h-10 w-0.5 rounded-full"
                style={{ backgroundColor: activeTheme.secondary }}
              />

              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest leading-tight">
                Capacidad
                <br />
                Instalada
              </span>
            </div>
          </div>

          {/* Right Column: Sidebar Info with Complementary Color Dots */}
          <div className="w-64 flex flex-col justify-center border-l-2 border-slate-100 pl-8 space-y-4">
            {/* ID Proyecto */}
            <div className="relative">
              <div
                className="absolute -left-[38px] w-3 h-3 rounded-full top-1 shadow-xs"
                style={{ backgroundColor: activeTheme.secondary }}
              />
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">
                ID Proyecto
              </span>
              <span
                className="text-lg font-black font-mono block"
                style={{ color: activeTheme.primary }}
              >
                {project.client.projectId || 'SP-2024-089'}
              </span>
            </div>

            {/* Fecha Emisión */}
            <div className="relative">
              <div
                className="absolute -left-[38px] w-3 h-3 rounded-full top-1 shadow-xs"
                style={{ backgroundColor: activeTheme.primary }}
              />
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">
                Fecha Emisión
              </span>
              <span
                className="text-lg font-black block"
                style={{ color: activeTheme.primary }}
              >
                {currentDateStr}
              </span>
            </div>

            {/* Validez */}
            <div className="relative">
              <div
                className="absolute -left-[38px] w-3 h-3 rounded-full top-1 shadow-xs"
                style={{ backgroundColor: activeTheme.secondary }}
              />
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">
                Validez
              </span>
              <span
                className="text-lg font-black block"
                style={{ color: activeTheme.secondary }}
              >
                {project.client.quoteValidityDays || 7} Días Laborables
              </span>
            </div>

            {/* Configuración */}
            <div className="relative pt-3 border-t border-slate-200">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">
                Configuración
              </span>
              <span className="text-xs font-bold text-slate-800 block leading-snug">
                {panelModelText}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* 4. Minimalist Corporate Footer */}
      <footer className="mt-auto px-12 py-5 bg-slate-50 border-t border-slate-200 relative overflow-hidden">
        {/* Subtle Decorative Circle Outline */}
        <div
          className="absolute right-[-40px] bottom-[-40px] w-44 h-44 rounded-full border-[10px] border-slate-200/70 opacity-60 pointer-events-none"
        />

        <div className="flex justify-between items-center relative z-10 text-xs">
          <div className="flex items-center gap-7">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg text-white flex items-center justify-center shadow-xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Phone className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-900 text-xs">{companyPhone}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg text-white flex items-center justify-center shadow-xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Globe className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-900 text-xs">{companyWebsite}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg text-white flex items-center justify-center shadow-xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Instagram className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-900 text-xs">@{companyInstagram}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase tracking-wider font-extrabold">
            <MapPin className="w-4 h-4" style={{ color: activeTheme.secondary }} />
            <span className="truncate max-w-[270px]">
              {companyFooterText.split('|')[0] || companyFooterText}
            </span>
          </div>
        </div>

        {/* Bottom Decorative Dual-Tone Colored Bar */}
        <div className="absolute bottom-0 left-0 w-full flex h-2.5">
          <div className="w-1/3" style={{ backgroundColor: activeTheme.secondary }} />
          <div className="w-2/3" style={{ backgroundColor: activeTheme.primary }} />
        </div>
      </footer>
    </div>
  );
};
