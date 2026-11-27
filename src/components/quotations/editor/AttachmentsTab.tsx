import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileStack, FileSymlink, RefreshCw, Trash2, Upload } from 'lucide-react';
import { QUOTATION_LIMITS } from '../../../../shared/quotations';
import type { QuotationAttachment, QuotationContent } from '../../../types/quotation';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { addAttachments, moveAttachmentAmong, removeAttachment, sourceDocuments, updateAttachment } from '../../../domain/quotationEdit';
import { attachmentAvailability } from '../../../features/quotations/proposalDocuments';
import { useLocalAttachmentPresence } from '../../../features/quotations/attachmentPresence';
import type { SourceDocumentsResult } from '../../../features/quotations/editorActions';
import {
  ATTACHMENT_ACCEPT, attachmentBytesUnused, catalogDatasheetCandidates, downloadAttachmentBytes, formatFileSize, pageCountLabel, prepareAttachmentFile,
} from '../../../features/quotations/attachments';
import { quotationAttachmentResolver } from '../../../features/quotations/assetImages';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { attachmentCopiesSettled } from '../../../store/sync/attachmentCopies';
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
  /** Con sesión: los documentos con referencia se pueden descargar del servidor para incluirlos en el PDF. */
  online?: boolean;
  /** Grupo «De la propuesta …» (con propuesta de origen enlazada). */
  sourceGroup?: SourceGroupProps;
}

export interface SourceGroupProps {
  /** Nombre visible de la propuesta (o el aviso si ya no está disponible). */
  name: string;
  /** La propuesta está en este espacio y fuera de la papelera: se puede actualizar desde ella. */
  available: boolean;
  /** Documentos de la propuesta que «Actualizar» añadiría. */
  pending: number;
  /** Anexos de la propuesta sin referencia reutilizable (solo en el equipo donde se subieron): no pasan. */
  omitted: number;
  refresh: () => SourceDocumentsResult;
  remove: (attachmentId: string) => string | null;
}

const ORIGIN_LABELS: Record<QuotationAttachment['origin'], string> = {
  manual: 'Subido desde el equipo',
  catalog: 'Catálogo de equipos',
  proposal: 'Desde la propuesta',
};

const kindLabel = (attachment: QuotationAttachment) => (/\.(png|jpe?g|webp)$/i.test(attachment.fileName) ? 'IMG' : 'PDF');

