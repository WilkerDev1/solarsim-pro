import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';

// ============================================================================
// FIX FOR LINUX / ARCH / GNOME / WAYLAND IBUS KEYBOARD INPUT DROP
// ============================================================================
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

let mainWindow: BrowserWindow | null = null;

// Configure autoUpdater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(statusPayload: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', statusPayload);
  }
}

// AutoUpdater Events
autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus({ state: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus({
    state: 'available',
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : (info.releaseNotes ? JSON.stringify(info.releaseNotes) : null),
  });
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdateStatus({
    state: 'not-available',
    version: info?.version || app.getVersion(),
  });
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus({
    state: 'error',
    error: err == null ? 'Error desconocido al comprobar actualizaciones' : (err.message || String(err)),
  });
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateStatus({
    state: 'downloading',
    progressPct: Math.round(progressObj.percent),
    transferredBytes: progressObj.transferred,
    totalBytes: progressObj.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus({
    state: 'downloaded',
    version: info.version,
    releaseDate: info.releaseDate,
  });
});

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Archivo',
      submenu: [
        isMac ? { role: 'close' as const } : { role: 'quit' as const, label: 'Salir' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo' as const, label: 'Deshacer' },
        { role: 'redo' as const, label: 'Rehacer' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: 'Cortar' },
        { role: 'copy' as const, label: 'Copiar' },
        { role: 'paste' as const, label: 'Pegar' },
        { role: 'selectAll' as const, label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' as const, label: 'Recargar' },
        { role: 'forceReload' as const, label: 'Forzar recarga' },
        {
          label: 'Alternar Herramientas de Desarrollador',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          },
        },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: 'Restablecer zoom' },
        { role: 'zoomIn' as const, label: 'Acercar' },
        { role: 'zoomOut' as const, label: 'Alejar' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: 'Pantalla completa' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  createApplicationMenu();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SolarSim Pro - Simulador Fotovoltaico',
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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

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

// IPC Handlers for Auto-Updater
ipcMain.handle('check-for-updates', async () => {
  try {
    sendUpdateStatus({ state: 'checking' });
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (err: any) {
    console.warn('Error checking for updates:', err?.message || err);
    sendUpdateStatus({
      state: 'error',
      error: err?.message || 'No se pudo conectar con el repositorio de actualizaciones en GitHub.',
    });
    return { success: false, error: err?.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err: any) {
    console.error('Error downloading update:', err);
    return { success: false, error: err?.message };
  }
});

ipcMain.handle('quit-and-install', async () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});
