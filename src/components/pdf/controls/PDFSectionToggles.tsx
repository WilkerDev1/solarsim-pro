import { useSelfConsumptionProjection } from '../../../features/application/useApplicationFeatures';
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
import { DOCUMENT_SECTION_IDS, DOCUMENT_SECTIONS, sectionLabel } from '../../../../shared/documentTexts/sections';
import type { SectionVisibility } from '../../../../shared/documentLayout';
import { PDFExtraTocEditor } from './PDFExtraTocEditor';
import { ProjectSimulation, DocumentCustomization, ExtraTOCItem } from '../../../types';

const SECTION_ICONS: Record<PDFSectionId, React.ComponentType<{ className?: string }>> = {
  cover: Layout,
  tableOfContents: ListOrdered,
  executiveSummary: LayoutDashboard,
  aboutUs: Building2,
  benefits: Sun,
  techIntro: Cpu,
  projectDescription: FileText,
  energy: Zap,
  quotation: FileText,
  roi: TrendingUp,
  cashFlow: BarChart3,
  costMatrix: Lock,
};
import { PDFAttachmentsSection } from './PDFAttachmentsSection';
import { PDFSectionId, DEFAULT_PDF_SECTION_ORDER } from '../../../constants/pdfSections';
import { normalizeSectionOrder } from '../../../utils/pdfLayout';

interface PDFSectionTogglesProps {
  isDark: boolean;
  /** Visibilidad efectiva de cada sección y su cambio (persistido en `customization.layout`). */
  visibility: SectionVisibility;
  setSectionVisible: (id: PDFSectionId, visible: boolean) => void;
  project?: ProjectSimulation;
  updateDocumentCustomization?: (customization: Partial<DocumentCustomization>) => void;
  updateSpecs?: (specs: Partial<ProjectSimulation['specs']>) => void;
}

export const PDFSectionToggles: React.FC<PDFSectionTogglesProps> = ({
  isDark,
  visibility,
  setSectionVisible,
  project,
  updateDocumentCustomization,
  updateSpecs,
}) => {
  const projectionEnabled = useSelfConsumptionProjection();
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const extraTocItems: ExtraTOCItem[] = project?.customization?.extraTocItems || [];

  const currentOrder = useMemo(
    () => normalizeSectionOrder(project?.customization?.sectionOrder),
    [project?.customization?.sectionOrder]
  );

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

  const sectionConfigs = Object.fromEntries(
    DOCUMENT_SECTION_IDS.map((id) => [id, {
      visible: visibility[id],
      toggle: (value: boolean) => setSectionVisible(id, value),
      icon: SECTION_ICONS[id],
      title: sectionLabel(id),
      subtitle: DOCUMENT_SECTIONS[id].description,
      isConfidential: DOCUMENT_SECTIONS[id].confidential,
    }]),
  ) as Record<PDFSectionId, { visible: boolean; toggle: (value: boolean) => void; icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; isConfidential?: boolean }>;

  return (
    <div className="space-y-4">
      {/* 1. SECCIÓN: ESTRUCTURA Y ORDEN DE PÁGINAS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400`}>
              1. Estructura y Orden de Páginas
            </h3>
            <span className={`text-[10px] block text-slate-400 dark:text-zinc-500`}>
              Arrastra con ⋮⋮ para cambiar el orden en el PDF
            </span>
          </div>
          {isOrderModified && (
            <button
              type="button"
              onClick={handleResetOrder}
              className={`text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors cursor-pointer border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white`}
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
                      className={`cursor-grab active:cursor-grabbing p-1 -ml-0.5 rounded transition-colors shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800`}
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
                            className={`text-[8.5px] font-extrabold px-1.5 py-0.2 rounded border bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/90 dark:text-amber-300 dark:border-amber-700/70`}
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
                {projectionEnabled && sectionId === 'energy' && config.visible && (
                  <div
                    className={`mt-2 pt-1.5 border-t flex items-center justify-between w-full border-slate-200 text-slate-500 dark:border-zinc-800/80 dark:text-zinc-400`}
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

      <div className={`h-px w-full bg-slate-200 dark:bg-[#2a2a36]`}></div>

      <PDFExtraTocEditor isDark={isDark} extraTocItems={extraTocItems} updateDocumentCustomization={updateDocumentCustomization} />

      <div className={`h-px w-full bg-slate-200 dark:bg-[#2a2a36]`}></div>

      {/* 4. ADJUNTAR Y FUSIONAR PDFS EXTERNOS (FICHAS TÉCNICAS / ANEXOS) */}
      <PDFAttachmentsSection
        isDark={isDark}
        project={project}
        updateDocumentCustomization={updateDocumentCustomization}
      />

    </div>
  );
};