/** Pestaña «Adjuntos»: documentos que se fusionan al PDF (`include`) o solo quedan enlazados (`related`). */
export const AttachmentsTab: React.FC<AttachmentsTabProps> = ({ quotationId, content, readOnly, edit, catalog, online = false, sourceGroup }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { attachments } = content;
  // Rechazos definitivos del servidor en la última publicación (p. ej. 415): se dice qué hacer junto al adjunto.
  const issues = useSimulationStore((s) => s.quotationAssetIssues[quotationId]);
  const issueOf = (id: string) => issues?.find((issue) => issue.attachmentId === id)?.message;
  // Los de la propuesta enlazada van en su propio grupo; el resto (subidos y fichas del catálogo), en la lista general.
  const grouped = sourceGroup ? sourceDocuments(content) : [];
  const groupIds = grouped.map((a) => a.id);
  const others = attachments.filter((a) => !groupIds.includes(a.id));
  const otherIds = others.map((a) => a.id);
  const included = others.filter((a) => a.mode === 'include').length;
  const groupIncluded = grouped.filter((a) => a.mode === 'include').length;
  const localBytes = useLocalAttachmentPresence(groupIds);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
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
  const refresh = () => {
    if (!sourceGroup) return;
    const result = sourceGroup.refresh();
    setError(result.error);
    setRefreshNotice(result.error ? null : [
      result.added ? `Se ${result.added === 1 ? 'agregó 1 documento' : `agregaron ${result.added} documentos`} de la propuesta.` : 'No hay documentos nuevos en la propuesta.',
      result.overflow ? `${result.overflow === 1 ? '1 documento no cupo' : `${result.overflow} documentos no cupieron`} (máximo ${QUOTATION_LIMITS.maxAttachments} adjuntos).` : '',
    ].filter(Boolean).join(' '));
  };
  const remove = (attachment: QuotationAttachment) => {
    // Uno de la propuesta se recuerda como quitado: «Actualizar desde la propuesta» no lo vuelve a traer.
    const failure = sourceGroup && groupIds.includes(attachment.id) ? sourceGroup.remove(attachment.id) : edit((c) => removeAttachment(c, attachment.id));
    setError(failure);
    // Una duplicación puede estar copiando estos bytes: se espera a que termine antes de decidir si se borran.
    if (!failure)
      void attachmentCopiesSettled(attachment.id).then(() => {
        if (attachmentBytesUnused(useSimulationStore.getState().quotations, attachment)) void PDFAttachmentStorage.deleteAttachment(attachment.id);
      });
  };

  const row = (attachment: QuotationAttachment, index: number, list: readonly QuotationAttachment[], memberIds: readonly string[], noun: string) => {
    const name = `${noun} ${index + 1}`;
    // Solo los de la propuesta pueden no tener sus bytes aquí (vienen como referencia); el resto se subió o está en el catálogo.
    const availability = memberIds === groupIds ? attachmentAvailability(attachment, { online, local: localBytes.has(attachment.id) }) : { includable: true as const };
    return (
      <li key={attachment.id} className="qe-attachment">
        <div className="qe-attachment-top">
          <span className="qe-attachment-kind" aria-hidden="true">{kindLabel(attachment)}</span>
          <TextField
            label={`Título del ${name}`}
            hideLabel
            value={attachment.title}
            readOnly={readOnly}
            maxLength={QUOTATION_LIMITS.label}
            className="qe-attachment-title"
            onCommit={(title) => edit((c) => updateAttachment(c, attachment.id, { title }))}
          />
          <button type="button" className="qe-icon-btn" aria-label={`Descargar ${name}`} disabled={downloading === attachment.id} aria-busy={downloading === attachment.id} onClick={() => void download(attachment)}><Download className="h-4 w-4" aria-hidden="true" /></button>
          {!readOnly && (
            <div className="qe-line-actions">
              <button type="button" className="qe-icon-btn" aria-label={`Subir ${name}`} disabled={index === 0} onClick={() => setError(edit((c) => moveAttachmentAmong(c, attachment.id, -1, memberIds)))}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className="qe-icon-btn" aria-label={`Bajar ${name}`} disabled={index === list.length - 1} onClick={() => setError(edit((c) => moveAttachmentAmong(c, attachment.id, 1, memberIds)))}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className="qe-icon-btn qe-danger" aria-label={`Quitar ${name}`} onClick={() => remove(attachment)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          )}
        </div>
        <p className="qe-attachment-meta">
          {[ORIGIN_LABELS[attachment.origin], pageCountLabel(attachment.pageCount), formatFileSize(attachment.fileSize), attachment.fileName].filter(Boolean).join(' · ')}
        </p>
        {issueOf(attachment.id) && <p className="qe-field-error" role="note">{issueOf(attachment.id)}</p>}
        <div className="qe-attachment-use">
          <div className="qe-segmented" role="group" aria-label={`Uso del ${name}`}>
            <button type="button" aria-pressed={attachment.mode === 'include'} disabled={readOnly || (!availability.includable && attachment.mode !== 'include')} onClick={() => setError(edit((c) => updateAttachment(c, attachment.id, { mode: 'include' })))}>Incluir en el PDF</button>
            <button type="button" aria-pressed={attachment.mode === 'related'} disabled={readOnly} onClick={() => setError(edit((c) => updateAttachment(c, attachment.id, { mode: 'related' })))}>Solo relacionado</button>
          </div>
          {!availability.includable && (
            <InfoTip label={`Por qué no se puede incluir el ${name}`} text={attachment.mode === 'include' ? `${availability.reason} Si no llega al exportar, el PDF sale sin él y se avisa.` : availability.reason} />
          )}
        </div>
      </li>
    );
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

      {sourceGroup && (
        <section className="qe-card qe-source-docs" aria-labelledby="qe-source-docs-title">
          <div className="qe-card-head">
            <h2 id="qe-source-docs-title"><FileSymlink className="h-4 w-4" aria-hidden="true" />De la propuesta {sourceGroup.name}</h2>
            <span className="qe-muted">{grouped.length ? `${grouped.length} · ${groupIncluded} se incluyen en el PDF` : 'Ninguno'}</span>
          </div>
          {!readOnly && sourceGroup.available && (
            <div className="qe-actions qe-source-docs-actions">
              <button type="button" className="qe-btn qe-btn-sm" disabled={!sourceGroup.pending || full} onClick={refresh}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar desde la propuesta{sourceGroup.pending ? ` (${sourceGroup.pending})` : ''}
              </button>
              <InfoTip
                label="Qué trae «Actualizar desde la propuesta»"
                text="Añade los documentos de la propuesta que aún no están aquí, como «Solo relacionado». Los que quitaste no vuelven, y la propuesta no se modifica."
              />
            </div>
          )}
          {refreshNotice && <p className="qe-field-hint" role="status">{refreshNotice}</p>}
          {!grouped.length && <p className="qe-muted">{sourceGroup.available ? 'La propuesta no tiene documentos que se puedan enlazar, o los quitaste de esta cotización.' : 'Sin documentos de la propuesta.'}</p>}
          {sourceGroup.omitted > 0 && (
            <p className="qe-field-hint qe-source-docs-omitted">
              {sourceGroup.omitted === 1 ? '1 anexo de la propuesta no se puede enlazar' : `${sourceGroup.omitted} anexos de la propuesta no se pueden enlazar`}
              <InfoTip label="Por qué hay anexos que no pasan" text="Están solo en el equipo donde se subieron a la propuesta, sin un archivo guardado que la cotización pueda referenciar. Publica la propuesta con sesión o súbelos aquí desde el equipo." />
            </p>
          )}
          <ul className="qe-attachments">{grouped.map((attachment, index) => row(attachment, index, grouped, groupIds, 'documento de la propuesta'))}</ul>
        </section>
      )}

      <section className="qe-card" aria-labelledby="qe-attachments-title">
        <div className="qe-card-head">
          <h2 id="qe-attachments-title">{sourceGroup ? 'Otros documentos' : 'Documentos de esta cotización'}</h2>
          <span className="qe-muted">{others.length ? `${others.length} · ${included} se incluyen en el PDF` : 'Ninguno'}</span>
        </div>
        {!others.length && <p className="qe-muted">Las fichas técnicas, planos o fotos que agregues se añaden al final del PDF o quedan solo como relacionados.</p>}
        <ul className="qe-attachments">{others.map((attachment, index) => row(attachment, index, others, otherIds, 'adjunto'))}</ul>
        {full && <p className="qe-field-hint">Se alcanzó el máximo de {QUOTATION_LIMITS.maxAttachments} adjuntos.</p>}
      </section>
      {error && <p className="qe-field-error" role="alert">{error}</p>}
    </>
  );
};
