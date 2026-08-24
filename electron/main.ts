import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { exec } from 'child_process';
import { autoUpdater } from 'electron-updater';
import { registerAIInvoiceHandlers } from './aiInvoiceHandler';

// Register AI Invoice Extractor IPC handlers
registerAIInvoiceHandlers();

// ============================================================================
// FIX FOR LINUX / ARCH / GNOME / WAYLAND IBUS KEYBOARD INPUT DROP & LOGS
// ============================================================================
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

// Helper for downloading files with HTTP redirect support
function downloadFile(url: string, destPath: string, onProgress: (transferred: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (currentUrl: string) => {
      https.get(currentUrl, { headers: { 'User-Agent': 'SolarSim-Pro-Updater' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Error de descarga HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let transferredBytes = 0;
        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          transferredBytes += chunk.length;
          onProgress(transferredBytes, totalBytes);
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => resolve());
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    };

    request(url);
  });
}

// Fetch GitHub Releases via HTTPS directly
function fetchLatestGitHubRelease(): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/WilkerDev1/solarsim-pro/releases/latest',
      headers: { 'User-Agent': 'SolarSim-Pro-Updater' },
    };

    https.get(options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
      }
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// IPC Handlers for Auto-Updater & Platform Info
ipcMain.handle('get-platform-info', () => {
  let isArch = false;
  let isDebian = false;

  if (process.platform === 'linux') {
    isArch = fs.existsSync('/usr/bin/pacman') ||
             fs.existsSync('/etc/arch-release') ||
             fs.existsSync('/etc/cachyos-release') ||
             fs.existsSync('/etc/manjaro-release') ||
             fs.existsSync('/etc/endeavouros-release');

    if (!isArch && fs.existsSync('/etc/os-release')) {
      try {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf-8').toLowerCase();
        isArch = osRelease.includes('arch') || osRelease.includes('cachyos') || osRelease.includes('manjaro');
      } catch {}
    }

    isDebian = !isArch && (fs.existsSync('/etc/debian_version') || fs.existsSync('/usr/bin/dpkg'));
  }

  return {
    platform: process.platform,
    isAppImage: !!process.env.APPIMAGE,
    isArchLinux: isArch,
    isDebian: isDebian,
  };
});

ipcMain.handle('open-external-url', async (_event, url: string) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
  }
});

ipcMain.handle('check-for-updates', async () => {
  try {
    sendUpdateStatus({ state: 'checking' });

    // In Linux non-AppImage (e.g. pacman or deb), query GitHub API directly to get clean release info
    if (process.platform === 'linux' && !process.env.APPIMAGE) {
      const release = await fetchLatestGitHubRelease();
      const latestTag = (release.tag_name || '').replace(/^v/, '');
      const currentVer = app.getVersion().replace(/^v/, '');

      if (latestTag && latestTag !== currentVer) {
        sendUpdateStatus({
          state: 'available',
          version: latestTag,
          releaseDate: release.published_at,
          releaseNotes: release.body,
        });
        return { success: true, updateInfo: { version: latestTag } };
      } else {
        sendUpdateStatus({
          state: 'not-available',
          version: currentVer,
        });
        return { success: true };
      }
    }

    // Windows or Linux AppImage
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

ipcMain.handle('install-linux-package', async (_event, packageType: 'pacman' | 'deb', version: string) => {
  try {
    if (packageType !== 'pacman' && packageType !== 'deb') {
      throw new Error('Tipo de paquete Linux no soportado.');
    }

    const cleanVersion = (version || '').replace(/[^0-9a-zA-Z._-]/g, '').trim();
    if (!cleanVersion || !/^[0-9]+\.[0-9]+\.[0-9]+/.test(cleanVersion)) {
      throw new Error('Formato de versión semántica inválido.');
    }

    const filename = packageType === 'pacman'
      ? `solarsim-pro-${cleanVersion}.pacman`
      : `solarsim-pro_${cleanVersion}_amd64.deb`;
    const downloadUrl = `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${cleanVersion}/${filename}`;
    const tmpDest = path.join('/tmp', filename);

    sendUpdateStatus({ state: 'downloading', progressPct: 0, transferredBytes: 0, totalBytes: 0 });

    await downloadFile(downloadUrl, tmpDest, (transferred, total) => {
      const pct = total > 0 ? Math.round((transferred / total) * 100) : 0;
      sendUpdateStatus({
        state: 'downloading',
        progressPct: pct,
        transferredBytes: transferred,
        totalBytes: total,
      });
    });

    sendUpdateStatus({ state: 'installing' });

    // Execute with pkexec
    const cmd = packageType === 'pacman'
      ? `pkexec pacman -U --noconfirm "${tmpDest}"`
      : `pkexec dpkg -i "${tmpDest}"`;

    await new Promise<void>((resolve, reject) => {
      exec(cmd, (error, _stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message));
        }
        resolve();
      });
    });

    // Installation successful, restart app
    app.relaunch();
    app.quit();
    return { success: true };
  } catch (err: any) {
    console.error('Error installing linux package:', err);
    sendUpdateStatus({
      state: 'error',
      error: `Error durante la instalación del paquete: ${err?.message || err}`,
    });
    return { success: false, error: err?.message };
  }
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

