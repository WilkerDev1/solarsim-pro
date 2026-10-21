// Contract shared by the in-app assistants and the local MCP bridge. Pure TypeScript: no app or Node imports.
import type { AgentCard, AgentCardType } from '../agentCards';

/**
 * - `read`: consulta sin efectos.
 * - `draft`: crea o edita propuestas, textos, clientes o anexos; se aplica al momento con registro y deshacer.
 * - `guarded`: catálogo, precios, borrados, estados; requiere confirmación en la app.
 */
export type AgentToolKind = 'read' | 'draft' | 'guarded';
export type AgentSource = 'app-assistant' | 'proposal-assistant' | 'mcp';
export type AgentToolCategory =
  | 'proposals' | 'catalog' | 'pricing' | 'documents' | 'attachments' | 'clients' | 'navigation' | 'commercial' | 'reference';

/** JSON Schema subset understood by the Gemini and MCP adapters. */
export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  description?: string;
  additionalProperties?: boolean;
  nullable?: boolean;
}

export interface AgentToolDefinition {
  name: string;
  title: string;
  description: string;
  kind: AgentToolKind;
  category: AgentToolCategory;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  /** Card rendered with the result, in-app (React) and in MCP Apps hosts (ui://solarsim/cards/<type>). */
  card?: AgentCardType;
  surfaces: AgentSource[];
}

export interface AgentToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type AgentToolOutcome =
  | { status: 'ok'; data: unknown; cards?: AgentCard[] }
  | { status: 'applied'; data: unknown; activityId: string; cards?: AgentCard[] }
  | { status: 'pending_confirmation'; actionId: string; summary: string; cards?: AgentCard[] }
  | { status: 'error'; code: string; message: string };
