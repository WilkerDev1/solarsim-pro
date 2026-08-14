import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { Phone, MapPin, Globe, Instagram, Zap } from 'lucide-react';
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
  const companyPhone = cust.companyPhone || DEFAULT_DOCUMENT_CUSTOMIZATION.companyPhone || '(809) 378-6590';
  const companyFooterText = cust.companyFooterText || DEFAULT_DOCUMENT_CUSTOMIZATION.companyFooterText || 'C/ Ercilia Pepín #1, Plaza Toledo, Local 307, Arroyo Manzano, Sto. Dgo. Rep. Dom.';
  const companyWebsite = cust.companyWebsite || DEFAULT_DOCUMENT_CUSTOMIZATION.companyWebsite || 'www.electsun.do';
  const companyInstagram = cust.companyInstagram || DEFAULT_DOCUMENT_CUSTOMIZATION.companyInstagram || 'Electsunrd';

  const isDefaultElectsun = companyName.toLowerCase().trim() === 'electsun';
  const headerLogoSrc = cust.headerLogoBase64 || ELECTSUN_LOGO_COLOR_BASE64;

  return (
    <div className="pdf-page w-[850px] min-h-[1100px] bg-white shadow-xl flex flex-col justify-between shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
      {/* Top Header Section with Logo */}
      <div className="pt-8 px-12 pb-4 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-12 rounded-full"
            style={{ backgroundColor: activeTheme.primary }}
          />
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
            Dossier Corporativo
          </span>
        </div>

        <div className="flex items-center justify-end">
          {cust.headerLogoBase64 || isDefaultElectsun ? (
            <img
              src={headerLogoSrc}
              alt={companyName}
              className="h-[60px] max-h-[64px] w-auto object-contain"
            />
          ) : (
            <div className="text-right">
              <span
                className="text-2xl font-black tracking-tight block"
                style={{ color: activeTheme.primary }}
              >
                {companyName}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                {companySlogan}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Hero Image Container with Modern Angled Cut */}
      <div className="relative w-full h-[400px] overflow-hidden my-2">
        <img
          src={PDF_COVER_HERO_BASE64}
          alt="Solar panel array at sunset"
          className="w-full h-full object-cover object-center"
        />
        {/* Geometric Overlay Badges */}
        <div
          className="absolute bottom-0 right-0 w-[55%] h-24 transform skew-x-[-20deg] translate-x-8 shadow-xl flex items-center justify-center pl-6"
          style={{ backgroundColor: activeTheme.primary }}
        >
          <div className="transform skew-x-[20deg] text-white flex items-center gap-3">
            <Zap className="w-6 h-6 text-amber-300 fill-amber-300" />
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider block text-white/80">
                Capacidad del Sistema
              </span>
              <span className="text-xl font-black font-mono tracking-tight block">
                {summary.systemCapacityKWp.toFixed(2)} kWp
              </span>
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-0 right-0 w-24 h-6 transform skew-x-[-20deg] translate-x-2"
          style={{ backgroundColor: activeTheme.secondary }}
        />
      </div>

      {/* Main Title & Client Presentation Box */}
      <div className="px-12 py-6 flex-1 flex flex-col justify-center space-y-4 z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-black uppercase tracking-[0.25em]"
              style={{ color: activeTheme.primary }}
            >
              PROPUESTA TÉCNICA Y ECONÓMICA
            </span>
          </div>
          <h1
            className="text-3xl font-black uppercase tracking-tight text-slate-900 leading-tight"
            style={{ color: activeTheme.primary }}
          >
            {project.client.name || 'Cliente Residencial / Comercial'}
          </h1>
          <p className="text-sm font-bold text-slate-600 mt-1">
            Proyecto Fotovoltaico Interconectado • {project.client.province || project.client.location || 'República Dominicana'}
          </p>
        </div>

        {/* Specs quick pill cards */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">ID Proyecto</span>
            <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
              {project.client.projectId || 'SP-2024-089'}
            </span>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Fecha de Emisión</span>
            <span className="text-xs font-bold text-slate-800 block mt-0.5">{currentDateStr}</span>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Validez</span>
            <span className="text-xs font-bold text-emerald-700 block mt-0.5">
              {project.client.quoteValidityDays || 7} Días Laborables
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Corporate Contact Bar */}
      <div className="px-12 pb-8 pt-4 border-t border-slate-100 z-10">
        <div className="grid grid-cols-2 gap-4 text-xs text-slate-600">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Phone className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-slate-800">{companyPhone}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <MapPin className="w-3.5 h-3.5" />
              </div>
              <span className="font-medium text-slate-700 text-[11px] truncate max-w-[280px]">
                {companyFooterText.split('|')[0] || companyFooterText}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Globe className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-slate-800">{companyWebsite}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Instagram className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-slate-800">@{companyInstagram}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative Bottom Colored Bar */}
      <div className="h-2.5 w-full flex">
        <div className="h-full w-2/3" style={{ backgroundColor: activeTheme.primary }} />
        <div className="h-full w-1/3" style={{ backgroundColor: activeTheme.secondary }} />
      </div>
    </div>
  );
};
