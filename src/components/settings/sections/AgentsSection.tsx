import React from 'react';
import { AgentPermissionsPanel } from './agents/AgentPermissionsPanel';
import { AgentActivityPanel } from './agents/AgentActivityPanel';
import { McpConnectionPanel } from './agents/McpConnectionPanel';
import { RemoteMcpPanel } from './agents/RemoteMcpPanel';

/** Ajustes → Agentes e IA: permisos, actividad, conexión MCP local y acceso remoto. Se registra en el menú con la pista de agentes. */
export const AgentsSection: React.FC = () => (
  <div className="space-y-6">
    <AgentPermissionsPanel />
    <AgentActivityPanel />
    <McpConnectionPanel />
    <RemoteMcpPanel />
  </div>
);
