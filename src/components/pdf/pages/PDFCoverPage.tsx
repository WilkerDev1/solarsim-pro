import React from 'react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { Phone, MapPin, Globe, Instagram, Zap, Calendar, ShieldCheck, Sparkles } from 'lucide-react';
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
    <div className="pdf-page w-[850px] min-h-[1100px] bg-white shadow-2xl flex flex-col justify-between shrink-0 relative overflow-hidden font-sans print:shadow-none print:w-full print:min-h-screen">
      {/* Top Header Section with Large Prominent Corporate Logo */}
      <div className="pt-8 px-12 pb-5 flex justify-between items-center z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-14 rounded-full shadow-xs"
              style={{ backgroundColor: activeTheme.primary }}
            />
            <span className="text-[11px] uppercase font-black tracking-[0.2em] text-slate-500">
              Dossier Ejecutivo
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-400 block tracking-wider">
            SISTEMA FOTOVOLTAICO INTERCONECTADO
          </span>
        </div>

        {/* Prominent Large Logo Box */}
        <div className="flex items-center justify-end">
          {cust.headerLogoBase64 || isDefaultElectsun ? (
            <img
              src={headerLogoSrc}
              alt={companyName}
              className="h-[80px] max-h-[85px] w-auto object-contain drop-shadow-xs"
            />
          ) : (
            <div className="text-right">
              <span
                className="text-3xl font-black tracking-tight block"
                style={{ color: activeTheme.primary }}
              >
                {companyName}
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">
                {companySlogan}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Hero Image Container with Dynamic Architectural Diagonal Framing */}
      <div className="relative w-full h-[420px] overflow-hidden my-1">
        <img
          src={PDF_COVER_HERO_BASE64}
          alt="Solar panel array at sunset"
          className="w-full h-full object-cover object-center"
        />

        {/* Ambient Gradient Shadows */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Top-left Floating Badge */}
        <div className="absolute top-4 left-10 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/60 shadow-lg flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-800">
            Ingeniería Solar • Ley 57-07
          </span>
        </div>

        {/* Prominent Diagonal Capacity Banner */}
        <div
          className="absolute bottom-0 right-0 w-[58%] h-28 transform skew-x-[-22deg] translate-x-10 shadow-2xl flex items-center justify-center pl-8"
          style={{ backgroundColor: activeTheme.primary }}
        >
          <div className="transform skew-x-[22deg] text-white flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shadow-inner">
              <Zap className="w-7 h-7 text-amber-300 fill-amber-300 drop-shadow" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] block text-white/80">
                Capacidad del Sistema
              </span>
              <span className="text-2xl font-black font-mono tracking-tight block">
                {summary.systemCapacityKWp.toFixed(2)} kWp
              </span>
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-0 right-0 w-28 h-7 transform skew-x-[-22deg] translate-x-2"
          style={{ backgroundColor: activeTheme.secondary }}
        />
      </div>

      {/* Main Title & Client Presentation Section */}
      <div className="px-12 py-6 flex-1 flex flex-col justify-center space-y-4 z-10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-xs font-black uppercase tracking-[0.3em]"
              style={{ color: activeTheme.primary }}
            >
              PROPUESTA TÉCNICA Y ECONÓMICA
            </span>
          </div>

          <h1
            className="text-3xl font-black uppercase tracking-tight text-slate-900 leading-tight drop-shadow-2xs"
            style={{ color: activeTheme.primary }}
          >
            {project.client.name || 'Cliente Residencial / Comercial'}
          </h1>
          <p className="text-sm font-bold text-slate-600 mt-1 flex items-center gap-2">
            <span>{project.client.province || project.client.location || 'República Dominicana'}</span>
            <span>•</span>
            <span className="text-slate-500 font-medium">
              {project.specs.panelCount} Módulos Tier-1 ({project.specs.panelPowerW}W)
            </span>
          </p>
        </div>

        {/* Project Meta Cards */}
        <div className="grid grid-cols-3 gap-3.5 pt-1">
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 shadow-2xs flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
              style={{ backgroundColor: activeTheme.primary }}
            >
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">ID Proyecto</span>
              <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
                {project.client.projectId || 'SP-2024-089'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 shadow-2xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-800 text-white shrink-0 shadow-2xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Fecha de Emisión</span>
              <span className="text-xs font-bold text-slate-800 block mt-0.5">{currentDateStr}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 shadow-2xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-600 text-white shrink-0 shadow-2xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Validez Propuesta</span>
              <span className="text-xs font-bold text-emerald-700 block mt-0.5">
                {project.client.quoteValidityDays || 7} Días Laborables
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Corporate Contact Bar */}
      <div className="px-12 pb-7 pt-4 border-t border-slate-100 z-10 bg-slate-50/40">
        <div className="grid grid-cols-2 gap-4 text-xs text-slate-600">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Phone className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-800">{companyPhone}</span>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <MapPin className="w-3.5 h-3.5" />
              </div>
              <span className="font-medium text-slate-700 text-[11px] truncate max-w-[300px]">
                {companyFooterText.split('|')[0] || companyFooterText}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Globe className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-800">{companyWebsite}</span>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeTheme.primary }}
              >
                <Instagram className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-slate-800">@{companyInstagram}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative Bottom Colored Bar */}
      <div className="h-3 w-full flex">
        <div className="h-full w-2/3" style={{ backgroundColor: activeTheme.primary }} />
        <div className="h-full w-1/3" style={{ backgroundColor: activeTheme.secondary }} />
      </div>
    </div>
  );
};
