// Dónde aparece el asistente general y qué propuesta considera abierta.
import type { AppView } from '../../store/types';

/**
 * Vistas de trabajo con el asistente (F5b: todas). La vista del documento (PDF, modo edición) lo incluye para editar sus
 * textos; el chat lleva `data-pdf-chrome` y nunca se imprime.
 */
const ASSISTANT_VIEWS: readonly AppView[] = ['dashboard', 'simulator', 'pdf-preview', 'project-hub', 'companies-hub', 'clients-hub', 'quotations-hub', 'quotation-editor', 'quotation-library'];
/** Vistas del módulo de cotizaciones: si la organización lo oculta, el asistente tampoco aparece ahí. */
const QUOTATION_VIEWS: readonly string[] = ['quotations-hub', 'quotation-editor', 'quotation-library'];
/** Vistas en las que hay una propuesta abierta. */
const PROJECT_VIEWS = ['simulator', 'project-hub', 'pdf-preview'];

/** ¿Se monta el asistente en esta vista? `quotations: false` cuando la política efectiva oculta las cotizaciones. */
export const assistantVisibleIn = (view: string, features: { quotations?: boolean } = {}): boolean =>
  (ASSISTANT_VIEWS as readonly string[]).includes(view) && (features.quotations !== false || !QUOTATION_VIEWS.includes(view));

export const assistantProjectId = (view: string, activeProjectId?: string): string | undefined =>
  PROJECT_VIEWS.includes(view) && activeProjectId ? activeProjectId : undefined;

/**
 * Clave React del panel del asistente: solo el espacio de trabajo y la sesión (`owner`). Abrir o crear otra propuesta, o
 * cambiar de vista, no remonta el panel (F5b); la conversación y el turno viven en la sesión fuera de React
 * (`session/assistantSession.ts`), que se descarta al cambiar de espacio o de sesión.
 */
export const assistantPanelKey = (owner: string): string => `assistant|${owner}`;

/**
 * Estado del botón Enviar del flotante. La falta de clave NO lo bloquea: el intento llega a la sesión, que responde en la
 * conversación con el camino a Ajustes (y el aviso discreto del compositor sigue ahí). Solo se bloquea sin texto o mientras
 * se leen adjuntos.
 */
export const assistantComposerState = ({ draft, loadingFiles }: { draft: string; hasApiKey: boolean; loadingFiles: number }): { canSend: boolean; disabledReason: string } =>
  loadingFiles > 0 ? { canSend: false, disabledReason: 'Leyendo archivos adjuntos…' }
    : !draft.trim() ? { canSend: false, disabledReason: 'Escribe un mensaje.' }
      : { canSend: true, disabledReason: '' };
