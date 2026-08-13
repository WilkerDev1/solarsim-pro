import React from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Search, Plus, Calendar, Edit3, Trash2, Copy, MapPin, Zap } from 'lucide-react';
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
  } = useSimulationStore();

  const filteredProjects = projects.filter((project) => {
    return (
      project.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.client.company && project.client.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      project.client.province.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.client.projectId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 max-w-[1440px] mx-auto w-full font-sans">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Catálogo de Proyectos y Simulaciones</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Gestión y diseño de propuestas comerciales de energía solar fotovoltaica en República Dominicana
          </p>
        </div>
        <button
          onClick={openNewProjectModal}
          className="bg-emerald-700 hover:bg-emerald-800 text-white transition-all px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nueva Simulación
        </button>
      </div>

      {/* Toolbar Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, empresa, provincia o ID..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 transition-all placeholder:text-slate-400 placeholder:font-normal"
          />
        </div>

        <div className="text-xs font-bold text-slate-500">
          Total de proyectos guardados: <span className="font-mono text-emerald-800 font-extrabold">{projects.length}</span>
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center my-8 shadow-xs">
          <p className="text-slate-500 text-sm mb-4 font-semibold">No se encontraron proyectos con los criterios de búsqueda.</p>
          <button
            onClick={openNewProjectModal}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2 transition-all shadow-md cursor-pointer"
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
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col hover:shadow-xl hover:border-emerald-300 transition-all group relative overflow-hidden shadow-xs"
              >
                {/* Top Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {project.client.projectId || 'SP-2026-001'}
                    </span>
                    <h3 className="font-bold text-base text-slate-900 leading-snug group-hover:text-emerald-800 transition-colors">
                      {project.client.name}
                    </h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[220px]">{project.client.province || project.client.location}</span>
                    </p>
                  </div>

                  {/* Actions (Duplicate & Delete) */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => duplicateProject(project.id)}
                      className="text-slate-400 hover:text-emerald-700 p-1.5 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
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
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      title="Eliminar proyecto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Specs Box */}
                <div className="grid grid-cols-2 gap-3 my-3 py-3 border-y border-slate-100 bg-slate-50/70 rounded-xl px-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Potencia DC
                    </span>
                    <span className="font-mono text-base font-black text-emerald-800">{kwp.toFixed(2)} kWp</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Distribuidora
                    </span>
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      {project.client.distributor || 'EDEESTE'} ({project.client.tariffCode || 'BTS2'})
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-4 font-medium">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Guardado: {dateStr}
                    </span>
                    <span className="text-slate-500 font-semibold">
                      {project.specs.panelCount} Paneles ({project.specs.panelPowerW}W)
                    </span>
                  </div>

                  <button
                    onClick={() => setActiveProject(project.id)}
                    className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md cursor-pointer"
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
  );
};
