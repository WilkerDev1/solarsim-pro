import React, { useState, useRef } from 'react';
import {
  Paperclip,
  UploadCloud,
  FileText,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { ProjectSimulation, DocumentCustomization, AttachedPDFDocument } from '../../../types';
import { PDFMergeService } from '../../../services/pdfMergeService';
import { PDFAttachmentStorage } from '../../../services/pdfAttachmentStorage';
import { useSimulationStore } from '../../../store/useSimulationStore';

interface PDFAttachmentsSectionProps {
  isDark: boolean;
  project?: ProjectSimulation;
  updateDocumentCustomization?: (customization: Partial<DocumentCustomization>) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PDFAttachmentsSection: React.FC<PDFAttachmentsSectionProps> = ({
  isDark,
  project,
  updateDocumentCustomization,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Obtener referencia reactiva directa del store para evitar cualquier desfase por props
  const activeProjectId = useSimulationStore((s) => s.activeProjectId);
  const storeProject = useSimulationStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId) || s.getActiveProject()
  );
  const currentProject = storeProject || project;

  const doUpdateDoc = (partial: Partial<DocumentCustomization>) => {
    useSimulationStore.getState().updateDocumentCustomization(partial);
    if (updateDocumentCustomization) {
      try {
        updateDocumentCustomization(partial);
      } catch (_) {}
    }
  };

  if (!currentProject) {
    return null;
  }

  const attachedPdfs: AttachedPDFDocument[] = currentProject.customization?.attachedPdfs || [];
  const enabledAttachments = attachedPdfs.filter((att) => att.enabled);
  const totalAttachedPages = enabledAttachments.reduce((sum, att) => sum + (att.pageCount || 1), 0);

  const handleProcessFiles = async (files: FileList | File[]) => {
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

      for (const file of pdfFiles) {
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
        await PDFAttachmentStorage.saveAttachment(docId, targetProjId, file.name, fileBuffer);

        newItems.push({
          id: docId,
          fileName: file.name,
          fileSize: file.size,
          pageCount: pageCount > 0 ? pageCount : 1,
          title: cleanName,
          subtitle: `Ficha Técnica / Anexo Oficial (${pageCount} ${pageCount === 1 ? 'pág' : 'págs'})`,
          uploadedAt: new Date().toISOString(),
          enabled: true,
          addToTableOfContents: false, // Por defecto no altera el índice visual del lienzo
        });
      }

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

  const getLatestAttachments = (): AttachedPDFDocument[] => {
    const latestProj = useSimulationStore.getState().projects.find((p) => p.id === currentProject.id) || currentProject;
    return latestProj.customization?.attachedPdfs || [];
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

  const handleRemoveAttachment = async (id: string) => {
    await PDFAttachmentStorage.deleteAttachment(id);
    const list = getLatestAttachments();
    doUpdateDoc({
      attachedPdfs: list.filter((att) => att.id !== id),
    });
  };

  const handlePreviewAttachment = async (id: string, fileName: string) => {
    const buffer = await PDFAttachmentStorage.getAttachment(id);
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
          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
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

      <p className={`text-[11px] leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
        Adjunta fichas técnicas de paneles/inversores, planos o certificados. Se conservarán en el dock y se fusionarán vectorialmente en alta resolución al final de tu propuesta al exportar el PDF.
      </p>

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
          <span className={`text-[10px] block mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Arrastra aquí o haz clic para explorar (.pdf) • Múltiples archivos permitidos
          </span>
        </div>
      </div>

      {/* Resumen de Fusión Activa */}
      {enabledAttachments.length > 0 && (
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
            isDark
              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
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
          {attachedPdfs.map((doc) => (
            <div
              key={doc.id}
              className={`p-3 rounded-xl border transition-all space-y-2 ${
                doc.enabled
                  ? isDark
                    ? 'bg-[#1a1a24] border-[#2e2e3e]'
                    : 'bg-white border-slate-200 shadow-2xs'
                  : isDark
                  ? 'bg-[#14141c]/50 border-zinc-800 opacity-60'
                  : 'bg-slate-100 border-slate-200 opacity-60'
              }`}
            >
              {/* Fila Principal: Icono, Nombre, Badges y Acciones */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={doc.title}
                      onChange={(e) => handleUpdateTitle(doc.id, e.target.value)}
                      placeholder="Título descriptivo del archivo..."
                      className={`text-xs font-bold w-full bg-transparent border-b border-transparent hover:border-zinc-500 focus:border-emerald-500 outline-none transition-colors ${
                        isDark ? 'text-zinc-100' : 'text-slate-900'
                      }`}
                    />
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-[10px] truncate max-w-[130px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        {doc.fileName}
                      </span>
                      <span className="text-[9.5px] font-mono text-zinc-500">•</span>
                      <span className="text-[9.5px] font-mono text-zinc-400 font-semibold">
                        {formatFileSize(doc.fileSize)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Badge de Páginas y Botones de Acción */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md border ${
                      isDark
                        ? 'bg-[#242432] border-[#38384a] text-emerald-400'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}
                  >
                    {doc.pageCount} {doc.pageCount === 1 ? 'pág' : 'págs'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handlePreviewAttachment(doc.id, doc.fileName)}
                    className="p-1 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                    title="Ver o descargar PDF original en pestaña nueva"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(doc.id)}
                    className="p-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors cursor-pointer"
                    title="Eliminar PDF adjunto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Fila de Opciones: Checkboxes de Inclusión */}
              <div className="pt-1.5 border-t border-dashed border-zinc-700/40 flex items-center justify-between text-[10.5px] gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={doc.enabled}
                    onChange={(e) => handleToggleEnabled(doc.id, e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                  />
                  <span className={`font-medium ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    ✓ Fusionar al exportar
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={doc.addToTableOfContents}
                    onChange={(e) => handleToggleAddToToc(doc.id, e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                  />
                  <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>
                    Mostrar en el Índice
                  </span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
