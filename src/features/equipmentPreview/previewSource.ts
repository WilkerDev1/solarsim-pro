import type { SolarEquipmentItem } from '../../types/equipment';

export interface EquipmentPreviewSource {
  assetId: string;
  kind: 'image' | 'datasheet';
}

export type PreviewableEquipment = Pick<SolarEquipmentItem, 'imageAssetIds' | 'datasheetAssetId'>;

/** First catalog image, otherwise the datasheet. Only server assets: external datasheet URLs are never fetched for a preview. */
export function selectEquipmentPreviewSource(item: PreviewableEquipment | null | undefined): EquipmentPreviewSource | null {
  const image = item?.imageAssetIds?.find(Boolean);
  if (image) return { assetId: image, kind: 'image' };
  if (item?.datasheetAssetId) return { assetId: item.datasheetAssetId, kind: 'datasheet' };
  return null;
}

export type SniffedAssetType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Detects the formats the catalog accepts from their magic bytes; anything else (SVG, HTML…) is rejected. */
export function sniffAssetMimeType(bytes: Uint8Array): SniffedAssetType | null {
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}
