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
  // Use dedicated cover logo, fallback to header logo, or default color logo
  const coverLogoSrc = cust.coverLogoBase64 || cust.headerLogoBase64 || ELECTSUN_LOGO_COLOR_BASE64;
  const hasLogoImage = Boolean(cust.coverLogoBase64 || cust.headerLogoBase64 || isDefaultElectsun);

  const clientName = (project.client.name || 'Centro Médico Hispánico').toUpperCase();
  const clientLocation = project.client.province || project.client.location || 'Santo Domingo / Distrito Nacional';
  const panelModelText = `${project.specs.panelCount} Módulos Tier-1 (${project.specs.panelPowerW}W)`;

  return (
    <div className="pdf-page w-[850px] h-[1202px] min-h-[1202px] max-h-[1202px] bg-white shadow-2xl flex flex-col justify-between shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
      {/* 1. Header Overlay (Larger High-Resolution Logo on Top-Right) */}
      <div className="absolute top-0 right-0 w-full flex justify-end p-6 pr-8 z-30 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          {hasLogoImage ? (
            <img
              src={coverLogoSrc}
              alt={companyName}
              className="h-20 max-h-[85px] w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
            />
          ) : (
            <div className="flex flex-col text-right drop-shadow-md">
              <span
                className="text-4xl font-black tracking-tight uppercase"
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

      {/* 2. Geometric Hero Section with 100% SVG-compatible Triangles */}
      <div className="relative h-[490px] w-full z-0 overflow-hidden bg-white shrink-0">
        {/* Main Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src={PDF_COVER_HERO_BASE64}
            alt="Solar rooftop installation at sunset"
            className="w-full h-full object-cover object-center"
          />
          {/* Subtle color blend overlay */}
          <div
            className="absolute inset-0 opacity-20 mix-blend-multiply"
            style={{ backgroundColor: activeTheme.primary }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25" />
        </div>

        {/* Native SVG Polygons for Cross-Platform & html2canvas Reliability */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 850 490"
          preserveAspectRatio="none"
        >
          {/* 1. White Diagonal Cutout */}
          <polygon points="340,490 850,318 850,490" fill="#ffffff" />

          {/* 2. Primary Theme Large Geometric Triangle */}
          <polygon
            points="620,490 850,318 850,490"
            fill={activeTheme.primary}
            opacity="0.95"
          />

          {/* 3. Secondary Theme Smaller Corner Triangle */}
          <polygon
            points="710,490 850,410 850,490"
            fill={activeTheme.secondary}
            opacity="0.95"
          />
        </svg>

        {/* Top-Left Project Tag with Solid Background and High Contrast */}
        <div className="absolute top-8 left-10 z-20 space-y-2">
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
            className="px-3.5 py-1.5 inline-flex items-center gap-2 rounded shadow-xl border-l-4"
            style={{
              backgroundColor: '#0f172a',
              borderLeftColor: activeTheme.secondary,
            }}
          >
            <span
              className="text-xs font-black uppercase tracking-wider"
              style={{ color: '#ffffff' }}
            >
              ENERGÍA SOLAR
            </span>
            <span
              className="text-xs font-bold uppercase tracking-wider text-slate-100"
              style={{ color: '#ffffff' }}
            >
              • LEY 57-07
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Body Content (Left: Project & Client | Right: Metadata Timeline) */}
      <main className="px-12 pt-6 pb-20 flex-1 flex items-center justify-between relative z-10">
        {/* Left Column: Big Typographic Hierarchy */}
        <div className="w-[58%] space-y-5">
          {/* Small Top Kicker */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-1 rounded-full"
              style={{ backgroundColor: activeTheme.primary }}
            />
            <span
              className="text-[11px] font-black tracking-[0.2em] uppercase"
              style={{ color: activeTheme.primary }}
            >
              PROPUESTA TÉCNICA Y ECONÓMICA
            </span>
          </div>

          {/* Client Name Main Title & Location with Balanced Spacing */}
          <div>
            <h1 className="text-4xl font-black text-slate-900 leading-[1.1] tracking-tight uppercase break-words">
              {clientName}
            </h1>
            <div className="flex items-center gap-2 text-slate-600 mt-3.5 text-sm font-semibold">
              <MapPin className="w-4 h-4 shrink-0" style={{ color: activeTheme.secondary }} />
              <span className="leading-normal">{clientLocation}</span>
            </div>
          </div>

          {/* Capacity Big Highlight Card */}
          <div className="pt-2">
            <div
              className="inline-flex items-baseline gap-3.5 pb-2.5 border-b-2"
              style={{ borderColor: activeTheme.primary }}
            >
              <span
                className="text-4xl font-black tracking-tight"
                style={{ color: activeTheme.primary }}
              >
                {summary.systemCapacityKWp.toFixed(2)}
              </span>
              <span className="text-xl font-black text-slate-900 tracking-wider">
                KWP
              </span>
              <div className="h-6 w-[1.5px] bg-slate-300 mx-1" />
              <div className="flex flex-col">
                <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest">
                  Capacidad
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Instalada
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sleek Corporate Metadata Timeline */}
        <div className="w-[38%] pl-8 border-l border-slate-200 relative">
          <div className="space-y-4 text-left">
            {/* Project ID */}
            <div className="relative">
              <div
                className="absolute -left-[38px] w-3 h-3 rounded-full top-1 shadow-xs"
                style={{ backgroundColor: activeTheme.primary }}
              ></div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">
                ID Proyecto
              </span>
              <span className="text-base font-black text-slate-900 block tracking-tight">
                {project.client.projectId || 'SP-2024-001'}
              </span>
            </div>

            {/* Fecha Emisión */}
            <div className="relative">
              <div
                className="absolute -left-[38px] w-3 h-3 rounded-full top-1 shadow-xs"
                style={{ backgroundColor: activeTheme.primary }}
              ></div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">
                Fecha Emisión
              </span>
              <span
                className="text-base font-black block"
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
              ></div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">
                Validez
              </span>
              <span
                className="text-base font-black block"
                style={{ color: activeTheme.secondary }}
              >
                {project.client.quoteValidityDays || 7} Días Laborables
              </span>
            </div>

            {/* Configuración */}
            <div className="relative pt-2.5 border-t border-slate-200">
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
      <footer className="absolute bottom-0 left-0 right-0 w-full px-10 py-3 bg-slate-50 border-t border-slate-200 z-30 overflow-hidden box-border">
        {/* Subtle Decorative Circle Outline */}
        <div
          className="absolute right-[-40px] bottom-[-40px] w-44 h-44 rounded-full border-[10px] border-slate-200/70 opacity-60 pointer-events-none"
        />

        <div className="flex justify-between items-center relative z-10 text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Phone className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-900 text-xs whitespace-nowrap">{companyPhone}</span>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Globe className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-900 text-xs whitespace-nowrap">{companyWebsite}</span>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Instagram className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-900 text-xs whitespace-nowrap">@{companyInstagram}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-600 text-[10px] font-bold max-w-[300px] text-right">
            <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: activeTheme.secondary }} />
            <span className="truncate">
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
