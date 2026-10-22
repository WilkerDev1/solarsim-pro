import React, { useState } from 'react';
import { ListPlus, PlusCircle, Trash2 } from 'lucide-react';
import type { DocumentCustomization, ExtraTOCItem } from '../../../types';

interface PDFExtraTocEditorProps {
  isDark: boolean;
  extraTocItems: ExtraTOCItem[];
  updateDocumentCustomization?: (customization: Partial<DocumentCustomization>) => void;
}

/** Puntos extra del índice (anexos externos): único editor, ya no se duplica en otro panel. */
export const PDFExtraTocEditor: React.FC<PDFExtraTocEditorProps> = ({ isDark, extraTocItems, updateDocumentCustomization }) => {
  const [newExtraTitle, setNewExtraTitle] = useState('');
  const [newExtraSubtitle, setNewExtraSubtitle] = useState('');
  const [newExtraPageCount, setNewExtraPageCount] = useState<number>(1);
  const [isAddingOpen, setIsAddingOpen] = useState(false);

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
    <>
      {/* 3. PÁGINAS EXTRA / ANEXOS DEL ÍNDICE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-amber-500 shrink-0" />
            <h3 className={`text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300`}>
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

        <p className={`text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400`}>
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
                    <span className={`text-xs font-bold truncate block text-slate-900 dark:text-zinc-100`}>
                      {item.title}
                    </span>
                  </div>
                  {item.subtitle && (
                    <span className={`text-[10.5px] truncate block pl-5.5 text-slate-500 dark:text-zinc-400`}>
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
                      className={`w-6 text-center font-mono font-black text-xs bg-transparent outline-none p-0 cursor-text text-amber-900 dark:text-amber-400`}
                    />
                    <span className={`text-[10px] font-bold select-none pl-0.5 text-slate-500 dark:text-zinc-400`}>
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
          className={`p-3 rounded-xl border space-y-2.5 bg-slate-50 border-slate-200 dark:bg-[#181822] dark:border-[#2c2c3c]`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-400`}>
              + Agregar Nuevo Punto al Índice
            </span>
          </div>

          <div>
            <label className={`block text-[10px] font-bold uppercase mb-1 text-slate-600 dark:text-zinc-400`}>
              Título del Punto Extra / Anexo
            </label>
            <input
              type="text"
              placeholder="ej: Fichas Técnicas de Equipos"
              value={newExtraTitle}
              onChange={(e) => setNewExtraTitle(e.target.value)}
              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors bg-white border-slate-300 text-slate-800 focus:border-amber-600 dark:bg-[#242432] dark:border-[#38384a] dark:text-zinc-100 dark:focus:border-amber-500`}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className={`block text-[10px] font-bold uppercase mb-1 text-slate-600 dark:text-zinc-400`}>
                Subtema / Descripción (Opcional)
              </label>
              <input
                type="text"
                placeholder="ej: Datasheets de Módulos e Inversores"
                value={newExtraSubtitle}
                onChange={(e) => setNewExtraSubtitle(e.target.value)}
                className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors bg-white border-slate-300 text-slate-800 focus:border-amber-600 dark:bg-[#242432] dark:border-[#38384a] dark:text-zinc-100 dark:focus:border-amber-500`}
              />
            </div>
            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 text-slate-600 dark:text-zinc-400`}>
                Páginas
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={newExtraPageCount}
                onChange={(e) => setNewExtraPageCount(parseInt(e.target.value) || 1)}
                className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors bg-white border-slate-300 text-slate-800 focus:border-amber-600 dark:bg-[#242432] dark:border-[#38384a] dark:text-zinc-100 dark:focus:border-amber-500`}
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
            <span className={`text-[9.5px] uppercase font-bold tracking-wider block mb-1.5 text-slate-400 dark:text-zinc-500`}>
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
                  className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors cursor-pointer bg-white border-slate-300 text-slate-700 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300 dark:bg-[#242432] dark:border-[#38384a] dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-300 dark:hover:border-amber-700/50`}
                >
                  + {preset.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
