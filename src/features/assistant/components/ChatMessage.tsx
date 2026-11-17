import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, FileText, Pencil, RotateCcw, Settings, Sparkles } from 'lucide-react';
import { parseChatMarkdown, type ChatInline } from '../chatMarkdown';
import { isMissingKeyError } from '../chatUi';

function Inlines({ inlines }: { inlines: ChatInline[] }) {
  return (
    <>
      {inlines.map((n, i) =>
        n.t === 'b' ? <strong key={i}>{n.v}</strong>
          : n.t === 'i' ? <em key={i}>{n.v}</em>
          : n.t === 'code' ? <code key={i}>{n.v}</code>
          : n.t === 'br' ? <br key={i} />
          : <React.Fragment key={i}>{n.v}</React.Fragment>
      )}
    </>
  );
}

/** Fichas compactas de adjuntos enviados con un turno (sólo nombres; los archivos no se muestran aquí). */
export function ChatFileChips({ names }: { names: readonly string[] }) {
  if (!names.length) return null;
  return (
    <ul className="assistant-sent-files" aria-label="Archivos enviados">
      {names.map((name, i) => (
        <li key={`${name}-${i}`} title={name}><FileText size={13} aria-hidden /><span>{name}</span></li>
      ))}
    </ul>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <>
      {parseChatMarkdown(text).map((block, i) => {
        if (block.type === 'p') return <p key={i}><Inlines inlines={block.inlines} /></p>;
        if (block.type === 'h') return <p key={i} className="assistant-message-heading"><strong><Inlines inlines={block.inlines} /></strong></p>;
        const items = block.items.map((item, j) => <li key={j}><Inlines inlines={item} /></li>);
        return block.type === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
      })}
    </>
  );
}

function CopyButton({ onCopy }: { onCopy: () => void | Promise<void> }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button type="button" className="chat-msg-action" aria-label="Copiar respuesta" title="Copiar"
      onClick={async () => { try { await onCopy(); setCopied(true); } catch { /* el portapapeles puede no estar disponible */ } }}>
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span className="sr-only" aria-live="polite">{copied ? 'Copiado' : ''}</span>
    </button>
  );
}

interface Props {
  role: 'user' | 'assistant';
  text: string;
  children?: React.ReactNode;
  files?: readonly string[];
  variant?: 'error';
  /** Acciones del turno (sólo se muestran las que el contenedor ofrece). */
  onCopy?: () => void | Promise<void>;
  onRetry?: () => void;
  onReuse?: () => void;
  onOpenSettings?: () => void;
}

/**
 * User turns are plain-text bubbles aligned right; assistant prose renders a safe markdown subset
 * (no HTML, no links) under a one-line identity (avatar + author), with a row of turn actions.
 */
export function ChatMessage({ role, text, children, files, variant, onCopy, onRetry, onReuse, onOpenSettings }: Props) {
  if (role === 'user')
    return (
      <article className="assistant-message assistant-message-user">
        <h4 className="sr-only">Tú</h4>
        {files?.length ? <ChatFileChips names={files} /> : null}
        <div className="assistant-message-text">{text}</div>
        {children}
        {onReuse && (
          <div className="chat-msg-actions" role="toolbar" aria-label="Acciones del mensaje">
            <button type="button" className="chat-msg-action" aria-label="Volver a escribir este mensaje" title="Volver a escribir" onClick={onReuse}><Pencil size={14} aria-hidden /></button>
          </div>
        )}
      </article>
    );
  const error = variant === 'error';
  const missingKey = error && isMissingKeyError(text);
  return (
    <article className={`assistant-message assistant-message-assistant${error ? ' assistant-message-error' : ''}`}>
      <h4 className="sr-only">Asistente</h4>
      <div className="assistant-message-author" aria-hidden>
        <span className="assistant-avatar">{error ? <AlertTriangle size={12} /> : <Sparkles size={12} />}</span>
        <span>SolarSim IA</span>
        {error && <span className="assistant-message-tag">No se completó</span>}
      </div>
      <div className="assistant-message-text">
        {error ? (
          <>
            <p><strong>{missingKey ? 'Falta la clave de Gemini.' : 'No pude completar la respuesta.'}</strong> {missingKey ? 'Configúrala en Ajustes de IA y vuelve a intentarlo.' : 'Tu mensaje y el borrador se conservan.'}</p>
            <details className="chat-error-details"><summary>Detalles técnicos</summary><p>{text}</p></details>
          </>
        ) : <Markdown text={text} />}
      </div>
      {children}
      {error ? (
        (onRetry || (missingKey && onOpenSettings)) && (
          <div className="chat-error-actions">
            {missingKey && onOpenSettings && <button type="button" className="chat-error-primary" onClick={onOpenSettings}><Settings size={14} aria-hidden />Abrir ajustes de IA</button>}
            {onRetry && <button type="button" className={missingKey ? 'chat-error-secondary' : 'chat-error-primary'} onClick={onRetry}><RotateCcw size={14} aria-hidden />Reintentar</button>}
          </div>
        )
      ) : (onCopy || onRetry) && (
        <div className="chat-msg-actions" role="toolbar" aria-label="Acciones del mensaje">
          {onCopy && <CopyButton onCopy={onCopy} />}
          {onRetry && <button type="button" className="chat-msg-action" aria-label="Reintentar" title="Reintentar" onClick={onRetry}><RotateCcw size={14} aria-hidden /></button>}
        </div>
      )}
    </article>
  );
}
