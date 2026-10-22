import React, { useState, useRef } from 'react';
import { Paperclip, UploadCloud, CheckCircle2, AlertCircle, Sparkles, RotateCcw } from 'lucide-react';
import { ProjectSimulation, DocumentCustomization, AttachedPDFDocument } from '../../../types';
import { PDFMergeService } from '../../../services/pdfMergeService';
import { PDFAttachmentStorage } from '../../../services/pdfAttachmentStorage';
import { datasheetFileName, proposalDatasheets } from '../../../utils/proposalDatasheets';
import { fetchEquipmentAsset } from '../../../services/equipmentAssetService';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { dismissAnnex, restoreDismissedAnnexes, workspaceCatalog } from '../../../utils/proposalAnnexes';
import { AnnexCard } from '../annexes/AnnexCard';
import { resolveProposalAttachmentBytes } from '../../../services/proposalAttachmentResolver';

interface PDFAttachmentsSectionProps {
  isDark: boolean;
  project?: ProjectSimulation;
  updateDocumentCustomization?: (customization: Partial<DocumentCustomization>) => void;
}

export const PDFAttachmentsSection: React.FC<PDFAttachmentsSectionProps> = ({
  isDark,
  project,
  updateDocumentCustomization,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [cachedDatasheets, setCachedDatasheets] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedAttIndex, setDraggedAttIndex] = useState<number | null>(null);
  const [dragOverAttIndex, setDragOverAttIndex] = useState<number | null>(null);

  // Obtener referencia reactiva directa del store para evitar cualquier desfase por props
  const activeProjectId = useSimulationStore((s) => s.activeProjectId);
  const catalog = useSimulationStore(s => s.equipmentCatalog);
  const sync = useSimulationStore(s => s.syncSettings);
  const storeProject = useSimulationStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId) || s.getActiveProject()
  );
  const currentProject = storeProject || project;

  const doUpdateDoc = (partial: Partial<DocumentCustomization>) => {
    const live = useSimulationStore.getState();
    if (live.activeProjectId !== currentProject?.id || live.projects.find(p => p.id === currentProject.id)?.isDeleted) return;
    live.updateDocumentCustomization(partial);
    if (updateDocumentCustomization) {
      try {
        updateDocumentCustomization(partial);
      } catch (_) {}
    }
  };

  const getLatestAttachments = (): AttachedPDFDocument[] => {
    if (!currentProject) return [];
    const latestProj = useSimulationStore.getState().projects.find((p) => p.id === currentProject.id) || currentProject;
    return latestProj.customization?.attachedPdfs || [];
  };

  const handleReorderAttachments = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const list = [...getLatestAttachments()];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    doUpdateDoc({ attachedPdfs: list });
  };

  React.useEffect(() => {
    let cancelled = false;
    setCachedDatasheets([]);
    const attachments = currentProject?.customization?.attachedPdfs || [];
    void Promise.all(attachments.filter(att => att.sourceDatasheetKey).map(async att => {
      const bytes = await PDFAttachmentStorage.getAttachment(att.id);
      return bytes ? att.sourceDatasheetKey! : null;
    })).then(keys => { if (!cancelled) setCachedDatasheets(keys.filter((key): key is string => !!key)); });
    return () => { cancelled = true; };
  }, [currentProject?.id, currentProject?.customization?.attachedPdfs]);

  if (!currentProject) {
    return null;
  }

  const attachedPdfs: AttachedPDFDocument[] = currentProject.customization?.attachedPdfs || [];
  const enabledAttachments = attachedPdfs.filter((att) => att.enabled);
  const totalAttachedPages = enabledAttachments.reduce((sum, att) => sum + (att.pageCount || 1), 0);

  // Server-stored datasheets are annexed automatically (ProposalAnnexSync); only external links stay manual.
  const detected = proposalDatasheets(currentProject, workspaceCatalog(catalog, sync.serverUrl, sync.currentUser?.organizationId))
    .filter(source => !source.item.datasheetAssetId && !cachedDatasheets.includes(source.key));
  const dismissedCount = currentProject.customization?.dismissedDatasheetKeys?.length || 0;

  const handleProcessFiles = async (files: FileList | File[], sourceKeys: string[] = []) => {
    const session = useSimulationStore.getState().sessionGeneration;
    const ensureTarget = () => {
      const live = useSimulationStore.getState();
      if (live.sessionGeneration !== session || live.activeProjectId !== currentProject.id ||
          !live.projects.some(p => p.id === currentProject.id && !p.isDeleted))
        throw new Error('La propuesta o sesión cambió. Vuelve a adjuntar en la propuesta elegida.');
    };
    setUploadError(null);
    setFeedbackMsg(null);
    setIsUploading(true);

    const pdfFiles = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) {
      setUploadError('Por favor selecciona únicamente archivos en formato PDF (.pdf).');
      setIsUploading(false);
      return;
    }

    try {
      const newItems: AttachedPDFDocument[] = [];

      for (const [fileIndex, file] of pdfFiles.entries()) {
        const fileBuffer = await file.arrayBuffer();
        // Clonar buffer para que nunca se desvincule al procesarlo
        const bufferCopy = fileBuffer.slice(0);

        let pageCount = 1;
        try {
          pageCount = await PDFMergeService.getPdfPageCount(bufferCopy);
        } catch (pageErr) {
          console.warn('Advertencia leyendo páginas de PDF (usando 1 por defecto):', pageErr);
        }

        const cleanName = file.name
          .replace(/\.pdf$/i, '')
          .replace(/[_-]+/g, ' ')
          .trim();

        const docId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        // Guardar binario en IndexedDB y caché
        const targetProjId = currentProject.id || activeProjectId || 'default-proj';
        ensureTarget();
        await PDFAttachmentStorage.saveAttachment(docId, targetProjId, file.name, fileBuffer);

        newItems.push({
          id: docId,
          sourceDatasheetKey: sourceKeys[fileIndex],
          fileName: file.name,
          fileSize: file.size,
          pageCount: pageCount > 0 ? pageCount : 1,
          title: cleanName,
          subtitle: `Ficha Técnica / Anexo Oficial (${pageCount} ${pageCount === 1 ? 'pág' : 'págs'})`,
          uploadedAt: new Date().toISOString(),
          enabled: true,
          addToTableOfContents: false, // Por defecto no altera el índice visual del lienzo
          origin: 'manual',
        });
      }

      ensureTarget();
      // Tomar la lista más fresca directamente del store para no sobrescribir nada
      const latestProj = useSimulationStore.getState().projects.find((p) => p.id === currentProject.id) || currentProject;
      const currentList = latestProj.customization?.attachedPdfs || [];
      const updatedList = [...currentList, ...newItems];

      doUpdateDoc({
        attachedPdfs: updatedList,
      });

      setFeedbackMsg(`✓ ¡${newItems.length} archivo(s) PDF adjuntado(s) exitosamente! Listo para fusionar al exportar.`);
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err: any) {
      console.error('Error procesando archivos PDF adjuntos:', err);
      setUploadError(err.message || 'Ocurrió un error al leer y procesar los archivos PDF.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


  const handleAddCatalogDatasheet = async (source: typeof detected[number]) => {
    if (isUploading) return;
    const live = useSimulationStore.getState();
    const session = live.sessionGeneration;
    const target = currentProject.id;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setIsUploading(true);
    setUploadError(null);
    try {
      const blob = source.item.datasheetAssetId
        ? await fetchEquipmentAsset(sync.serverUrl, sync.authToken || '', source.item.datasheetAssetId, controller.signal)
        : await (async () => {
            const url = new URL(source.item.datasheetUrl!);
            if (url.protocol !== 'https:') throw new Error('La ficha debe tener un enlace HTTPS.');
            const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit' });
            if (!response.ok) throw new Error(`No se pudo descargar la ficha (HTTP ${response.status}).`);
            return response.blob();
          })();
      const now = useSimulationStore.getState();
      if (now.sessionGeneration !== session || now.activeProjectId !== target) throw new Error('La propuesta o sesión cambió.');
      if (blob.size > 8 * 1024 * 1024 || !blob.size) throw new Error('La ficha está vacía o supera 8 MB.');
      if (!(await blob.slice(0, 5).text()).startsWith('%PDF-')) throw new Error('El documento vinculado no es un PDF. Adjunta una ficha PDF.');
      const bytes = await blob.arrayBuffer();
      const latest = useSimulationStore.getState();
      const proposal = latest.projects.find(p => p.id === target && !p.isDeleted);
      if (latest.sessionGeneration !== session || latest.activeProjectId !== target || !proposal ||
          !proposalDatasheets(proposal, latest.equipmentCatalog).some(candidate => candidate.key === source.key && candidate.item.id === source.item.id))
        throw new Error('La propuesta, el equipo o la sesión cambió. Revisa sus fichas y vuelve a intentar.');
      const existing = proposal.customization?.attachedPdfs?.find(att => att.sourceDatasheetKey === source.key);
      if (existing) {
        await PDFAttachmentStorage.saveAttachment(existing.id, target, existing.fileName, bytes);
        if (useSimulationStore.getState().sessionGeneration !== session || useSimulationStore.getState().activeProjectId !== target || !useSimulationStore.getState().projects.find(p => p.id === target)?.customization?.attachedPdfs?.some(att => att.id === existing.id && att.sourceDatasheetKey === source.key)) return;
        setCachedDatasheets(keys => [...keys, source.key]);
        setFeedbackMsg('Ficha recuperada en este dispositivo, sin duplicar el anexo.');
        return;
      }
      await handleProcessFiles([new File([blob], datasheetFileName(source.item.displayName), { type: 'application/pdf' })], [source.key]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'No se pudo adjuntar la ficha del catálogo.');
    } finally {
      clearTimeout(timeout);
      setIsUploading(false);
    }
  };

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    const list = getLatestAttachments();
    doUpdateDoc({
      attachedPdfs: list.map((att) => (att.id === id ? { ...att, enabled } : att)),
    });
  };

  const handleToggleAddToToc = (id: string, addToTableOfContents: boolean) => {
    const list = getLatestAttachments();
    doUpdateDoc({
      attachedPdfs: list.map((att) => (att.id === id ? { ...att, addToTableOfContents } : att)),
    });
  };

  const handleUpdateTitle = (id: string, title: string) => {
    const list = getLatestAttachments();
    doUpdateDoc({
      attachedPdfs: list.map((att) => (att.id === id ? { ...att, title } : att)),
    });
  };

  const handleUpdateSubtitle = (id: string, subtitle: string) => {
    const list = getLatestAttachments();
    doUpdateDoc({
      attachedPdfs: list.map((att) => (att.id === id ? { ...att, subtitle } : att)),
    });
  };

  // Removing an automatic datasheet dismisses it, so the sync does not attach it again.
  const handleRemoveAttachment = async (id: string) => {
    await PDFAttachmentStorage.deleteAttachment(id);
    const latest = useSimulationStore.getState().projects.find((p) => p.id === currentProject.id) || currentProject;
    doUpdateDoc(dismissAnnex(latest.customization || {}, id));
  };

  const handleRestoreDatasheets = () => doUpdateDoc(restoreDismissedAnnexes());

  const handlePreviewAttachment = async (id: string, fileName: string) => {
    // Same lookup as the export: local bytes, then the preview cache, then the server (automatic annexes
    // synced from another device have no local copy yet).
    const annex = getLatestAttachments().find((att) => att.id === id);
    const buffer = annex ? await resolveProposalAttachmentBytes(annex) : await PDFAttachmentStorage.getAttachment(id);
    if (!buffer) {
      alert(`No se encontró el archivo binario de "${fileName}" en memoria local.`);
      return;
    }
    PDFMergeService.previewPdfBytes(buffer);
  };

  return (
    <div className="space-y-3">
      {/* Encabezado de la Sección */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-emerald-500 shrink-0" />
          <h3 className={`text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300`}>
            4. Fusión de PDFs Externos & Datasheets
          </h3>
        </div>
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
            attachedPdfs.length > 0
              ? isDark
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : isDark
              ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}
        >
          {attachedPdfs.length} {attachedPdfs.length === 1 ? 'Archivo' : 'Archivos'}
        </span>
      </div>

      <p className={`text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400`}>
        Las fichas técnicas del catálogo de los equipos de esta propuesta se anexan solas (insignia «Automática»). Adjunta aquí planos, certificados u otros PDF: se fusionan al final de la propuesta al exportar.
      </p>

      {detected.length > 0 && (
        <div className="space-y-2 rounded-lg border border-emerald-500/40 p-3">
          <p className="text-xs font-semibold">Fichas del catálogo para esta propuesta</p>
          {detected.map(source => <button key={source.key} type="button" disabled={isUploading || currentProject.isDeleted}
            onClick={() => void handleAddCatalogDatasheet(source)}
            className="block w-full rounded border border-emerald-500/40 px-2 py-2 text-left text-xs disabled:opacity-50">
            {attachedPdfs.some(att => att.sourceDatasheetKey === source.key) ? '↻ Recuperar' : '+ Adjuntar'} {datasheetFileName(source.item.displayName)}
          </button>)}
          <p className="text-[11px] opacity-70">Se descargan una vez y quedan disponibles como anexos en este dispositivo.</p>
        </div>
      )}
      {dismissedCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-600 dark:border-zinc-700 dark:text-zinc-300">
          <span>{dismissedCount === 1 ? '1 ficha automática retirada' : `${dismissedCount} fichas automáticas retiradas`} de esta propuesta.</span>
          <button type="button" disabled={currentProject.isDeleted} onClick={handleRestoreDatasheets}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-300">
            <RotateCcw className="h-3 w-3" />Restaurar fichas
          </button>
        </div>
      )}
      {/* Feedback de Éxito Instantáneo */}
      {feedbackMsg && (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-zinc-400 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Mensaje de Error */}
      {uploadError && (
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError(null)} className="text-zinc-400 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Zona de Carga / Dropzone */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf,application/x-pdf"
        multiple
        className="hidden"
        onClick={(e) => {
          (e.target as HTMLInputElement).value = '';
        }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleProcessFiles(e.target.files);
          }
        }}
      />

      <div
        onClick={() => {
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          fileInputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleProcessFiles(e.dataTransfer.files);
          }
        }}
        className={`p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-2 ${
          isDragOver
            ? 'border-emerald-500 bg-emerald-500/10'
            : isDark
            ? 'border-zinc-700 hover:border-emerald-500/60 bg-[#161622] hover:bg-[#1c1c2b]'
            : 'border-slate-300 hover:border-emerald-500/60 bg-slate-50 hover:bg-emerald-50/30'
        }`}
      >
        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <UploadCloud className="w-5 h-5" />
        </div>
        <div>
          <span className="text-xs font-bold block text-emerald-400">
            {isUploading ? 'Procesando e inspeccionando PDF...' : '+ Adjuntar Ficha Técnica o PDF Externo'}
          </span>
          <span className={`text-[10px] block mt-0.5 text-slate-500 dark:text-zinc-400`}>
            Arrastra aquí o haz clic para explorar (.pdf) • Múltiples archivos permitidos
          </span>
        </div>
      </div>

      {/* Resumen de Fusión Activa */}
      {enabledAttachments.length > 0 && (
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-300`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span className="text-[10.5px] font-semibold truncate">
              Fusión activada: <strong>{enabledAttachments.length} docs</strong> ({totalAttachedPages} págs extras)
            </span>
          </div>
          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0">
            Auto-Merge al Exportar
          </span>
        </div>
      )}

      {/* Lista de Documentos PDF Adjuntos */}
      {attachedPdfs.length > 0 && (
        <div className="space-y-2.5 pt-1">
          {attachedPdfs.map((doc, idx) => (
            <AnnexCard
              key={doc.id}
              doc={doc}
              idx={idx}
              isDark={isDark}
              draggedAttIndex={draggedAttIndex}
              dragOverAttIndex={dragOverAttIndex}
              setDraggedAttIndex={setDraggedAttIndex}
              setDragOverAttIndex={setDragOverAttIndex}
              handleReorderAttachments={handleReorderAttachments}
              handleUpdateTitle={handleUpdateTitle}
              handlePreviewAttachment={handlePreviewAttachment}
              handleRemoveAttachment={handleRemoveAttachment}
              handleToggleEnabled={handleToggleEnabled}
              handleToggleAddToToc={handleToggleAddToToc}
            />
          ))}
        </div>
      )}
    </div>
  );
};
