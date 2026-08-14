import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  X,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  ArrowRight,
  Terminal,
  Copy,
  Check,
  Package,
  Zap,
} from 'lucide-react';
import { UpdateInfo, PlatformInfo } from '../../types';

export const UpdateModal: React.FC = () => {
  const { isUpdateModalOpen, closeUpdateModal, updateInfo, setUpdateInfo, sidebarTheme } = useSimulationStore();
  const isDark = sidebarTheme === 'dark';

  const [appVersion, setAppVersion] = useState('1.0.0');
  const [isChecking, setIsChecking] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    platform: 'linux',
    isAppImage: false,
    isArchLinux: true,
    isDebian: false,
  });

  useEffect(() => {
    // Get current version and platform if in Electron
    if (window.electronAPI) {
      if (typeof window.electronAPI.getAppVersion === 'function') {
        window.electronAPI.getAppVersion().then((ver) => {
          if (ver) setAppVersion(ver);
        });
      }
      if (typeof window.electronAPI.getPlatformInfo === 'function') {
        window.electronAPI.getPlatformInfo().then((info) => {
          if (info) setPlatformInfo(info);
        });
      }
    }

    // Subscribe to IPC update events
    if (window.electronAPI && typeof window.electronAPI.onUpdateStatus === 'function') {
      const unsubscribe = window.electronAPI.onUpdateStatus((info: UpdateInfo) => {
        setUpdateInfo(info);
        setIsChecking(info.state === 'checking');
      });
      return () => unsubscribe();
    }
  }, [setUpdateInfo]);

  if (!isUpdateModalOpen) return null;

  const targetVer = updateInfo.version || '1.1.0';
  const pacmanUrl = `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${targetVer}/solarsim-pro-${targetVer}.pacman`;
  const debUrl = `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${targetVer}/solarsim-pro_${targetVer}_amd64.deb`;
  const appImageUrl = `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${targetVer}/SolarSim.Pro-${targetVer}.AppImage`;
  const pacmanTerminalCmd = `sudo pacman -U ${pacmanUrl}`;

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    setUpdateInfo({ state: 'checking' });

    if (window.electronAPI && typeof window.electronAPI.checkForUpdates === 'function') {
      try {
        const res = await window.electronAPI.checkForUpdates();
        if (!res.success) {
          setUpdateInfo({
            state: 'error',
            error: res.error || 'No se pudo conectar con GitHub Releases.',
          });
        }
      } catch (err: any) {
        setUpdateInfo({
          state: 'error',
          error: err?.message || 'Error de conexión con el repositorio.',
        });
      } finally {
        setIsChecking(false);
      }
    } else {
      // Running in browser web mode
      setTimeout(() => {
        setIsChecking(false);
        setUpdateInfo({
          state: 'not-available',
          version: appVersion,
        });
      }, 1200);
    }
  };

  const handleDownload = async () => {
    if (window.electronAPI && typeof window.electronAPI.downloadUpdate === 'function') {
      setUpdateInfo({ ...updateInfo, state: 'downloading', progressPct: 0 });
      await window.electronAPI.downloadUpdate();
    }
  };

  const handleInstallLinuxPackage = async (type: 'pacman' | 'deb') => {
    if (window.electronAPI && typeof window.electronAPI.installLinuxPackage === 'function') {
      await window.electronAPI.installLinuxPackage(type, targetVer);
    }
  };

  const handleInstall = async () => {
    if (window.electronAPI && typeof window.electronAPI.quitAndInstall === 'function') {
      await window.electronAPI.quitAndInstall();
    }
  };

  const handleCopyTerminal = () => {
    navigator.clipboard.writeText(pacmanTerminalCmd);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2500);
  };

  const handleOpenUrl = (url: string) => {
    if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
      window.electronAPI.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200 transition-colors max-h-[90vh] ${
          isDark ? 'bg-[#18181f] border-[#2e2e3a] text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 flex justify-between items-center shrink-0 border-b transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-slate-950 via-[#1c1c24] to-[#18181f] border-[#2e2e3a] text-white'
              : 'bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <RefreshCw className={`w-5 h-5 text-emerald-400 ${isChecking ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight text-white">Actualizaciones de SolarSim Pro</h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-300'}`}>
                Versión actual: <span className="font-mono text-emerald-400 font-bold">v{appVersion}</span>
                {platformInfo.isArchLinux && ' • Arch Linux'}
                {platformInfo.isDebian && ' • Debian / Ubuntu'}
              </p>
            </div>
          </div>
          <button
            onClick={closeUpdateModal}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs overflow-y-auto">
          {/* Checking view */}
          {updateInfo.state === 'checking' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
              <div className="space-y-1">
                <p className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Buscando nuevas versiones...
                </p>
                <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Consultando repositorio GitHub:{' '}
                  <span className={`font-mono font-semibold ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>
                    WilkerDev1/solarsim-pro
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Update Available */}
          {updateInfo.state === 'available' && (
            <div className="space-y-4">
              <div
                className={`border rounded-xl p-4 flex items-start gap-3 ${
                  isDark
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-extrabold text-sm">¡Nueva versión disponible: v{targetVer}!</h4>
                  <p className="opacity-85 text-[11px]">
                    Incluye personalización multi-empresa, logos editables, marca de agua con opacidad y mejoras de rendimiento.
                  </p>
                </div>
              </div>

              {/* Release Notes */}
              {updateInfo.releaseNotes && (
                <div
                  className={`border rounded-xl p-3 max-h-32 overflow-y-auto space-y-1 ${
                    isDark ? 'bg-[#141418] border-[#2a2a36] text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className={`font-bold text-[10px] uppercase ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Novedades de la versión:
                  </span>
                  <div className="text-[11px] whitespace-pre-line leading-relaxed">{updateInfo.releaseNotes}</div>
                </div>
              )}

              {/* Action for Windows / AppImage vs Native Arch / Debian */}
              {platformInfo.platform === 'win32' || platformInfo.isAppImage ? (
                <button
                  onClick={handleDownload}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer text-xs active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar e Instalar Actualización Automática</span>
                </button>
              ) : platformInfo.isArchLinux ? (
                <div className="space-y-3">
                  {/* 1-Click Native Pacman Install */}
                  <button
                    onClick={() => handleInstallLinuxPackage('pacman')}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer text-xs active:scale-95"
                  >
                    <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                    <span>Actualizar con 1 Clic en Arch Linux (.pacman)</span>
                  </button>

                  {/* Terminal Command Quick Copy */}
                  <div className={`p-3 rounded-xl border space-y-1.5 ${isDark ? 'bg-[#121217] border-[#2c2c38]' : 'bg-slate-100 border-slate-200'}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-bold uppercase flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" /> O ejecutar en Terminal (Pacman):
                      </span>
                      <button
                        onClick={handleCopyTerminal}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                          copiedCommand
                            ? 'bg-emerald-500 text-white'
                            : isDark
                            ? 'bg-[#282834] text-zinc-200 hover:bg-[#343444]'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {copiedCommand ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedCommand ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <pre className="text-[10px] font-mono p-2 rounded-lg bg-black/40 text-emerald-400 overflow-x-auto select-all">
                      {pacmanTerminalCmd}
                    </pre>
                  </div>

                  {/* Direct Download Options */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleOpenUrl(pacmanUrl)}
                      className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isDark ? 'border-[#343446] bg-[#1a1a24] hover:bg-[#242432] text-zinc-200' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Descargar .pacman</span>
                    </button>
                    <button
                      onClick={() => handleOpenUrl(appImageUrl)}
                      className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isDark ? 'border-[#343446] bg-[#1a1a24] hover:bg-[#242432] text-zinc-200' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Descargar AppImage</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Debian / Ubuntu */}
                  <button
                    onClick={() => handleInstallLinuxPackage('deb')}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer text-xs active:scale-95"
                  >
                    <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                    <span>Actualizar con 1 Clic (.deb)</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleOpenUrl(debUrl)}
                      className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isDark ? 'border-[#343446] bg-[#1a1a24] hover:bg-[#242432] text-zinc-200' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Descargar .deb</span>
                    </button>
                    <button
                      onClick={() => handleOpenUrl(appImageUrl)}
                      className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isDark ? 'border-[#343446] bg-[#1a1a24] hover:bg-[#242432] text-zinc-200' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Descargar AppImage</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Downloading view */}
          {updateInfo.state === 'downloading' && (
            <div className="py-6 space-y-4 text-center">
              <div className="space-y-1">
                <p className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Descargando actualización...
                </p>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Descargando el paquete nativo para tu sistema operativo desde GitHub.
                </p>
              </div>

              <div
                className={`w-full rounded-full h-3 overflow-hidden border ${
                  isDark ? 'bg-[#242430] border-[#383848]' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${updateInfo.progressPct || 10}%` }}
                />
              </div>

              <div className={`flex justify-between text-[11px] font-mono font-semibold px-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                <span>{updateInfo.progressPct || 0}% completado</span>
                {updateInfo.totalBytes && (
                  <span>
                    {Math.round((updateInfo.transferredBytes || 0) / 1024 / 1024)} MB /{' '}
                    {Math.round(updateInfo.totalBytes / 1024 / 1024)} MB
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Installing view */}
          {updateInfo.state === 'installing' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
              <div className="space-y-1.5">
                <p className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Instalando paquete en el sistema...
                </p>
                <p className={`text-[11px] max-w-xs mx-auto ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Ingresa tu contraseña de administrador en la ventana de autorización del sistema (Polkit) si es solicitada.
                </p>
              </div>
            </div>
          )}

          {/* Downloaded view (for Windows / AppImage) */}
          {updateInfo.state === 'downloaded' && (
            <div className="space-y-4 text-center py-4">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
                  isDark ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className={`font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  ¡Descarga Completa!
                </h4>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  La nueva versión de SolarSim Pro está lista para ser instalada.
                </p>
              </div>

              <button
                onClick={handleInstall}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer text-xs active:scale-95"
              >
                <span>Reiniciar e Instalar Ahora</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Not Available view */}
          {updateInfo.state === 'not-available' && (
            <div className="space-y-4 text-center py-4">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto border ${
                  isDark
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className={`font-extrabold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  ¡Tu aplicación está al día!
                </h4>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Tienes instalada la última versión disponible (v{appVersion}).
                </p>
              </div>
            </div>
          )}

          {/* Error view */}
          {updateInfo.state === 'error' && (
            <div className="space-y-4">
              <div
                className={`border rounded-xl p-4 flex items-start gap-3 ${
                  isDark
                    ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-xs">Aviso de Actualización</h4>
                  <p className="text-[11px] opacity-90">
                    {updateInfo.error || 'No se pudieron verificar nuevas versiones en este momento.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* GitHub Source info */}
          <div
            className={`border rounded-xl p-3 flex justify-between items-center transition-colors ${
              isDark ? 'bg-[#141418] border-[#2a2a36]' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="space-y-0.5">
              <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                Fuente de Actualizaciones
              </span>
              <p className={`font-mono text-[11px] font-bold ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
                github.com/WilkerDev1/solarsim-pro
              </p>
            </div>
            <button
              onClick={() => handleOpenUrl('https://github.com/WilkerDev1/solarsim-pro/releases')}
              className="text-emerald-500 hover:text-emerald-400 font-bold text-xs flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>Ver Releases</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Actions */}
          <div className={`pt-2 flex justify-between items-center border-t ${isDark ? 'border-[#2e2e3a]' : 'border-slate-200'}`}>
            <button
              onClick={closeUpdateModal}
              className={`px-4 py-2 rounded-lg border font-semibold text-xs transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#383848] text-zinc-300 hover:bg-[#242430]'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Cerrar
            </button>
            <button
              onClick={handleCheckUpdates}
              disabled={isChecking}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Buscando...' : 'Buscar Actualizaciones'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
