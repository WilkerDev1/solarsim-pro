// IPC contract between Electron main (local MCP server) and the renderer that executes agent tools.
import type { AgentToolCall, AgentToolDefinition, AgentToolOutcome } from './types';

export interface McpInvokeMessage {
  requestId: string;
  call: AgentToolCall;
  /** MCP client name reported on initialize (e.g. "claude-code", "codex"). */
  clientLabel?: string;
}

export interface McpRendererSnapshot {
  /** Tools the renderer currently exposes to external agents after applying the device policy. */
  tools: AgentToolDefinition[];
}

export interface McpServerStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
  error?: string;
  clients: { name: string; lastSeenAt: string }[];
}

export interface ElectronMcpApi {
  getStatus(): Promise<McpServerStatus>;
  setEnabled(enabled: boolean): Promise<McpServerStatus>;
  regenerateToken(): Promise<McpServerStatus>;
  /** Copies the bearer token from the main process; the token never reaches renderer code. */
  copyToken(): Promise<boolean>;
  onInvoke(callback: (message: McpInvokeMessage) => void): () => void;
  respond(requestId: string, outcome: AgentToolOutcome): void;
  ready(snapshot: McpRendererSnapshot): void;
}
