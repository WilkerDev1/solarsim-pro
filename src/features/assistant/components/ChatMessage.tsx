import React from 'react';
/** Plain text stays escaped; user bubbles and assistant prose share both chat surfaces. */
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
      <div className="assistant-message-text">{text}</div>
      {children}
    </article>
  );
}
