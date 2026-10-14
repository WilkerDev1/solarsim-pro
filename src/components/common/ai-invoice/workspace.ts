import type { SimulationStore } from '../../../store/types';

// Drafts are transient: changing identity, server or workspace invalidates them.
export function aiWorkspaceKey(state: Pick<SimulationStore, 'syncSettings' | 'sessionGeneration'>): string {
  const sync = state.syncSettings;
  return JSON.stringify([sync.serverUrl, sync.currentUser?.id, sync.currentUser?.organizationId, state.sessionGeneration]);
}

export const PROPOSAL_FILE_LIMIT = 8 * 1024 * 1024;
export const PROPOSAL_FILES_LIMIT = 4;
export function proposalFileType(file: Pick<File, 'type' | 'name' | 'size'>): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const expected = ({pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp'} as Record<string,string>)[extension || ''];
  const mime = file.type || expected;
  if (!expected || mime !== expected) throw new Error('Adjunta un PDF, PNG, JPG o WebP con extensión y formato coincidentes.');
  if (file.size > PROPOSAL_FILE_LIMIT) throw new Error('Cada archivo debe pesar como máximo 8 MB.');
  if (file.size === 0) throw new Error('El archivo está vacío.');
  return mime;
}
export function readProposalFile(file: File): Promise<string> {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer el archivo. Intenta adjuntarlo de nuevo.'));
    reader.readAsDataURL(file);
  });
}
