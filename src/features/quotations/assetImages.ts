import { useEffect, useState } from 'react';
import { isAssetRef } from '../../../shared/documentAssets';
import { DocumentAssetService, cachedAssetContent } from '../../services/documentAssetService';
import { useSimulationStore } from '../../store/useSimulationStore';
import { PDFAttachmentStorage } from '../../services/pdfAttachmentStorage';
import { currentPreviewSession } from '../../services/proposalAttachmentResolver';
import { loadEquipmentAssetBlob } from '../equipmentPreview/equipmentPreviewLoader';
import type { QuotationAttachment } from '../../types/quotation';
import { resolveAttachmentBytes } from './attachments';

/** Transporte de activos de la sesión activa, o `null` sin sesión (sin cuenta, las imágenes ya están en línea). */
function sessionTransport() {
  const { serverUrl, authToken } = useSimulationStore.getState().syncSettings;
  return authToken ? DocumentAssetService.transport(serverUrl, () => useSimulationStore.getState().syncSettings.authToken || '') : null;
}

/** Data URL de una imagen guardada en línea o como `asset:sha256:` (de este equipo o del servidor); `null` si no hay. */
export async function resolveAssetImage(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!isAssetRef(value)) return value;
  const content = await DocumentAssetService.content(sessionTransport(), value);
  return content && content.startsWith('data:image/') ? content : null;
}

/**
 * La imagen lista para dibujar: en línea, al instante; una referencia, cuando llega (mientras tanto, `null` y la hoja
 * muestra su alternativa, p. ej. el nombre del emisor). Solo estado local: nunca escribe en el store.
 */
export function useAssetImage(value: string | null | undefined): string | null {
  const immediate = !value ? null : isAssetRef(value) ? cachedAssetContent(value) ?? null : value;
  const [resolved, setResolved] = useState<{ value: string | null | undefined; image: string | null }>({ value, image: immediate });
  useEffect(() => {
    if (!value || !isAssetRef(value) || cachedAssetContent(value)) return;
    let cancelled = false;
    void resolveAssetImage(value).then((image) => { if (!cancelled) setResolved({ value, image }); });
    return () => { cancelled = true; };
  }, [value]);
  return immediate ?? (resolved.value === value ? resolved.image : null);
}

/** Bytes de los adjuntos de una cotización con el almacenamiento de este equipo y la sesión activa. */
export function quotationAttachmentResolver(quotationId: string) {
  return (attachment: QuotationAttachment) => resolveAttachmentBytes(attachment, {
    local: (id) => PDFAttachmentStorage.getAttachment(id),
    save: (id, fileName, bytes) => PDFAttachmentStorage.saveAttachment(id, quotationId, fileName, bytes),
    documentAssetBytes: (ref) => DocumentAssetService.fileBytes(sessionTransport(), ref),
    equipmentAsset: (assetId) => loadEquipmentAssetBlob(currentPreviewSession(), assetId),
  });
}
