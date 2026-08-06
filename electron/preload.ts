import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  printToPDF: () => ipcRenderer.invoke('print-to-pdf'),
});
