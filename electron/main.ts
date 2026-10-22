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
import { createMcpController, registerMcpIpc, watchMcpWindow } from './mcp/ipc';

// 1. Una sola instancia: el servidor MCP local escucha en un puerto fijo y los datos viven en un único perfil.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = getMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  // 2. Configurar flags de sistema operativo y entorno Linux/Wayland
  setupLinuxEnvironment();

  // 3. Registrar Handlers IPC
  registerAIInvoiceHandlers();
  registerWindowIpcHandlers();
  registerAutoUpdater();

  // 4. Ciclo de vida de la aplicación Electron
  app.whenReady().then(async () => {
    const mcp = createMcpController(getMainWindow);
    registerMcpIpc(mcp, getMainWindow);
    app.on('before-quit', () => void mcp.shutdown());
    const openWindow = () => watchMcpWindow(mcp, createMainWindow());

    createApplicationMenu();
    openWindow();
    await mcp.init();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        openWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
