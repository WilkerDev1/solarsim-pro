import React, { useState } from 'react';
import {
  Check,
  Zap,
  FileText,
  TrendingUp,
  BarChart3,
  Lock,
  Layout,
  ListOrdered,
  Building2,
  Sun,
  Cpu,
  ListPlus,
  PlusCircle,
  Trash2,
  Sparkles,
  Layers,
} from 'lucide-react';
import { PDFColorTheme, PDF_COLOR_THEMES } from '../../../constants/pdfThemes';
import { ProjectSimulation, DocumentCustomization, ExtraTOCItem } from '../../../types';

interface PDFSectionTogglesProps {
  isDark: boolean;
  activeTheme: PDFColorTheme;
  setActiveTheme: (theme: PDFColorTheme) => void;
  // New Intro Pages
  showCover: boolean;
  setShowCover: (val: boolean) => void;
  showTableOfContents: boolean;
  setShowTableOfContents: (val: boolean) => void;
  showAboutUs: boolean;
  setShowAboutUs: (val: boolean) => void;
  showBenefits: boolean;
  setShowBenefits: (val: boolean) => void;
  showTechIntro: boolean;
  setShowTechIntro: (val: boolean) => void;
  showProjectDescription: boolean;
  setShowProjectDescription: (val: boolean) => void;
  // Core Technical & Financial Pages
  showPage1: boolean;
  setShowPage1: (val: boolean) => void;
  showPageQuotation: boolean;
  setShowPageQuotation: (val: boolean) => void;
  showPage2: boolean;
  setShowPage2: (val: boolean) => void;
  showPage3: boolean;
  setShowPage3: (val: boolean) => void;
  showPageCostMatrix: boolean;
  setShowPageCostMatrix: (val: boolean) => void;
  showHeadersFooters: boolean;
  setShowHeadersFooters: (val: boolean) => void;
  project?: ProjectSimulation;
  updateDocumentCustomization?: (customization: Partial<DocumentCustomization>) => void;
}

