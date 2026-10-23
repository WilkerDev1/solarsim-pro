import React from 'react';
import { AgentConfirmations } from './AgentConfirmations';
import { McpBridgeHost } from './McpBridgeHost';

/** Single mount point for agent runtime UI shared by both assistants and external MCP clients. */
export const AgentRuntimeHost: React.FC = () => (
  <>
    <AgentConfirmations />
    <McpBridgeHost />
  </>
);
