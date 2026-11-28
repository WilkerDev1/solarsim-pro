/**
 * Entradas del asistente único (F5b). Las tres entradas que abrían el asistente de propuestas (el modal `ai-invoice`) abren
 * ahora el panel del asistente único sobre su sesión:
 *
 * - `dock-menu`: el menú de IA del dock principal.
 * - `new-project`: el atajo «Crear con el asistente» de «Nueva simulación».
 * - `invoice`: «Autocompletar con factura» de la pestaña Energía (abre el chat con el selector de archivo).
 *
 * Sin React: abre el panel, cierra los modales que lo tapan, deja un borrador sugerido (nunca lo envía ni pisa lo que el
 * usuario ya escribió) y, para la factura, pide el selector de archivos, que el panel abre al montarse. Pedir el asistente
 * desde una entrada es una elección del usuario: si estaba apagado en Ajustes, lo enciende (el interruptor lo registra), y
 * así las entradas nunca quedan muertas. El modal antiguo y sus archivos siguen en el código hasta F6, sin estas entradas.
 */
import { useSimulationStore } from '../../store/useSimulationStore';
import { assistantSession, type AssistantSession } from './session/assistantSession';

export type AssistantEntry = 'dock-menu' | 'new-project' | 'invoice';

/** Borrador que deja cada entrada (vacío: ninguno). */
export const ASSISTANT_ENTRY_PROMPTS: Readonly<Record<AssistantEntry, string>> = {
  'dock-menu': '',
  'new-project': 'Crea una propuesta',
  invoice: 'Lee la factura adjunta y actualiza el consumo y los datos del cliente de esta propuesta.',
};

export interface OpenAssistantOptions {
  /** Sesión (por defecto la única de la app; las pruebas pasan la suya). */
  session?: AssistantSession;
  /** Nombre escrito en «Nueva simulación», si lo hay. */
  projectName?: string;
}

export function openAssistant(entry: AssistantEntry, options: OpenAssistantOptions = {}): void {
  const session = options.session ?? assistantSession();
  const s = useSimulationStore.getState();
  if (!s.appAssistantEnabled) s.setAppAssistantEnabled(true);
  // Lo que taparía el panel (AppAssistant no se monta con estos modales abiertos).
  if (s.isNewProjectModalOpen) s.closeNewProjectModal();
  if (s.isSettingsModalOpen) s.closeSettingsModal();
  if (s.isAIInvoiceModalOpen) s.closeAIInvoiceModal();
  const name = options.projectName?.trim();
  const prompt = entry === 'new-project' && name ? `Crea una propuesta llamada «${name.slice(0, 120)}»` : ASSISTANT_ENTRY_PROMPTS[entry];
  if (prompt && !session.getState().draft.trim()) session.setDraft(prompt);
  if (entry === 'invoice') session.requestFilePicker();
  session.setPanelOpen(true);
}
