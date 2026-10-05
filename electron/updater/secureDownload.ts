import fs from 'node:fs';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';

const DOWNLOAD_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com']);

export function validateDownloadUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('La descarga debe proceder de GitHub Releases mediante HTTPS.');
  }
  return url;
}

export async function downloadReleaseFile(
  url: string, destination: string, onProgress: (transferred: number, total: number) => void,
  maxBytes = 2 * 1024 * 1024 * 1024, redirects = 0,
): Promise<void> {
  const parsed = validateDownloadUrl(url);
  if (redirects > 8) throw new Error('Demasiadas redirecciones al descargar la actualización.');
  let earlyResponseError: Error | undefined;
  const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const request = https.get(parsed, { headers: { 'User-Agent': 'SolarSim-Pro-Updater' } }, incoming => {
      // A connection may fail while the private destination is being opened.
      incoming.on('error', error => { earlyResponseError = error; });
      resolve(incoming);
    });
    request.setTimeout(30_000, () => request.destroy(new Error('Tiempo de espera de descarga agotado.')));
    request.on('error', reject);
  });
  if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
    response.resume();
    return downloadReleaseFile(new URL(response.headers.location, parsed).href, destination, onProgress, maxBytes, redirects + 1);
  }
  if (response.statusCode !== 200) {
    response.resume();
    throw new Error(`Error de descarga HTTP ${response.statusCode}`);
  }
  const total = Number(response.headers['content-length'] || 0);
  if (!Number.isFinite(total) || total < 0 || total > maxBytes) {
    response.destroy();
    throw new Error('Tamaño de actualización no permitido.');
  }
  let file: import('node:fs/promises').FileHandle;
  try {
    file = await fs.promises.open(destination, 'wx', 0o600);
  } catch (error) {
    response.destroy();
    throw error;
  }
  // Register data observers only after the destination is ready. A data listener
  // starts flowing mode and would otherwise discard bytes while open() awaits.
  let transferred = 0;
  response.on('data', (chunk: Buffer) => {
    transferred += chunk.length;
    if (transferred > maxBytes) response.destroy(new Error('La actualización supera el tamaño permitido.'));
    else onProgress(transferred, total);
  });
  try {
    if (earlyResponseError) throw earlyResponseError;
    await pipeline(response, file.createWriteStream());
    if (total > 0 && transferred !== total) throw new Error('La descarga de la actualización está incompleta.');
  } catch (error) {
    await file.close().catch(() => {});
    await fs.promises.rm(destination, { force: true });
    throw error;
  }
}
