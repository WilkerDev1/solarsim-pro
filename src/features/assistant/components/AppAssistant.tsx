import React, { useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
  Settings,
} from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppAssistant } from '../useAppAssistant';
import { assistantOwner } from '../tools';
import { assistantPanelKey, assistantProjectId, assistantVisibleIn } from '../assistantScope';
import { ChatMessage } from './ChatMessage';
import { ChatComposer, ChatSuggestions, ChatThinking, ScrollToLatest } from './ChatComposer';
import { reusableUserText, useChatAnnouncement, useElapsedSeconds, useResend, useStickToBottom } from '../chatUi';
import { AgentCardView } from '../cards/registry';
import { announceActivities } from '../../agentTools/documentTextLog';
import {
  AssistantActionCard,
  AssistantAppliedCard,
  AssistantResultCard,
} from './AssistantResultCard';
import { AssistantResultList } from './AssistantResultList';
import '../chat.css';
import type { GeminiTransport } from '../../../../shared/geminiTransport';

const PROJECT_SUGGESTIONS = ['Resume esta propuesta y sus supuestos', '¿Por qué el ahorro del primer año es este?', 'Busca un inversor alternativo en el inventario'];
const GLOBAL_SUGGESTIONS = ['Muestra mis propuestas más recientes', 'Busca baterías de litio en el inventario', '¿Qué propuestas siguen pendientes de decisión?'];
function AssistantPanel({
  projectId,
  transport,
  belowToolbar,
}: {
  projectId?: string;
  transport?: GeminiTransport;
  /** En la vista del documento el panel se limita en alto para no tapar la barra de edición fija. */
  belowToolbar?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ai = useAppAssistant(projectId, transport);
  const state = useSimulationStore(useShallow((s) => ({ projects: s.projects, isSettingsModalOpen: s.isSettingsModalOpen, isAIInvoiceModalOpen: s.isAIInvoiceModalOpen, isAIDatasheetModalOpen: s.isAIDatasheetModalOpen, isAIPriceCatalogModalOpen: s.isAIPriceCatalogModalOpen, isNewProjectModalOpen: s.isNewProjectModalOpen, activeConflict: s.activeConflict, isTrashActive: s.isTrashActive, openSettingsModal: s.openSettingsModal, geminiApiKey: s.geminiApiKey })));
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroll = useStickToBottom(log, [ai.messages, ai.busy, ai.steps.length, open]);
  const elapsed = useElapsedSeconds(ai.busy);
  const project = state.projects.find((p) => p.id === projectId);
  // Un error que llega al terminar una consulta es un turno del hilo (con reintento); los de adjuntos van al compositor.
  const wasBusy = useRef(false);
  const [threadError, setThreadError] = useState('');
  useEffect(() => {
    // El error más reciente manda: uno nuevo fuera de una consulta (adjunto rechazado) sustituye al turno de error anterior.
    if (ai.busy || !ai.error) setThreadError('');
    else setThreadError(wasBusy.current ? ai.error : '');
    wasBusy.current = ai.busy;
  }, [ai.busy, ai.error]);
  const resend = useResend(ai.prompt, ai.setPrompt, () => void ai.send(), ai.busy);
  const lastUser = [...ai.messages].reverse().find((m) => m.role === 'user');
  const retryText = lastUser ? reusableUserText(lastUser.text) : '';
  const retry = retryText ? () => resend(retryText) : undefined;
  const lastAssistantIndex = ai.messages.map((m) => m.role).lastIndexOf('assistant');
  const announcement = useChatAnnouncement(ai.busy, () => ai.error ? 'La respuesta no se completó.' : ai.messages[ai.messages.length - 1]?.role === 'user' ? 'Respuesta detenida.' : 'Respuesta lista.');
  // Cambios de textos aplicados por el asistente: se anuncian (propuesta, texto, antes → después), sobre todo si no es la abierta.
  const [changeAnnouncement, setChangeAnnouncement] = useState('');
  const announceApplied = (ids: string[]) => setChangeAnnouncement(announceActivities(ids, useSimulationStore.getState().agentActivity));
  // Se limpia al empezar un turno y al vaciar el chat: un cambio idéntico al anterior (deshacer y reaplicar) vuelve a anunciarse.
  useEffect(() => { if (ai.busy || !ai.messages.length) setChangeAnnouncement(''); }, [ai.busy, !ai.messages.length]);
  useEffect(() => {
    const last = ai.messages[ai.messages.length - 1];
    if (last?.role === 'assistant' && last.applied?.length) announceApplied(last.applied.map((a) => a.activityId));
  }, [ai.messages]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const blocked =
    state.isSettingsModalOpen ||
    state.isAIInvoiceModalOpen ||
    state.isAIDatasheetModalOpen ||
    state.isAIPriceCatalogModalOpen ||
    state.isNewProjectModalOpen ||
    !!state.activeConflict ||
    state.isTrashActive;
  useEffect(() => {
    if (blocked) ai.cancel();
  }, [blocked]);
  if (blocked) return null;
  return (
    // data-pdf-chrome: en la vista del documento el chat nunca se imprime ni se exporta.
    <div className={`assistant-widget${belowToolbar ? ' assistant-widget-below-toolbar' : ''}`} data-pdf-chrome="">
      {!open ? (
        <button
          className="assistant-fab"
          aria-label="Abrir asistente de IA"
          onClick={() => setOpen(true)}
        >
          <MessageCircle size={18} />
          Asistente
        </button>
      ) : (
        <section
          className={`assistant-widget-panel ${expanded ? 'assistant-expanded' : ''}`}
          aria-label="Asistente de SolarSim"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              ai.cancel();
              setOpen(false);
            }
          }}
        >
          <div className="assistant-widget-header">
            <h2>
              Asistente
              <small>
                {project
                  ? `${project.client.projectId} · ${project.client.name}`
                  : 'Propuestas e inventario'}
              </small>
            </h2>
            <button
              className="assistant-icon"
              title="Configurar IA"
              aria-label="Configurar IA"
              onClick={() => {
                ai.cancel();
                state.openSettingsModal('ai');
              }}
            >
              <Settings size={16} />
            </button>
            <button
              className="assistant-icon"
              title="Nueva conversación"
              aria-label="Nueva conversación"
              disabled={ai.busy}
              onClick={ai.reset}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="assistant-icon"
              title={expanded ? 'Comprimir chat' : 'Ampliar chat'}
              aria-label={expanded ? 'Comprimir chat' : 'Ampliar chat'}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              className="assistant-icon"
              title="Cerrar asistente"
              aria-label="Cerrar asistente"
              onClick={() => {
                ai.cancel();
                setOpen(false);
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="chat-log-wrap">
          <div
            className="assistant-widget-log"
            ref={log}
            onScroll={scroll.onScroll}
            role="log"
            aria-live="off"
            tabIndex={0}
            aria-label="Conversación con SolarSim"
          >
            {!ai.messages.length && (
              <ChatSuggestions
                title={project ? 'Pregunta sobre esta simulación' : '¿En qué te ayudo?'}
                description={project ? 'Puedo explicar resultados o preparar cambios que revisas antes de aplicar.' : 'Consulta tus propuestas o busca equipos del inventario.'}
                items={project ? PROJECT_SUGGESTIONS : GLOBAL_SUGGESTIONS}
                onPick={(text) => {
                  ai.setPrompt(text);
                  requestAnimationFrame(() => input.current?.focus());
                }}
              />
            )}
            {ai.messages.map((m, i) => (
              <ChatMessage key={i} role={m.role} text={m.text}
                onCopy={m.role === 'assistant' ? () => navigator.clipboard.writeText(m.text) : undefined}
                onRetry={i === lastAssistantIndex && !ai.busy && !threadError ? retry : undefined}
                onReuse={m.role === 'user' && !ai.busy ? () => { ai.setPrompt(reusableUserText(m.text)); requestAnimationFrame(() => input.current?.focus()); } : undefined}>
                {m.cards?.map((card) => (
                  <AssistantResultCard
                    key={`${card.kind}:${card.id}`}
                    card={card}
                  />
                ))}
                {m.lists?.map((list, index) => (
                  <AssistantResultList key={`list-${index}`} list={list} />
                ))}
                {m.actions?.map((action) => (
                  <AssistantActionCard
                    key={action.id}
                    action={action}
                    disabled={ai.busy}
                    onApplied={(text, activityId) => { ai.append(text); if (activityId) { setChangeAnnouncement(''); requestAnimationFrame(() => announceApplied([activityId])); } }}
                  />
                ))}
                {m.agentCards?.map((card) => (
                  <AgentCardView key={`${card.type}:${card.id}`} card={card} />
                ))}
                {m.applied?.map((a) => (
                  <AssistantAppliedCard key={a.activityId} activityId={a.activityId} title={a.title} />
                ))}
              </ChatMessage>
            ))}
            {threadError && !ai.busy && (
              <ChatMessage role="assistant" variant="error" text={threadError} onRetry={retry}
                onOpenSettings={() => { ai.cancel(); state.openSettingsModal('ai'); }} />
            )}
            {ai.busy && (
              <ChatThinking label="Consultando la aplicación…" steps={ai.steps} elapsed={elapsed} />
            )}
          </div>
          <ScrollToLatest visible={scroll.away} onClick={() => scroll.scrollToBottom()} />
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{changeAnnouncement}</p>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{threadError && !ai.busy ? 'La respuesta no se completó.' : announcement}</p>
          <ChatComposer
            id="app-assistant-input"
            label="Mensaje al asistente"
            inputRef={input}
            value={ai.prompt}
            onChange={ai.setPrompt}
            onSubmit={() => void ai.send()}
            onCancel={ai.cancel}
            onPickFiles={(files) => void ai.addFiles(files)}
            busy={ai.busy}
            canSend={!!ai.prompt.trim() && !!state.geminiApiKey && !ai.loadingFiles}
            disabledReason={!state.geminiApiKey ? 'Configura Gemini para conversar.' : ai.loadingFiles ? 'Leyendo archivos adjuntos…' : 'Escribe un mensaje.'}
            placeholder="Pregunta o pide un cambio…"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            attachments={ai.files.map((f) => ({ key: f.id, name: f.name, onRemove: () => ai.removeFile(f.id) }))}
            notices={
              <>
                {ai.error && !threadError && <p role="alert" className="chat-notice" data-tone="error">{ai.error}</p>}
                {ai.loadingFiles && <p role="status" className="chat-notice">Leyendo archivos adjuntos…</p>}
                {!state.geminiApiKey && (
                  <div className="chat-notice">
                    Configura Gemini para conversar.
                    <button type="button" onClick={() => { ai.cancel(); state.openSettingsModal('ai'); }}>
                      <Settings size={14} aria-hidden />Abrir ajustes de IA
                    </button>
                  </div>
                )}
              </>
            }
            footer={
              <details className="proposal-note-details">
                <summary>Contexto y privacidad</summary>Solo se consulta el
                espacio actual. Texto, archivos adjuntos y resultados de las
                herramientas se envían a Google Gemini. Los borradores se aplican
                con opción de deshacer; catálogo, precios y estados piden confirmación
                (Ajustes → Agentes e IA).
              </details>
            }
          />
        </section>
      )}
    </div>
  );
}
export function AppAssistant({
  transport,
}: { transport?: GeminiTransport } = {}) {
  const state = useSimulationStore(useShallow((s) => ({ activeView: s.activeView, activeProjectId: s.activeProjectId, appAssistantEnabled: s.appAssistantEnabled })));
  const projectId = assistantProjectId(state.activeView, state.activeProjectId);
  if (!state.appAssistantEnabled || !assistantVisibleIn(state.activeView))
    return null;
  return (
    <AssistantPanel
      key={assistantPanelKey(assistantOwner(), projectId)}
      projectId={projectId}
      belowToolbar={state.activeView === 'pdf-preview'}
      transport={transport}
    />
  );
}
