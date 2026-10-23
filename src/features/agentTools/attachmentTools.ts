import type { AttachedPDFDocument, ProjectSimulation } from '../../types';
import { applyAnnexPlan, dismissAnnex, planDatasheetAnnexes, unresolvedEquipmentIds, workspaceCatalog } from '../../utils/proposalAnnexes';
import { PDFAttachmentStorage } from '../../services/pdfAttachmentStorage';
import { PDFMergeService } from '../../services/pdfMergeService';
import { detectChatFileType, getChatFile, CHAT_FILE_LIMITS } from '../assistant/chatFiles';
import { findVisibleProject, fingerprint, pickFields, requireEditableProject, store, type NativeHandler, type NativePlan } from './nativeTools';

const FIELDS = ['customization'] as const;

/** Rewrites `customization` of any proposal by id, recording the previous value for undo. */
function customizationPlan(
  proposalId: string,
  title: string,
  changes: NativePlan['changes'],
  edit: (customization: NonNullable<ProjectSimulation['customization']>, project: ProjectSimulation) => Partial<NonNullable<ProjectSimulation['customization']>>,
  afterExecute?: (project: ProjectSimulation) => void,
): NativePlan {
  return {
    title, changes, targetType: 'project',
    execute() {
      const current = requireEditableProject(proposalId);
      const before = pickFields(current, FIELDS);
      store().updateProjectById(current.id, (p) => ({ customization: { ...p.customization, ...edit(p.customization || {}, p) } }));
      const after = store().projects.find((p) => p.id === current.id)!;
      afterExecute?.(after);
      return { targetId: current.id, undo: { before, fields: [...FIELDS], afterFingerprint: fingerprint(pickFields(after, FIELDS)) } };
    },
  };
}

const summary = (a: AttachedPDFDocument) => ({
  id: a.id, title: a.title, fileName: a.fileName, enabled: a.enabled, inTableOfContents: a.addToTableOfContents,
  origin: a.origin || 'manual', pageCount: a.pageCount, catalogItemId: a.catalogItemId,
});

const listAttachments: NativeHandler = (args) => {
  const project = findVisibleProject(args.proposalId);
  return { data: { proposalId: project.id, attachments: (project.customization?.attachedPdfs ?? []).map(summary) } };
};

const syncCatalogDatasheets: NativeHandler = (args) => {
  const project = requireEditableProject(args.proposalId);
  const s = store();
  const catalog = workspaceCatalog(s.equipmentCatalog, s.syncSettings.serverUrl, s.syncSettings.currentUser?.organizationId);
  const preview = applyAnnexPlan(project.customization || {}, planDatasheetAnnexes(project, catalog), new Date().toISOString(), unresolvedEquipmentIds(project, catalog));
  if (!preview.changed) return { data: { status: 'unchanged', attachments: (project.customization?.attachedPdfs ?? []).map(summary) } };
  return {
    data: { status: 'ready' },
    plan: customizationPlan(project.id, `Fichas del catálogo: ${project.client.name}`,
      [{ label: 'Anexos del catálogo', value: `${preview.attachedPdfs.filter((a) => a.origin === 'catalog').length} fichas` }],
      (customization, p) => ({ attachedPdfs: applyAnnexPlan(customization, planDatasheetAnnexes(p, catalog), new Date().toISOString(), unresolvedEquipmentIds(p, catalog)).attachedPdfs })),
  };
};

