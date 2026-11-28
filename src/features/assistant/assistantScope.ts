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
 * Todavía cambia al abrir o crear otra propuesta y remonta el panel; desde F4 eso ya no aborta el turno ni vacía la
 * conversación, que viven en la sesión fuera de React (`session/assistantSession.ts`). Dejarla solo por espacio/sesión
 * es de F5b (se invierte en F5b).
 */
export const assistantPanelKey = (owner: string, projectId?: string): string => `${owner}|${projectId || 'global'}`;

/**
 * Estado del botón Enviar del flotante. La falta de clave NO lo bloquea: el intento llega a la sesión, que responde en la
 * conversación con el camino a Ajustes (y el aviso discreto del compositor sigue ahí). Solo se bloquea sin texto o mientras
 * se leen adjuntos.
 */
export const assistantComposerState = ({ draft, loadingFiles }: { draft: string; hasApiKey: boolean; loadingFiles: number }): { canSend: boolean; disabledReason: string } =>
  loadingFiles > 0 ? { canSend: false, disabledReason: 'Leyendo archivos adjuntos…' }
    : !draft.trim() ? { canSend: false, disabledReason: 'Escribe un mensaje.' }
      : { canSend: true, disabledReason: '' };
