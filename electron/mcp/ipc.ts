// IPC surface of the local MCP server. Every handler accepts only the main window's own webContents.
import { app, clipboard, ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { McpRendererSnapshot } from '../../shared/agentTools/bridge';
import type { AgentToolOutcome } from '../../shared/agentTools/types';
import { mcpConfigPath } from './config';
import { McpController } from './mcpController';

const KINDS = new Set(['read', 'draft', 'guarded']);
const MAX_TOOLS = 200;

const isSnapshot = (value: unknown): value is McpRendererSnapshot => {
  const tools = (value as McpRendererSnapshot | undefined)?.tools;
  return (
    Array.isArray(tools) &&
    tools.length <= MAX_TOOLS &&
    tools.every((t) => t && typeof t.name === 'string' && typeof t.description === 'string' && KINDS.has(t.kind) && t.inputSchema && typeof t.inputSchema === 'object')
  );
};
const isOutcome = (value: unknown): value is AgentToolOutcome =>
  !!value && typeof value === 'object' && ['ok', 'applied', 'pending_confirmation', 'error'].includes((value as { status?: string }).status ?? '');

export function createMcpController(getWindow: () => BrowserWindow | null): McpController {
  return new McpController({
    configFile: mcpConfigPath(app.getPath('userData')),
    version: app.getVersion(),
    send: (message) => {
      const contents = getWindow()?.webContents;
      if (!contents || contents.isDestroyed()) return false;
      contents.send('mcp:invoke', message);
      return true;
    },
    copyText: (text) => clipboard.writeText(text),
  });
}

export function registerMcpIpc(controller: McpController, getWindow: () => BrowserWindow | null): void {
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    const contents = getWindow()?.webContents;
    return !!contents && event.sender === contents;
  };
  const guarded = <T>(fn: () => T | Promise<T>) => (event: IpcMainInvokeEvent) => {
    if (!trusted(event)) throw new Error('Remitente no autorizado.');
    return fn();
  };
  ipcMain.handle('mcp:status', guarded(() => controller.status()));
  ipcMain.handle('mcp:set-enabled', (event, enabled: unknown) => {
    if (!trusted(event) || typeof enabled !== 'boolean') throw new Error('Solicitud no válida.');
    return controller.setEnabled(enabled);
  });
  ipcMain.handle('mcp:regenerate-token', guarded(() => controller.regenerateToken()));
  ipcMain.handle('mcp:copy-token', guarded(() => controller.copyToken()));
  ipcMain.on('mcp:respond', (event, requestId: unknown, outcome: unknown) => {
    if (!trusted(event) || typeof requestId !== 'string' || !isOutcome(outcome)) return;
    controller.bridge.respond(requestId, outcome);
  });
  ipcMain.on('mcp:renderer-ready', (event, snapshot: unknown) => {
    if (trusted(event) && isSnapshot(snapshot)) controller.bridge.setReady(snapshot);
  });
}

/** A reload, crash or close drops the renderer's tool snapshot; it announces itself again when it is back. */
export function watchMcpWindow(controller: McpController, window: BrowserWindow): void {
  const gone = () => controller.bridge.rendererGone();
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) gone();
  });
  window.webContents.on('render-process-gone', gone);
  window.on('closed', gone);
}
