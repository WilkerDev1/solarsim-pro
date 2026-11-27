import { isOpenableExternalUrl } from '../../shared/externalUrl';

export interface ExternalUrlEnv {
  /** Puente de Electron (`window.electronAPI`): abre con `shell.openExternal` en el proceso principal. */
  electron?: { openExternalUrl?: (url: string) => Promise<void> } | null;
  /** Navegador: `location.assign` (con `mailto:` abre la aplicación de correo sin salir de la página). */
  assign?: (url: string) => void;
}

const browserEnv = (): ExternalUrlEnv => ({
  electron: typeof window !== 'undefined' ? window.electronAPI : undefined,
  assign: typeof window !== 'undefined' ? (url) => window.location.assign(url) : undefined,
});

/**
 * Abre un enlace externo permitido (`http(s)://` o `mailto:`) por el mecanismo de la app: en Electron, el puente
 * `openExternalUrl`; en el navegador, `location.assign`. Devuelve `false` si el enlace no está permitido o no hay cómo.
 */
export async function openExternalUrl(url: string, env: ExternalUrlEnv = browserEnv()): Promise<boolean> {
  if (!isOpenableExternalUrl(url)) return false;
  if (env.electron?.openExternalUrl) {
    await env.electron.openExternalUrl(url);
    return true;
  }
  if (!env.assign) return false;
  env.assign(url);
  return true;
}
