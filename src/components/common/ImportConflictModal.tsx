import React from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { AlertTriangle, Hash, Copy, Replace, X, ShieldAlert } from 'lucide-react';

export const ImportConflictModal: React.FC = () => {
  const {
    pendingImportConflict,
    resolveImportConflict,
    cancelImportConflict,
    sidebarTheme,
  } = useSimulationStore();

  if (!pendingImportConflict) return null;

  const isDark = sidebarTheme === 'dark';
  const { incomingProject, conflictingProject, reason } = pendingImportConflict;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 transition-colors bg-white border-slate-200 text-slate-900 dark:bg-[#181822] dark:border-[#2e2e42] dark:text-zinc-100`}
      >
        {/* Header */}
        <div
          className={`p-5 border-b flex items-start justify-between gap-3 bg-slate-50 border-slate-200 dark:bg-[#1f1f2c] dark:border-[#2e2e42]`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-black text-base text-slate-900 dark:text-white`}>
                Conflicto de ID al Importar
              </h3>
              <p className={`text-xs font-medium text-slate-500 dark:text-zinc-400`}>
                El proyecto importado coincide con uno existente en tu catálogo
              </p>
            </div>
          </div>
          <button
            onClick={cancelImportConflict}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800`}
            title="Cancelar importación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Details */}
        <div className="p-5 space-y-4">
          {/* Conflict details card */}
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-2 bg-amber-50/70 border-amber-200 dark:bg-[#14141c] dark:border-amber-500/30`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className={`font-bold text-amber-900 dark:text-amber-300`}>{reason}</span>
                <div className={`grid grid-cols-2 gap-2 pt-1 font-mono text-[11px] text-slate-700 dark:text-zinc-300`}>
                  <div>
                    <span className="opacity-70 block text-[10px] font-sans font-semibold">Proyecto en Archivo:</span>
                    <span className="font-bold text-emerald-500">{incomingProject.client.name}</span>
                    <span className="block opacity-80">{incomingProject.client.projectId} / {incomingProject.client.quoteNumber}</span>
                  </div>
                  <div>
                    <span className="opacity-70 block text-[10px] font-sans font-semibold">Proyecto en tu Catálogo:</span>
                    <span className="font-bold text-amber-500">{conflictingProject.client.name}</span>
                    <span className="block opacity-80">{conflictingProject.client.projectId} / {conflictingProject.client.quoteNumber}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className={`text-xs font-bold text-slate-700 dark:text-zinc-300`}>
            ¿Cómo deseas resolver este conflicto?
          </p>

          {/* Option Cards */}
          <div className="space-y-2.5">
            {/* Option 1: Next Sequence */}
            <button
              onClick={() => resolveImportConflict('next_sequence')}
              className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer group ${
                isDark
                  ? 'bg-[#1e1e2c] border-[#383850] hover:border-emerald-500 hover:bg-[#252538]'
                  : 'bg-white border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 shadow-xs hover:shadow-md'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                <Hash className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-xs text-slate-900 dark:text-white`}>
                    Asignar nuevo número consecutivo
                  </span>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Recomendado
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 text-slate-500 dark:text-zinc-400`}>
                  Mantiene ambos proyectos intactos asignándole al importado el siguiente ID libre de tu catálogo.
                </p>
              </div>
            </button>

            {/* Option 2: Save as Version / Copy */}
            <button
              onClick={() => resolveImportConflict('copy_version')}
              className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer group ${
                isDark
                  ? 'bg-[#1e1e2c] border-[#383850] hover:border-indigo-500 hover:bg-[#252538]'
                  : 'bg-white border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/40 shadow-xs hover:shadow-md'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                <Copy className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`font-bold text-xs text-slate-900 dark:text-white`}>
                  Guardar como versión / copia ({incomingProject.client.projectId}-B)
                </span>
                <p className={`text-[11px] mt-0.5 text-slate-500 dark:text-zinc-400`}>
                  Conserva el identificador original agregando el sufijo "-B" para diferenciar revisiones.
                </p>
              </div>
            </button>

            {/* Option 3: Overwrite Existing */}
            <button
              onClick={() => resolveImportConflict('overwrite')}
              className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer group ${
                isDark
                  ? 'bg-[#1e1e2c] border-[#383850] hover:border-amber-500 hover:bg-[#252538]'
                  : 'bg-white border-slate-200 hover:border-amber-500 hover:bg-amber-50/40 shadow-xs hover:shadow-md'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                <Replace className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`font-bold text-xs text-slate-900 dark:text-white`}>
                  Sobrescribir proyecto existente
                </span>
                <p className={`text-[11px] mt-0.5 text-slate-500 dark:text-zinc-400`}>
                  Reemplaza el proyecto actual en tu catálogo por la versión contenida en este archivo JSON.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t flex justify-end gap-2 bg-slate-50 border-slate-200 dark:bg-[#1f1f2c] dark:border-[#2e2e42]`}
        >
          <button
            onClick={cancelImportConflict}
            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-[#38384c] dark:text-zinc-300 dark:hover:bg-[#28283a]`}
          >
            Cancelar Importación
          </button>
        </div>
      </div>
    </div>
  );
};
