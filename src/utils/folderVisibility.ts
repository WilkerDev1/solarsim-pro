import type { ProjectFolder, ProjectSimulation } from '../types';

/** IDs de carpetas marcadas para ocultarse de la vista general. */
export function hiddenFolderIdSet(folders: ProjectFolder[]): Set<string> {
  return new Set(folders.filter((f) => f.hideFromGeneral).map((f) => f.id));
}

/**
 * Vista general (sin carpeta activa): proyectos sin carpeta o en carpetas visibles.
 * Con carpeta activa: solo los proyectos de esa carpeta, aunque esté oculta.
 */
export function isProjectInFolderView(
  project: Pick<ProjectSimulation, 'folderId'>,
  hiddenFolderIds: Set<string>,
  activeFolderId: string | null = null,
): boolean {
  if (activeFolderId) return project.folderId === activeFolderId;
  return !project.folderId || !hiddenFolderIds.has(project.folderId);
}
