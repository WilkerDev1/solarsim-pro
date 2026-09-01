import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  Search,
  Plus,
  Filter,
  Folder,
  FolderPlus,
  X,
  Sparkles,
  FileText,
} from 'lucide-react';
import { ProjectCard } from './ProjectCard';
import { FoldersResumeGrid } from './FoldersResumeGrid';
import { CreateFolderModal } from './sidebar/CreateFolderModal';

export const DashboardView: React.FC = () => {
  const {
    projects,
    searchQuery,
    setSearchQuery,
    openNewProjectModal,
    activeFolderId,
    setActiveFolderId,
    activeTeamMemberFilter,
    setActiveTeamMemberFilter,
    folders,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Filter projects by search, active folder, team member and status
  const filteredProjects = projects.filter((project) => {
    // 1. Search Query Filter
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      project.client.name.toLowerCase().includes(query) ||
      (project.client.company && project.client.company.toLowerCase().includes(query)) ||
      project.client.province.toLowerCase().includes(query) ||
      project.client.projectId.toLowerCase().includes(query);

    // 2. Folder Filter
    const matchesFolder = activeFolderId ? project.folderId === activeFolderId : true;

    // 3. Team Member Filter
    const matchesTeam = activeTeamMemberFilter
      ? (project.authorName || '').toLowerCase() === activeTeamMemberFilter.toLowerCase()
      : true;

    // 4. Status Filter
    const matchesStatus = statusFilter === 'All' ? true : project.status === statusFilter;

    return matchesSearch && matchesFolder && matchesTeam && matchesStatus;
  });

  const activeFolderName = activeFolderId ? folders.find((f) => f.id === activeFolderId)?.name : null;

  return (
    <div
      className={`flex-1 overflow-y-auto w-full h-full p-6 md:p-10 font-sans transition-colors duration-200 ${
        isDark ? 'bg-[#10141d] text-zinc-100' : 'bg-[#f4f6fa] text-slate-900'
      }`}
    >
      <div className="max-w-[1500px] mx-auto w-full flex flex-col gap-8 pb-16">
        {/* ========================================================================= */}
        {/* 🔝 HEADER SUPERIOR: PROJECTS, BUSCADOR Y ACCIONES */}
        {/* ========================================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
            Projects
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            {/* Buscador Integrado */}
            <div className="relative min-w-[240px] sm:min-w-[320px]">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs border border-slate-200/90 dark:border-[#272f3e] bg-white dark:bg-[#181d27] text-slate-900 dark:text-zinc-100 shadow-2xs focus:outline-hidden focus:border-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Botón Filters */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFiltersDropdown(!showFiltersDropdown)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold border flex items-center gap-2 transition-all cursor-pointer shadow-2xs ${
                  statusFilter !== 'All'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700'
                    : 'border-slate-200/90 dark:border-[#272f3e] bg-white dark:bg-[#181d27] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#202734]'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filters</span>
                {statusFilter !== 'All' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </button>

              {showFiltersDropdown && (
                <div className="absolute right-0 mt-2 w-44 rounded-2xl bg-white dark:bg-[#181d27] border border-slate-200 dark:border-[#272f3e] shadow-xl p-2 z-40 flex flex-col gap-1 text-xs animate-in fade-in zoom-in-95 duration-150">
                  {['All', 'Draft', 'Final', 'Archived'].map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setStatusFilter(status);
                        setShowFiltersDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                        statusFilter === status
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold'
                          : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#202734]'
                      }`}
                    >
                      {status === 'All' ? 'Todos los Estados' : status}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Botón Folder */}
            <button
              type="button"
              onClick={() => setIsFolderModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold border border-slate-200/90 dark:border-[#272f3e] bg-white dark:bg-[#181d27] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#202734] transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
            >
              <FolderPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Folder</span>
            </button>

            {/* Botón Principal: + New Simulation */}
            <button
              type="button"
              onClick={openNewProjectModal}
              className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Simulation</span>
            </button>
          </div>
        </div>

        {/* 📌 Banner de Filtro Activo (si se seleccionó una carpeta o colaborador en el árbol) */}
        {(activeFolderName || activeTeamMemberFilter || statusFilter !== 'All') && (
          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 dark:bg-emerald-950/30 dark:border-emerald-800/40 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                Mostrando:
              </span>
              {activeFolderName && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181d27] border border-emerald-300 dark:border-emerald-700 font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Folder className="w-3 h-3" />
                  <span>{activeFolderName}</span>
                </span>
              )}
              {activeTeamMemberFilter && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181d27] border border-blue-300 dark:border-blue-700 font-bold text-blue-800 dark:text-blue-300">
                  Autor: {activeTeamMemberFilter}
                </span>
              )}
              {statusFilter !== 'All' && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181d27] border border-slate-300 dark:border-zinc-700 font-bold text-slate-700 dark:text-zinc-300">
                  Estado: {statusFilter}
                </span>
              )}
            </div>

            <button
              onClick={() => {
                setActiveFolderId(null);
                setActiveTeamMemberFilter(null);
                setStatusFilter('All');
              }}
              className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Ver Todos los Proyectos</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 🎴 GRID DE TARJETAS DE PROYECTOS */}
        {/* ========================================================================= */}
        {filteredProjects.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-4 bg-white dark:bg-[#181d27] border border-slate-200/80 dark:border-[#272f3e] rounded-3xl p-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No se encontraron proyectos
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm">
                No hay propuestas que coincidan con la búsqueda o carpeta seleccionada.
              </p>
            </div>
            <button
              onClick={openNewProjectModal}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
            >
              Crear Nueva Propuesta
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 📁 RESUMEN DE CARPETAS (FOLDERS RESUME) */}
        {/* ========================================================================= */}
        <FoldersResumeGrid />
      </div>

      <CreateFolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
      />
    </div>
  );
};
