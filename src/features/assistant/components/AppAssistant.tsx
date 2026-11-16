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
import { assistantProjectId, assistantVisibleIn } from '../assistantScope';
import { ChatMessage } from './ChatMessage';
import { ChatComposer, ChatSuggestions, ChatThinking, ScrollToLatest } from './ChatComposer';
import { useElapsedSeconds, useStickToBottom } from '../chatUi';
import { AgentCardView } from '../cards/registry';
import {
  AssistantActionCard,
  AssistantAppliedCard,
  AssistantResultCard,
} from './AssistantResultCard';
import '../chat.css';
import type { GeminiTransport } from '../../../../shared/geminiTransport';

const PROJECT_SUGGESTIONS = ['Resume esta propuesta y sus supuestos', '¿Por qué el ahorro del primer año es este?', 'Busca un inversor alternativo en el inventario'];
const GLOBAL_SUGGESTIONS = ['Muestra mis propuestas más recientes', 'Busca baterías de litio en el inventario', '¿Qué propuestas siguen pendientes de decisión?'];
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
  const scroll = useStickToBottom(log, [ai.messages, ai.busy, ai.steps.length, open]);
  const elapsed = useElapsedSeconds(ai.busy);
  const project = state.projects.find((p) => p.id === projectId);
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
    <div className="assistant-widget" data-pdf-chrome="">
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
          <div
            className="assistant-widget-log"
            ref={log}
            onScroll={scroll.onScroll}
            role="log"
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
              <ChatThinking label="Consultando la aplicación…" steps={ai.steps} elapsed={elapsed} />
            )}
          </div>
          <ScrollToLatest visible={scroll.away} onClick={() => scroll.scrollToBottom()} />
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
                {ai.error && <p role="alert" className="chat-notice" data-tone="error">{ai.error}</p>}
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
      key={`${assistantOwner()}|${projectId || 'global'}`}
      projectId={projectId}
      transport={transport}
    />
  );
}
