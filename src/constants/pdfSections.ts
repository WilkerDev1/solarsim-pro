import { DOCUMENT_SECTION_IDS, type DocumentSectionId } from '../../shared/documentTexts/sections';

/** Ids de las secciones internas del PDF; los nombres viven en shared/documentTexts/sections. */
export type PDFSectionId = DocumentSectionId;

export const DEFAULT_PDF_SECTION_ORDER: PDFSectionId[] = [...DOCUMENT_SECTION_IDS];
