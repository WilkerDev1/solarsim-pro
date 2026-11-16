import React from 'react';
import { AlertTriangle, FileText, Sparkles } from 'lucide-react';
import { parseChatMarkdown, type ChatInline } from '../chatMarkdown';

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

/**
 * User turns are plain-text bubbles aligned right; assistant prose renders a safe markdown subset
 * (no HTML, no links) as flowing text next to a small identity mark.
 */
export function ChatMessage({
  role,
  text,
  children,
  files,
  variant,
}: {
  role: 'user' | 'assistant';
  text: string;
  children?: React.ReactNode;
  files?: readonly string[];
  variant?: 'error';
}) {
  const body = (
    <div className="assistant-message-text">
      {role === 'user'
        ? text
        : parseChatMarkdown(text).map((block, i) => {
            if (block.type === 'p') return <p key={i}><Inlines inlines={block.inlines} /></p>;
            if (block.type === 'h') return <p key={i} className="assistant-message-heading"><strong><Inlines inlines={block.inlines} /></strong></p>;
            const items = block.items.map((item, j) => <li key={j}><Inlines inlines={item} /></li>);
            return block.type === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
          })}
    </div>
  );
  if (role === 'user')
    return (
      <article className="assistant-message assistant-message-user">
        <span className="sr-only">Tú</span>
        {files?.length ? <ChatFileChips names={files} /> : null}
        {body}
        {children}
      </article>
    );
  return (
    <article className={`assistant-message assistant-message-assistant${variant === 'error' ? ' assistant-message-error' : ''}`}>
      <span className="assistant-avatar" aria-hidden>
        {variant === 'error' ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
      </span>
      <div className="assistant-message-main">
        <span className="assistant-message-author">
          <span className="sr-only">Asistente</span>
          <span aria-hidden>SolarSim IA</span>
          {variant === 'error' && <span className="assistant-message-tag">No se completó</span>}
        </span>
        {body}
        {children}
      </div>
    </article>
  );
}
