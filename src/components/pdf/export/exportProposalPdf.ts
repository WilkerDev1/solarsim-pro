import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { AttachedPDFDocument } from '../../../types';
import { PDFMergeService } from '../../../services/pdfMergeService';
import { collectAttachmentBuffers, type AttachmentBytesResolver } from './proposalAttachmentCollection';
import { isEditorChrome, stripEditorChrome } from './editorChrome';

export interface ExportProposalPdfOptions {
  pages: HTMLElement[];
  fileName: string;
  attachments: AttachedPDFDocument[];
  resolveAttachmentBytes: AttachmentBytesResolver;
  /** Called when some enabled annexes have no bytes; returning 'cancel' aborts the download. Default: continue. */
  onMissingAttachments?: (missing: AttachedPDFDocument[]) => Promise<'continue' | 'cancel'>;
}

const PDF_WIDTH_MM = 210;
const PDF_HEIGHT_MM = 297;

function createSandbox(): HTMLDivElement {
  // Sandbox contenedor aislado fuera del flujo de scroll e invisible al usuario
  const sandbox = document.createElement('div');
  Object.assign(sandbox.style, {
    position: 'fixed', top: '0px', left: '0px', width: '850px', height: '1202px', overflow: 'hidden',
    zIndex: '-9999', backgroundColor: '#ffffff', pointerEvents: 'none', boxSizing: 'border-box', margin: '0', padding: '0',
  });
  document.body.appendChild(sandbox);
  return sandbox;
}

function preparePageClone(pageEl: HTMLElement): HTMLElement {
  const clone = pageEl.cloneNode(true) as HTMLElement;
  // Defensa adicional al modo 'export' del editor: ningún cromo de edición llega al PDF.
  stripEditorChrome(clone);
  Object.assign(clone.style, {
    width: '850px', height: '1202px', minHeight: '1202px', maxHeight: '1202px', margin: '0', padding: '0',
    boxSizing: 'border-box', overflow: 'hidden', transform: 'none', boxShadow: 'none',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
  });
  return clone;
}

/** Rasterizes each A4 page (html2canvas → jsPDF) and appends enabled annexes with pdf-lib. */
export async function exportProposalPdf(options: ExportProposalPdfOptions): Promise<void> {
  if (!options.pages.length) return;
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const sandbox = createSandbox();
  try {
    for (let i = 0; i < options.pages.length; i++) {
      const clone = preparePageClone(options.pages[i]);
      sandbox.innerHTML = '';
      sandbox.appendChild(clone);
      // Delay para estabilización completa de layout, imágenes y fuentes
      await new Promise((resolve) => setTimeout(resolve, 100));
      const canvas = await html2canvas(clone, {
        scale: 2, useCORS: true, logging: false, allowTaint: true, backgroundColor: '#ffffff',
        width: 850, height: 1202, windowWidth: 850, windowHeight: 1202, x: 0, y: 0, scrollX: 0, scrollY: 0,
        ignoreElements: isEditorChrome,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(imgData, 'JPEG', 0, 0, PDF_WIDTH_MM, PDF_HEIGHT_MM, undefined, 'FAST');
      // Explicitly release canvas pixel buffer from memory
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    if (document.body.contains(sandbox)) document.body.removeChild(sandbox);
  }

  const enabled = options.attachments.filter((att) => att.enabled);
  if (!enabled.length) {
    pdf.save(options.fileName);
    return;
  }
  const { ready, missing } = await collectAttachmentBuffers(enabled, options.resolveAttachmentBytes);
  if (missing.length && options.onMissingAttachments && (await options.onMissingAttachments(missing)) === 'cancel') return;
  if (!ready.length) {
    pdf.save(options.fileName);
    return;
  }
  const mergedBytes = await PDFMergeService.mergeProposalWithAttachments(pdf.output('arraybuffer'), ready);
  PDFMergeService.downloadPdfBytes(mergedBytes, options.fileName);
}
