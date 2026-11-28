// Dónde aparece el asistente general y qué propuesta considera abierta.

/** Vistas con el chat flotante. La vista del documento (PDF, modo edición) lo incluye para editar sus textos. */
const ASSISTANT_VIEWS = ['simulator', 'project-hub', 'pdf-preview', 'dashboard'];
/** Vistas en las que hay una propuesta abierta. */
const PROJECT_VIEWS = ['simulator', 'project-hub', 'pdf-preview'];

export const assistantVisibleIn = (view: string): boolean => ASSISTANT_VIEWS.includes(view);

export const assistantProjectId = (view: string, activeProjectId?: string): string | undefined =>
  PROJECT_VIEWS.includes(view) && activeProjectId ? activeProjectId : undefined;

/**
 * Clave React del panel del asistente: espacio de trabajo/sesión (`owner`) y propuesta abierta (`global` sin ninguna).
 * Hoy cambia al abrir o crear otra propuesta, lo que remonta el panel, aborta el turno y vacía la conversación
 * (se invierte en F5b: la conversación pasará a vivir fuera del árbol con clave).
 */
export const assistantPanelKey = (owner: string, projectId?: string): string => `${owner}|${projectId || 'global'}`;
