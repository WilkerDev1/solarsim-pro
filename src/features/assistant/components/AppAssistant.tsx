import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MessageCircle, X, Maximize2, Minimize2, RotateCcw, Settings, Paperclip, Pencil } from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { assistantOwner } from '../tools';
import { assistantComposerState, assistantPanelKey, assistantProjectId, assistantVisibleIn } from '../assistantScope';
import { ChatMessage } from './ChatMessage';
import { ChatComposer, ChatSuggestions, ChatThinking, ScrollToLatest } from './ChatComposer';
import { useChatAnnouncement, useElapsedSeconds, useStickToBottom } from '../chatUi';
import { AssistantTurnDetails, turnSteps } from './AssistantTurnDetails';
import { assistantSession, type AssistantSession, type SessionAssistantMessage } from '../session/assistantSession';
import { assistantPanelLayout, draggedAssistantWidth, type AssistantPanelLayout } from '../panelLayout';
import { assistantBadge, assistantPanelBlock } from '../panelState';
import { useQuotationsFeature } from '../../application/quotationsFeature';
import type { LlmClient } from '../../../services/llm/types';
import '../chat.css';
import './assistantTurn.css';

// Panel del asistente único (F4 → F5b): pinta la sesión (`session/assistantSession.ts`), que vive fuera de React. Se monta una
// vez por espacio de trabajo/sesión (`assistantPanelKey`) y está en todas las vistas de trabajo. En el simulador, el resumen
// y el PDF se acopla como columna derecha redimensionable cuando al contenido le quedan al menos 640 px
// (`assistantPanelLayout`, puro); si no, y en el resto de vistas, flota. Acoplar o flotar es el mismo elemento con otra clase:
// no se remonta. Se puede escribir mientras trabaja (la sesión encola y entrega al terminar el paso); cerrarlo no cancela
// («Detener» es aparte) y el botón muestra una insignia discreta con trabajo en curso o cambios sin ver.
// El camino antiguo (`useAppAssistant` + `service.ts`, el modal `ai-invoice`) ya no lo usa nadie desde aquí; se retira en F6.

const PROJECT_SUGGESTIONS = ['Ponle baterías a esta propuesta', 'Resume esta propuesta y sus supuestos', '¿Por qué el ahorro del primer año es este?'];
const GLOBAL_SUGGESTIONS = ['Crea una propuesta', 'Muestra mis propuestas más recientes', 'Busca baterías de litio en el inventario'];

const useSession = (session: AssistantSession) => useSyncExternalStore(session.subscribe, session.getState, session.getState);

function joinText(a: string, b: string) {
  return a && b ? `${a}\n\n${b}` : a || b;
}

/** Ancho de la ventana, al día con los cambios de tamaño. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * Hora actual para la caducidad de las confirmaciones pendientes: solo late (cada 30 s) mientras hay alguna pendiente, para
 * que una tarjeta se vea caducada sin tener que pulsarla.
 */
function useNowWhile(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Borde izquierdo de la columna acoplada: arrastrar o flechas (24 px; Inicio vuelve al ancho de fábrica). */
function DockResizeHandle({ session, layout }: { session: AssistantSession; layout: AssistantPanelLayout }) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => { if (drag.current) session.setPanelWidth(draggedAssistantWidth(drag.current.width, drag.current.x, e.clientX, layout)); };
    const end = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [session, layout]);
  return (
    <div
      className="assistant-dock-resize"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Cambiar ancho del asistente"
      aria-valuemin={layout.minWidth}
      aria-valuemax={layout.maxWidth}
      aria-valuenow={layout.width}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, width: layout.width }; }}
      onKeyDown={(e) => {
        if (e.key === 'Home') { e.preventDefault(); session.setPanelWidth(undefined); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          session.setPanelWidth(draggedAssistantWidth(layout.width, 0, e.key === 'ArrowLeft' ? -24 : 24, layout));
        }
      }}
    />
  );
}

