// Dónde aparece el asistente general y qué propuesta considera abierta.

/** Vistas con el chat flotante. La vista del documento (PDF, modo edición) lo incluye para editar sus textos. */
const ASSISTANT_VIEWS = ['simulator', 'project-hub', 'pdf-preview', 'dashboard'];
/** Vistas en las que hay una propuesta abierta. */
const PROJECT_VIEWS = ['simulator', 'project-hub', 'pdf-preview'];

export const assistantVisibleIn = (view: string): boolean => ASSISTANT_VIEWS.includes(view);

export const assistantProjectId = (view: string, activeProjectId?: string): string | undefined =>
  PROJECT_VIEWS.includes(view) && activeProjectId ? activeProjectId : undefined;
