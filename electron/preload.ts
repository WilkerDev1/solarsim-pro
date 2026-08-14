import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
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
  validateGeminiApiKey: (apiKey: string, model?: string) =>
    ipcRenderer.invoke('validate-gemini-key', apiKey, model),
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
