import { DocumentCustomization } from '../types';
import { DEFAULT_PDF_SECTION_ORDER } from './pdfSections';
import { FACTORY_COMPANY, FACTORY_TEXTS } from '../../shared/documentTexts/factoryTexts';

// Los textos de fábrica viven en shared/documentTexts (los comparten la app y el visor web).
export const DEFAULT_DOCUMENT_CUSTOMIZATION: DocumentCustomization = {
  sectionOrder: [...DEFAULT_PDF_SECTION_ORDER],
  ...FACTORY_COMPANY, // RNC vacío: lo confirma el administrador de la organización.

  contactName: '',
  clientPhone: '',
  clientEmail: '',
  watermarkOpacity: 0.15,
  ...FACTORY_TEXTS,

  projectSummarySubtitle: '',
  customProjectSummaryParagraph1: '',
  customProjectSummaryParagraph2: '',
};
