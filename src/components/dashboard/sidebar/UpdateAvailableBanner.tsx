import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowRight, Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import type { UpdateInfo } from '../../../types';

export interface UpdateBannerModel {
  kind: 'available' | 'downloading' | 'ready';
  title: string;
  detail: string;
  action: string;
  /** 0–100 mientras descarga. */
  progressPct?: number;
  /** Solo el aviso de «disponible» se puede ocultar; descarga e instalación en curso siempre se ven. */
  dismissible: boolean;
}

/** Qué muestra el aviso según el estado del actualizador; null si no hay nada que avisar o se ocultó esa versión. */
export function updateBannerModel(info: UpdateInfo, dismissedVersion: string | null): UpdateBannerModel | null {
  const version = info.version ? `v${info.version}` : 'Nueva versión';
  if (info.state === 'available') {
    if (info.version && info.version === dismissedVersion) return null;
    // Sin versión no hay con qué recordar el «ocultar»: la X no se ofrece.
    return { kind: 'available', title: 'Actualización disponible', detail: `${version} lista para descargar`, action: 'Ver novedades', dismissible: Boolean(info.version) };
  }
  if (info.state === 'downloading') {
    const progressPct = Math.max(0, Math.min(100, Math.round(info.progressPct ?? 0)));
    return { kind: 'downloading', title: 'Descargando actualización', detail: `${version} · ${progressPct}%`, action: 'Ver progreso', progressPct, dismissible: false };
  }
  if (info.state === 'downloaded' || info.state === 'installing') {
    return { kind: 'ready', title: 'Actualización lista', detail: `Reinicia para usar ${version}`, action: 'Instalar ahora', dismissible: false };
  }
  return null;
}

const DISMISS_KEY = 'solarsim.updateBanner.dismissedVersion';

function readDismissed(): string | null {
  try { return window.localStorage.getItem(DISMISS_KEY); } catch { return null; }
}

export interface UpdateBannerViewProps {
  model: UpdateBannerModel;
  onOpen: () => void;
  onDismiss: () => void;
}

/** Aviso llamativo (degradado, halo y pulso) encima del perfil; el botón entero abre el modal de actualización. */
export const UpdateBannerView: React.FC<UpdateBannerViewProps> = ({ model, onOpen, onDismiss }) => {
  const Icon = model.kind === 'ready' ? RefreshCw : model.kind === 'downloading' ? Download : Sparkles;
  return (
    <div className="relative">
      {model.kind !== 'downloading' && (
        <span aria-hidden="true" className="pointer-events-none absolute -inset-0.5 rounded-[14px] bg-gradient-to-r from-emerald-400 via-sky-400 to-emerald-400 opacity-50 blur-[6px]" />
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${model.title}: ${model.detail}. ${model.action}`}
        className="group relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-xl border-0 bg-gradient-to-br from-emerald-500 via-emerald-600 to-sky-600 p-2.5 pr-8 text-left text-white shadow-lg shadow-emerald-600/30 transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <span className="relative flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40">
          {model.kind === 'available' && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-white/30 motion-safe:animate-ping" />}
          <Icon className={`relative h-4 w-4 ${model.kind === 'downloading' ? 'motion-safe:animate-bounce' : ''}`} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold leading-tight">{model.title}</span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-white/85">{model.detail}</span>
          {model.progressPct !== undefined && (
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${model.progressPct}%` }} />
            </span>
          )}
        </span>
        <span className="flex h-6 w-6 flex-none items-center justify-center self-end rounded-md bg-white/15">
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
      {model.dismissible && (
        <button
          type="button"
          onClick={event => { event.stopPropagation(); onDismiss(); }}
          aria-label="Ocultar el aviso hasta la próxima versión"
          title="Ocultar hasta la próxima versión"
          className="absolute right-0.5 top-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-white/70 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/** Conectado al actualizador: en la pantalla principal, encima del perfil. */
export const UpdateAvailableBanner: React.FC = () => {
  const { updateInfo, openUpdateModal } = useSimulationStore(useShallow(s => ({ updateInfo: s.updateInfo, openUpdateModal: s.openUpdateModal })));
  const [dismissed, setDismissed] = React.useState<string | null>(readDismissed);
  const model = updateBannerModel(updateInfo, dismissed);
  if (!model) return null;
  const dismiss = () => {
    const version = updateInfo.version ?? null;
    setDismissed(version);
    try { if (version) window.localStorage.setItem(DISMISS_KEY, version); } catch { /* sin almacenamiento: se oculta solo en esta sesión */ }
  };
  return <UpdateBannerView model={model} onOpen={openUpdateModal} onDismiss={dismiss} />;
};
