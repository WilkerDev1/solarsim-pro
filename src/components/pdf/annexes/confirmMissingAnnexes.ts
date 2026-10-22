import type { AttachedPDFDocument } from '../../../types';
import { confirmAction } from '../../common/confirmAction';

/** Text of the export confirmation when enabled annexes have no bytes on this device nor on the server. */
export function missingAnnexesConfirmation(missing: Pick<AttachedPDFDocument, 'title' | 'fileName'>[]) {
  const count = missing.length;
  const noun = count === 1 ? 'anexo' : 'anexos';
  return {
    title: count === 1 ? 'Falta 1 anexo' : `Faltan ${count} anexos`,
    message: `No se encontró el archivo de ${count === 1 ? 'este anexo' : 'estos anexos'} en este dispositivo ni en el servidor: ${missing.map((att) => att.title || att.fileName).join(', ')}. Puedes exportar sin ${count === 1 ? 'él' : 'ellos'} o cancelar y volver a adjuntar${count === 1 ? 'lo' : 'los'}.`,
    confirmLabel: `Exportar sin ${count} ${noun}`,
    cancelLabel: 'Cancelar',
  };
}

/** `onMissingAttachments` of exportProposalPdf: asks instead of silently dropping annexes. */
export async function confirmMissingAnnexes(missing: AttachedPDFDocument[]): Promise<'continue' | 'cancel'> {
  return (await confirmAction(missingAnnexesConfirmation(missing))) ? 'continue' : 'cancel';
}
