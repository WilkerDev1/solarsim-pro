import React from 'react';
import { ExternalLink, GripVertical, Sparkles, Trash2 } from 'lucide-react';
import type { AttachedPDFDocument } from '../../../types';
import { AnnexThumbnail } from './AnnexThumbnail';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface AnnexCardProps {
  doc: AttachedPDFDocument;
  idx: number;
  isDark: boolean;
  draggedAttIndex: number | null;
  dragOverAttIndex: number | null;
  setDraggedAttIndex: (index: number | null) => void;
  setDragOverAttIndex: (index: number | null) => void;
  handleReorderAttachments: (from: number, to: number) => void;
  handleUpdateTitle: (id: string, title: string) => void;
  handlePreviewAttachment: (id: string, fileName: string) => void;
  handleRemoveAttachment: (id: string) => void;
  handleToggleEnabled: (id: string, enabled: boolean) => void;
  handleToggleAddToToc: (id: string, addToTableOfContents: boolean) => void;
}

/** One annex of the merge list: drag handle, page-1 preview, title, size, pages and merge/index toggles. */
export function AnnexCard({
  doc, idx, isDark, draggedAttIndex, dragOverAttIndex, setDraggedAttIndex, setDragOverAttIndex,
  handleReorderAttachments, handleUpdateTitle, handlePreviewAttachment, handleRemoveAttachment, handleToggleEnabled, handleToggleAddToToc,
}: AnnexCardProps) {
  const automatic = doc.origin === 'catalog';
  return (
  <div
   
    draggable
    onDragStart={(e) => {
      setDraggedAttIndex(idx);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    }}
    onDragOver={(e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverAttIndex !== idx) {
        setDragOverAttIndex(idx);
      }
    }}
    onDragLeave={() => {
      if (dragOverAttIndex === idx) {
        setDragOverAttIndex(null);
      }
    }}
    onDrop={(e) => {
      e.preventDefault();
      if (draggedAttIndex !== null && draggedAttIndex !== idx) {
        handleReorderAttachments(draggedAttIndex, idx);
      }
      setDraggedAttIndex(null);
      setDragOverAttIndex(null);
    }}
    onDragEnd={() => {
      setDraggedAttIndex(null);
      setDragOverAttIndex(null);
    }}
    className={`p-3 rounded-xl border transition-all space-y-2 relative group ${
      dragOverAttIndex === idx
        ? isDark
          ? 'border-emerald-400 bg-emerald-950/40 ring-2 ring-emerald-500/40 scale-[1.01]'
          : 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400/50 scale-[1.01]'
        : doc.enabled
        ? isDark
          ? 'bg-[#1a1a24] border-[#2e2e3e] hover:border-zinc-500'
          : 'bg-white border-slate-200 shadow-2xs hover:border-slate-400'
        : isDark
        ? 'bg-[#14141c]/50 border-zinc-800 opacity-60'
        : 'bg-slate-100 border-slate-200 opacity-60'
    } ${draggedAttIndex === idx ? 'opacity-40 border-dashed border-emerald-500' : ''}`}
  >
    {/* Fila Principal: Manecilla 3 Rayas, Thumbnail Real Pág 1, Nombre, Badges y Acciones */}
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        {/* Manecilla de 3 rayas para arrastrar y reordenar */}
        <div
          className="p-1 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-emerald-400 transition-colors shrink-0 self-center"
          title="Arrastra con el cursor para cambiar el orden de fusión"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <AnnexThumbnail doc={doc} />

        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={doc.title}
            onChange={(e) => handleUpdateTitle(doc.id, e.target.value)}
            placeholder="Título descriptivo del archivo..."
            className={`text-xs font-bold w-full bg-transparent border-b border-transparent hover:border-zinc-500 focus:border-emerald-500 outline-none transition-colors text-slate-900 dark:text-zinc-100`}
          />
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {automatic && (
              <span
                title="Ficha del catálogo de un equipo de esta propuesta; se mantiene al día sola"
                className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-300"
              >
                <Sparkles className="w-2.5 h-2.5" />
                Automática
              </span>
            )}
            <span className={`text-[10px] truncate max-w-[130px] text-slate-500 dark:text-zinc-400`}>
              {doc.fileName}
            </span>
            <span className="text-[9.5px] font-mono text-zinc-500">•</span>
            <span className="text-[9.5px] font-mono text-zinc-400 font-semibold">
              {doc.pageCountPending ? 'pendiente' : formatFileSize(doc.fileSize)}
            </span>
          </div>
        </div>
      </div>

      {/* Badge de Páginas y Botones de Acción */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md border bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-[#242432] dark:border-[#38384a] dark:text-emerald-400`}
        >
          {doc.pageCountPending ? '… págs' : `${doc.pageCount} ${doc.pageCount === 1 ? 'pág' : 'págs'}`}
        </span>

        <button
          type="button"
          onClick={() => handlePreviewAttachment(doc.id, doc.fileName)}
          className="p-1 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
          title="Ver o descargar PDF original en pestaña nueva"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => handleRemoveAttachment(doc.id)}
          className="p-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors cursor-pointer"
          title={automatic ? 'Quitar esta ficha automática (no se volverá a anexar hasta restaurarla)' : 'Eliminar PDF adjunto'}
          aria-label={automatic ? `Quitar la ficha automática ${doc.title}` : `Eliminar el anexo ${doc.title}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    {/* Fila de Opciones: Checkboxes de Inclusión */}
    <div className="pt-1.5 border-t border-dashed border-zinc-700/40 flex items-center justify-between text-[10.5px] gap-2">
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={doc.enabled}
          onChange={(e) => handleToggleEnabled(doc.id, e.target.checked)}
          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-0 cursor-pointer"
        />
        <span className={`font-medium text-slate-700 dark:text-zinc-300`}>
          ✓ Fusionar al exportar
        </span>
      </label>

      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={doc.addToTableOfContents}
          onChange={(e) => handleToggleAddToToc(doc.id, e.target.checked)}
          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-0 cursor-pointer"
        />
        <span className="text-slate-500 dark:text-zinc-400">
          Mostrar en el Índice
        </span>
      </label>
    </div>
  </div>
  );
}
