import { app, BrowserWindow } from 'electron';
import {
  setupLinuxEnvironment,
  createMainWindow,
  getMainWindow,
  registerWindowIpcHandlers,
} from './window/windowManager';
import { createApplicationMenu } from './menu/appMenu';
import { registerAutoUpdater } from './updater/autoUpdaterHandler';
import { registerAIInvoiceHandlers } from './ai/aiInvoiceHandler';

// 1. Configurar flags de sistema operativo y entorno Linux/Wayland
setupLinuxEnvironment();

// 2. Registrar Handlers IPC
registerAIInvoiceHandlers();
registerWindowIpcHandlers();
registerAutoUpdater();

// 3. Ciclo de vida de la aplicación Electron
app.whenReady().then(() => {
  createApplicationMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
