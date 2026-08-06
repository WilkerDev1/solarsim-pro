import React from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Search, Plus, Calendar, Edit3, Trash2, CheckCircle2, Clock, Archive } from 'lucide-react';
import { calculateDCCapacityKWp } from '../../engine/solarEngine';

export const DashboardView: React.FC = () => {
  const {
    projects,
    setActiveProject,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    createNewProject,
    deleteProject,
  } = useSimulationStore();

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.client.company && project.client.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      project.client.province.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.client.projectId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'All Projects' || project.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface max-w-[1440px] mx-auto w-full">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Simulaciones de Proyectos</h2>
          <p className="text-sm text-secondary">
            Gestión y diseño de propuestas comerciales de energía solar fotovoltaica (República Dominicana)
          </p>
        </div>
        <button
          onClick={() => createNewProject()}
          className="bg-primary text-white hover:bg-primary-dark transition-colors px-4 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nueva Simulación
        </button>
      </div>

      {/* Toolbar Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-white p-4 rounded-xl border border-outline-variant/60 shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, empresa, provincia o ID..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-9 pr-4 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-secondary/70"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-secondary uppercase tracking-wider">Estado:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-outline-variant rounded-lg text-xs font-medium text-on-surface py-2 px-3 focus:ring-1 focus:ring-primary"
            >
              <option value="All Projects">Todos los proyectos</option>
              <option value="Draft">Borrador (Draft)</option>
              <option value="Final">Finalizado</option>
              <option value="Archived">Archivado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white border border-outline-variant/60 rounded-xl p-12 text-center my-8">
          <p className="text-secondary text-base mb-4">No se encontraron proyectos con los criterios seleccionados.</p>
          <button
            onClick={() => createNewProject()}
            className="bg-primary text-white px-4 py-2 rounded-lg font-semibold text-sm inline-flex items-center gap-2"
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
                className="bg-white border border-outline-variant/70 rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow group relative overflow-hidden"
              >
                {/* Status Bar Indicator */}
                <div
                  className={`absolute top-0 left-0 w-full h-1.5 ${
                    project.status === 'Final' ? 'bg-primary' : project.status === 'Draft' ? 'bg-tertiary-container' : 'bg-secondary'
                  }`}
                />

                <div className="flex justify-between items-start mb-3 mt-1">
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase mb-2 ${
                        project.status === 'Final'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : project.status === 'Draft'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {project.status === 'Final' && <CheckCircle2 className="w-3 h-3" />}
                      {project.status === 'Draft' && <Clock className="w-3 h-3" />}
                      {project.status === 'Archived' && <Archive className="w-3 h-3" />}
                      {project.status}
                    </span>
                    <h3 className="font-semibold text-lg text-on-surface leading-snug group-hover:text-primary transition-colors">
                      {project.client.name}
                    </h3>
                    <p className="text-xs text-secondary">{project.client.company || project.client.province}</p>
                  </div>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                    title="Eliminar proyecto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 py-3 border-y border-outline-variant/40 bg-surface/50 rounded-lg px-3">
                  <div>
                    <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider block mb-0.5">
                      Potencia DC
                    </span>
                    <span className="font-mono text-base font-bold text-primary">{kwp.toFixed(2)} kWp</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider block mb-0.5">
                      Módulos
                    </span>
                    <span className="font-mono text-sm font-semibold text-on-surface">
                      {project.specs.panelCount} ({project.specs.panelPowerW}W)
                    </span>
                  </div>
                </div>

                <div className="mt-auto">
                  <div className="flex items-center justify-between text-xs text-secondary mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Actualizado: {dateStr}
                    </span>
                    <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                      {project.client.projectId}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveProject(project.id)}
                      className="flex-1 py-2 bg-primary text-white font-semibold text-xs rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar / Simular
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
