import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { Phone, MapPin, Globe, Instagram, MapPinned } from 'lucide-react';
import { ELECTSUN_LOGO_COLOR_BASE64 } from '../../../assets/electsunLogo';
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
  const headerLogoSrc = cust.headerLogoBase64 || ELECTSUN_LOGO_COLOR_BASE64;

  const clientName = project.client.name || 'Centro Médico Hispánico';
  const clientLocation = project.client.province || project.client.location || 'Santo Domingo / Distrito Nacional';
  const panelModelText = `${project.specs.panelCount} Módulos Tier-1 (${project.specs.panelPowerW}W)`;

  return (
    <div className="pdf-page w-[850px] min-h-[1100px] bg-white shadow-2xl flex flex-col justify-between shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
      {/* 1. Header Overlay (Top-Right Floating Brand Card) */}
      <div className="absolute top-0 right-0 w-full flex justify-end p-8 z-30 pointer-events-none">
        <div className="flex items-center gap-3 bg-white/95 backdrop-blur-md px-6 py-2.5 rounded-full shadow-lg border border-white/80 pointer-events-auto">
          {cust.headerLogoBase64 || isDefaultElectsun ? (
            <img
              src={headerLogoSrc}
              alt={companyName}
              className="h-10 max-h-11 w-auto object-contain"
            />
          ) : (
            <div className="flex flex-col leading-none">
              <span
                className="text-2xl font-extrabold tracking-tighter uppercase"
                style={{ color: activeTheme.primary }}
              >
                {companyName}
              </span>
              <span className="text-[9px] text-slate-500 font-medium self-end tracking-wider">
                {companySlogan}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Geometric Hero Section with Polygons & Diagonal Cuts */}
      <div className="relative h-[560px] w-full z-0 flex flex-col overflow-hidden bg-slate-900">
        {/* Background Dot-Grid Texture */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none z-0"
          style={{
            backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Main Image with Geometric Clip */}
        <div
          className="absolute inset-0 z-10 overflow-hidden"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 100% 68%, 42% 100%, 0% 100%)',
          }}
        >
          <img
            src={PDF_COVER_HERO_BASE64}
            alt="Solar rooftop installation at sunset"
            className="w-full h-full object-cover object-center scale-100"
          />
          {/* Subtle Multiply Tint */}
          <div
            className="absolute inset-0 opacity-25 mix-blend-multiply"
            style={{ backgroundColor: activeTheme.primary }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/30" />
        </div>

        {/* Color Accent Polygon 1 (Primary / Theme Color) */}
        <div
          className="absolute right-0 bottom-10 w-2/3 h-1/2 opacity-95 z-0 transition-colors"
          style={{
            backgroundColor: activeTheme.primary,
            clipPath: 'polygon(100% 0, 100% 100%, 20% 100%)',
          }}
        />

        {/* Color Accent Polygon 2 (Secondary / Accent Color) */}
        <div
          className="absolute right-0 bottom-0 w-1/2 h-1/3 z-0 transition-colors"
          style={{
            backgroundColor: activeTheme.secondary,
            clipPath: 'polygon(100% 0, 100% 100%, 45% 100%)',
          }}
        />

        {/* Legislative Tag (Top Left) */}
        <div className="absolute top-10 left-12 z-20 space-y-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-1 rounded-full shadow-xs"
              style={{ backgroundColor: activeTheme.secondary }}
            />
            <span className="text-xs font-black tracking-[0.3em] text-white uppercase drop-shadow-md">
              Dossier Ejecutivo
            </span>
          </div>

          <div
            className="backdrop-blur-md text-white px-4 py-1.5 inline-flex items-center gap-2 rounded-sm border-l-4 shadow-lg"
            style={{
              backgroundColor: `${activeTheme.primary}dd`,
              borderLeftColor: activeTheme.secondary,
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Ingeniería Solar • Ley 57-07
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Content Area */}
      <main className="flex-1 px-12 pt-6 pb-4 flex flex-col justify-center relative z-10 bg-white">
        {/* Subtle Dot-Grid Texture */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        <div className="flex w-full gap-8 relative z-10 items-center">
          {/* Left Column: Title & Capacity */}
          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-[11px] font-black tracking-[0.3em] text-slate-400 uppercase mb-3 flex items-center gap-3">
              <span className="w-12 h-0.5 bg-slate-300 rounded-full inline-block" />
              PROPUESTA TÉCNICA
            </h2>

            <h1
              className="text-4xl font-extrabold uppercase leading-tight tracking-tight mb-2 drop-shadow-2xs"
              style={{ color: activeTheme.primary }}
            >
              {clientName}
            </h1>

            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-6">
              <MapPinned className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{clientLocation}</span>
            </div>

            {/* Clean Technical Callout for Capacity */}
            <div
              className="inline-flex items-center gap-5 py-3 border-b-2 max-w-[340px]"
              style={{ borderBottomColor: `${activeTheme.primary}40` }}
            >
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-4xl font-light tracking-tight font-mono"
                  style={{ color: activeTheme.primary }}
                >
                  {summary.systemCapacityKWp.toFixed(2)}
                </span>
                <span
                  className="text-xl font-black font-sans uppercase"
                  style={{ color: activeTheme.primary }}
                >
                  kWp
                </span>
              </div>

              <div className="h-8 w-px bg-slate-300" />

              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
                Capacidad
                <br />
                Instalada
              </span>
            </div>
          </div>

          {/* Right Column: Sidebar Info Cards */}
          <div className="w-64 flex flex-col justify-center border-l border-slate-200 pl-8 space-y-4">
            <div className="relative">
              <div
                className="absolute -left-[37px] w-2.5 h-2.5 rounded-full top-1 shadow-2xs"
                style={{ backgroundColor: activeTheme.secondary }}
              />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                ID Proyecto
              </span>
              <span className="text-sm font-bold font-mono text-slate-900 block">
                {project.client.projectId || 'SP-2024-089'}
              </span>
            </div>

            <div className="relative">
              <div
                className="absolute -left-[37px] w-2.5 h-2.5 rounded-full top-1 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                Fecha Emisión
              </span>
              <span className="text-sm font-bold text-slate-900 block">
                {currentDateStr}
              </span>
            </div>

            <div className="relative">
              <div className="absolute -left-[37px] w-2.5 h-2.5 rounded-full top-1 bg-slate-700 shadow-2xs" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                Validez
              </span>
              <span className="text-sm font-bold text-emerald-700 block">
                {project.client.quoteValidityDays || 7} Días Laborables
              </span>
            </div>

            <div className="relative pt-3 border-t border-slate-200">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                Configuración
              </span>
              <span className="text-xs font-semibold text-slate-700 block leading-snug">
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
          className="absolute right-[-40px] bottom-[-40px] w-40 h-40 rounded-full border-[8px] border-slate-200/60 opacity-60 pointer-events-none"
        />

        <div className="flex justify-between items-center relative z-10 text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white text-slate-700 flex items-center justify-center border border-slate-200 shadow-2xs">
                <Phone className="w-3.5 h-3.5 text-slate-600" />
              </div>
              <span className="font-semibold text-slate-800 text-[11px]">{companyPhone}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white text-slate-700 flex items-center justify-center border border-slate-200 shadow-2xs">
                <Globe className="w-3.5 h-3.5 text-slate-600" />
              </div>
              <span className="font-semibold text-slate-800 text-[11px]">{companyWebsite}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white text-slate-700 flex items-center justify-center border border-slate-200 shadow-2xs">
                <Instagram className="w-3.5 h-3.5 text-slate-600" />
              </div>
              <span className="font-semibold text-slate-800 text-[11px]">@{companyInstagram}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase tracking-wider font-semibold">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate max-w-[260px]">
              {companyFooterText.split('|')[0] || companyFooterText}
            </span>
          </div>
        </div>

        {/* Bottom Decorative Two-Tone Colored Bar */}
        <div className="absolute bottom-0 left-0 w-full flex h-2">
          <div className="w-1/3" style={{ backgroundColor: activeTheme.secondary }} />
          <div className="w-2/3" style={{ backgroundColor: activeTheme.primary }} />
        </div>
      </footer>
    </div>
  );
};