export const PDFSectionToggles: React.FC<PDFSectionTogglesProps> = ({
  isDark,
  activeTheme,
  setActiveTheme,
  showCover,
  setShowCover,
  showTableOfContents,
  setShowTableOfContents,
  showAboutUs,
  setShowAboutUs,
  showBenefits,
  setShowBenefits,
  showTechIntro,
  setShowTechIntro,
  showProjectDescription,
  setShowProjectDescription,
  showPage1,
  setShowPage1,
  showPageQuotation,
  setShowPageQuotation,
  showPage2,
  setShowPage2,
  showPage3,
  setShowPage3,
  showPageCostMatrix,
  setShowPageCostMatrix,
  showHeadersFooters,
  setShowHeadersFooters,
  project,
  updateDocumentCustomization,
}) => {
  const [newExtraTitle, setNewExtraTitle] = useState('');
  const [newExtraSubtitle, setNewExtraSubtitle] = useState('');
  const [newExtraPageCount, setNewExtraPageCount] = useState<number>(1);
  const [isAddingOpen, setIsAddingOpen] = useState(false);

  const extraTocItems: ExtraTOCItem[] = project?.customization?.extraTocItems || [];

  const handleAddExtraItem = () => {
    if (!newExtraTitle.trim() || !updateDocumentCustomization) return;
    const newItem: ExtraTOCItem = {
      id: `extra-toc-${Date.now()}`,
      title: newExtraTitle.trim(),
      subtitle: newExtraSubtitle.trim() || undefined,
      pageCount: newExtraPageCount > 0 ? newExtraPageCount : 1,
    };
    updateDocumentCustomization({
      extraTocItems: [...extraTocItems, newItem],
    });
    setNewExtraTitle('');
    setNewExtraSubtitle('');
    setNewExtraPageCount(1);
    setIsAddingOpen(false);
  };

  const handleAddPreset = (preset: { title: string; subtitle: string; pageCount: number }) => {
    if (!updateDocumentCustomization) return;
    const newItem: ExtraTOCItem = {
      id: `extra-toc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title: preset.title,
      subtitle: preset.subtitle,
      pageCount: preset.pageCount,
    };
    updateDocumentCustomization({
      extraTocItems: [...extraTocItems, newItem],
    });
  };

  const handleRemoveExtraItem = (id: string) => {
    if (!updateDocumentCustomization) return;
    updateDocumentCustomization({
      extraTocItems: extraTocItems.filter((it) => it.id !== id),
    });
  };
  return (
    <div className="space-y-4">
      {/* Selector de Color */}
      <div className="space-y-2">
        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
          Paleta de Color Corporativa
        </h3>
        <div className="grid grid-cols-6 gap-1.5">
          {PDF_COLOR_THEMES.map((theme) => {
            const isActive = activeTheme.id === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setActiveTheme(theme)}
                title={theme.name}
                className={`h-11 rounded-xl flex flex-col overflow-hidden border-2 transition-all cursor-pointer relative ${
                  isActive
                    ? 'border-emerald-500 ring-2 ring-emerald-500/40 scale-105 shadow-md'
                    : isDark
                    ? 'border-[#2e2e3a] opacity-70 hover:opacity-100 hover:border-zinc-500'
                    : 'border-slate-200 opacity-80 hover:opacity-100 hover:border-slate-400'
                }`}
              >
                <span className="h-1/2 w-full" style={{ backgroundColor: theme.primary }}></span>
                <span className="h-1/2 w-full" style={{ backgroundColor: theme.barColor }}></span>
                {isActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`h-px w-full ${isDark ? 'bg-[#2a2a36]' : 'bg-slate-200'}`}></div>

      {/* 1. SECCIÓN: PRESENTACIÓN Y MARCO INSTITUCIONAL */}
      <div className="space-y-2">
        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
          1. Presentación e Introducción
        </h3>

        {/* Portada */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showCover
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showCover ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <Layout className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Portada Ejecutiva</span>
              <span className="text-[10px] opacity-75 block">Imagen hero, cliente y datos</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showCover}
            onChange={(e) => setShowCover(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Índice */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showTableOfContents
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showTableOfContents ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <ListOrdered className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Índice del Dossier</span>
              <span className="text-[10px] opacity-75 block">Estructura y números dinámicos</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showTableOfContents}
            onChange={(e) => setShowTableOfContents(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Quiénes Somos */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showAboutUs
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showAboutUs ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">1. ¿Quiénes Somos? & Servicios</span>
              <span className="text-[10px] opacity-75 block">Visión y 4 tarjetas de servicio</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showAboutUs}
            onChange={(e) => setShowAboutUs(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Beneficios Solares & Ley 57-07 */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showBenefits
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showBenefits ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">2. Beneficios Solares & Ley 57-07</span>
              <span className="text-[10px] opacity-75 block">Pilares y marco fiscal dominicano</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showBenefits}
            onChange={(e) => setShowBenefits(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Descripción Técnica */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showTechIntro
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showTechIntro ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">3. ¿Qué es FV? & Flujo Técnico</span>
              <span className="text-[10px] opacity-75 block">Render 3D y diagrama de flujo</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showTechIntro}
            onChange={(e) => setShowTechIntro(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Descripción del Proyecto & Normativa SIE */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showProjectDescription
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showProjectDescription ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">4. Resumen & Normativa SIE</span>
              <span className="text-[10px] opacity-75 block">Narrativa técnica y Res. SIE-007</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showProjectDescription}
            onChange={(e) => setShowProjectDescription(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>
      </div>

      <div className={`h-px w-full ${isDark ? 'bg-[#2a2a36]' : 'bg-slate-200'}`}></div>

      {/* 2. SECCIÓN: ANÁLISIS TÉCNICO Y ECONÓMICO */}
      <div className="space-y-2">
        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
          2. Análisis Técnico & Financiero
        </h3>

        {/* Page 1: Energía */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showPage1
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showPage1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Análisis de Energía y Balance</span>
              <span className="text-[10px] opacity-75 block">Generación vs Demanda mensual</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showPage1}
            onChange={(e) => setShowPage1(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Page 2: Cotización */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showPageQuotation
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showPageQuotation ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Cotización de Sistema</span>
              <span className="text-[10px] opacity-75 block">Equipos, inversión y garantías</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showPageQuotation}
            onChange={(e) => setShowPageQuotation(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Page 3: ROI */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showPage2
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showPage2 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Retorno de Inversión</span>
              <span className="text-[10px] opacity-75 block">Payback, VAN, TIR y Ley 57-07</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showPage2}
            onChange={(e) => setShowPage2(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Page 4: Flujo de Caja */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showPage3
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-xs'
                : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showPage3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">Flujo de Caja 25 Años</span>
              <span className="text-[10px] opacity-75 block">Proyección financiera detallada</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showPage3}
            onChange={(e) => setShowPage3(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>

        {/* Page 5: Costos Internos (Confidencial) */}
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showPageCostMatrix
              ? isDark
                ? 'bg-amber-950/50 border-amber-500/70 text-amber-200 shadow-xs'
                : 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-amber-700/50'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${showPageCostMatrix ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold block leading-tight">Costos Internos</span>
                <span
                  className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${
                    isDark
                      ? 'bg-amber-950/90 text-amber-300 border-amber-700/70'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  CONFIDENCIAL
                </span>
              </div>
              <span className="text-[10px] opacity-75 block">Matriz de márgenes y desglose</span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showPageCostMatrix}
            onChange={(e) => setShowPageCostMatrix(e.target.checked)}
            className="w-4 h-4 rounded text-amber-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>
      </div>

      <div className={`h-px w-full ${isDark ? 'bg-[#2a2a36]' : 'bg-slate-200'}`}></div>

      {/* 3. PÁGINAS EXTRA / ANEXOS DEL ÍNDICE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-amber-500 shrink-0" />
            <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
              3. Páginas Extra / Anexos del Índice
            </h3>
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              extraTocItems.length > 0
                ? isDark
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
                : isDark
                ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {extraTocItems.length} {extraTocItems.length === 1 ? 'Anexo' : 'Anexos'}
          </span>
        </div>

        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
          Añade puntos adicionales al índice para documentos que insertarás externamente (ej. Fichas técnicas, Planos, Certificaciones). El sistema les asignará automáticamente los números de página finales correlativos.
        </p>

        {/* Lista de Anexos Existentes */}
        {extraTocItems.length > 0 && (
          <div className="space-y-2">
            {extraTocItems.map((item, idx) => (
              <div
                key={item.id}
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all ${
                  isDark ? 'bg-[#1a1a24] border-[#2e2e3e]' : 'bg-white border-slate-200 shadow-2xs'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-500 font-black text-[10px] flex items-center justify-center shrink-0">
                      +{idx + 1}
                    </span>
                    <span className={`text-xs font-bold truncate block ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                      {item.title}
                    </span>
                  </div>
                  {item.subtitle && (
                    <span className={`text-[10.5px] truncate block pl-5.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      {item.subtitle}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                      isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {item.pageCount && item.pageCount > 1 ? `${item.pageCount} págs` : '1 pág'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveExtraItem(item.id)}
                    className="p-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors cursor-pointer"
                    title="Eliminar punto del índice"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Formulario para Agregar Nuevo Punto */}
        <div
          className={`p-3 rounded-xl border space-y-2.5 ${
            isDark ? 'bg-[#181822] border-[#2c2c3c]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
              + Agregar Nuevo Punto al Índice
            </span>
          </div>

          <div>
            <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              Título del Punto Extra / Anexo
            </label>
            <input
              type="text"
              placeholder="ej: Fichas Técnicas de Equipos"
              value={newExtraTitle}
              onChange={(e) => setNewExtraTitle(e.target.value)}
              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors ${
                isDark
                  ? 'bg-[#242432] border-[#38384a] text-zinc-100 focus:border-amber-500'
                  : 'bg-white border-slate-300 text-slate-800 focus:border-amber-600'
              }`}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Subtema / Descripción (Opcional)
              </label>
              <input
                type="text"
                placeholder="ej: Datasheets de Módulos e Inversores"
                value={newExtraSubtitle}
                onChange={(e) => setNewExtraSubtitle(e.target.value)}
                className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#242432] border-[#38384a] text-zinc-100 focus:border-amber-500'
                    : 'bg-white border-slate-300 text-slate-800 focus:border-amber-600'
                }`}
              />
            </div>
            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Páginas
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={newExtraPageCount}
                onChange={(e) => setNewExtraPageCount(parseInt(e.target.value) || 1)}
                className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#242432] border-[#38384a] text-zinc-100 focus:border-amber-500'
                    : 'bg-white border-slate-300 text-slate-800 focus:border-amber-600'
                }`}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddExtraItem}
            disabled={!newExtraTitle.trim()}
            className="w-full py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Añadir Punto al Índice</span>
          </button>

          {/* Plantillas / Presets Rápidos */}
          <div className="pt-2 border-t border-dashed border-zinc-700/50">
            <span className={`text-[9.5px] uppercase font-bold tracking-wider block mb-1.5 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              Sugerencias Rápidas:
            </span>
            <div className="flex flex-wrap gap-1">
              {[
                { title: 'Fichas Técnicas de Equipos', subtitle: 'Datasheets de Módulos e Inversores Tier-1', pageCount: 2 },
                { title: 'Diagramas Unifilares y Planos', subtitle: 'Esquema Eléctrico y Distribución de Strings', pageCount: 1 },
                { title: 'Certificaciones y Garantías', subtitle: 'Certificados UL, IEC y Respaldo de Fábrica', pageCount: 1 },
                { title: 'Anexo Fotográfico de Sitio', subtitle: 'Levantamiento de Techo y Puntos de Conexión', pageCount: 1 },
              ].map((preset, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => handleAddPreset(preset)}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-[#242432] border-[#38384a] text-zinc-300 hover:bg-amber-950/40 hover:text-amber-300 hover:border-amber-700/50'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300'
                  }`}
                >
                  + {preset.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`h-px w-full ${isDark ? 'bg-[#2a2a36]' : 'bg-slate-200'}`}></div>

      {/* Opciones de Formato */}
      <div className="space-y-2">
        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
          Opciones de Formato
        </h3>
        <label
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            showHeadersFooters
              ? isDark
                ? 'bg-[#22222d] border-[#38384a] text-zinc-100'
                : 'bg-white border-slate-300 text-slate-800'
              : isDark
              ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          <span className="text-xs font-semibold">Mostrar Encabezados y Pies</span>
          <input
            type="checkbox"
            checked={showHeadersFooters}
            onChange={(e) => setShowHeadersFooters(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0"
          />
        </label>
      </div>
    </div>
  );
};
