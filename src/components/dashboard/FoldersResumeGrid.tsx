import React, { useState } from 'react';
import { Folder, FolderPlus, Edit3, Trash2, EyeOff } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ProjectFolder } from '../../types';
import { CreateFolderModal } from './sidebar/CreateFolderModal';

export const FoldersResumeGrid: React.FC = () => {
  const { folders, projects, activeFolderId, setActiveFolderId, syncSettings, deleteFolder, moveProjectToFolder } = useSimulationStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<ProjectFolder | null>(null);
  const isAdmin = !syncSettings.currentUser || syncSettings.currentUser.role === 'ADMIN';
  const edit = (folder: ProjectFolder | null) => { setFolderToEdit(folder); setIsModalOpen(true); };
  return <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-zinc-800" aria-label="Carpetas de propuestas">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">Carpetas</h2>
      {isAdmin && <button type="button" onClick={() => edit(null)} className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"><FolderPlus className="h-4 w-4" />Nueva carpeta</button>}
    </div>
    {folders.length === 0 ? <p className="text-sm text-slate-500 dark:text-zinc-400">Crea una carpeta para organizar propuestas por cliente, licitación o región.</p> :
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {folders.map((folder) => <li key={folder.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => {
          event.preventDefault(); const id = event.dataTransfer.getData('text/plain');
          if (id) moveProjectToFolder(id, folder.id);
        }} className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 dark:bg-zinc-900 ${activeFolderId === folder.id ? 'border-emerald-600 dark:border-emerald-500' : 'border-slate-200 dark:border-zinc-800'}`}>
          <Folder className="h-5 w-5 shrink-0" style={{ color: folder.color || '#059669' }} />
          <button type="button" aria-pressed={activeFolderId === folder.id} onClick={() => setActiveFolderId(activeFolderId === folder.id ? null : folder.id)} className="min-w-0 flex-1 text-left">
            <span className="block break-words text-sm font-medium text-slate-900 dark:text-zinc-100">{folder.name}</span>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">{projects.filter((project) => !project.isDeleted && project.folderId === folder.id).length} propuestas{folder.hideFromGeneral && <><EyeOff className="h-3 w-3" />Oculta en principal</>}</span>
          </button>
          {isAdmin && <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label={`Editar carpeta ${folder.name}`} onClick={() => edit(folder)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"><Edit3 className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label={`Eliminar carpeta ${folder.name}`} onClick={() => { if (confirm(`¿Eliminar la carpeta «${folder.name}»? Sus proyectos se conservarán.`)) deleteFolder(folder.id); }} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:text-zinc-400 dark:hover:bg-rose-950 dark:hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>}
        </li>)}
      </ul>}
    <CreateFolderModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setFolderToEdit(null); }} folderToEdit={folderToEdit} />
  </section>;
};
