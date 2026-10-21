import {
  geminiResponseText,
  requestGeminiJson,
  type GeminiTransport,
} from '../../../shared/geminiTransport';
import { toGeminiFunctionDeclarations } from '../../../shared/agentTools/jsonSchema';
import { assistantSystemPrompt } from '../../../shared/agentTools/rules';
import { listAgentTools } from '../agentTools/registry';
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
  signal: AbortSignal;
  execute: (call: AssistantToolCall) => AssistantToolResult | Promise<AssistantToolResult>;
  transport?: GeminiTransport;
}
/** Small bounded tool loop. Tool results are data, never instructions or executable HTML. */
export async function runAssistant(
  options: AssistantRunOptions
): Promise<AssistantMessage> {
  const cards: AssistantCard[] = [];
  const actions: AssistantAction[] = [];
  const contents: any[] = options.history
    .slice(-12)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text.slice(0, 6000) }],
    }));
  contents.push({
    role: 'user',
    parts: [{ text: options.prompt.slice(0, 12000) }],
  });
  const tools = [
    { functionDeclarations: toGeminiFunctionDeclarations(listAgentTools('app-assistant')) },
  ];
  for (let round = 0; round < 4; round++) {
    const body = {
      systemInstruction: {
        parts: [
          {
            text: assistantSystemPrompt(options.activeProjectId),
          },
        ],
      },
      contents,
      tools,
      toolConfig:
        round === 3 ? { functionCallingConfig: { mode: 'NONE' } } : undefined,
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
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
      };
    if (calls.length > 4)
      throw new Error(
        'El asistente solicitó demasiadas herramientas. Divide la pregunta.'
      );
    contents.push({ role: 'model', parts });
    const responses = await Promise.all(calls.map(async (call: any) => {
      try {
        const result = await options.execute({ name: call.name, args: { ...call.args } });
        if (JSON.stringify(result.data).length > 64000)
          throw new Error(
            'Resultado demasiado grande. Consulta un equipo o una propuesta específica.'
          );
        if (result.cards) cards.push(...result.cards);
        if (result.action) {
          if (actions.length >= 3)
            throw new Error('Máximo tres cambios por mensaje.');
          actions.push(result.action);
        }
        return {
          functionResponse: {
            ...(typeof call.id === 'string' ? { id: call.id } : {}),
            name: call.name,
            response: { result: result.data },
          },
        };
      } catch (error) {
        return {
          functionResponse: {
            ...(typeof call.id === 'string' ? { id: call.id } : {}),
            name: call.name,
            response: {
              error:
                error instanceof Error
                  ? error.message
                  : 'Herramienta no disponible.',
            },
          },
        };
      }
    }));
    contents.push({ role: 'user', parts: responses });
  }
  throw new Error(
    'El asistente alcanzó el límite de consultas. Haz una pregunta más concreta.'
  );
}
