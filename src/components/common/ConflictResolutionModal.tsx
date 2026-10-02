import React from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  AlertTriangle,
  GitFork,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  X,
  FileText,
} from 'lucide-react';

export const ConflictResolutionModal: React.FC = () => {
  const { activeConflict, resolveConflict, setActiveConflict } = useSimulationStore();

  if (!activeConflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-3xl bg-[#161b22] border border-amber-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* ⚠️ Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-amber-500/10 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">
                Conflicto de Concurrencia en Sincronización
              </h2>
              <p className="text-xs text-amber-300/80">
                Se detectaron cambios simultáneos en la propuesta{' '}
                <span className="font-mono font-bold text-white">
                  [{activeConflict.localProject.client.projectId || activeConflict.projectId}]
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveConflict(null)}
            className="p-1.5 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 📜 Content Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 text-sm">
          {/* Explanation Alert */}
          <div className="p-4 rounded-2xl bg-[#0d1117] border border-[#30363d] text-xs text-zinc-300 leading-relaxed">
            <p>
              El usuario <span className="font-bold text-white">{activeConflict.lastModifiedByName || 'Otro Consultor'}</span> guardó
              una versión más reciente (<span className="font-mono font-bold text-blue-400">v{activeConflict.serverVersion}</span>) en el servidor
              mientras editabas localmente a partir de la versión base{' '}
              <span className="font-mono font-bold text-amber-400">v{activeConflict.localVersion}</span>.
            </p>
            <p className="mt-2 text-zinc-400">
              Revisa las diferencias a continuación y selecciona cómo deseas resolver esta colisión para garantizar la integridad de los cálculos:
            </p>
          </div>

          {/* 🔍 Visual Diffs Comparison */}
          <div className="rounded-2xl border border-[#30363d] overflow-hidden bg-[#0d1117]">
            <div className="grid grid-cols-3 px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              <span>Parámetro</span>
              <span className="text-amber-400">Tu Versión Local (v{activeConflict.localVersion})</span>
              <span className="text-blue-400">Versión del Servidor (v{activeConflict.serverVersion})</span>
            </div>

            <div className="divide-y divide-[#21262d] max-h-60 overflow-y-auto">
              {activeConflict.diffs.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  Sin diferencias críticas en parámetros principales.
                </div>
              ) : (
                activeConflict.diffs.map((diff, idx) => (
                  <div key={idx} className="grid grid-cols-3 px-4 py-3 text-xs items-center gap-2">
                    <div>
                      <span className="font-bold text-white block">{diff.field}</span>
                      <span className="text-[10px] text-zinc-500">{diff.section}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono text-xs truncate">
                      {diff.formattedOld || String(diff.oldValue)}
                    </div>

                    <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono text-xs truncate">
                      {diff.formattedNew || String(diff.newValue)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 🎯 Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {/* 1. Fork (Recommended) */}
            <button
              onClick={() => resolveConflict('fork')}
              className="p-4 rounded-2xl bg-gradient-to-b from-[#1c2433] to-[#121721] border-2 border-emerald-500/60 hover:border-emerald-400 text-left transition-all hover:scale-[1.02] flex flex-col justify-between group cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <GitFork className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">
                    Recomendado
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white mb-1">Bifurcar Propuesta</h4>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Conserva ambos trabajos creando una nueva propuesta independiente con tus cambios locales.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-400 mt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                Bifurcar y continuar →
              </span>
            </button>

            {/* 2. Accept Server */}
            <button
              onClick={() => resolveConflict('accept_server')}
              className="p-4 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-blue-400 text-left transition-all hover:scale-[1.02] flex flex-col justify-between group cursor-pointer"
            >
              <div>
                <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 w-fit mb-2">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">Aceptar Servidor</h4>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Aplica la versión más reciente guardada por tu colega, descartando tus cambios locales no sincronizados.
                </p>
              </div>
              <span className="text-xs font-bold text-blue-400 mt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                Descargar servidor →
              </span>
            </button>

            {/* 3. Keep Local */}
            <button
              onClick={() => resolveConflict('keep_local')}
              className="p-4 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-amber-400 text-left transition-all hover:scale-[1.02] flex flex-col justify-between group cursor-pointer"
            >
              <div>
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 w-fit mb-2">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">Conservar Local</h4>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Fuerza la subida de tu versión local incrementando el número de versión (v{activeConflict.serverVersion + 1}).
                </p>
              </div>
              <span className="text-xs font-bold text-amber-400 mt-3 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                Sobreescribir nube →
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
