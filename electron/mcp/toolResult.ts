// Maps renderer outcomes to MCP CallToolResult content. Text is always present for hosts that ignore structuredContent.
import type { AgentToolDefinition, AgentToolOutcome } from '../../shared/agentTools/types';

export interface McpToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

const json = (value: unknown) => JSON.stringify(value ?? null, null, 2);

export function outcomeText(outcome: AgentToolOutcome): string {
  switch (outcome.status) {
    case 'ok':
      return json(outcome.data);
    case 'applied':
      return `Cambio aplicado en SolarSim (actividad ${outcome.activityId}; se puede deshacer en Ajustes → Agentes e IA).\n${json(outcome.data)}`;
    case 'pending_confirmation':
      return `${outcome.summary}\nEsta acción espera la confirmación de una persona en SolarSim (id ${outcome.actionId}). No está aplicada: usa get_agent_action_status con ese id para conocer la decisión.`;
    case 'error':
      return `${outcome.message} (${outcome.code})`;
  }
}

export function toolResult(outcome: AgentToolOutcome): McpToolResult {
  return {
    content: [{ type: 'text', text: outcomeText(outcome) }],
    structuredContent: outcome as unknown as Record<string, unknown>,
    isError: outcome.status === 'error',
  };
}

export function failureResult(code: string, message: string): McpToolResult {
  return toolResult({ status: 'error', code, message });
}

/** MCP tool listing entry. Output schemas are omitted: structuredContent carries the outcome envelope, not raw tool data. */
export function toMcpTool(definition: AgentToolDefinition) {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: { ...definition.inputSchema, type: 'object' as const },
    annotations: {
      title: definition.title,
      readOnlyHint: definition.kind === 'read',
      destructiveHint: definition.kind === 'guarded',
      openWorldHint: false,
    },
  };
}
