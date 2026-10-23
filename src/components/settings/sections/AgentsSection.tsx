import React from 'react';
import { AgentPermissionsPanel } from './agents/AgentPermissionsPanel';
import { AgentActivityPanel } from './agents/AgentActivityPanel';
import { McpConnectionPanel } from './agents/McpConnectionPanel';

/** Ajustes → Agentes e IA: permisos, actividad y conexión MCP local. Se registra en el menú con la pista de agentes. */
export const AgentsSection: React.FC = () => (
  <div className="space-y-6">
    <AgentPermissionsPanel />
    <AgentActivityPanel />
    <McpConnectionPanel />
  </div>
);
