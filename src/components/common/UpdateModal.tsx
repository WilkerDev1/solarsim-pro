import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { X, RefreshCw, Download, CheckCircle2, AlertTriangle, Sparkles, ExternalLink, ArrowRight } from 'lucide-react';
import { UpdateInfo } from '../../types';

export const UpdateModal: React.FC = () => {
  const { isUpdateModalOpen, closeUpdateModal, updateInfo, setUpdateInfo } = useSimulationStore();
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // Get current version if in Electron
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
      window.electronAPI.getAppVersion().then((ver) => {
        if (ver) setAppVersion(ver);
      });
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

  const handleInstall = async () => {
    if (window.electronAPI && typeof window.electronAPI.quitAndInstall === 'function') {
      await window.electronAPI.quitAndInstall();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <RefreshCw className={`w-5 h-5 text-emerald-400 ${isChecking ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight text-white">Actualizaciones de SolarSim Pro</h3>
              <p className="text-xs text-slate-300">Versión actual instalada: <span className="font-mono text-emerald-300 font-bold">v{appVersion}</span></p>
            </div>
          </div>
          <button
            onClick={closeUpdateModal}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-slate-700">
          {/* Status view switcher */}
          {updateInfo.state === 'checking' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin" />
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-900">Buscando nuevas versiones...</p>
                <p className="text-slate-500 text-[11px]">Consultando repositorio GitHub: <span className="font-mono text-slate-700 font-semibold">WilkerDev1/solarsim-pro</span></p>
              </div>
            </div>
          )}

          {updateInfo.state === 'available' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-extrabold text-sm text-emerald-950">¡Nueva versión disponible: v{updateInfo.version}!</h4>
                  <p className="text-emerald-800 text-[11px]">
                    Hay una nueva versión lista para optimizar los cálculos y el generador de propuestas.
                  </p>
                </div>
              </div>

              {updateInfo.releaseNotes && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
                  <span className="font-bold text-[10px] uppercase text-slate-500">Notas de la versión:</span>
                  <div className="text-slate-700 text-[11px] whitespace-pre-line">
                    {updateInfo.releaseNotes}
                  </div>
                </div>
              )}

              <button
                onClick={handleDownload}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <Download className="w-4 h-4" />
                Descargar e Instalar Actualización
              </button>
            </div>
          )}

          {updateInfo.state === 'downloading' && (
            <div className="py-6 space-y-4 text-center">
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-900">Descargando actualización...</p>
                <p className="text-slate-500 text-xs">Por favor, espera unos instantes mientras se descarga el paquete.</p>
              </div>

              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                <div
                  className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${updateInfo.progressPct || 10}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] font-mono text-slate-500 font-semibold px-1">
                <span>{updateInfo.progressPct || 0}% completado</span>
                {updateInfo.totalBytes && (
                  <span>{Math.round((updateInfo.transferredBytes || 0) / 1024 / 1024)} MB / {Math.round(updateInfo.totalBytes / 1024 / 1024)} MB</span>
                )}
              </div>
            </div>
          )}

          {updateInfo.state === 'downloaded' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-slate-900">¡Descarga Completa!</h4>
                <p className="text-slate-600 text-xs">La nueva versión de SolarSim Pro está lista para ser instalada.</p>
              </div>

              <button
                onClick={handleInstall}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <span>Reiniciar e Instalar Ahora</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {updateInfo.state === 'not-available' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-900">¡Tu aplicación está al día!</h4>
                <p className="text-slate-500 text-xs">Tienes instalada la última versión disponible (v{appVersion}).</p>
              </div>
            </div>
          )}

          {updateInfo.state === 'error' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-xs">Aviso de Actualización</h4>
                  <p className="text-[11px] text-amber-800">
                    {updateInfo.error || 'No se pudieron verificar nuevas versiones en este momento.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* GitHub Source info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex justify-between items-center">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Fuente de Actualizaciones</span>
              <p className="font-mono text-[11px] font-bold text-slate-800">github.com/WilkerDev1/solarsim-pro</p>
            </div>
            <a
              href="https://github.com/WilkerDev1/solarsim-pro/releases"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:text-emerald-800 font-bold text-xs flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>Ver Releases</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-between items-center border-t border-slate-200">
            <button
              onClick={closeUpdateModal}
              className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              onClick={handleCheckUpdates}
              disabled={isChecking}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
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
