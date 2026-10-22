import React, { useEffect } from 'react';
import { connectMcpBridge } from './mcpBridge';

/** Executes tool calls forwarded by the local MCP server (Electron main). Renders nothing; inert outside Electron. */
export const McpBridgeHost: React.FC = () => {
  useEffect(() => {
    const api = window.electronAPI?.mcp;
    return api ? connectMcpBridge(api) : undefined;
  }, []);
  return null;
};
