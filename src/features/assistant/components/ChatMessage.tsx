import React from 'react';
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

/** User bubbles stay plain text; assistant prose renders a safe markdown subset (no HTML, no links). */
export function ChatMessage({
  role,
  text,
  children,
}: {
  role: 'user' | 'assistant';
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <article className={`assistant-message assistant-message-${role}`}>
      <span className="sr-only">{role === 'user' ? 'Tú' : 'Asistente'}</span>
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
      {children}
    </article>
  );
}
