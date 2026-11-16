import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, FileText, Paperclip, Sparkles, Square, X } from 'lucide-react';
import { composerDropEffect, composerKeyAction, leavesContainer, shouldRefocusComposer, useAutoGrow } from '../chatUi';

export interface ComposerAttachment { key: string; name: string; onRemove: () => void }

interface ComposerProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onPickFiles: (files: File[]) => void;
  busy: boolean;
  canSend: boolean;
  /** Motivo visible cuando no se puede enviar (sin clave, sin texto…). */
  disabledReason?: string;
  attachments: readonly ComposerAttachment[];
  placeholder: string;
  accept: string;
  attachDisabled?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  maxLength?: number;
  /** Contenido bajo el compositor (privacidad, límites). */
  footer?: React.ReactNode;
  /** Avisos sobre el compositor (errores, ajustes pendientes). */
  notices?: React.ReactNode;
}

/** Compositor tipo chat: fichas de adjuntos dentro, área que crece, adjuntar como icono y enviar circular. */
export function ChatComposer(props: ComposerProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const input = props.inputRef || own;
  const files = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  useAutoGrow(input, props.value);
  // Al terminar una respuesta (busy: true → false) el foco vuelve al campo si no quedó en otro control.
  // El montaje no enfoca: de eso se ocupa quien abre el panel.
  const wasBusy = useRef(props.busy);
  useEffect(() => {
    const previous = wasBusy.current;
    wasBusy.current = props.busy;
    if (!shouldRefocusComposer(previous, props.busy)) return;
    const active = document.activeElement;
    if (!active || active === document.body || active === input.current) input.current?.focus({ preventScroll: true });
  }, [props.busy, input]);
  const hintId = `${props.id}-hint`;
  const submit = () => { if (props.canSend && !props.busy) props.onSubmit(); };
  return (
    <form
      className="chat-composer"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      // Siempre se consume arrastrar/soltar: en Electron un archivo soltado sin preventDefault navega la ventana.
      onDragOver={(e) => {
        e.preventDefault();
        const effect = composerDropEffect({ busy: props.busy, attachDisabled: props.attachDisabled });
        e.dataTransfer.dropEffect = effect;
        setDragging(effect === 'copy');
      }}
      onDragLeave={(e) => { if (leavesContainer(e.currentTarget, e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (composerDropEffect({ busy: props.busy, attachDisabled: props.attachDisabled }) === 'copy' && e.dataTransfer.files.length) props.onPickFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {props.notices}
      <div className="chat-composer-box" data-dragging={dragging || undefined} data-busy={props.busy || undefined}>
        {props.attachments.length > 0 && (
          <ul className="chat-composer-chips" aria-label="Archivos adjuntos">
            {props.attachments.map((a) => (
              <li key={a.key} title={a.name}>
                <FileText size={14} aria-hidden />
                <span>{a.name}</span>
                <button type="button" aria-label={`Quitar ${a.name}`} disabled={props.busy} onClick={a.onRemove}><X size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        <label className="sr-only" htmlFor={props.id}>{props.label}</label>
        <textarea
          id={props.id}
          ref={input}
          rows={1}
          value={props.value}
          maxLength={props.maxLength ?? 12000}
          disabled={props.busy}
          placeholder={props.placeholder}
          aria-describedby={hintId}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (composerKeyAction({ key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing }) === 'send') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="chat-composer-row">
          <input ref={files} type="file" multiple accept={props.accept} hidden onChange={(e) => { props.onPickFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          <button type="button" className="chat-icon-button" aria-label="Adjuntar archivos" title="Adjuntar PDF o imagen" disabled={props.busy || props.attachDisabled} onClick={() => files.current?.click()}>
            <Paperclip size={18} />
          </button>
          <span className="chat-composer-hint" id={hintId}>{!props.busy && !props.canSend && props.disabledReason ? props.disabledReason : 'Enter envía · Shift+Enter salta línea'}</span>
          {props.busy ? (
            <button type="button" className="chat-send chat-stop" aria-label="Detener" title="Detener" onClick={props.onCancel}>
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" className="chat-send" aria-label="Enviar mensaje" title="Enviar (Enter)" disabled={!props.canSend}>
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
      {props.footer}
    </form>
  );
}

/** «Pensando»: puntos animados, texto de estado y pasos de herramienta cuando existen. */
export function ChatThinking({ label, detail, steps = [], elapsed }: { label: string; detail?: string; steps?: readonly string[]; elapsed?: number }) {
  return (
    <div className="chat-thinking" role="status" aria-live="polite">
      <span className="assistant-avatar" aria-hidden><Sparkles size={14} /></span>
      <div>
        <p className="chat-thinking-label">
          <span className="chat-dots" aria-hidden><i /><i /><i /></span>
          {label}
          {elapsed !== undefined && elapsed >= 3 && <span className="chat-thinking-time" aria-hidden="true"> · {elapsed} s</span>}
        </p>
        {steps.length > 0 && (
          <ol className="chat-steps" aria-label="Pasos">
            {steps.map((step, i) => (
              <li key={`${step}-${i}`} data-state={i === steps.length - 1 ? 'active' : 'done'}>
                {i === steps.length - 1 ? <span className="chat-step-spinner" aria-hidden /> : <Check size={13} aria-hidden />}
                {step}
              </li>
            ))}
          </ol>
        )}
        {detail && <p className="chat-thinking-detail">{detail}</p>}
      </div>
    </div>
  );
}

/** Estado vacío con sugerencias: pulsar una rellena el mensaje (no lo envía) para que se pueda ajustar. */
export function ChatSuggestions({ title, description, items, onPick }: { title: string; description?: string; items: readonly string[]; onPick: (text: string) => void }) {
  return (
    <div className="chat-empty">
      <span className="chat-empty-mark" aria-hidden><Sparkles size={20} /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      <ul className="chat-suggestions" aria-label="Sugerencias">
        {items.map((item) => (
          <li key={item}><button type="button" onClick={() => onPick(item)}>{item}</button></li>
        ))}
      </ul>
    </div>
  );
}

export function ScrollToLatest({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null;
  return (
    <button type="button" className="chat-scroll-latest" onClick={onClick}>
      <ArrowDown size={14} aria-hidden />Ir al final
    </button>
  );
}
