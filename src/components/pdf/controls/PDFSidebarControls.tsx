import React from 'react';
import {
  Download,
  Printer,
  FileText,
  SlidersHorizontal,
  RefreshCw,
} from 'lucide-react';
import { ProjectSimulation, DocumentCustomization } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFSectionToggles } from './PDFSectionToggles';
import { PDFDocumentDataEditor } from './PDFDocumentDataEditor';

interface PDFSidebarControlsProps {
  isDark: boolean;
  project: ProjectSimulation;
  activeTheme: PDFColorTheme;
  setActiveTheme: (theme: PDFColorTheme) => void;
  activePagesCount: number;
  sidebarTab: 'sections' | 'edit';
  setSidebarTab: (tab: 'sections' | 'edit') => void;
  isExporting: boolean;
  handleExportPDF: () => void;
  handlePrint: () => void;
  onRefresh: () => void;

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

  updateClient: (client: Partial<ProjectSimulation['client']>) => void;
  updateSpecs: (specs: Partial<ProjectSimulation['specs']>) => void;
  updateDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
}

export const PDFSidebarControls: React.FC<PDFSidebarControlsProps> = ({
  isDark,
  project,
  activeTheme,
  setActiveTheme,
  activePagesCount,
  sidebarTab,
  setSidebarTab,
  isExporting,
  handleExportPDF,
  handlePrint,
  onRefresh,

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

  updateClient,
  updateSpecs,
  updateDocumentCustomization,
}) => {
  return (
    <aside
      className={`w-[340px] flex flex-col h-full shrink-0 transition-colors z-20 ${
        isDark
          ? 'bg-[#18181f] border-r border-[#2a2a36] text-zinc-100 shadow-2xl'
          : 'bg-white border-r border-slate-300 shadow-md'
      }`}
    >
      {/* Top Actions in Sidebar */}
      <div className={`p-4 border-b space-y-2.5 ${isDark ? 'border-[#2a2a36] bg-[#131318]' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Exportación PDF
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
          {isExporting ? 'Generando Documento...' : 'Descargar Propuesta PDF'}
        </button>

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

      {/* Tabs Header: "Secciones" vs "Datos del Documento" */}
      <div className={`grid grid-cols-2 p-1.5 m-3 rounded-xl border ${isDark ? 'bg-[#14141a] border-[#2a2a36]' : 'bg-slate-100 border-slate-200'}`}>
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
          onClick={() => setSidebarTab('edit')}
          className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            sidebarTab === 'edit'
              ? isDark
                ? 'bg-[#242432] text-white shadow-xs'
                : 'bg-white text-slate-900 shadow-xs'
              : isDark
              ? 'text-zinc-400 hover:text-zinc-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-emerald-500" />
          Datos del Documento
        </button>
      </div>

      {/* Sidebar Content Scrollable Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {sidebarTab === 'sections' ? (
          <PDFSectionToggles
            isDark={isDark}
            activeTheme={activeTheme}
            setActiveTheme={setActiveTheme}
            showCover={showCover}
            setShowCover={setShowCover}
            showTableOfContents={showTableOfContents}
            setShowTableOfContents={setShowTableOfContents}
            showAboutUs={showAboutUs}
            setShowAboutUs={setShowAboutUs}
            showBenefits={showBenefits}
            setShowBenefits={setShowBenefits}
            showTechIntro={showTechIntro}
            setShowTechIntro={setShowTechIntro}
            showProjectDescription={showProjectDescription}
            setShowProjectDescription={setShowProjectDescription}
            showPage1={showPage1}
            setShowPage1={setShowPage1}
            showPageQuotation={showPageQuotation}
            setShowPageQuotation={setShowPageQuotation}
            showPage2={showPage2}
            setShowPage2={setShowPage2}
            showPage3={showPage3}
            setShowPage3={setShowPage3}
            showPageCostMatrix={showPageCostMatrix}
            setShowPageCostMatrix={setShowPageCostMatrix}
            showHeadersFooters={showHeadersFooters}
            setShowHeadersFooters={setShowHeadersFooters}
            project={project}
            updateDocumentCustomization={updateDocumentCustomization}
          />
        ) : (
          <PDFDocumentDataEditor
            isDark={isDark}
            project={project}
            updateClient={updateClient}
            updateSpecs={updateSpecs}
            updateDocumentCustomization={updateDocumentCustomization}
          />
        )}
      </div>

      {/* Bottom Bar in Sidebar */}
      <div className={`p-4 border-t ${isDark ? 'border-[#2a2a36] bg-[#14141a]' : 'border-slate-200 bg-slate-50'}`}>
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
