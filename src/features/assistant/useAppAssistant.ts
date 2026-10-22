import { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { assistantOwner } from './tools';
import { executeForAssistant } from '../agentTools/registry';
import { AssistantRunError, runAssistant } from './service';
import { CHAT_FILE_LIMITS, forgetChatFiles, registerChatFile, type ChatFile } from './chatFiles';
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
  const [files, setFiles] = useState<ChatFile[]>([]);
  const sessionFiles = useRef<string[]>([]);
  const addFiles = async (list: FileList | File[]) => {
    setError('');
    for (const f of Array.from(list)) {
      try {
        if (files.length >= CHAT_FILE_LIMITS.maxFiles) throw new Error('Máximo tres archivos por mensaje.');
        const registered = registerChatFile(f.name, await f.arrayBuffer());
        sessionFiles.current.push(registered.id);
        setFiles((previous) => [...previous, registered].slice(0, CHAT_FILE_LIMITS.maxFiles));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo adjuntar el archivo.');
      }
    }
  };
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
      forgetChatFiles(sessionFiles.current);
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
    const attached = files;
    setFiles([]);
    const label = attached.length ? `${text}\n\n📎 ${attached.map((f) => f.name).join(', ')}` : text;
    setMessages((previous) => [...previous, { role: 'user', text: label }]);
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
        files: attached,
        signal: abort.signal,
        execute: (call) => {
          if (!valid()) throw new Error('Solicitud cancelada.');
          return executeForAssistant(call, { source: 'app-assistant', owner, signal: abort.signal });
        },
      });
      if (valid()) setMessages((previous) => [...previous, reply]);
    } catch (e) {
      if (valid() && e instanceof AssistantRunError)
        setMessages((previous) => [...previous, { role: 'assistant', text: e.message, applied: e.applied }]);
      else if (valid())
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
    files,
    addFiles,
    removeFile: (id: string) => setFiles((previous) => previous.filter((f) => f.id !== id)),
    reset: () => {
      cancel();
      forgetChatFiles(sessionFiles.current);
      sessionFiles.current = [];
      setFiles([]);
      setMessages([]);
      setError('');
      setPrompt('');
    },
    append: (text: string) =>
      setMessages((m) => [...m, { role: 'assistant', text }]),
  };
}
