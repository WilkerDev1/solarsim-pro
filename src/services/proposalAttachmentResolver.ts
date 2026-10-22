import type { AttachedPDFDocument } from '../types';
import { PDFAttachmentStorage } from './pdfAttachmentStorage';

/** Locates the bytes of a proposal annex for export. Today only this device's IndexedDB cache is consulted. */
export async function resolveProposalAttachmentBytes(attachment: AttachedPDFDocument): Promise<ArrayBuffer | null> {
  return PDFAttachmentStorage.getAttachment(attachment.id);
}
