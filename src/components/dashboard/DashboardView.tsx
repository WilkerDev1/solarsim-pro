import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Zap,
  Clock,
  ArrowDownUp,
  User,
  Check,
  RotateCcw,
} from 'lucide-react';
import { ProjectCard } from './ProjectCard';
import { FoldersResumeGrid } from './FoldersResumeGrid';
import { CreateFolderModal } from './sidebar/CreateFolderModal';
import { calculateDCCapacityKWp } from '../../engine/solarEngine';

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
    syncSettings,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

  // Filter States
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'power_desc' | 'power_asc'>('newest');
  const [distributorFilter, setDistributorFilter] = useState<string>('All');
  const [projectTypeFilter, setProjectTypeFilter] = useState<'All' | 'hybrid' | 'injection' | 'zero_export'>('All');
  const [memberFilter, setMemberFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Close filter popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setShowFiltersModal(false);
      }
    };
    if (showFiltersModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFiltersModal]);

  // List of real registered accounts / authors
  const availableMembers = useMemo(() => {
    const memberSet = new Set<string>();
    if (syncSettings.currentUser?.name) {
      memberSet.add(syncSettings.currentUser.name);
    }
    projects.forEach((p) => {
      if (!p.isDeleted && p.authorName && p.authorName.trim()) {
        memberSet.add(p.authorName.trim());
      }
    });
    return Array.from(memberSet);
  }, [projects, syncSettings.currentUser]);

  // Count active filters (excluding defaults)
  const activeFiltersCount =
    (distributorFilter !== 'All' ? 1 : 0) +
    (projectTypeFilter !== 'All' ? 1 : 0) +
    (memberFilter !== 'All' ? 1 : 0) +
    (statusFilter !== 'All' ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const resetAllFilters = () => {
    setSortBy('newest');
    setDistributorFilter('All');
    setProjectTypeFilter('All');
    setMemberFilter('All');
    setStatusFilter('All');
    setActiveFolderId(null);
    setActiveTeamMemberFilter(null);
    setSearchQuery('');
  };

  // Filter and Sort Projects
  const filteredAndSortedProjects = useMemo(() => {
    const list = projects.filter((project) => {
      if (project.isDeleted) return false;

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

      // 3. Team Member Filter (from tree sidebar or filter popover)
      const effectiveMember = memberFilter !== 'All' ? memberFilter : activeTeamMemberFilter;
      const matchesTeam = effectiveMember
        ? (project.authorName || '').toLowerCase() === effectiveMember.toLowerCase()
        : true;

      // 4. Status Filter
      const matchesStatus = statusFilter === 'All' ? true : project.status === statusFilter;

      // 5. Distributor Filter
      const matchesDistributor =
        distributorFilter === 'All' ? true : project.rates.distributor === distributorFilter;

      // 6. Project Type Filter
      let matchesType = true;
      if (projectTypeFilter === 'hybrid') {
        matchesType = !!project.specs.hasBattery;
      } else if (projectTypeFilter === 'zero_export') {
        matchesType = !!project.rates.isZeroExport;
      } else if (projectTypeFilter === 'injection') {
        matchesType = !project.specs.hasBattery && !project.rates.isZeroExport;
      }

      return matchesSearch && matchesFolder && matchesTeam && matchesStatus && matchesDistributor && matchesType;
    });

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'power_desc') {
        const pA = calculateDCCapacityKWp(a.specs.panelPowerW, a.specs.panelCount);
        const pB = calculateDCCapacityKWp(b.specs.panelPowerW, b.specs.panelCount);
        return pB - pA;
      }
      if (sortBy === 'power_asc') {
        const pA = calculateDCCapacityKWp(a.specs.panelPowerW, a.specs.panelCount);
        const pB = calculateDCCapacityKWp(b.specs.panelPowerW, b.specs.panelCount);
        return pA - pB;
      }
      // default: newest
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }, [
    projects,
    searchQuery,
    activeFolderId,
    activeTeamMemberFilter,
    memberFilter,
    statusFilter,
    distributorFilter,
    projectTypeFilter,
    sortBy,
  ]);

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

            {/* Botón Filters con Popover Desplegable */}
            <div className="relative" ref={filtersRef}>
              <button
                type="button"
                onClick={() => setShowFiltersModal(!showFiltersModal)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold border flex items-center gap-2 transition-all cursor-pointer shadow-2xs ${
                  activeFiltersCount > 0
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700'
                    : 'border-slate-200/90 dark:border-[#272f3e] bg-white dark:bg-[#181d27] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#202734]'
                }`}
              >
                <Filter className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* 🗂️ Popover Flotante de Filtros Avanzados */}
              {showFiltersModal && (
                <div className="absolute right-0 mt-3 w-80 md:w-96 rounded-3xl bg-white dark:bg-[#181d27] border border-slate-200 dark:border-[#272f3e] shadow-2xl p-5 z-50 flex flex-col gap-5 text-xs animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#272f3e]">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                        Filtros Avanzados
                      </span>
                    </div>
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={resetAllFilters}
                        className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restablecer</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Orden Cronológico / Potencia */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2 flex items-center gap-1.5">
                      <ArrowDownUp className="w-3.5 h-3.5" />
                      <span>Ordenar Propuestas</span>
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'newest', label: 'Más recientes' },
                        { id: 'oldest', label: 'Más antiguos' },
                        { id: 'power_desc', label: 'Mayor Potencia' },
                        { id: 'power_asc', label: 'Menor Potencia' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSortBy(item.id as any)}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left truncate cursor-pointer ${
                            sortBy === item.id
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-slate-50 dark:bg-[#1f2532] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#252c3c]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Distribuidora Eléctrica */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>Distribuidora (EDE / CEPM)</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['All', 'EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'].map((dist) => (
                        <button
                          key={dist}
                          onClick={() => setDistributorFilter(dist)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all text-center truncate cursor-pointer ${
                            distributorFilter === dist
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-slate-50 dark:bg-[#1f2532] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#252c3c]'
                          }`}
                        >
                          {dist === 'All' ? 'Todas' : dist}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Tipo de Proyecto */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">
                      Tipo de Proyecto
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'All', label: 'Todos los Tipos' },
                        { id: 'hybrid', label: 'Híbrido (Batería)' },
                        { id: 'injection', label: 'Inyección a Red' },
                        { id: 'zero_export', label: 'Inyección Cero' },
                      ].map((type) => (
                        <button
                          key={type.id}
                          onClick={() => setProjectTypeFilter(type.id as any)}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left truncate cursor-pointer ${
                            projectTypeFilter === type.id
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-slate-50 dark:bg-[#1f2532] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#252c3c]'
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Miembro del Equipo / Autor */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-500" />
                      <span>Filtrar por Miembro</span>
                    </label>
                    <select
                      value={memberFilter}
                      onChange={(e) => setMemberFilter(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl text-xs border border-slate-200 dark:border-[#272f3e] bg-slate-50 dark:bg-[#1f2532] text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                    >
                      <option value="All">Todos los Miembros del Equipo</option>
                      {availableMembers.map((member) => (
                        <option key={member} value={member}>
                          {member}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 5. Estado de la Propuesta */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">
                      Estado de la Propuesta
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {['All', 'Draft', 'Final', 'Archived'].map((st) => (
                        <button
                          key={st}
                          onClick={() => setStatusFilter(st)}
                          className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold transition-all text-center truncate cursor-pointer ${
                            statusFilter === st
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-slate-50 dark:bg-[#1f2532] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#252c3c]'
                          }`}
                        >
                          {st === 'All' ? 'Todos' : st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Footer del Popover */}
                  <div className="pt-2 border-t border-slate-100 dark:border-[#272f3e] flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {filteredAndSortedProjects.length} propuestas
                    </span>
                    <button
                      onClick={() => setShowFiltersModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-xs"
                    >
                      Listo
                    </button>
                  </div>
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

            {/* Botón Principal: New Simulation */}
            <button
              type="button"
              onClick={openNewProjectModal}
              className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Simulation</span>
            </button>
          </div>
        </div>

        {/* 📌 Banner de Filtro Activo (si se seleccionó una carpeta, distribuidora, autor o estado) */}
        {(activeFolderName ||
          activeTeamMemberFilter ||
          memberFilter !== 'All' ||
          distributorFilter !== 'All' ||
          projectTypeFilter !== 'All' ||
          statusFilter !== 'All') && (
          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 dark:bg-emerald-950/30 dark:border-emerald-800/40 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                Filtros activos:
              </span>
              {activeFolderName && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181d27] border border-emerald-300 dark:border-emerald-700 font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Folder className="w-3 h-3" />
                  <span>Carpeta: {activeFolderName}</span>
                </span>
              )}
              {(activeTeamMemberFilter || memberFilter !== 'All') && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181d27] border border-blue-300 dark:border-blue-700 font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>Autor: {memberFilter !== 'All' ? memberFilter : activeTeamMemberFilter}</span>
                </span>
              )}
              {distributorFilter !== 'All' && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181d27] border border-amber-300 dark:border-amber-700 font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>{distributorFilter}</span>
                </span>
              )}
              {projectTypeFilter !== 'All' && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181d27] border border-purple-300 dark:border-purple-700 font-bold text-purple-800 dark:text-purple-300">
                  Tipo:{' '}
                  {projectTypeFilter === 'hybrid'
                    ? 'Híbrido'
                    : projectTypeFilter === 'zero_export'
                    ? 'Inyección Cero'
                    : 'Inyección'}
                </span>
              )}
              {statusFilter !== 'All' && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181d27] border border-slate-300 dark:border-zinc-700 font-bold text-slate-700 dark:text-zinc-300">
                  Estado: {statusFilter}
                </span>
              )}
            </div>

            <button
              onClick={resetAllFilters}
              className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpiar Todos los Filtros</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 🎴 GRID DE TARJETAS DE PROYECTOS */}
        {/* ========================================================================= */}
        {filteredAndSortedProjects.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-4 bg-white dark:bg-[#181d27] border border-slate-200/80 dark:border-[#272f3e] rounded-3xl p-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No se encontraron propuestas
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm">
                No hay proyectos que coincidan con los filtros seleccionados o el término de búsqueda.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {activeFiltersCount > 0 && (
                <button
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#202634] transition-all cursor-pointer"
                >
                  Limpiar Filtros
                </button>
              )}
              <button
                onClick={openNewProjectModal}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
              >
                Crear Nueva Propuesta
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredAndSortedProjects.map((project) => (
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
