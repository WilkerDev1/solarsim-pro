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
  Paperclip,
} from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { useAppAssistant } from '../useAppAssistant';
import { assistantOwner } from '../tools';
import { ChatMessage } from './ChatMessage';
import { AgentCardView } from '../cards/registry';
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
  const state = useSimulationStore(useShallow((s) => ({ projects: s.projects, isSettingsModalOpen: s.isSettingsModalOpen, isAIInvoiceModalOpen: s.isAIInvoiceModalOpen, isAIDatasheetModalOpen: s.isAIDatasheetModalOpen, isAIPriceCatalogModalOpen: s.isAIPriceCatalogModalOpen, isNewProjectModalOpen: s.isNewProjectModalOpen, activeConflict: s.activeConflict, isTrashActive: s.isTrashActive, openSettingsModal: s.openSettingsModal, geminiApiKey: s.geminiApiKey })));
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
                {m.agentCards?.map((card) => (
                  <AgentCardView key={`${card.type}:${card.id}`} card={card} />
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
            {ai.loadingFiles && <p role="status" className="assistant-widget-status">Leyendo archivos adjuntos…</p>}
            {ai.files.length > 0 && (
              <ul className="assistant-file-chips" aria-label="Archivos adjuntos">
                {ai.files.map((f) => (
                  <li key={f.id}>
                    <span>{f.name}</span>
                    <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => ai.removeFile(f.id)}><X size={12} /></button>
                  </li>
                ))}
              </ul>
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
              <label className="assistant-icon" title="Adjuntar PDF o imagen" aria-label="Adjuntar PDF o imagen">
                <Paperclip size={16} />
                <input
                  type="file"
                  className="sr-only"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  multiple
                  disabled={ai.busy}
                  onChange={(e) => {
                    if (e.target.files) void ai.addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
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
                  disabled={!ai.prompt.trim() || !state.geminiApiKey || ai.loadingFiles}
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
              espacio actual. Texto, archivos adjuntos y resultados de las
              herramientas se envían a Google Gemini. Los borradores se aplican
              con opción de deshacer; catálogo, precios y estados piden confirmación
              (Ajustes → Agentes e IA).
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
  const state = useSimulationStore(useShallow((s) => ({ activeView: s.activeView, activeProjectId: s.activeProjectId, appAssistantEnabled: s.appAssistantEnabled })));
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
