import { SimulationSlice, FolderSlice } from '../types';
import { ProjectFolder } from '../../types';

export const createFolderSlice: SimulationSlice<FolderSlice> = (set, get) => ({
  folders: [],
  activeFolderId: null,
  activeTeamMemberFilter: null,

  setActiveFolderId: (folderId) => set({ activeFolderId: folderId, activeTeamMemberFilter: null }),
  setActiveTeamMemberFilter: (member) => set({ activeTeamMemberFilter: member, activeFolderId: null }),

  createFolder: (name, color = '#10b981', description = '', hideFromGeneral = false) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const newFolder: ProjectFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: trimmed,
      color,
      description,
      hideFromGeneral,
      createdAt: new Date().toISOString(),
      createdBy: get().syncSettings.currentUser?.name || 'Admin',
    };

    set((state) => ({
      folders: [...state.folders, newFolder],
      saveFeedbackMessage: `¡Carpeta "${trimmed}" creada con éxito!`,
    }));

    setTimeout(() => {
      set({ saveFeedbackMessage: null });
    }, 3000);

    return newFolder;
  },

  updateFolder: (id, updates) => {
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      saveFeedbackMessage: '¡Carpeta actualizada!',
    }));
    setTimeout(() => {
      set({ saveFeedbackMessage: null });
    }, 2500);
  },

  deleteFolder: (id) => {
    // When a folder is deleted, projects belonging to it are preserved but detached (folderId = undefined)
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      activeFolderId: state.activeFolderId === id ? null : state.activeFolderId,
      projects: state.projects.map((p) => (p.folderId === id ? { ...p, folderId: undefined } : p)),
      saveFeedbackMessage: 'Carpeta eliminada (proyectos preservados).',
    }));
    setTimeout(() => {
      set({ saveFeedbackMessage: null });
    }, 3000);
  },

  moveProjectToFolder: (projectId, targetFolderId) => {
    set((state) => {
      const targetProject = state.projects.find((p) => p.id === projectId);
      if (!targetProject) return state;

      const updatedProjects = state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              folderId: targetFolderId || undefined,
              syncStatus: 'pending' as const,
              updatedAt: new Date().toISOString(),
            }
          : p
      );

      const folderName = targetFolderId
        ? state.folders.find((f) => f.id === targetFolderId)?.name || 'Carpeta'
        : 'Proyectos Generales';

      return {
        projects: updatedProjects,
        saveFeedbackMessage: `Proyecto movido a "${folderName}"`,
      };
    });

    get().triggerAutoSync(false);

    setTimeout(() => {
      set({ saveFeedbackMessage: null });
    }, 2500);
  },
});
