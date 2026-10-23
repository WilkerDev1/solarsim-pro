// Polyfills universales de Promises para Web Workers, Electron / Chromium y navegadores
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function (fn: any, ...args: any[]) {
    return new Promise((resolve, reject) => {
      try {
        resolve(fn(...args));
      } catch (err) {
        reject(err);
      }
    });
  };
}

import * as pdfjsLib from 'pdfjs-dist';

// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configurar el worker de PDF.js de forma local para funcionamiento 100% offline y en Electron
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  } catch (err) {
    console.warn('No se pudo inicializar el worker local de PDF.js, usando fallback:', err);
  }
}

type PdfDocumentProxy = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

const withTimeout = <T,>(work: Promise<T>, ms: number, fallback: T) =>
  Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

async function openDocument<T>(buffer: ArrayBuffer | Uint8Array, use: (pdf: PdfDocumentProxy) => Promise<T>): Promise<T> {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // Clonar buffer para que PDF.js no lo transfiera ni desvincule
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0), useSystemFonts: true, disableFontFace: true });
  try {
    return await use(await loadingTask.promise);
  } finally {
    try { void loadingTask.destroy(); } catch (_) {}
  }
}

async function renderPage(pdf: PdfDocumentProxy, pageNumber: number, targetWidth: number): Promise<Blob | null> {
  const page = await pdf.getPage(pageNumber);
  const originalViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidth / Math.max(originalViewport.width, 1) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  // Fondo blanco inicial (simulando hoja de papel física)
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  // @ts-ignore pdfjs 6 acepta canvasContext
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  // Liberar memoria gráfica del canvas inmediatamente
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

const canRender = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * 🖼️ PDFThumbnailService
 *
 * Renderiza páginas de PDF adjuntos (fichas técnicas, diagramas, certificados) a JPEG
 * para vistas previas del catálogo y del dock de anexos.
 */
export class PDFThumbnailService {
  /** Primera página como JPEG; `null` si el PDF es inválido o tarda más que `timeoutMs`. */
  static async renderFirstPage(buffer: ArrayBuffer | Uint8Array, targetWidth = 160, timeoutMs = 8000): Promise<Blob | null> {
    if (!canRender()) return null;
    const work = openDocument(buffer, async (pdf) => (pdf.numPages < 1 ? null : renderPage(pdf, 1, targetWidth))).catch((err) => {
      console.warn('Advertencia generando miniatura de PDF (usando fallback visual sin bloquear):', err);
      return null;
    });
    return withTimeout(work, timeoutMs, null);
  }

  /** Las primeras `maxPages` páginas como JPEG y el total de páginas del documento. */
  static async renderPages(buffer: ArrayBuffer | Uint8Array, targetWidth = 720, maxPages = 8): Promise<{ pages: Blob[]; pageCount: number }> {
    if (!canRender()) return { pages: [], pageCount: 0 };
    return openDocument(buffer, async (pdf) => {
      const pages: Blob[] = [];
      for (let number = 1; number <= Math.min(pdf.numPages, maxPages); number++) {
        const page = await renderPage(pdf, number, targetWidth);
        if (page) pages.push(page);
      }
      return { pages, pageCount: pdf.numPages };
    });
  }

  /**
   * Miniatura en Data URL JPEG de la primera página (envoltura de `renderFirstPage`).
   * Límite de 2500 ms para no bloquear la subida si el PDF es corrupto o el worker falla.
   */
  static async generateThumbnail(buffer: ArrayBuffer | Uint8Array, targetWidth: number = 160): Promise<string> {
    const blob = await PDFThumbnailService.renderFirstPage(buffer, targetWidth, 2500);
    if (!blob) return '';
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }
}
