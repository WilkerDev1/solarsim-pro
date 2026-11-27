import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileStack, Trash2, Upload } from 'lucide-react';
import { QUOTATION_LIMITS } from '../../../../shared/quotations';
import type { QuotationAttachment, QuotationContent } from '../../../types/quotation';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { addAttachments, moveAttachment, removeAttachment, updateAttachment } from '../../../domain/quotationEdit';
import {
  ATTACHMENT_ACCEPT, attachmentBytesUnused, catalogDatasheetCandidates, downloadAttachmentBytes, formatFileSize, pageCountLabel, prepareAttachmentFile,
} from '../../../features/quotations/attachments';
import { quotationAttachmentResolver } from '../../../features/quotations/assetImages';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { PDFAttachmentStorage } from '../../../services/pdfAttachmentStorage';
import { InfoTip } from '../../simulator/params/ui/InfoTip';
import { TextField } from './fields';
import type { Edit } from './ContentSections';

interface AttachmentsTabProps {
  quotationId: string;
  content: QuotationContent;
  readOnly: boolean;
  edit: Edit;
  catalog: readonly SolarEquipmentItem[];
}

const ORIGIN_LABELS: Record<QuotationAttachment['origin'], string> = {
  manual: 'Subido desde el equipo',
  catalog: 'Catálogo de equipos',
  proposal: 'Desde la propuesta',
};

const kindLabel = (attachment: QuotationAttachment) => (/\.(png|jpe?g|webp)$/i.test(attachment.fileName) ? 'IMG' : 'PDF');

