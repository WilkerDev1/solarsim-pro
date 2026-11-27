import { isOpenableExternalUrl } from '../../shared/externalUrl';

export interface ExternalUrlEnv {
  /** Puente de Electron (`window.electronAPI`): el proceso principal vuelve a comprobar y responde si lo abrió. */
  electron?: { openExternalUrl?: (url: string) => Promise<boolean | void> } | null;
  /** Navegador, `mailto:`: `location.assign` abre la aplicación de correo sin salir de la página. */
  assign?: (url: string) => void;
  /** Navegador, `http(s)`: pestaña nueva, como hacían los llamadores antes de este módulo. */
  openWindow?: (url: string) => void;
}

const browserEnv = (): ExternalUrlEnv => (typeof window === 'undefined' ? {} : {
  electron: window.electronAPI,
  assign: (url) => window.location.assign(url),
  openWindow: (url) => { window.open(url, '_blank', 'noopener,noreferrer'); },
});

/**
 * Abre un enlace externo permitido (`shared/externalUrl.ts`) por el mecanismo de la app: en Electron, el puente
 * `openExternalUrl` (IPC `open-external-url`, que devuelve si lo aceptó); en el navegador, pestaña nueva para http(s)
 * y `location.assign` para `mailto:`. Devuelve `false` si el enlace no está permitido, el puente lo rechaza o falla,
 * o no hay cómo abrirlo.
 */
export async function openExternalUrl(url: string, env: ExternalUrlEnv = browserEnv()): Promise<boolean> {
  if (!isOpenableExternalUrl(url)) return false;
  if (env.electron?.openExternalUrl) {
    try {
      return (await env.electron.openExternalUrl(url)) === true;
    } catch {
      return false;
    }
  }
  const open = url.startsWith('mailto:') ? env.assign : env.openWindow;
  if (!open) return false;
  open(url);
  return true;
}
