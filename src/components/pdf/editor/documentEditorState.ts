import { canWrite } from '../../../../shared/permissions';
import type { ProjectSimulation } from '../../../types';

export { documentTextContextFor, buildDocumentTextContext } from '../../../utils/documentTextContext';

/** 'view' = vista previa, 'edit' = edición en vivo, 'export' = captura para PDF (sin cromo). */
export type DocumentEditorMode = 'view' | 'edit' | 'export';

/**
 * Quién puede editar el documento: escritores (o modo local), nunca una propuesta en papelera
 * ni con un conflicto de sincronización pendiente.
 */
export function canEditDocument({ project, user }: { project: Pick<ProjectSimulation, 'isDeleted' | 'syncStatus'>; user: { role?: string | null } | null | undefined }): boolean {
  return canWrite(user) && !project.isDeleted && project.syncStatus !== 'conflict';
}