const setAttachmentEnabled: NativeHandler = (args) => {
  const project = requireEditableProject(args.proposalId);
  const target = project.customization?.attachedPdfs?.find((a) => a.id === args.attachmentId);
  if (!target) throw new Error('Anexo no encontrado. Usa list_proposal_attachments.');
  const patch: Partial<AttachedPDFDocument> = {
    ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {}),
    ...(typeof args.inTableOfContents === 'boolean' ? { addToTableOfContents: args.inTableOfContents } : {}),
    ...(typeof args.title === 'string' && args.title.trim() ? { title: args.title.trim().slice(0, 200) } : {}),
  };
  if (!Object.keys(patch).length) throw new Error('Indica enabled, inTableOfContents o title.');
  return {
    data: { status: 'ready' },
    plan: customizationPlan(project.id, `Anexo «${target.title}»`,
      Object.entries(patch).map(([k, v]) => ({ label: k === 'addToTableOfContents' ? 'En el índice' : k === 'enabled' ? 'Fusionar al exportar' : 'Título', value: String(v) })),
      (customization) => ({ attachedPdfs: (customization.attachedPdfs ?? []).map((a) => (a.id === target.id ? { ...a, ...patch } : a)) })),
  };
};

/** PDF from the chat (fileId) or from an external agent (base64). Pages are counted before planning. */
const attachFile: NativeHandler = async (args) => {
  const project = requireEditableProject(args.proposalId);
  let name: string;
  let bytes: ArrayBuffer;
  if (args.fileId) {
    const file = getChatFile(args.fileId);
    if (!file) throw new Error('Archivo no disponible; vuelve a adjuntarlo en el chat.');
    if (file.mimeType !== 'application/pdf') throw new Error('Solo se anexan PDF a la propuesta.');
    name = file.name;
    bytes = file.bytes;
  } else if (args.contentBase64) {
    const binary = atob(String(args.contentBase64));
    const view = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    bytes = view.buffer;
    name = String(args.fileName || 'documento.pdf');
  } else throw new Error('Indica fileId (archivo del chat) o contentBase64.');
  if (bytes.byteLength > CHAT_FILE_LIMITS.maxBytes) throw new Error('El PDF supera 8 MB.');
  if (detectChatFileType(bytes) !== 'application/pdf') throw new Error('El archivo no es un PDF válido.');
  const pageCount = await PDFMergeService.getPdfPageCount(bytes);
  const id = `att-agent-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
  const title = String(args.title || name.replace(/\.pdf$/i, '')).slice(0, 200);
  const attachment: AttachedPDFDocument = {
    id, origin: 'manual', fileName: name.slice(0, 200), fileSize: bytes.byteLength, pageCount: Math.max(1, pageCount), title,
    subtitle: `Anexo (${pageCount} págs)`, uploadedAt: new Date().toISOString(), enabled: true, addToTableOfContents: false,
  };
  return {
    data: { status: 'ready' },
    plan: customizationPlan(project.id, `Anexar «${title}»`, [{ label: 'Anexo', value: `${title} · ${pageCount} págs` }],
      (customization) => ({ attachedPdfs: [...(customization.attachedPdfs ?? []), attachment] }),
      // Memory cache is filled synchronously; IndexedDB persistence follows in the background.
      (p) => void PDFAttachmentStorage.saveAttachment(id, p.id, attachment.fileName, bytes)),
  };
};

const removeAttachment: NativeHandler = (args) => {
  const project = requireEditableProject(args.proposalId);
  const target = project.customization?.attachedPdfs?.find((a) => a.id === args.attachmentId);
  if (!target) throw new Error('Anexo no encontrado. Usa list_proposal_attachments.');
  return {
    data: { status: 'ready' },
    plan: customizationPlan(project.id, `Quitar anexo «${target.title}»`,
      [{ label: 'Anexo', value: target.origin === 'catalog' ? `${target.title} (no se volverá a añadir automáticamente)` : target.title }],
      (customization) => dismissAnnex(customization, target.id)),
  };
};

export const ATTACHMENT_TOOL_HANDLERS: Record<string, NativeHandler> = {
  list_proposal_attachments: listAttachments,
  sync_catalog_datasheets: syncCatalogDatasheets,
  set_attachment_enabled: setAttachmentEnabled,
  attach_file_to_proposal: attachFile,
  remove_proposal_attachment: removeAttachment,
};
