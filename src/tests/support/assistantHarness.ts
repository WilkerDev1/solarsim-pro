// Ayudantes de las pruebas de evaluación del asistente (F7a): el montaje (store, sesión, propuesta inicial) vive en
// `scripts/qa/assistantEvalHarness.ts`, que también usa el script con el modelo real y por eso no importa dobles de prueba;
// aquí solo lo que lee las llamadas de ScriptedLlm.
import assert from 'node:assert/strict';
import { closedTurnProblems } from '../../features/assistant/session/agentLoop';
import type { AssistantSession, SessionMessage } from '../../features/assistant/session/assistantSession';
import type { LlmRequest } from '../../services/llm/types';
import type { ScriptedCall } from './scriptedLlm';

export * from '../../../scripts/qa/assistantEvalHarness';

export const req = (call: ScriptedCall) => call.request as LlmRequest;
export const lastUserParts = (call: ScriptedCall) => req(call).contents.at(-1)!.parts;
/** La n-ésima `functionResponse` que el bucle devolvió al modelo en esta llamada. */
export const frOf = (call: ScriptedCall, index = 0) =>
  lastUserParts(call).filter((p) => p.type === 'functionResponse')[index] as { id?: string; name: string; response: Record<string, any> };
export const lastAssistant = (session: AssistantSession) =>
  [...session.getState().messages].reverse().find((m) => m.role === 'assistant') as SessionMessage & { role: 'assistant' };
export const assertHistoryClosed = (session: AssistantSession, label: string) =>
  assert.deepEqual(closedTurnProblems(session.history()), [], `${label}: historial sin functionCall huérfanos`);
