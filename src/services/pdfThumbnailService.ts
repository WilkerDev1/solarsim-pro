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

/**
 * 🖼️ PDFThumbnailService
 * 
 * Genera vistas previas en miniatura (thumbnails) en alta definición de la
 * primera página de archivos PDF adjuntos (fichas técnicas, diagramas, certificados).
 */
export class PDFThumbnailService {
  /**
   * Genera una miniatura en Base64 JPEG de la primera página del documento PDF.
   * Con límite de tiempo estricto (timeout de 2500ms) para garantizar que nunca
   * bloquee la subida de archivos si el PDF es corrupto o el worker tiene anomalías.
   * 
   * @param buffer ArrayBuffer o Uint8Array con los bytes del PDF
   * @param targetWidth Ancho deseado en píxeles (default: 160px para nitidez en retina displays)
   */
  static async generateThumbnail(
    buffer: ArrayBuffer | Uint8Array,
    targetWidth: number = 160
  ): Promise<string> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return '';
    }

    const renderProcess = async (): Promise<string> => {
      let loadingTask: any = null;
      try {
        const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        // Clonar buffer para que PDF.js no lo transfiera ni desvincule
        const dataCopy = data.slice(0);

        loadingTask = pdfjsLib.getDocument({
          data: dataCopy,
          useSystemFonts: true,
          disableFontFace: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (pdfDoc.numPages < 1) return '';

        const page = await pdfDoc.getPage(1);
        const originalViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / Math.max(originalViewport.width, 1);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext('2d', { alpha: false });

        if (!context) return '';

        // Fondo blanco inicial (simulando hoja de papel física)
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // @ts-ignore
        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
        });

        await renderTask.promise;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Liberar memoria gráfica del canvas inmediatamente
        canvas.width = 0;
        canvas.height = 0;

        return dataUrl;
      } catch (err) {
        console.warn('Advertencia generando miniatura de PDF (usando fallback visual sin bloquear):', err);
        if (loadingTask && typeof loadingTask.destroy === 'function') {
          try {
            loadingTask.destroy();
          } catch (_) {}
        }
        return '';
      }
    };

    // Timeout de seguridad: Si no responde en 2.5s, retornar cadena vacía de inmediato
    return Promise.race([
      renderProcess(),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 2500)),
    ]);
  }
}
