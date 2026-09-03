/**
 * 📦 PDFAttachmentStorage
 * 
 * Almacenamiento seguro de binarios de archivos PDF externos en IndexedDB.
 * Evita la saturación del límite de 5-10MB de localStorage y mantiene
 * una caché en memoria para operaciones instantáneas de exportación.
 */

const DB_NAME = 'solarsim_pdf_attachments';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_files';

interface StoredPDFAttachment {
  id: string;
  projectId: string;
  fileName: string;
  data: ArrayBuffer;
  updatedAt: string;
}

// Caché en memoria para acceso ultra-rápido durante la sesión activa
const memoryCache = new Map<string, ArrayBuffer>();

class PDFAttachmentStorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB no está disponible en este entorno.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('projectId', 'projectId', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Guarda un archivo PDF en IndexedDB y en la caché de memoria
   */
  async saveAttachment(
    id: string,
    projectId: string,
    fileName: string,
    buffer: ArrayBuffer
  ): Promise<void> {
    // Guardar siempre en memoria primero
    memoryCache.set(id, buffer);

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const record: StoredPDFAttachment = {
          id,
          projectId,
          fileName,
          data: buffer,
          updatedAt: new Date().toISOString(),
        };

        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Advertencia: No se pudo persistir en IndexedDB, usando caché en memoria:', err);
    }
  }

  /**
   * Recupera los bytes de un archivo PDF por su ID (desde memoria o IndexedDB)
   */
  async getAttachment(id: string): Promise<ArrayBuffer | null> {
    if (memoryCache.has(id)) {
      return memoryCache.get(id)!;
    }

    try {
      const db = await this.getDB();
      return await new Promise<ArrayBuffer | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);

        req.onsuccess = () => {
          const result = req.result as StoredPDFAttachment | undefined;
          if (result && result.data) {
            memoryCache.set(id, result.data);
            resolve(result.data);
          } else {
            resolve(null);
          }
        };

        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`Error al recuperar adjunto ${id} de IndexedDB:`, err);
      return null;
    }
  }

  /**
   * Elimina un archivo PDF de la caché y de IndexedDB
   */
  async deleteAttachment(id: string): Promise<void> {
    memoryCache.delete(id);

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`Error al eliminar adjunto ${id} de IndexedDB:`, err);
    }
  }

  /**
   * Elimina todos los archivos adjuntos vinculados a un proyecto
   */
  async clearProjectAttachments(projectId: string): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('projectId');
        const req = index.openCursor(IDBKeyRange.only(projectId));

        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            memoryCache.delete(cursor.value.id);
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };

        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`Error al limpiar adjuntos del proyecto ${projectId}:`, err);
    }
  }
}

export const PDFAttachmentStorage = new PDFAttachmentStorageService();
