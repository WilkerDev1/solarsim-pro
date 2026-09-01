import React, { useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import {
  Folder,
  FolderOpen,
  FileText,
  Users,
  User,
  ChevronDown,
  ChevronRight,
  Plus,
  UserPlus,
  Edit2,
  Trash2,
  Sparkles,
  Layers,
  Check,
} from 'lucide-react';
import { CreateFolderModal } from './CreateFolderModal';
import { ProjectFolder } from '../../../types';

export const SolarCoreTreeSidebar: React.FC = () => {
  const {
    projects,
    folders,
    activeFolderId,
    setActiveFolderId,
    activeTeamMemberFilter,
    setActiveTeamMemberFilter,
    setActiveProject,
    syncSettings,
    openSettingsModal,
    moveProjectToFolder,
    deleteFolder,
  } = useSimulationStore();

  const currentUser = syncSettings.currentUser;
  const isAdmin = currentUser?.role === 'ADMIN' || !currentUser; // Default full admin capabilities in standalone mode

  // Tree collapsible section states
  const [isProjectsOpen, setIsProjectsOpen] = useState(true);
  const [isTeamOpen, setIsTeamOpen] = useState(true);
  const [openFolderIds, setOpenFolderIds] = useState<Record<string, boolean>>({});

  // Modal for folder creation / editing
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<ProjectFolder | null>(null);

  // Drag over tracking
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const toggleFolder = (folderId: string) => {
    setOpenFolderIds((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  // Distinct team members based strictly on real registered account or project authors
  const teamMembers = React.useMemo(() => {
    const memberSet = new Set<string>();
    if (currentUser?.name) {
      memberSet.add(currentUser.name);
    }
    projects.forEach((p) => {
      if (p.authorName && p.authorName.trim()) {
        memberSet.add(p.authorName.trim());
      }
    });
    if (memberSet.size === 0) {
      memberSet.add(currentUser?.email || 'Usuario Principal');
    }
    return Array.from(memberSet);
  }, [projects, currentUser]);

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolderId(null);
  };

  const handleDropOnFolder = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    const projectId = e.dataTransfer.getData('text/plain');
    if (projectId) {
      moveProjectToFolder(projectId, folderId);
      if (folderId) {
        setOpenFolderIds((prev) => ({ ...prev, [folderId]: true }));
      }
    }
  };

  return (
    <aside className="w-72 md:w-80 h-full border-r border-slate-200/90 dark:border-[#27272a] bg-white dark:bg-[#161a22] flex flex-col justify-between shrink-0 select-none z-30 overflow-hidden shadow-xs">
      {/* ☀️ Header: Solar Core Brand */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        <div className="p-5 pb-4 border-b border-slate-100 dark:border-[#222734] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100/70 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center font-bold shadow-2xs">
              <Layers className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-emerald-950 dark:text-white flex items-center gap-1.5">
                <span>Solar Core</span>
              </h2>
            </div>
          </div>
        </div>

        {/* 🌳 Árbol de Navegación */}
        <div className="p-3 flex flex-col gap-5 text-xs">
          {/* ========================================================================= */}
          {/* SECCIÓN 1: 📁 PROJECTS (General / Todos) */}
          {/* ========================================================================= */}
          <div
            onDragOver={(e) => handleDragOver(e, null)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDropOnFolder(e, null)}
            className={`flex flex-col gap-1 rounded-xl transition-colors ${
              dragOverFolderId === null ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
            }`}
          >
            <div
              onClick={() => {
                setActiveFolderId(null);
                setActiveTeamMemberFilter(null);
              }}
              className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                activeFolderId === null && activeTeamMemberFilter === null
                  ? 'bg-emerald-50/80 text-emerald-900 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40 font-bold shadow-2xs'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100/80 dark:hover:bg-[#202634]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsProjectsOpen(!isProjectsOpen);
                  }}
                  className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  {isProjectsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <Folder className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-sm">Projects</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-100 dark:bg-[#242b3b] text-slate-600 dark:text-zinc-400 font-semibold">
                {projects.length}
              </span>
            </div>

            {/* Sub-lista de proyectos generales */}
            {isProjectsOpen && (
              <div className="pl-6 pr-1 flex flex-col gap-1 mt-1 border-l-2 border-slate-100 dark:border-[#272f3e] ml-4">
                {projects.slice(0, 8).map((proj) => (
                  <div
                    key={proj.id}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', proj.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => setActiveProject(proj.id)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202634] flex items-center gap-2 transition-all truncate cursor-grab active:cursor-grabbing group"
                    title={proj.client.name}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                    <span className="truncate">{proj.client.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* SECCIÓN 2: 👥 TEAM (Miembros y Colaboradores) */}
          {/* ========================================================================= */}
          <div className="flex flex-col gap-1">
            <div
              onClick={() => setIsTeamOpen(!isTeamOpen)}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 dark:text-zinc-300 hover:bg-slate-100/80 dark:hover:bg-[#202634] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="p-0.5 text-slate-400">
                  {isTeamOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </span>
                <Users className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                <span className="font-semibold text-sm">Team</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">{teamMembers.length}</span>
            </div>

            {isTeamOpen && (
              <div className="pl-6 pr-1 flex flex-col gap-1 mt-1 border-l-2 border-slate-100 dark:border-[#272f3e] ml-4">
                {teamMembers.map((member) => {
                  const isSelected = activeTeamMemberFilter === member;
                  const memberProjectsCount = projects.filter(
                    (p) => (p.authorName || '').toLowerCase() === member.toLowerCase()
                  ).length;

                  return (
                    <button
                      key={member}
                      onClick={() => setActiveTeamMemberFilter(isSelected ? null : member)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all cursor-pointer truncate ${
                        isSelected
                          ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-300 font-bold'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202634]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <User className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{member}</span>
                      </div>
                      {memberProjectsCount > 0 && (
                        <span className="text-[10px] text-slate-400 font-mono ml-1">{memberProjectsCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* SECCIÓN 3: 🗂️ FOLDERS (Carpetas Personalizadas con Drag & Drop) */}
          {/* ========================================================================= */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                Folders
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setFolderToEdit(null);
                    setIsFolderModalOpen(true);
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-[#202634] transition-colors cursor-pointer"
                  title="Crear Nueva Carpeta (Admin)"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Listado de Carpetas */}
            <div className="flex flex-col gap-1">
              {folders.length === 0 ? (
                <div className="px-3 py-3 text-center border border-dashed border-slate-200 dark:border-[#272f3e] rounded-xl my-1">
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">Sin carpetas creadas</p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setFolderToEdit(null);
                        setIsFolderModalOpen(true);
                      }}
                      className="mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      + Crear primera carpeta
                    </button>
                  )}
                </div>
              ) : (
                folders.map((folder) => {
                  const isSelected = activeFolderId === folder.id;
                  const isOpen = !!openFolderIds[folder.id];
                  const folderProjects = projects.filter((p) => p.folderId === folder.id);
                  const isDragOver = dragOverFolderId === folder.id;

                  return (
                    <div
                      key={folder.id}
                      onDragOver={(e) => handleDragOver(e, folder.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDropOnFolder(e, folder.id)}
                      className={`rounded-xl transition-all ${
                        isDragOver ? 'ring-2 ring-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40' : ''
                      }`}
                    >
                      {/* Item de Carpeta */}
                      <div
                        onClick={() => {
                          toggleFolder(folder.id);
                          setActiveFolderId(isSelected ? null : folder.id);
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 font-bold shadow-2xs'
                            : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100/80 dark:hover:bg-[#202634]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFolder(folder.id);
                            }}
                            className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                          >
                            {isOpen ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isOpen ? (
                            <FolderOpen
                              className="w-4 h-4 shrink-0"
                              style={{ color: folder.color || '#10b981' }}
                            />
                          ) : (
                            <Folder
                              className="w-4 h-4 shrink-0"
                              style={{ color: folder.color || '#10b981' }}
                            />
                          )}
                          <span className="font-semibold truncate text-xs">{folder.name}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isSelected
                                ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100'
                                : 'bg-slate-100 dark:bg-[#242b3b] text-slate-600 dark:text-zinc-400'
                            }`}
                          >
                            {folderProjects.length}
                          </span>
                        </div>
                      </div>

                      {/* Proyectos dentro de esta Carpeta */}
                      {isOpen && (
                        <div className="pl-6 pr-1 flex flex-col gap-1 mt-1 border-l-2 border-slate-100 dark:border-[#272f3e] ml-4">
                          {folderProjects.length === 0 ? (
                            <span className="text-[10px] text-slate-400 italic py-1 pl-2">
                              Arrastra proyectos aquí
                            </span>
                          ) : (
                            folderProjects.map((proj) => (
                              <div
                                key={proj.id}
                                draggable={true}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', proj.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onClick={() => setActiveProject(proj.id)}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202634] flex items-center gap-2 transition-all truncate cursor-grab active:cursor-grabbing group"
                                title={proj.client.name}
                              >
                                <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-emerald-500" />
                                <span className="truncate">{proj.client.name}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 👤 Área Inferior: Invitar Miembros & Perfil de Usuario */}
      <div className="p-4 border-t border-slate-100 dark:border-[#222734] flex flex-col gap-3 shrink-0">
        {/* Botón Invitar Teammates */}
        <button
          onClick={() => openSettingsModal('account')}
          className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-[#202634] transition-colors flex items-center gap-2 cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Invite teammates</span>
        </button>

        {/* Píldora de Perfil del Usuario Activo */}
        <div
          onClick={() => openSettingsModal('account')}
          className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#1f2532] border border-slate-200/70 dark:border-[#2a3344] flex items-center gap-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-[#252c3c] transition-all shadow-2xs"
          title="Ver perfil y ajustes"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-400 to-sky-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'J'}
          </div>
          <div className="flex-1 min-w-0">
            <span className="block font-bold text-xs text-slate-900 dark:text-white truncate font-mono">
              {currentUser?.name || 'James W.'}
            </span>
            <span className="block text-[10px] text-slate-500 dark:text-zinc-400 truncate">
              {currentUser?.email || 'admin@solarsim.pro'}
            </span>
          </div>
        </div>
      </div>

      {/* Modal de Creación / Edición de Carpeta */}
      <CreateFolderModal
        isOpen={isFolderModalOpen}
        onClose={() => {
          setIsFolderModalOpen(false);
          setFolderToEdit(null);
        }}
        folderToEdit={folderToEdit}
      />
    </aside>
  );
};
