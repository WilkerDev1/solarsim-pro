import { clientOutdatedMessage, isSemver } from '../../shared/clientVersion';

/**
 * Estado «esta versión del cliente ya no puede sincronizar con el servidor» (la API respondió 426 `client_outdated`).
 * Vive fuera del store para no tocar las rebanadas: `fetchWithSessionRetry` lo escribe y la interfaz lo lee. Mientras
 * esté activo, las rutas de datos de ese servidor no salen a la red; el trabajo local se sigue guardando sin conexión.
 * Se levanta al reiniciar la aplicación (tras actualizarla).
 */
export interface ClientOutdatedState {
  serverUrl: string;
  /** Versión mínima que informó la API; `null` si no vino una versión válida. */
  minVersion: string | null;
}

let state: ClientOutdatedState | null = null;
const listeners = new Set<() => void>();

const normalize = (url: string) => url.trim().replace(/\/+$/, '');

export const getClientOutdated = (): ClientOutdatedState | null => state;

export function subscribeClientOutdated(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function reportClientOutdated(serverUrl: string, minVersion: unknown): ClientOutdatedState {
  const next: ClientOutdatedState = { serverUrl: normalize(serverUrl), minVersion: typeof minVersion === 'string' && isSemver(minVersion) ? minVersion : null };
  if (state?.serverUrl === next.serverUrl && state.minVersion === next.minVersion) return state;
  state = next;
  listeners.forEach(listener => listener());
  return next;
}

export function resetClientOutdated(): void {
  if (!state) return;
  state = null;
  listeners.forEach(listener => listener());
}

export const isServerBlocked = (serverUrl: string): boolean => state !== null && state.serverUrl === normalize(serverUrl);

/** Texto que ven el aviso y los mensajes de error de la sincronización. */
export const clientOutdatedText = (minVersion: string | null): string =>
  minVersion ? clientOutdatedMessage(minVersion) : 'Actualiza SolarSim para seguir sincronizando.';
