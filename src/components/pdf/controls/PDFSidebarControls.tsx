import React from 'react';
import {
  Download,
  Printer,
  FileText,
  SlidersHorizontal,
  RefreshCw,
  Globe,
  Palette,
} from 'lucide-react';
import { ProjectSimulation, DocumentCustomization } from '../../../types';
import { PDFSectionToggles } from './PDFSectionToggles';
import { PDFDesignControls } from './PDFDesignControls';
import type { DocumentLayoutState } from '../useDocumentLayout';

interface PDFSidebarControlsProps {
  isDark: boolean;
  project: ProjectSimulation;
  /** Diseño persistente: visibilidad de secciones, tema y cabecera/pie. */
  layout: DocumentLayoutState;
  activePagesCount: number;
  sidebarTab: 'sections' | 'design';
  setSidebarTab: (tab: 'sections' | 'design') => void;
  isExporting: boolean;
  handleExportPDF: () => void;
  handlePrint: () => void;
  onOpenShareModal?: () => void;
  onRefresh: () => void;
  updateSpecs: (specs: Partial<ProjectSimulation['specs']>) => void;
  updateDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
  saveCurrentProjectAsDefaultDocumentTemplate?: () => void;
  resetDefaultDocumentCustomization?: () => void;
}

/** Dock del documento: exportar y compartir, estructura de secciones y diseño. El texto se edita en la hoja. */
export const PDFSidebarControls: React.FC<PDFSidebarControlsProps> = ({
  isDark,
  project,
  layout,
  activePagesCount,
  sidebarTab,
  setSidebarTab,
  isExporting,
  handleExportPDF,
  handlePrint,
  onOpenShareModal,
  onRefresh,
  updateSpecs,
  updateDocumentCustomization,
  saveCurrentProjectAsDefaultDocumentTemplate,
  resetDefaultDocumentCustomization,
}) => {
  const activeTheme = layout.theme;
  return (
    <aside
      className={`w-[340px] flex flex-col h-full shrink-0 transition-colors z-20 ${
        isDark
          ? 'bg-[#18181f] border-r border-[#2a2a36] text-zinc-100 shadow-2xl'
          : 'bg-white border-r border-slate-300 shadow-md'
      }`}
    >
      {/* Top Actions in Sidebar */}
      <div className={`p-4 border-b space-y-2.5 border-slate-200 bg-slate-50 dark:border-[#2a2a36] dark:bg-[#131318]`}>
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400`}>
            Exportación y Enlaces
          </span>
          <span className="text-[10px] font-mono font-bold text-emerald-500 bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-800/60">
            {activePagesCount} {activePagesCount === 1 ? 'Página' : 'Páginas'}
          </span>
        </div>

        <button
          onClick={handleExportPDF}
          disabled={isExporting}
          className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: activeTheme.primary }}
        >
          <Download className="w-4 h-4" />
          {isExporting
            ? (project?.customization?.attachedPdfs && project.customization.attachedPdfs.filter((a) => a.enabled).length > 0
                ? `Escaneando y fusionando ${project.customization.attachedPdfs.filter((a) => a.enabled).length} anexo(s)...`
                : 'Generando Documento...')
            : 'Descargar Propuesta PDF'}
        </button>

        {onOpenShareModal && (
          <button
            type="button"
            onClick={onOpenShareModal}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border shadow-xs active:scale-[0.98] ${
              isDark
                ? 'bg-gradient-to-r from-emerald-950/70 via-teal-950/50 to-emerald-950/70 border-emerald-700/60 text-emerald-300 hover:border-emerald-500 hover:text-white hover:shadow-emerald-950/50'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-400'
            }`}
            title="Compartir propuesta web interactiva y temporal (Cloudflare)"
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Compartir Propuesta Web</span>
          </button>
        )}

        <button
          onClick={handlePrint}
          className={`w-full py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
            isDark
              ? 'bg-[#20202a] border-[#343444] text-zinc-300 hover:bg-[#282836] hover:text-white'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs'
          }`}
        >
          <Printer className="w-3.5 h-3.5" />
          Imprimir / Guardar Sistema
        </button>
      </div>

      {/* Pestañas del dock: estructura y diseño (los textos se editan en la hoja) */}
      <div className={`grid grid-cols-2 p-1.5 m-3 rounded-xl border bg-slate-100 border-slate-200 dark:bg-[#14141a] dark:border-[#2a2a36]`}>
        <button
          type="button"
          onClick={() => setSidebarTab('sections')}
          className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            sidebarTab === 'sections'
              ? isDark
                ? 'bg-[#242432] text-white shadow-xs'
                : 'bg-white text-slate-900 shadow-xs'
              : isDark
              ? 'text-zinc-400 hover:text-zinc-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Secciones
        </button>
        <button
          type="button"
          onClick={() => setSidebarTab('design')}
          className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            sidebarTab === 'design'
              ? isDark
                ? 'bg-[#242432] text-white shadow-xs'
                : 'bg-white text-slate-900 shadow-xs'
              : isDark
              ? 'text-zinc-400 hover:text-zinc-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          Diseño
        </button>
      </div>

      {/* Sidebar Content Scrollable Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {sidebarTab === 'sections' ? (
          <PDFSectionToggles
            isDark={isDark}
            visibility={layout.visibility}
            setSectionVisible={layout.setSectionVisible}
            project={project}
            updateDocumentCustomization={updateDocumentCustomization}
            updateSpecs={updateSpecs}
          />
        ) : (
          <PDFDesignControls
            isDark={isDark}
            project={project}
            layout={layout}
            updateDocumentCustomization={updateDocumentCustomization}
            saveCurrentProjectAsDefaultDocumentTemplate={saveCurrentProjectAsDefaultDocumentTemplate}
            resetDefaultDocumentCustomization={resetDefaultDocumentCustomization}
          />
        )}
      </div>

      {/* Bottom Bar in Sidebar */}
      <div className={`p-4 border-t border-slate-200 bg-slate-50 dark:border-[#2a2a36] dark:bg-[#14141a]`}>
        <button
          type="button"
          onClick={onRefresh}
          className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
            isDark
              ? 'bg-[#22222c] border-[#343444] text-zinc-200 hover:bg-[#2a2a38] hover:text-white'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 shadow-xs'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
          Actualizar Vista Previa
        </button>
      </div>
    </aside>
  );
};