function AssistantPanel({ projectId, belowToolbar, layout }: { projectId?: string; belowToolbar?: boolean; layout: AssistantPanelLayout }) {
  const session = assistantSession();
  const ai = useSession(session);
  const picker = useRef<(() => void) | null>(null);
  const state = useSimulationStore(useShallow((s) => ({ projects: s.projects, isSettingsModalOpen: s.isSettingsModalOpen, isAIInvoiceModalOpen: s.isAIInvoiceModalOpen, isAIDatasheetModalOpen: s.isAIDatasheetModalOpen, isAIPriceCatalogModalOpen: s.isAIPriceCatalogModalOpen, isNewProjectModalOpen: s.isNewProjectModalOpen, activeConflict: s.activeConflict, isTrashActive: s.isTrashActive, openSettingsModal: s.openSettingsModal, geminiApiKey: s.geminiApiKey, agentActivity: s.agentActivity, pendingAgentActions: s.pendingAgentActions })));
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const open = ai.panelOpen;
  const last = ai.messages[ai.messages.length - 1];
  const liveLength = last?.role === 'assistant' ? last.liveText.length + last.turn.text.length + last.turn.toolOrder.length : 0;
  const scroll = useStickToBottom(log, [ai.messages.length, liveLength, ai.busy, open]);
  const elapsed = useElapsedSeconds(ai.busy);
  const now = useNowWhile(state.pendingAgentActions.some((a) => a.status === 'pending'));
  const live = { agentActivity: state.agentActivity, pendingAgentActions: state.pendingAgentActions, projects: state.projects, now };
  const project = state.projects.find((p) => p.id === projectId);
  const announcement = useChatAnnouncement(ai.busy, () => {
    const reply = ai.messages[ai.messages.length - 1];
    if (reply?.role !== 'assistant') return 'Respuesta lista.';
    return reply.outcome === 'cancelled' ? 'Respuesta detenida.' : reply.outcome === 'failed' ? 'La respuesta no se completó.' : 'Respuesta lista.';
  });
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const docked = open && layout.mode === 'docked';
  // Un modal o la papelera ocultan el panel; el turno sigue (las herramientas revalidan permisos y conflictos al aplicar).
  // Acoplado, con un modal encima se reserva la columna vacía: el contenido no salta de ancho al abrir y cerrar el modal.
  const block = assistantPanelBlock(state, docked);
  const blocked = block !== null;
  // «Autocompletar con factura» pidió el selector de archivos: se abre en cuanto el panel (y su compositor) están montados.
  useEffect(() => {
    if (!open || blocked || !ai.filePickerRequested || !picker.current) return;
    session.consumeFilePickerRequest();
    picker.current();
  }, [open, blocked, ai.filePickerRequested, session]);
  if (block === 'hide') return null;
  if (block === 'reserve') return <div className="assistant-widget assistant-docked" style={{ width: layout.width }} aria-hidden="true" data-pdf-chrome="" />;
  const badge = assistantBadge(ai);
  const openSettings = () => state.openSettingsModal('ai');
  const composer = assistantComposerState({ draft: ai.draft, hasApiKey: !!state.geminiApiKey, loadingFiles: ai.loadingFiles });
  const actions = {
    confirmPending: (actionId: string) => { session.confirmPending(actionId); },
    rejectPending: (actionId: string) => session.rejectPending(actionId),
    // El resultado (también el fallo) queda en el mensaje: la tarjeta lo pinta.
    undo: (activityId: string) => { session.undoActivity(activityId); },
    undoTurn: (turnId: string) => { session.undoTurn(turnId); },
    continueTurn: () => void session.continueTurn(),
  };
  const lastAssistant = [...ai.messages].reverse().find((m): m is SessionAssistantMessage => m.role === 'assistant');
  return (
    // data-pdf-chrome: en la vista del documento el chat nunca se imprime ni se exporta. Acoplado o flotante es el MISMO
    // elemento con otra clase (no se remonta al cambiar de modo).
    <div
      className={`assistant-widget${docked ? ' assistant-docked' : ''}${belowToolbar && !docked ? ' assistant-widget-below-toolbar' : ''}`}
      style={docked ? { width: layout.width } : undefined}
      data-pdf-chrome=""
    >
      {docked && <DockResizeHandle session={session} layout={layout} />}
      {!open ? (
        <button className="assistant-fab" aria-label={`Abrir asistente de IA${badge.label ? ` (${badge.label})` : ''}`} onClick={() => session.setPanelOpen(true)}>
          <MessageCircle size={18} />
          Asistente
          {badge.kind && <span className="assistant-fab-badge" data-kind={badge.kind} aria-hidden="true" title={badge.label} />}
        </button>
      ) : (
        <section
          className={`assistant-widget-panel ${ai.expanded && !docked ? 'assistant-expanded' : ''}`}
          aria-label="Asistente de SolarSim"
          onKeyDown={(e) => {
            // Esc cierra el panel flotante y nunca detiene el turno (en modo cola el compositor tampoco: Detener es solo su
            // botón). Acoplado, Esc no cierra ni cancela (movería el contenido de la vista).
            if (e.key === 'Escape' && !docked) {
              e.preventDefault();
              e.stopPropagation();
              session.setPanelOpen(false);
            }
          }}
        >
          <div className="assistant-widget-header">
            <h2>
              Asistente
              <small>{project ? `${project.client.projectId} · ${project.client.name}` : 'Propuestas e inventario'}</small>
            </h2>
            <button className="assistant-icon" title="Configurar IA" aria-label="Configurar IA" onClick={openSettings}>
              <Settings size={16} />
            </button>
            <button className="assistant-icon" title="Nueva conversación" aria-label="Nueva conversación" disabled={ai.busy} onClick={session.reset}>
              <RotateCcw size={16} />
            </button>
            {!docked && (
              <button className="assistant-icon" title={ai.expanded ? 'Comprimir chat' : 'Ampliar chat'} aria-label={ai.expanded ? 'Comprimir chat' : 'Ampliar chat'} onClick={() => session.setExpanded(!ai.expanded)}>
                {ai.expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
            <button className="assistant-icon" title="Cerrar asistente (no detiene el trabajo en curso)" aria-label="Cerrar asistente" onClick={() => session.setPanelOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="chat-log-wrap">
            <div className="assistant-widget-log" ref={log} onScroll={scroll.onScroll} role="log" aria-live="off" tabIndex={0} aria-label="Conversación con SolarSim">
              {!ai.messages.length && (
                <ChatSuggestions
                  title={project ? 'Pregunta o pide un cambio' : '¿En qué te ayudo?'}
                  description={project ? 'Aplico los cambios en la propuesta al momento, con deshacer.' : 'Crea una propuesta, consulta las tuyas o busca equipos del inventario.'}
                  items={project ? PROJECT_SUGGESTIONS : GLOBAL_SUGGESTIONS}
                  action={{ label: project ? 'Adjuntar una factura' : 'Crear desde una factura', icon: <Paperclip size={14} aria-hidden />, onClick: () => picker.current?.() }}
                  onPick={(text) => {
                    session.setDraft(text);
                    requestAnimationFrame(() => input.current?.focus());
                  }}
                />
              )}
              {ai.messages.map((m) => {
                if (m.role === 'user')
                  return (
                    <ChatMessage key={m.id} role="user" text={m.text} files={m.files}
                      onReuse={!ai.busy ? () => { session.setDraft(m.text); requestAnimationFrame(() => input.current?.focus()); } : undefined} />
                  );
                const running = ai.busy && m.id === lastAssistant?.id && !m.outcome;
                if (m.error && !m.turn.text)
                  return (
                    <ChatMessage key={m.id} role="assistant" variant="error" text={m.error.message}
                      onRetry={m.retryText && !ai.busy ? () => void session.send(m.retryText) : undefined}
                      onOpenSettings={openSettings}>
                      <AssistantTurnDetails message={m} busy={ai.busy} actions={actions} live={live} />
                    </ChatMessage>
                  );
                const text = joinText(m.turn.text, m.liveText);
                return (
                  <React.Fragment key={m.id}>
                    {(text || !running) && (
                      <ChatMessage role="assistant" text={text || m.notice || ''}
                        onCopy={!running && text ? () => navigator.clipboard.writeText(text) : undefined}
                        onRetry={m.retryText && !ai.busy ? () => void session.send(m.retryText) : undefined}>
                        {text && m.notice && <p className="assistant-turn-notice">{m.notice}</p>}
                        {!running && <AssistantTurnDetails message={m} busy={ai.busy} actions={actions} live={live} />}
                      </ChatMessage>
                    )}
                    {running && (
                      <ChatThinking label={m.turn.toolOrder.length ? 'Trabajando…' : 'Pensando…'} steps={turnSteps(m)} detail={m.thinking} elapsed={elapsed} />
                    )}
                  </React.Fragment>
                );
              })}
              {ai.queued && (
                <div className="assistant-queued" role="status">
                  <p><span className="assistant-queued-label">En cola, al terminar el paso:</span> {ai.queued.text}{ai.queued.files.length ? ` (${ai.queued.files.length} ${ai.queued.files.length === 1 ? 'archivo' : 'archivos'})` : ''}</p>
                  <button type="button" onClick={session.unqueue}><Pencil size={12} aria-hidden /> Editar</button>
                </div>
              )}
            </div>
            <ScrollToLatest visible={scroll.away} onClick={() => scroll.scrollToBottom()} />
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
          <ChatComposer
            id="app-assistant-input"
            label="Mensaje al asistente"
            inputRef={input}
            value={ai.draft}
            onChange={session.setDraft}
            onSubmit={() => void session.send()}
            onCancel={session.cancel}
            onPickFiles={(files) => void session.addFiles(files)}
            pickerRef={picker}
            queueWhileBusy
            busy={ai.busy}
            canSend={composer.canSend}
            disabledReason={composer.disabledReason}
            placeholder={ai.busy ? 'Escribe: se entrega al terminar el paso…' : project ? 'Pide un cambio o pregunta…' : 'Pide una propuesta o pregunta…'}
            accept="application/pdf,image/png,image/jpeg,image/webp"
            attachments={ai.files.map((f) => ({ key: f.id, name: f.name, onRemove: () => session.removeFile(f.id) }))}
            notices={
              <>
                {ai.composerError && <p role="alert" className="chat-notice" data-tone="error">{ai.composerError}</p>}
                {ai.loadingFiles > 0 && <p role="status" className="chat-notice">Leyendo archivos adjuntos…</p>}
                {!state.geminiApiKey && (
                  <div className="chat-notice">
                    Configura Gemini para conversar.
                    <button type="button" onClick={openSettings}>
                      <Settings size={14} aria-hidden />Abrir ajustes de IA
                    </button>
                  </div>
                )}
              </>
            }
            footer={
              <details className="proposal-note-details">
                <summary>Contexto y privacidad</summary>Solo se consulta el espacio actual. Texto, archivos adjuntos y
                resultados de las herramientas se envían a Google Gemini. Los cambios dentro de una propuesta se aplican al
                momento y se pueden deshacer; catálogo, estados, papelera y lo compartido piden confirmación (Ajustes →
                Agentes e IA).
              </details>
            }
          />
        </section>
      )}
    </div>
  );
}

export function AppAssistant({ llmClientFactory }: { llmClientFactory?: (apiKey: string) => LlmClient | Promise<LlmClient> } = {}) {
  const state = useSimulationStore(useShallow((s) => ({ activeView: s.activeView, activeProjectId: s.activeProjectId, appAssistantEnabled: s.appAssistantEnabled, sidebarWidth: s.sidebarWidth })));
  const quotations = useQuotationsFeature();
  const viewportWidth = useViewportWidth();
  const session = assistantSession();
  const panelWidth = useSyncExternalStore(session.subscribe, () => session.getState().panelWidth);
  // Solo fixtures de QA pasan un modelo falso; la app usa el adaptador de Gemini.
  useEffect(() => {
    if (llmClientFactory) session.configure({ createClient: llmClientFactory });
  }, [llmClientFactory, session]);
  const projectId = assistantProjectId(state.activeView, state.activeProjectId);
  if (!state.appAssistantEnabled || !assistantVisibleIn(state.activeView, { quotations })) return null;
  const layout = assistantPanelLayout({ view: state.activeView, viewportWidth, panelWidth, parameterSidebarWidth: state.sidebarWidth });
  return (
    <AssistantPanel
      // Solo por espacio de trabajo y sesión (F5b): otra propuesta u otra vista no remontan el panel.
      key={assistantPanelKey(assistantOwner())}
      projectId={projectId}
      belowToolbar={state.activeView === 'pdf-preview'}
      layout={layout}
    />
  );
}
