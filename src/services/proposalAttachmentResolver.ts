import type { AttachedPDFDocument } from '../types';
import { PDFAttachmentStorage } from './pdfAttachmentStorage';
import { equipmentPreviewCache } from './equipmentPreviewCache';
import { loadEquipmentAssetBlob, sourceKey, type PreviewSession } from '../features/equipmentPreview/equipmentPreviewLoader';
import { useSimulationStore } from '../store/useSimulationStore';

export interface ProposalAttachmentResolverDeps {
  projectId: string;
  storage: Pick<typeof PDFAttachmentStorage, 'getAttachment' | 'saveAttachment'>;
  /** Bytes already on this device in the equipment preview cache. */
  cachedAsset: (assetId: string) => Promise<Blob | null>;
  /** Server download (the default caps it at 15 s). */
  fetchAsset: (assetId: string) => Promise<Blob | null>;
}

/** Server asset behind an annex: automatic annexes store it; older catalog annexes kept it as their source key. */
export function annexAssetId(attachment: AttachedPDFDocument): string | undefined {
  if (attachment.assetId) return attachment.assetId;
  const key = attachment.sourceDatasheetKey;
  return key && !/^https?:/i.test(key) ? key : undefined;
}

const isPdf = (bytes: ArrayBuffer) => new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))) === '%PDF-';

/**
 * Locates the bytes of a proposal annex: this device's annex storage → equipment preview cache → server.
 * Bytes recovered from the catalog are saved back as the annex, so the next export is local. A missing
 * annex resolves to `null` (the export then asks before continuing), never throws.
 */
export function createProposalAttachmentResolver(deps: ProposalAttachmentResolverDeps) {
  return async (attachment: AttachedPDFDocument): Promise<ArrayBuffer | null> => {
    try {
      const local = await deps.storage.getAttachment(attachment.id);
      if (local) return local;
      const assetId = annexAssetId(attachment);
      if (!assetId) return null;
      const blob = (await deps.cachedAsset(assetId).catch(() => null)) ?? (await deps.fetchAsset(assetId));
      if (!blob) return null;
      const bytes = await blob.arrayBuffer();
      if (!isPdf(bytes)) return null;
      await deps.storage.saveAttachment(attachment.id, deps.projectId, attachment.fileName, bytes).catch(() => undefined);
      return bytes;
    } catch {
      return null;
    }
  };
}

/** The current workspace session for asset downloads. */
export function currentPreviewSession(): PreviewSession {
  const state = useSimulationStore.getState();
  return { scope: state.workspaceScope || 'local', serverUrl: state.syncSettings.serverUrl, authToken: state.syncSettings.authToken };
}

/** Resolver of the active proposal, with the app's storage, cache and session. */
export async function resolveProposalAttachmentBytes(attachment: AttachedPDFDocument): Promise<ArrayBuffer | null> {
  const session = currentPreviewSession();
  return createProposalAttachmentResolver({
    projectId: useSimulationStore.getState().activeProjectId || 'default-proj',
    storage: PDFAttachmentStorage,
    cachedAsset: (assetId) => equipmentPreviewCache.get(sourceKey(session, assetId)),
    fetchAsset: (assetId) => loadEquipmentAssetBlob(session, assetId),
  })(attachment);
}
