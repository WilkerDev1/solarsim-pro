import React, { useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Square,
  Maximize2,
  Minimize2,
  RotateCcw,
  Settings,
} from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useAppAssistant } from '../useAppAssistant';
import { assistantOwner } from '../tools';
import { ChatMessage } from './ChatMessage';
import {
  AssistantActionCard,
  AssistantAppliedCard,
  AssistantResultCard,
} from './AssistantResultCard';
import '../chat.css';
import type { GeminiTransport } from '../../../../shared/geminiTransport';
function AssistantPanel({
  projectId,
  transport,
}: {
  projectId?: string;
  transport?: GeminiTransport;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ai = useAppAssistant(projectId, transport);
  const state = useSimulationStore();
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const project = state.projects.find((p) => p.id === projectId);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [ai.messages, ai.busy]);
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
    <div className="assistant-widget">
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
          <div
            className="assistant-widget-log"
            ref={log}
            role="log"
            aria-label="Conversación con SolarSim"
          >
            {!ai.messages.length && (
              <p className="assistant-widget-empty">
                {project
                  ? 'Pregunta sobre esta simulación o pide un cambio.'
                  : 'Consulta tus propuestas o busca equipos del inventario.'}
              </p>
            )}
            {ai.messages.map((m, i) => (
              <ChatMessage key={i} role={m.role} text={m.text}>
                {m.cards?.map((card) => (
                  <AssistantResultCard
                    key={`${card.kind}:${card.id}`}
                    card={card}
                  />
                ))}
                {m.actions?.map((action) => (
                  <AssistantActionCard
                    key={action.id}
                    action={action}
                    disabled={ai.busy}
                    onApplied={ai.append}
                  />
                ))}
                {m.applied?.map((a) => (
                  <AssistantAppliedCard key={a.activityId} activityId={a.activityId} title={a.title} />
                ))}
              </ChatMessage>
            ))}
            {ai.busy && (
              <p role="status" className="assistant-widget-status">
                Consultando la aplicación…
              </p>
            )}
          </div>
          <form
            className="assistant-widget-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ai.send();
            }}
          >
            {ai.error && (
              <p role="alert" className="assistant-widget-error">
                {ai.error}
              </p>
            )}
            <label className="sr-only" htmlFor="app-assistant-input">
              Mensaje al asistente
            </label>
            <textarea
              id="app-assistant-input"
              ref={input}
              value={ai.prompt}
              onChange={(e) => ai.setPrompt(e.target.value)}
              maxLength={12000}
              placeholder="Pregunta o pide un cambio…"
              disabled={ai.busy}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void ai.send();
                }
              }}
            />
            <div className="assistant-widget-actions">
              <button
                type="button"
                className="assistant-icon"
                aria-label="Configurar IA"
                title="Configurar IA"
                onClick={() => {
                  ai.cancel();
                  state.openSettingsModal('ai');
                }}
              >
                <Settings size={16} />
              </button>
              {ai.busy ? (
                <button
                  type="button"
                  className="assistant-send"
                  onClick={ai.cancel}
                >
                  <Square size={14} />
                  Cancelar
                </button>
              ) : (
                <button
                  type="submit"
                  className="assistant-send"
                  disabled={!ai.prompt.trim() || !state.geminiApiKey}
                >
                  <Send size={14} />
                  Enviar
                </button>
              )}
            </div>
            {!state.geminiApiKey && (
              <p className="assistant-widget-empty">
                Configura Gemini para conversar.
              </p>
            )}
            <details className="proposal-note-details">
              <summary>Contexto y privacidad</summary>Solo se consulta el
              espacio actual. Texto y resultados de las herramientas se envían a
              Google Gemini. Los cambios requieren confirmar.
            </details>
          </form>
        </section>
      )}
    </div>
  );
}
export function AppAssistant({
  transport,
}: { transport?: GeminiTransport } = {}) {
  const state = useSimulationStore();
  const projectId = ['simulator', 'project-hub'].includes(state.activeView)
    ? state.activeProjectId
    : undefined;
  if (
    !state.appAssistantEnabled ||
    !['simulator', 'project-hub', 'dashboard'].includes(state.activeView)
  )
    return null;
  return (
    <AssistantPanel
      key={`${assistantOwner()}|${projectId || 'global'}`}
      projectId={projectId}
      transport={transport}
    />
  );
}
