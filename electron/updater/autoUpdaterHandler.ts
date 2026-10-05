import { app, ipcMain, shell } from 'electron';
import fs from 'fs';
import https from 'https';
import { installVerifiedLinuxPackage } from './linuxPackageUpdater';
import { assertNewerReleaseVersion, compareReleaseVersions } from './releaseVersion';
import { selectEligibleRelease } from './releaseChannel';
import { autoUpdater } from 'electron-updater';
import { getMainWindow } from '../window/windowManager';

// Configure autoUpdater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = process.platform !== 'linux';

function sendUpdateStatus(statusPayload: any) {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', statusPayload);
  }
}

// Fetch GitHub Releases via HTTPS directly
function fetchLatestGitHubRelease(): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/WilkerDev1/solarsim-pro/releases?per_page=100',
      headers: { 'User-Agent': 'SolarSim-Pro-Updater' },
    };

    https.get(options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
      }
      let rawData = '';
      let received = 0;
      res.on('data', (chunk) => { received += chunk.length; if (received > 2 * 1024 * 1024) res.destroy(new Error('Respuesta de release demasiado grande.')); else rawData += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject).setTimeout(12000, function (this: import('http').ClientRequest) { this.destroy(new Error('Timeout al consultar la release.')); });
  });
}

export function registerAutoUpdater() {
  autoUpdater.allowPrerelease = app.getVersion().split('+')[0].includes('-');
  let linuxInstallInProgress = false;
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

      // In development mode, or in Linux non-AppImage (e.g. pacman or deb), query GitHub API directly
      if (!app.isPackaged || process.platform === 'linux') {
        const currentVer = app.getVersion().replace(/^v/, '');
        const releases = await fetchLatestGitHubRelease();
        if (!Array.isArray(releases)) throw new Error('Respuesta de releases inválida.');
        const release = selectEligibleRelease(releases, currentVer);
        const latestTag = release?.tag_name.replace(/^v/, '') || currentVer;

        if (release && compareReleaseVersions(latestTag, currentVer) > 0) {
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

      // Windows or Linux AppImage (Packaged Production)
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
      if (process.platform === 'linux') throw new Error('La actualización automática Linux requiere un paquete .pacman o .deb verificado. Para AppImage, abre la release y verifica su firma antes de sustituir el archivo.');
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      console.error('Error downloading update:', err);
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('quit-and-install', async () => {
    if (process.platform === 'linux') return { success: false, error: 'Instala un paquete Linux con firma verificada.' };
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('install-linux-package', async (_event, packageType: 'pacman' | 'deb', version: string) => {
    if (linuxInstallInProgress) return { success: false, error: 'Ya hay una actualización Linux en curso.' };
    linuxInstallInProgress = true;
    try {
      if (process.platform !== 'linux' || process.arch !== 'x64') {
        throw new Error('La actualización de paquetes está disponible únicamente en Linux x64.');
      }
      const installedVersion = app.getVersion();
      assertNewerReleaseVersion(version, installedVersion);
      sendUpdateStatus({ state: 'downloading', progressPct: 0, transferredBytes: 0, totalBytes: 0 });
      await installVerifiedLinuxPackage(packageType, version, installedVersion, (transferred, total) => {
        sendUpdateStatus({
          state: 'downloading',
          progressPct: total > 0 ? Math.round((transferred / total) * 100) : 0,
          transferredBytes: transferred,
          totalBytes: total,
        });
      }, () => sendUpdateStatus({ state: 'installing' }));

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
    } finally {
      linuxInstallInProgress = false;
    }
  });

  ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
  });
}
