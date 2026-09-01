import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { FolderPlus, Folder, ArrowRight, Sparkles } from 'lucide-react';
import { CreateFolderModal } from './sidebar/CreateFolderModal';
import { ProjectFolder } from '../../types';

export const FoldersResumeGrid: React.FC = () => {
  const {
    folders,
    projects,
    activeFolderId,
    setActiveFolderId,
    syncSettings,
  } = useSimulationStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<ProjectFolder | null>(null);
  const isAdmin = syncSettings.currentUser?.role === 'ADMIN' || !syncSettings.currentUser;

  const activeProjects = React.useMemo(() => projects.filter((p) => !p.isDeleted), [projects]);

  return (
    <div className="flex flex-col gap-5 pt-8 border-t border-slate-200/80 dark:border-[#272f3e]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black tracking-wider uppercase text-slate-800 dark:text-zinc-200">
            Folders Resume
          </h3>
          <p className="text-xs text-slate-400 dark:text-zinc-500">
            Organización por categorías y carpetas de proyectos
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setFolderToEdit(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New Folder</span>
          </button>
        )}
      </div>

      {/* Grid Cards */}
      {folders.length === 0 ? (
        <div className="bg-white dark:bg-[#181d27] border border-dashed border-slate-200/90 dark:border-[#293242] rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">No hay carpetas personalizadas</h4>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-md">
              Crea carpetas para clasificar y organizar propuestas por cliente comercial, licitación o región.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setFolderToEdit(null);
                setIsModalOpen(true);
              }}
              className="mt-1 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
            >
              + Crear Primera Carpeta
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {folders.map((folder) => {
          const folderProjects = activeProjects.filter((p) => p.folderId === folder.id);
          const isSelected = activeFolderId === folder.id;

          // Unique authors who contributed to this folder
          const authors = Array.from(
            new Set(folderProjects.map((p) => p.authorName || 'Ing. Solar').filter(Boolean))
          );

          return (
            <div
              key={folder.id}
              onClick={() => setActiveFolderId(isSelected ? null : folder.id)}
              className={`bg-white dark:bg-[#181d27] border rounded-3xl p-6 flex flex-col justify-between gap-5 transition-all cursor-pointer shadow-xs hover:shadow-lg ${
                isSelected
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 dark:border-emerald-600'
                  : 'border-slate-200/90 dark:border-[#293242] hover:border-slate-300 dark:hover:border-zinc-600'
              }`}
            >
              <div>
                {/* Accent Color Pill */}
                <div
                  className="w-16 h-3 rounded-full mb-3"
                  style={{ backgroundColor: folder.color || '#10b981' }}
                />

                <h4 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                  {folder.name}
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {folderProjects.length} Simulations • Activo
                </p>
              </div>

              {/* Footer: Collaborator Stack & Details Button */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex -space-x-2 overflow-hidden">
                  {authors.length === 0 ? (
                    <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-[#252d3c] border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-[10px] text-slate-400">
                      —
                    </div>
                  ) : (
                    authors.slice(0, 3).map((author, idx) => (
                      <div
                        key={idx}
                        className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 text-white font-bold text-[10px] flex items-center justify-center ring-2 ring-white dark:ring-[#181d27]"
                        title={author}
                      >
                        {author.charAt(0).toUpperCase()}
                      </div>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFolderId(isSelected ? null : folder.id);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-[#202734] dark:hover:bg-[#2a3446] text-white font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <span>DETAILS</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
        </div>
      )}

      <CreateFolderModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setFolderToEdit(null);
        }}
        folderToEdit={folderToEdit}
      />
    </div>
  );
};