/** Pestaña «Adjuntos»: documentos que se fusionan al PDF (`include`) o solo quedan enlazados (`related`). */
export const AttachmentsTab: React.FC<AttachmentsTabProps> = ({ quotationId, content, readOnly, edit, catalog }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { attachments } = content;
  const included = attachments.filter((a) => a.mode === 'include').length;
  const datasheets = catalogDatasheetCandidates(content, catalog, new Date().toISOString());
  const full = attachments.length >= QUOTATION_LIMITS.maxAttachments;

  const [downloading, setDownloading] = useState<string | null>(null);
  const download = async (attachment: QuotationAttachment) => {
    setDownloading(attachment.id);
    const bytes = await quotationAttachmentResolver(quotationId)(attachment);
    setDownloading(null);
    if (!bytes) return setError(`«${attachment.title || attachment.fileName}» no está en este equipo ni se pudo descargar del servidor.`);
    setError(null);
    downloadAttachmentBytes(bytes, attachment);
  };
  const dropDisabled = busy || full;
  const upload = async (files: FileList | File[]) => {
    if (readOnly || dropDisabled || !files.length) return;
    setBusy(true);
    setError(null);
    const errors: string[] = [];
    const ready: QuotationAttachment[] = [];
    for (const file of Array.from(files)) {
      const prepared = await prepareAttachmentFile({ name: file.name, bytes: await file.arrayBuffer() }, { id: `attachment-${crypto.randomUUID()}`, now: new Date().toISOString() });
      if (!prepared.ok) { errors.push(`${file.name}: ${prepared.error}`); continue; }
      // Los bytes quedan en este equipo; al publicar se suben como activo y viajan como referencia.
      await PDFAttachmentStorage.saveAttachment(prepared.attachment.id, quotationId, prepared.attachment.fileName, prepared.bytes);
      ready.push(prepared.attachment);
    }
    const failure = ready.length ? edit((c) => addAttachments(c, ready)) : null;
    if (failure) for (const attachment of ready) void PDFAttachmentStorage.deleteAttachment(attachment.id);
    setError([...errors, ...(failure ? [failure] : [])].join(' ') || null);
    setBusy(false);
  };
  const remove = (attachment: QuotationAttachment) => {
    const failure = edit((c) => removeAttachment(c, attachment.id));
    setError(failure);
    if (!failure && attachmentBytesUnused(useSimulationStore.getState().quotations, attachment)) void PDFAttachmentStorage.deleteAttachment(attachment.id);
  };

  return (
    <>
      {!readOnly && (
        <section className="qe-card" aria-labelledby="qe-add-attachments-title">
          <div className="qe-card-head"><h2 id="qe-add-attachments-title">Agregar documentos</h2></div>
          <div
            className="qe-dropzone"
            data-dragging={(dragging && !dropDisabled) || undefined}
            data-disabled={dropDisabled || undefined}
            aria-disabled={dropDisabled || undefined}
            onDragOver={(event) => { event.preventDefault(); if (!dropDisabled) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
          >
            <Upload className="h-5 w-5" aria-hidden="true" />
            <span>{full ? 'Se alcanzó el máximo de adjuntos' : busy ? 'Leyendo archivos…' : 'Arrastra aquí archivos PDF o imágenes'}</span>
            <span className="qe-field-hint">PDF, PNG, JPEG o WebP de hasta 8 MB.</span>
          </div>
          <div className="qe-actions">
            <input ref={input} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={(event) => { const files = event.target.files; if (files) void upload(files); event.target.value = ''; }} />
            <button type="button" className="qe-btn qe-btn-sm" disabled={busy || full} aria-busy={busy} onClick={() => input.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden="true" />{busy ? 'Leyendo…' : 'Desde el equipo'}
            </button>
            <button type="button" className="qe-btn qe-btn-sm" disabled={!datasheets.length || full} onClick={() => setError(edit((c) => addAttachments(c, datasheets)))}>
              <FileStack className="h-4 w-4" aria-hidden="true" />Fichas del catálogo{datasheets.length ? ` (${datasheets.length})` : ''}
            </button>
            <InfoTip
              label="Qué fichas aparecen"
              text="Las fichas técnicas en PDF de los equipos del catálogo que están en las líneas de esta cotización y aún no están adjuntas."
            />
          </div>
        </section>
      )}

      <section className="qe-card" aria-labelledby="qe-attachments-title">
        <div className="qe-card-head">
          <h2 id="qe-attachments-title">Documentos de esta cotización</h2>
          <span className="qe-muted">{attachments.length ? `${attachments.length} · ${included} se incluyen en el PDF` : 'Ninguno'}</span>
        </div>
        {!attachments.length && <p className="qe-muted">Las fichas técnicas, planos o fotos que agregues se añaden al final del PDF o quedan solo como relacionados.</p>}
        <ul className="qe-attachments">
          {attachments.map((attachment, index) => (
            <li key={attachment.id} className="qe-attachment">
              <div className="qe-attachment-top">
                <span className="qe-attachment-kind" aria-hidden="true">{kindLabel(attachment)}</span>
                <TextField
                  label={`Título del adjunto ${index + 1}`}
                  hideLabel
                  value={attachment.title}
                  readOnly={readOnly}
                  maxLength={QUOTATION_LIMITS.label}
                  className="qe-attachment-title"
                  onCommit={(title) => edit((c) => updateAttachment(c, attachment.id, { title }))}
                />
                <button type="button" className="qe-icon-btn" aria-label={`Descargar adjunto ${index + 1}`} disabled={downloading === attachment.id} aria-busy={downloading === attachment.id} onClick={() => void download(attachment)}><Download className="h-4 w-4" aria-hidden="true" /></button>
                {!readOnly && (
                  <div className="qe-line-actions">
                    <button type="button" className="qe-icon-btn" aria-label={`Subir adjunto ${index + 1}`} disabled={index === 0} onClick={() => setError(edit((c) => moveAttachment(c, attachment.id, -1)))}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" className="qe-icon-btn" aria-label={`Bajar adjunto ${index + 1}`} disabled={index === attachments.length - 1} onClick={() => setError(edit((c) => moveAttachment(c, attachment.id, 1)))}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" className="qe-icon-btn qe-danger" aria-label={`Quitar adjunto ${index + 1}`} onClick={() => remove(attachment)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                )}
              </div>
              <p className="qe-attachment-meta">
                {[ORIGIN_LABELS[attachment.origin], pageCountLabel(attachment.pageCount), formatFileSize(attachment.fileSize), attachment.fileName].filter(Boolean).join(' · ')}
              </p>
              <div className="qe-segmented" role="group" aria-label={`Uso del adjunto ${index + 1}`}>
                <button type="button" aria-pressed={attachment.mode === 'include'} disabled={readOnly} onClick={() => setError(edit((c) => updateAttachment(c, attachment.id, { mode: 'include' })))}>Incluir en el PDF</button>
                <button type="button" aria-pressed={attachment.mode === 'related'} disabled={readOnly} onClick={() => setError(edit((c) => updateAttachment(c, attachment.id, { mode: 'related' })))}>Solo relacionado</button>
              </div>
            </li>
          ))}
        </ul>
        {full && <p className="qe-field-hint">Se alcanzó el máximo de {QUOTATION_LIMITS.maxAttachments} adjuntos.</p>}
      </section>
      {error && <p className="qe-field-error" role="alert">{error}</p>}
    </>
  );
};
