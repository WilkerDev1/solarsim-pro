import React, { useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  Search,
  Plus,
  Calendar,
  Edit3,
  Trash2,
  Copy,
  MapPin,
  Zap,
  Upload,
  Download,
  Share2,
  FileJson,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { calculateDCCapacityKWp } from '../../engine/solarEngine';

export const DashboardView: React.FC = () => {
  const {
    projects,
    setActiveProject,
    searchQuery,
    setSearchQuery,
    openNewProjectModal,
    duplicateProject,
    deleteProject,
    exportProjectAsJSON,
    exportAllProjectsAsJSON,
    importProjectsFromJSON,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importNotification, setImportNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const result = importProjectsFromJSON(parsed);

        if (result.success) {
          setImportNotification({ type: 'success', message: result.message });
        } else {
          setImportNotification({ type: 'error', message: result.message });
        }
      } catch (err: any) {
        setImportNotification({
          type: 'error',
          message: 'Error al leer el archivo JSON: formato corrupto o inválido.',
        });
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setTimeout(() => setImportNotification(null), 5000);
    };

    reader.readAsText(file);
  };

  const filteredProjects = projects.filter((project) => {
    return (
      project.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.client.company && project.client.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      project.client.province.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.client.projectId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div
      className={`flex-1 overflow-y-auto w-full h-full p-6 sm:p-8 font-sans transition-colors duration-200 ${
        isDark ? 'bg-[#121214] text-zinc-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      <div className="max-w-[1400px] mx-auto w-full space-y-6">
        {/* Import Notification Banner */}
        {importNotification && (
          <div
            className={`p-4 rounded-2xl border flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-2 shadow-md ${
              importNotification.type === 'success'
                ? isDark
                  ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-200'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : isDark
                ? 'bg-red-950/80 border-red-700/80 text-red-200'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            {importNotification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            )}
            <span className="text-xs sm:text-sm font-bold flex-1">{importNotification.message}</span>
            <button
              onClick={() => setImportNotification(null)}
              className="text-xs font-black uppercase opacity-70 hover:opacity-100 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Header Banner */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Catálogo de Proyectos y Simulaciones
            </h2>
            <p className={`text-xs sm:text-sm mt-1 font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Gestión y diseño de propuestas comerciales de energía solar fotovoltaica en República Dominicana
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Input Oculto de Archivo JSON */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Botón Importar JSON */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 ${
                isDark
                  ? 'bg-[#1e1e28] border-[#343446] text-zinc-200 hover:bg-[#282836] hover:border-amber-500/70 hover:text-amber-300'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-amber-400 hover:text-amber-800'
              }`}
              title="Importar proyecto o respaldo completo desde un archivo JSON"
            >
              <Upload className="w-4 h-4 text-amber-500" />
              <span>Importar JSON</span>
            </button>

            {/* Botón Exportar Respaldo Completo */}
            <button
              onClick={exportAllProjectsAsJSON}
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 ${
                isDark
                  ? 'bg-[#1e1e28] border-[#343446] text-zinc-200 hover:bg-[#282836] hover:border-emerald-500/70 hover:text-emerald-300'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-emerald-400 hover:text-emerald-800'
              }`}
              title="Exportar todos los proyectos en un archivo JSON de respaldo"
            >
              <Download className="w-4 h-4 text-emerald-500" />
              <span>Exportar Todo</span>
            </button>

            {/* Botón Nueva Simulación */}
            <button
              onClick={openNewProjectModal}
              className="bg-emerald-700 hover:bg-emerald-600 text-white transition-all px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Simulación</span>
            </button>
          </div>
        </div>

        {/* Toolbar Area */}
        <div
          className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 rounded-2xl border transition-colors ${
            isDark ? 'bg-[#18181f] border-[#2d2d38] shadow-md' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          {/* Search Input */}
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-400' : 'text-slate-400'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por cliente, empresa, provincia o ID..."
              className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#24242e] border-[#383846] text-white placeholder:text-zinc-500 focus:bg-[#282834] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 placeholder:text-slate-400'
              }`}
            />
          </div>

          <div className={`text-xs font-bold ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Total de proyectos guardados:{' '}
            <span className="font-mono text-emerald-500 font-black text-sm ml-1">{projects.length}</span>
          </div>
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div
            className={`border rounded-2xl p-12 text-center my-8 transition-colors ${
              isDark ? 'bg-[#18181f] border-[#2d2d38]' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <p className={`text-sm mb-4 font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              No se encontraron proyectos con los criterios de búsqueda.
            </p>
            <button
              onClick={openNewProjectModal}
              className="bg-emerald-700 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Crear nuevo proyecto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => {
              const kwp = calculateDCCapacityKWp(project.specs.panelPowerW, project.specs.panelCount);
              const dateStr = new Date(project.updatedAt).toLocaleDateString('es-DO', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });

              return (
                <article
                  key={project.id}
                  className={`border rounded-2xl p-5 flex flex-col transition-all group relative overflow-hidden ${
                    isDark
                      ? 'bg-[#1b1b22] border-[#2e2e3a] hover:border-emerald-500/80 hover:bg-[#20202a] text-zinc-100 shadow-lg'
                      : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-xl shadow-xs'
                  }`}
                >
                  {/* Top Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1.5 flex-1 min-w-0 pr-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          isDark
                            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700/60'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {project.client.projectId || 'SP-2026-001'}
                      </span>
                      <h3
                        className={`font-bold text-base leading-snug truncate transition-colors ${
                          isDark ? 'text-white group-hover:text-emerald-400' : 'text-slate-900 group-hover:text-emerald-800'
                        }`}
                        title={project.client.name}
                      >
                        {project.client.name}
                      </h3>
                      <p className={`text-xs flex items-center gap-1 font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        <MapPin className={`w-3 h-3 shrink-0 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`} />
                        <span className="truncate">{project.client.province || project.client.location}</span>
                      </p>
                    </div>

                    {/* Actions (Export JSON, Duplicate & Delete) */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => exportProjectAsJSON(project.id)}
                        className={`p-2 rounded-lg transition-colors cursor-pointer ${
                          isDark
                            ? 'text-zinc-400 hover:text-amber-400 hover:bg-[#2a2a36]'
                            : 'text-slate-400 hover:text-amber-700 hover:bg-amber-50'
                        }`}
                        title="Compartir / Exportar proyecto en JSON"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => duplicateProject(project.id)}
                        className={`p-2 rounded-lg transition-colors cursor-pointer ${
                          isDark
                            ? 'text-zinc-400 hover:text-emerald-400 hover:bg-[#2a2a36]'
                            : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title="Duplicar proyecto"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`¿Estás seguro de eliminar el proyecto "${project.client.name}"?`)) {
                            deleteProject(project.id);
                          }
                        }}
                        className={`p-2 rounded-lg transition-colors cursor-pointer ${
                          isDark
                            ? 'text-zinc-400 hover:text-red-400 hover:bg-red-950/50'
                            : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                        title="Eliminar proyecto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Specs Box */}
                  <div
                    className={`grid grid-cols-2 gap-3 my-3 py-3 border-y rounded-xl px-3.5 text-xs ${
                      isDark
                        ? 'border-[#2a2a36] bg-[#14141a]'
                        : 'border-slate-100 bg-slate-50/70'
                    }`}
                  >
                    <div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-400'}`}>
                        Potencia DC
                      </span>
                      <span className="font-mono text-base font-black text-emerald-500">{kwp.toFixed(2)} kWp</span>
                    </div>
                    <div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-400'}`}>
                        Distribuidora
                      </span>
                      <span className={`font-bold flex items-center gap-1 truncate ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>
                        <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="truncate">{project.client.distributor || 'EDEESTE'} ({project.client.tariffCode || 'BTS2'})</span>
                      </span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-2">
                    <div className={`flex items-center justify-between text-[11px] mb-4 font-medium ${isDark ? 'text-zinc-400' : 'text-slate-400'}`}>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {dateStr}
                      </span>
                      <span className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-slate-500'}`}>
                        {project.specs.panelCount} Paneles ({project.specs.panelPowerW}W)
                      </span>
                    </div>

                    <button
                      onClick={() => setActiveProject(project.id)}
                      className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md cursor-pointer active:scale-98"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Abrir Simulación
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
