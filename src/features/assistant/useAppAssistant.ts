import { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { assistantOwner } from './tools';
import { executeForAssistant } from '../agentTools/registry';
import { runAssistant } from './service';
import type { GeminiTransport } from '../../../shared/geminiTransport';
import type { AssistantMessage } from './types';
export function useAppAssistant(
  projectId?: string,
  transport?: GeminiTransport
) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController>();
  const sequence = useRef(0);
  const cancel = () => {
    sequence.current++;
    controller.current?.abort();
    setBusy(false);
  };
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    []
  );
  const send = async () => {
    if (busy || !prompt.trim()) return;
    const owner = assistantOwner();
    const s = useSimulationStore.getState();
    const text = prompt.trim();
    const request = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setMessages((previous) => [...previous, { role: 'user', text }]);
    setPrompt('');
    setBusy(true);
    setError('');
    const valid = () =>
      sequence.current === request &&
      owner === assistantOwner() &&
      !abort.signal.aborted;
    try {
      const reply = await runAssistant({
        apiKey: s.geminiApiKey,
        model: s.geminiModel,
        prompt: text,
        history: messages,
        activeProjectId: projectId,
        transport,
        signal: abort.signal,
        execute: (call) => {
          if (!valid()) throw new Error('Solicitud cancelada.');
          return executeForAssistant(call, { source: 'app-assistant', owner, signal: abort.signal });
        },
      });
      if (valid()) setMessages((previous) => [...previous, reply]);
    } catch (e) {
      if (valid())
        setError(
          e instanceof Error ? e.message : 'No se pudo completar la consulta.'
        );
    } finally {
      if (valid()) setBusy(false);
    }
  };
  return {
    messages,
    prompt,
    setPrompt,
    busy,
    error,
    send,
    cancel,
    reset: () => {
      cancel();
      setMessages([]);
      setError('');
      setPrompt('');
    },
    append: (text: string) =>
      setMessages((m) => [...m, { role: 'assistant', text }]),
  };
}
