import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Solaris Pro - Simulador Fotovoltaico',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
      defaultPath: `Propuesta_Solaris_${Date.now()}.pdf`,
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
