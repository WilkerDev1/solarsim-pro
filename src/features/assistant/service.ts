import {
  geminiResponseText,
  requestGeminiJson,
  type GeminiTransport,
} from '../../../shared/geminiTransport';
import { toGeminiFunctionDeclarations } from '../../../shared/agentTools/jsonSchema';
import { ASSISTANT_SYSTEM_PROMPT, assistantTurnContext } from '../../../shared/agentTools/rules';
import { listAgentTools } from '../agentTools/registry';
import { chatFileParts, type ChatFile } from './chatFiles';
import type {
  AssistantAction,
  AssistantCard,
  AssistantMessage,
  AssistantToolCall,
  AssistantToolResult,
} from './types';
export interface AssistantRunOptions {
  apiKey: string;
  model: string;
  prompt: string;
  history: AssistantMessage[];
  activeProjectId?: string;
  /** Vista actual: en 'pdf-preview' el usuario está en el documento (modo edición). */
  activeView?: string;
  signal: AbortSignal;
  execute: (call: AssistantToolCall) => AssistantToolResult | Promise<AssistantToolResult>;
  transport?: GeminiTransport;
  /** Files attached to this prompt only; history keeps text. */
  files?: ChatFile[];
}
/** Raised when the conversation fails after some changes were already applied, so the UI can still show them. */
export class AssistantRunError extends Error {
  constructor(message: string, readonly applied: { activityId: string; title: string }[]) {
    super(message);
  }
}
export async function runAssistant(
  options: AssistantRunOptions
): Promise<AssistantMessage> {
  const applied: { activityId: string; title: string }[] = [];
  try {
    return await runAssistantLoop(options, applied);
  } catch (error) {
    if (!applied.length) throw error;
    // Mutations already happened: never report "nothing was applied" and keep their undo cards visible.
    throw new AssistantRunError(
      'La conversación se interrumpió, pero algunos cambios ya se aplicaron. Puedes revisarlos o deshacerlos abajo.',
      applied
    );
  }
}
/**
 * Inicio de la ventana de historial: al menos los últimos 12 mensajes, pero el inicio avanza de 6 en 6 para que
 * turnos seguidos compartan el mismo prefijo (caché implícita); como mucho 17 mensajes.
 */
export function historyWindowStart(length: number): number {
  return length <= 12 ? 0 : Math.floor((length - 12) / 6) * 6;
}
/** Tool calls executed per round; extra calls in the same turn are answered with an error so the model can re-ask. */
const MAX_CALLS_PER_ROUND = 4;
const functionResponse = (call: any, response: Record<string, unknown>) => ({
  functionResponse: { ...(typeof call.id === 'string' ? { id: call.id } : {}), name: call.name, response },
});
/** Small bounded tool loop. Tool results are data, never instructions or executable HTML. */
async function runAssistantLoop(
  options: AssistantRunOptions,
  applied: { activityId: string; title: string }[]
): Promise<AssistantMessage> {
  const cards: AssistantCard[] = [];
  const agentCards: NonNullable<AssistantMessage['agentCards']> = [];
  const actions: AssistantAction[] = [];
  // Prefijo cacheable: instrucción y herramientas fijas, luego el historial; el contexto variable cierra el turno.
  const contents: any[] = options.history
    .slice(historyWindowStart(options.history.length))
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text.slice(0, 6000) }],
    }));
  contents.push({
    role: 'user',
    parts: [
      { text: options.prompt.slice(0, 12000) },
      ...chatFileParts(options.files || []),
      { text: assistantTurnContext(options.activeProjectId, options.activeView) },
    ],
  });
  const tools = [
    { functionDeclarations: toGeminiFunctionDeclarations(listAgentTools('app-assistant')) },
  ];
  for (let round = 0; round < 4; round++) {
    const body = {
      systemInstruction: {
        parts: [
          {
            text: ASSISTANT_SYSTEM_PROMPT,
          },
        ],
      },
      contents,
      tools,
      toolConfig:
        round === 3 ? { functionCallingConfig: { mode: 'NONE' } } : undefined,
      // Thinking tokens share this budget on Gemini 4: a 4,096 cap truncated tool-heavy turns.
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    };
    const result = await requestGeminiJson(
      {
        apiKey: options.apiKey,
        model: options.model,
        body,
        signal: options.signal,
      },
      options.transport
    );
    const candidate = result.response?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP')
      throw new Error(
        'La respuesta no se completó. No se aplicó ningún cambio.'
      );
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts))
      throw new Error('Respuesta inválida del asistente.');
    const calls = parts
      .filter((p: any) => p.functionCall)
      .map((p: any) => p.functionCall);
    if (!calls.length)
      return {
        role: 'assistant',
        text: geminiResponseText(result.response),
        cards: [
          ...new Map(cards.map((c) => [`${c.kind}:${c.id}`, c])).values(),
        ].slice(0, 12),
        actions,
        ...(applied.length ? { applied } : {}),
        ...(agentCards.length ? { agentCards: agentCards.slice(0, 6) } : {}),
      };
    // The model turn goes back unchanged: Gemini 3/4 require its thought signatures on the next request.
    contents.push({ role: 'model', parts });
    // Sequential on purpose: tool calls may mutate the proposal, and the activity/undo order must match the model's order.
    const responses: any[] = [];
    for (const [index, call] of calls.entries()) {
      if (index >= MAX_CALLS_PER_ROUND) {
        responses.push(functionResponse(call, { error: 'Límite de cuatro herramientas por turno: vuelve a pedir esta consulta en el siguiente turno.' }));
        continue;
      }
      try {
        // Size limits are enforced by the agent registry before anything is applied.
        const result = await options.execute({ name: call.name, args: { ...call.args } });
        if (result.cards) cards.push(...result.cards);
        if (result.agentCards) agentCards.push(...result.agentCards);
        if (result.activityId)
          applied.push({ activityId: result.activityId, title: String(call.args?.title || 'Cambio aplicado').slice(0, 150) });
        if (result.action) {
          if (actions.length >= 3) throw new Error('Máximo tres cambios por mensaje.');
          actions.push(result.action);
        }
        responses.push(functionResponse(call, { result: result.data }));
      } catch (error) {
        responses.push(functionResponse(call, { error: error instanceof Error ? error.message : 'Herramienta no disponible.' }));
      }
    }
    contents.push({ role: 'user', parts: responses });
  }
  throw new Error(
    'El asistente alcanzó el límite de consultas. Haz una pregunta más concreta.'
  );
}
