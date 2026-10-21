import type { AttachedPDFDocument } from '../../../types';

export type AttachmentBytesResolver = (attachment: AttachedPDFDocument) => Promise<ArrayBuffer | null>;

/** Reads the bytes of every enabled annex in document order; unresolved annexes are reported, never thrown. */
export async function collectAttachmentBuffers(
  attachments: AttachedPDFDocument[],
  resolve: AttachmentBytesResolver
): Promise<{ ready: { name: string; buffer: ArrayBuffer }[]; missing: AttachedPDFDocument[] }> {
  const ready: { name: string; buffer: ArrayBuffer }[] = [];
  const missing: AttachedPDFDocument[] = [];
  for (const attachment of attachments) {
    if (!attachment.enabled) continue;
    const buffer = await resolve(attachment).catch(() => null);
    if (buffer) ready.push({ name: attachment.fileName, buffer });
    else missing.push(attachment);
  }
  return { ready, missing };
}
