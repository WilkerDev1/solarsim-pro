import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';

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

function createWindow() {
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
    mainWindow.webContents.openDevTools({ mode: 'detach' });
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
