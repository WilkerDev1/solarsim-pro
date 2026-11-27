/**
 * Documentos de la propuesta enlazada en una cotización (docs/QUOTATION_FROM_PROPOSAL.md#documentos-de-la-propuesta-enlazada).
 * Reutiliza la regla de F7 (`proposalSourceDocuments`: solo anexos activos con una referencia reutilizable, sin copiar
 * binarios) y les da la forma de adjunto de cotización que da `quotationFromProposal`: «Solo relacionado», origen
 * `catalog` o `proposal` y `sourceProjectId`. Puro: no lee el store ni muta la propuesta.
 */
import type { ProjectSimulation } from '../../types';
import type { QuotationAttachment } from '../../types/quotation';
import { proposalSourceDocuments, type OmittedDocument } from './proposalSource';

export function proposalDocumentAttachments(project: ProjectSimulation): { attachments: QuotationAttachment[]; omitted: OmittedDocument[] } {
  const { attachments, omitted } = proposalSourceDocuments(project);
  return {
    attachments: attachments.map((doc) => ({
      ...doc,
      mode: 'related' as const,
      origin: doc.origin === 'catalog' ? ('catalog' as const) : ('proposal' as const),
      sourceProjectId: project.id,
    })),
    omitted,
  };
}

export type AttachmentAvailability = { includable: true } | { includable: false; reason: string };

export const UNAVAILABLE_ATTACHMENT_REASON =
  'Su archivo no está en este equipo y sin sesión no se puede descargar del servidor: queda solo como relacionado. Inicia sesión o ábrelo una vez con conexión para poder incluirlo.';

/**
 * Si los bytes de un adjunto se pueden obtener aquí para fusionarlo al PDF: guardados en este equipo (`local`) o, con
 * sesión, del servidor por su referencia. Sin ninguno de los dos, «Incluir en el PDF» se desactiva (la exportación, de
 * todos modos, omite con aviso lo que no llegue: nunca se rompe).
 */
export function attachmentAvailability(attachment: Pick<QuotationAttachment, 'assetId'>, { online, local }: { online: boolean; local: boolean }): AttachmentAvailability {
  if (local || (online && !!attachment.assetId)) return { includable: true };
  return { includable: false, reason: UNAVAILABLE_ATTACHMENT_REASON };
}
