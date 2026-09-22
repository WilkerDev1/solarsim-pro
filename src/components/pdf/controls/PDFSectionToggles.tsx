import React, { useState, useMemo } from 'react';
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
  GripVertical,
  RotateCcw,
  LayoutDashboard,
} from 'lucide-react';
import { PDFColorTheme, PDF_COLOR_THEMES } from '../../../constants/pdfThemes';
import { ProjectSimulation, DocumentCustomization, ExtraTOCItem } from '../../../types';
import { PDFAttachmentsSection } from './PDFAttachmentsSection';
import { PDFSectionId, DEFAULT_PDF_SECTION_ORDER } from '../../../constants/pdfSections';

interface PDFSectionTogglesProps {
  isDark: boolean;
  activeTheme: PDFColorTheme;
  setActiveTheme: (theme: PDFColorTheme) => void;
  // New Intro Pages
  showCover: boolean;
  setShowCover: (val: boolean) => void;
  showTableOfContents: boolean;
  setShowTableOfContents: (val: boolean) => void;
  showExecutiveSummary: boolean;
  setShowExecutiveSummary: (val: boolean) => void;
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
  updateSpecs?: (specs: Partial<ProjectSimulation['specs']>) => void;
}

export const PDFSectionToggles: React.FC<PDFSectionTogglesProps> = ({
  isDark,
  activeTheme,
  setActiveTheme,
  showCover,
  setShowCover,
  showTableOfContents,
  setShowTableOfContents,
  showExecutiveSummary,
  setShowExecutiveSummary,
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
  updateSpecs,
}) => {
  const [newExtraTitle, setNewExtraTitle] = useState('');
  const [newExtraSubtitle, setNewExtraSubtitle] = useState('');
  const [newExtraPageCount, setNewExtraPageCount] = useState<number>(1);
  const [isAddingOpen, setIsAddingOpen] = useState(false);

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const extraTocItems: ExtraTOCItem[] = project?.customization?.extraTocItems || [];

  const currentOrder: PDFSectionId[] = useMemo(() => {
    const saved = project?.customization?.sectionOrder;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      const validSaved = saved.filter((id): id is PDFSectionId =>
        DEFAULT_PDF_SECTION_ORDER.includes(id as PDFSectionId)
      );
      const missing = DEFAULT_PDF_SECTION_ORDER.filter((id) => !validSaved.includes(id));
      return [...validSaved, ...missing];
    }
    return DEFAULT_PDF_SECTION_ORDER;
  }, [project?.customization?.sectionOrder]);

  const isOrderModified = useMemo(() => {
    if (currentOrder.length !== DEFAULT_PDF_SECTION_ORDER.length) return true;
    return currentOrder.some((id, idx) => id !== DEFAULT_PDF_SECTION_ORDER[idx]);
  }, [currentOrder]);

  const handleReorderSections = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || !updateDocumentCustomization) return;
    const newOrder = [...currentOrder];
    const [removed] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, removed);
    updateDocumentCustomization({
      sectionOrder: newOrder,
    });
  };

  const handleResetOrder = () => {
    if (!updateDocumentCustomization) return;
    updateDocumentCustomization({
      sectionOrder: [...DEFAULT_PDF_SECTION_ORDER],
    });
  };

  const sectionConfigs: Record<
    PDFSectionId,
    {
      visible: boolean;
      toggle: (val: boolean) => void;
      icon: React.ComponentType<{ className?: string }>;
      title: string;
      subtitle: string;
      isConfidential?: boolean;
    }
  > = {
    cover: {
      visible: showCover,
      toggle: setShowCover,
      icon: Layout,
      title: 'Portada Ejecutiva',
      subtitle: 'Imagen hero, cliente y datos',
    },
    tableOfContents: {
      visible: showTableOfContents,
      toggle: setShowTableOfContents,
      icon: ListOrdered,
      title: 'Índice del Dossier',
      subtitle: 'Estructura y números dinámicos',
    },
    executiveSummary: {
      visible: showExecutiveSummary,
      toggle: setShowExecutiveSummary,
      icon: LayoutDashboard,
      title: 'Cuadro Resumen Ejecutivo',
      subtitle: 'Inversión bruta, Ley 57-07 y retorno',
    },
    aboutUs: {
      visible: showAboutUs,
      toggle: setShowAboutUs,
      icon: Building2,
      title: '1. ¿Quiénes Somos? & Servicios',
      subtitle: 'Visión y 4 tarjetas de servicio',
    },
    benefits: {
      visible: showBenefits,
      toggle: setShowBenefits,
      icon: Sun,
      title: '2. Beneficios Solares & Ley 57-07',
      subtitle: 'Pilares y marco fiscal dominicano',
    },
    techIntro: {
      visible: showTechIntro,
      toggle: setShowTechIntro,
      icon: Cpu,
      title: '3. ¿Qué es FV? & Flujo Técnico',
      subtitle: 'Render 3D y diagrama de flujo',
    },
    projectDescription: {
      visible: showProjectDescription,
      toggle: setShowProjectDescription,
      icon: FileText,
      title: '4. Resumen & Normativa SIE',
      subtitle: 'Narrativa técnica y Res. SIE-007',
    },
    energy: {
      visible: showPage1,
      toggle: setShowPage1,
      icon: Zap,
      title: 'Análisis de Energía y Balance',
      subtitle: 'Generación vs Demanda mensual',
    },
    quotation: {
      visible: showPageQuotation,
      toggle: setShowPageQuotation,
      icon: FileText,
      title: 'Cotización de Sistema',
      subtitle: 'Equipos, inversión y garantías',
    },
    roi: {
      visible: showPage2,
      toggle: setShowPage2,
      icon: TrendingUp,
      title: 'Retorno de Inversión',
      subtitle: 'Payback, VAN, TIR y Ley 57-07',
    },
    cashFlow: {
      visible: showPage3,
      toggle: setShowPage3,
      icon: BarChart3,
      title: 'Flujo de Caja 25 Años',
      subtitle: 'Proyección financiera detallada',
    },
    costMatrix: {
      visible: showPageCostMatrix,
      toggle: setShowPageCostMatrix,
      icon: Lock,
      title: 'Costos Internos',
      subtitle: 'Matriz de márgenes y desglose',
      isConfidential: true,
    },
  };

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

  const handleUpdatePageCount = (id: string, newCount: number) => {
    if (!updateDocumentCustomization) return;
    const clamped = Math.max(1, Math.min(99, newCount));
    updateDocumentCustomization({
      extraTocItems: extraTocItems.map((it) => (it.id === id ? { ...it, pageCount: clamped } : it)),
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
                <span className="flex-1 w-full" style={{ backgroundColor: theme.primary }}></span>
                <span className="flex-1 w-full" style={{ backgroundColor: theme.secondary }}></span>
                <span className="flex-1 w-full" style={{ backgroundColor: theme.tertiary || theme.barColor }}></span>
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

      {/* 1. SECCIÓN: ESTRUCTURA Y ORDEN DE PÁGINAS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              1. Estructura y Orden de Páginas
            </h3>
            <span className={`text-[10px] block ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              Arrastra con ⋮⋮ para cambiar el orden en el PDF
            </span>
          </div>
          {isOrderModified && (
            <button
              type="button"
              onClick={handleResetOrder}
              className={`text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                isDark
                  ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
              title="Restablecer orden predeterminado"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restablecer</span>
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {currentOrder.map((sectionId, index) => {
            const config = sectionConfigs[sectionId];
            if (!config) return null;
            const Icon = config.icon;
            const isDragging = draggedIdx === index;
            const isDragOver = dragOverIdx === index;

            return (
              <div
                key={sectionId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(index));
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggedIdx(index);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverIdx !== index) {
                    setDragOverIdx(index);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverIdx === index) {
                    setDragOverIdx(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedIdx !== null && draggedIdx !== index) {
                    handleReorderSections(draggedIdx, index);
                  }
                  setDraggedIdx(null);
                  setDragOverIdx(null);
                }}
                onDragEnd={() => {
                  setDraggedIdx(null);
                  setDragOverIdx(null);
                }}
                className={`flex flex-col p-2 rounded-xl border transition-all select-none ${
                  isDragging ? 'opacity-40 scale-[0.98] border-dashed border-emerald-500' : ''
                } ${
                  isDragOver ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-500/10' : ''
                } ${
                  !isDragOver && !isDragging
                    ? config.visible
                      ? config.isConfidential
                        ? isDark
                          ? 'bg-amber-950/40 border-amber-600/60 text-amber-200 shadow-2xs'
                          : 'bg-amber-50/80 border-amber-300 text-amber-950 shadow-2xs'
                        : isDark
                        ? 'bg-emerald-950/40 border-emerald-600/60 text-white shadow-2xs'
                        : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-2xs'
                      : isDark
                      ? 'bg-[#1b1b22] border-[#2a2a36] text-zinc-400 hover:border-zinc-500'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Botón de arrastre de 3 rayas */}
                    <div
                      className={`cursor-grab active:cursor-grabbing p-1 -ml-0.5 rounded transition-colors shrink-0 ${
                        isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                      }`}
                      title="Arrastrar arriba o abajo para cambiar el orden"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    {/* Número de secuencia */}
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                        config.visible
                          ? config.isConfidential
                            ? isDark
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-amber-200 text-amber-900'
                            : isDark
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-emerald-200 text-emerald-900'
                          : isDark
                          ? 'bg-zinc-800 text-zinc-500'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {index + 1}
                    </span>

                    {/* Icono de Sección */}
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        config.visible
                          ? config.isConfidential
                            ? isDark
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-amber-100 text-amber-800'
                            : isDark
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-emerald-100 text-emerald-700'
                          : isDark
                          ? 'bg-zinc-800 text-zinc-500'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>

                    {/* Título y Subtítulo */}
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold truncate leading-tight block">
                          {config.title}
                        </span>
                        {config.isConfidential && (
                          <span
                            className={`text-[8.5px] font-extrabold px-1.5 py-0.2 rounded border ${
                              isDark
                                ? 'bg-amber-950/90 text-amber-300 border-amber-700/70'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}
                          >
                            CONFIDENCIAL
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] opacity-75 truncate block">
                        {config.subtitle}
                      </span>
                    </div>
                  </div>

                  {/* Checkbox de visibilidad */}
                  <input
                    type="checkbox"
                    checked={config.visible}
                    onChange={(e) => config.toggle(e.target.checked)}
                    className={`w-4 h-4 rounded focus:ring-0 cursor-pointer shrink-0 ${
                      config.isConfidential ? 'text-amber-600' : 'text-emerald-600'
                    }`}
                  />
                </div>

                {/* Sub-toggle de Autoconsumo para la sección de Energía */}
                {sectionId === 'energy' && config.visible && (
                  <div
                    className={`mt-2 pt-1.5 border-t flex items-center justify-between w-full ${
                      isDark ? 'border-zinc-800/80 text-zinc-400' : 'border-slate-200 text-slate-500'
                    }`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[10px] font-medium flex items-center gap-1">
                      <Zap className="w-3 h-3 text-blue-500" />
                      <span>Autoconsumo en tablas/gráfica:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const current = project?.customization?.showSelfConsumptionInProposal !== undefined
                          ? project.customization.showSelfConsumptionInProposal
                          : (project?.specs?.showSelfConsumptionBreakdown !== false);
                        const nextVal = !current;
                        updateDocumentCustomization?.({ showSelfConsumptionInProposal: nextVal });
                        updateSpecs?.({ showSelfConsumptionBreakdown: nextVal });
                      }}
                      className={`px-2 py-0.5 text-[9.5px] font-bold rounded border transition-all cursor-pointer ${
                        (project?.customization?.showSelfConsumptionInProposal !== undefined
                          ? project.customization.showSelfConsumptionInProposal
                          : (project?.specs?.showSelfConsumptionBreakdown !== false))
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30'
                          : isDark
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                          : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-800'
                      }`}
                      title="Alternar entre desglose con línea de autoconsumo e inyección o formato clásico de 5 columnas"
                    >
                      {(project?.customization?.showSelfConsumptionInProposal !== undefined
                        ? project.customization.showSelfConsumptionInProposal
                        : (project?.specs?.showSelfConsumptionBreakdown !== false))
                        ? '⚡ Visible'
                        : '🏛️ Modo Clásico'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className={`flex items-center rounded-lg border px-1.5 py-0.5 transition-all ${
                      isDark
                        ? 'bg-[#242432] border-[#38384a] focus-within:border-amber-500'
                        : 'bg-slate-100 border-slate-300 focus-within:border-amber-600 focus-within:bg-white'
                    }`}
                    title="Haz clic para modificar la cantidad de páginas de este anexo"
                  >
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={item.pageCount || 1}
                      onChange={(e) => handleUpdatePageCount(item.id, parseInt(e.target.value) || 1)}
                      className={`w-6 text-center font-mono font-black text-xs bg-transparent outline-none p-0 cursor-text ${
                        isDark ? 'text-amber-400' : 'text-amber-900'
                      }`}
                    />
                    <span className={`text-[10px] font-bold select-none pl-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      {(item.pageCount || 1) === 1 ? 'pág' : 'págs'}
                    </span>
                  </div>

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

      {/* 4. ADJUNTAR Y FUSIONAR PDFS EXTERNOS (FICHAS TÉCNICAS / ANEXOS) */}
      <PDFAttachmentsSection
        isDark={isDark}
        project={project}
        updateDocumentCustomization={updateDocumentCustomization}
      />

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
