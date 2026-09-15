import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;

export function setupLinuxEnvironment() {
  // Suprimir logs de bajo nivel de Chromium (VSync parameters, fontconfig parser warnings)
  app.commandLine.appendSwitch('log-level', '3');
  process.env.FONTCONFIG_DEBUG = '0';
  process.env.FC_SILENT = '1';

  if (process.platform === 'linux') {
    // Prevent Chromium from blocking on non-existent IBUS sockets in Wayland
    delete process.env.GTK_IM_MODULE;
    delete process.env.QT_IM_MODULE;
    delete process.env.XMODIFIERS;
    process.env.IBUS_USE_PORTAL = '1';

    // Enable Ozone Wayland auto-detection & window decorations
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,WaylandWindowDecorations');
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SolarSim Pro - Simulador Fotovoltaico',
    icon: path.join(__dirname, '../src/assets/electsun-emblem-transparent.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
    const loadDev = () => {
      mainWindow?.loadURL(devUrl).catch(() => {
        setTimeout(loadDev, 500);
      });
    };
    loadDev();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function registerWindowIpcHandlers() {
  // IPC Handler for exporting PDF natively
  ipcMain.handle('print-to-pdf', async () => {
    if (!mainWindow) return null;
    try {
      const pdfData = await mainWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'none' },
      });

      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar Propuesta PDF',
        defaultPath: `Propuesta_SolarSim_${Date.now()}.pdf`,
        filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
      });

      if (filePath) {
        await fs.promises.writeFile(filePath, pdfData);
        return { success: true, filePath };
      }
      return { success: false, cancelled: true };
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      return { success: false, error: err.message };
    }
  });
}
