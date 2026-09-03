import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Bot,
  Sparkles,
} from 'lucide-react';
import { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import { FilePreview } from '../types';

interface AIInvoiceDocViewerProps {
  isDark: boolean;
  selectedFile: FilePreview | null;
  extractedData: ExtractedInvoiceData;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  handleResetDocument: () => void;
}

export const AIInvoiceDocViewer: React.FC<AIInvoiceDocViewerProps> = ({
  isDark,
  selectedFile,
  extractedData,
  zoomLevel,
  setZoomLevel,
  handleResetDocument,
}) => {
  const fileUrl = selectedFile ? ((selectedFile as any).dataUrl || selectedFile.url) : '';

  return (
    <div
      className={`w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r transition-colors ${
        isDark ? 'bg-[#101014] border-[#2a2a38]' : 'bg-slate-200/60 border-slate-300'
      }`}
    >
      {selectedFile ? (
        <>
          {/* Viewer toolbar */}
          <div
            className={`px-4 py-2 flex justify-between items-center border-b text-xs ${
              isDark ? 'bg-[#16161d] border-[#2a2a38] text-zinc-300' : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            <span className="font-bold truncate max-w-[200px] flex items-center gap-1.5">
              {selectedFile.type.includes('pdf') ? (
                <FileText className="w-4 h-4 text-rose-400" />
              ) : (
                <ImageIcon className="w-4 h-4 text-cyan-400" />
              )}
              {selectedFile.name}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoomLevel((z) => Math.max(50, z - 20))}
                className="p-1 rounded hover:bg-black/10 transition-colors cursor-pointer"
                title="Alejar"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[10px] font-semibold w-10 text-center">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(250, z + 20))}
                className="p-1 rounded hover:bg-black/10 transition-colors cursor-pointer"
                title="Acercar"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="p-1 rounded hover:bg-black/10 transition-colors cursor-pointer"
                title="Restablecer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <div className="h-4 w-px bg-zinc-700/40 mx-1" />
              <button
                onClick={handleResetDocument}
                className="text-[11px] font-bold text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                Cambiar Factura
              </button>
            </div>
          </div>

          {/* Document Display Area */}
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative">
            {selectedFile.type.includes('pdf') ? (
              <iframe
                src={fileUrl}
                title="Factura PDF"
                className="w-full h-full rounded-lg shadow-md border-0"
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
              />
            ) : (
              <img
                src={fileUrl}
                alt="Factura Eléctrica"
                className="max-w-full max-h-full object-contain rounded-lg shadow-md transition-transform duration-200"
                style={{ transform: `scale(${zoomLevel / 100})` }}
              />
            )}
          </div>
        </>
      ) : (
        /* Vista sin archivo físico (Basado en Requisitos Técnicos) */
        <div className="flex-1 p-6 overflow-y-auto flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-400" />
                <h4 className="font-bold text-sm">Dimensionamiento Basado en Requisitos</h4>
              </div>
              <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                Grounding Activo
              </span>
            </div>

            {extractedData.projectRequirementsPrompt && (
              <div className={`p-4 rounded-xl border space-y-2 ${isDark ? 'bg-[#15151e] border-[#29293a]' : 'bg-white border-slate-200'}`}>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                  Requerimiento Original Analizado:
                </span>
                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {extractedData.projectRequirementsPrompt}
                </pre>
              </div>
            )}

            {extractedData.aiReasoningSummary && (
              <div className={`p-4 rounded-xl border space-y-2 ${isDark ? 'bg-[#18241e] border-emerald-800/50' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex items-center gap-2 text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-bold">Síntesis Técnica del Asistente:</span>
                </div>
                <p className="text-xs text-zinc-300 dark:text-emerald-100/90 leading-relaxed">
                  {extractedData.aiReasoningSummary}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleResetDocument}
            className={`w-full py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              isDark ? 'border-[#38384c] text-zinc-400 hover:bg-[#20202c]' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Ajustar Requerimientos
          </button>
        </div>
      )}
    </div>
  );
};
