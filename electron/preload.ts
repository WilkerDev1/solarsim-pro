import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronMcpApi, McpInvokeMessage } from '../shared/agentTools/bridge';

const mcp: ElectronMcpApi = {
  getStatus: () => ipcRenderer.invoke('mcp:status'),
  setEnabled: (enabled) => ipcRenderer.invoke('mcp:set-enabled', enabled),
  regenerateToken: () => ipcRenderer.invoke('mcp:regenerate-token'),
  copyToken: () => ipcRenderer.invoke('mcp:copy-token'),
  onInvoke: (callback) => {
    const subscription = (_event: unknown, message: McpInvokeMessage) => callback(message);
    ipcRenderer.on('mcp:invoke', subscription);
    return () => {
      ipcRenderer.removeListener('mcp:invoke', subscription);
    };
  },
  respond: (requestId, outcome) => ipcRenderer.send('mcp:respond', requestId, outcome),
  ready: (snapshot) => ipcRenderer.send('mcp:renderer-ready', snapshot),
};

contextBridge.exposeInMainWorld('electronAPI', {
  mcp,
  printToPDF: () => ipcRenderer.invoke('print-to-pdf'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  installLinuxPackage: (packageType: 'pacman' | 'deb', version: string) =>
    ipcRenderer.invoke('install-linux-package', packageType, version),
  parseInvoiceWithAI: (payload: any) =>
    ipcRenderer.invoke('parse-invoice-with-ai', payload),
  cancelAIRequest: (requestId: string) => ipcRenderer.invoke('cancel-ai-request', requestId),
  listGeminiModels: (apiKey: string) =>
    ipcRenderer.invoke('list-gemini-models', apiKey),
  onUpdateStatus: (callback: (info: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('update-status', subscription);
    return () => {
      ipcRenderer.removeListener('update-status', subscription);
    };
  },
});
