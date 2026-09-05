import React, { useState, useMemo } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { TrashProjectCard } from './TrashProjectCard';
import {
  Trash2,
  Search,
  ArrowLeft,
  Clock,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const TrashView: React.FC = () => {
  const {
    projects,
    emptyTrash,
    setIsTrashActive,
  } = useSimulationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmEmpty, setShowConfirmEmpty] = useState(false);

  // All trashed projects
  const trashedProjects = useMemo(() => {
    return projects.filter((p) => p.isDeleted);
  }, [projects]);

  // Filtered by local search query
  const filteredProjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return trashedProjects;

    return trashedProjects.filter((p) => {
      const name = (p.client?.name || '').toLowerCase();
      const company = (p.client?.company || '').toLowerCase();
      const projectId = (p.client?.projectId || '').toLowerCase();
      const province = (p.client?.province || '').toLowerCase();
      return name.includes(q) || company.includes(q) || projectId.includes(q) || province.includes(q);
    });
  }, [trashedProjects, searchQuery]);

  const handleEmptyTrash = () => {
    emptyTrash();
    setShowConfirmEmpty(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-[#0f1218] overflow-hidden select-none">
      {/* 🧭 Top Bar: Navegación, Título y Acciones */}
      <header className="px-8 py-6 border-b border-slate-200/80 dark:border-[#222734] bg-white/70 dark:bg-[#161a22]/70 backdrop-blur-md flex flex-col gap-4 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setIsTrashActive(false)}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#202634] dark:hover:bg-[#283244] text-slate-600 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Volver al Catálogo de Proyectos"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center shadow-xs">
              <Trash2 className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Papelera de Reciclaje
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400">
                  {trashedProjects.length} {trashedProjects.length === 1 ? 'propuesta' : 'propuestas'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Los proyectos se conservan durante 30 días en modo solo lectura antes de ser purgados definitivamente.
              </p>
            </div>
          </div>

          {/* Acciones Superiores */}
          <div className="flex items-center gap-3">
            {/* Botón Vaciar Papelera */}
            <button
              disabled={trashedProjects.length === 0}
              onClick={() => setShowConfirmEmpty(true)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${
                trashedProjects.length > 0
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-300 dark:border-rose-900/60 cursor-pointer active:scale-95'
                  : 'bg-slate-100 text-slate-400 dark:bg-[#1e2430] dark:text-zinc-600 cursor-not-allowed border border-transparent'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Vaciar Papelera</span>
            </button>

            {/* Botón Volver a Proyectos */}
            <button
              onClick={() => setIsTrashActive(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              Volver a Proyectos
            </button>
          </div>
        </div>

        {/* Barra de Búsqueda y Aviso Informativo */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {/* Input de Búsqueda */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en la papelera por cliente, código o provincia..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-white dark:bg-[#1a202c] border border-slate-200 dark:border-[#2d3748] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
            />
          </div>

          {/* Banner sutil de política de retención */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Retención automática de 30 días • Acceso en modo solo lectura</span>
          </div>
        </div>
      </header>

      {/* 📋 Main Canvas: Grid de Tarjetas o Estado Vacío */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {filteredProjects.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-[#181d27] border border-slate-200/80 dark:border-[#263040] flex items-center justify-center text-slate-400 mb-4 shadow-xs">
              <Trash2 className="w-10 h-10 text-slate-300 dark:text-zinc-600" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              {searchQuery ? 'No se encontraron resultados' : 'La papelera está vacía'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mt-1.5 leading-relaxed">
              {searchQuery
                ? `No hay propuestas en la papelera que coincidan con "${searchQuery}".`
                : 'Las propuestas que elimines aparecerán aquí durante 30 días para su recuperación antes de ser purgadas definitivamente.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-[#252c3c] dark:hover:bg-[#30384c] text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {filteredProjects.map((proj) => (
              <TrashProjectCard key={proj.id} project={proj} />
            ))}
          </div>
        )}
      </main>

      {/* ⚠️ Modal de Confirmación: Vaciar Papelera */}
      {showConfirmEmpty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#181d27] border border-slate-200 dark:border-[#2d3748] rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  ¿Vaciar la papelera de reciclaje?
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed bg-slate-50 dark:bg-[#1e2533] p-3.5 rounded-2xl border border-slate-200/60 dark:border-[#283244]">
              Se eliminarán de forma <strong>definitiva y permanente</strong> las{' '}
              <strong className="text-rose-600 dark:text-rose-400">
                {trashedProjects.length} propuesta{trashedProjects.length === 1 ? '' : 's'}
              </strong>{' '}
              almacenadas en la papelera de reciclaje. Los datos no podrán recuperarse.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmEmpty(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202634] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEmptyTrash}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, vaciar definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
