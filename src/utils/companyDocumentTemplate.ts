import type { CompanyProfile, DocumentCustomization } from '../types';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../constants/defaultDocumentCustomization';
import { companyDocumentSnapshot } from './companyDocumentSnapshot';
import { KNOWN_FACTORY_VALUES, templateTexts } from '../../shared/documentTexts';

/**
 * Keep reusable document settings, excluding private data from a particular proposal.
 * Annex state (files, TOC entries and dismissed datasheet keys) is per proposal: it is also
 * stripped when a template is applied, so templates saved by older versions need no migration.
 */
export function reusableDocumentTemplate(customization: DocumentCustomization): DocumentCustomization {
  const { contactName, clientPhone, clientEmail, quoteDate, attachedPdfs, extraTocItems, dismissedDatasheetKeys, ...template } = customization;
  return structuredClone(templateTexts(template));
}

export function companyDocumentCustomization(
  company: CompanyProfile,
  legacyTemplate: DocumentCustomization,
  templates: Record<string, DocumentCustomization>,
): DocumentCustomization {
  // Once company-scoped templates exist, the compatibility mirror is never another
  // company's fallback. Older global templates retain their reusable text settings.
  const base = Object.keys(templates).length ? DEFAULT_DOCUMENT_CUSTOMIZATION : legacyTemplate;
  const result = {
    ...DEFAULT_DOCUMENT_CUSTOMIZATION,
    ...reusableDocumentTemplate(base),
    ...companyDocumentSnapshot(company, base),
    ...reusableDocumentTemplate(templates[company.id] || {}),
  };
  // Old reusable templates may retain the former factory example. Do not copy
  // that placeholder into a new proposal; existing document snapshots stay intact.
  // Los textos de fábrica no se copian: la propuesta muestra el texto predeterminado (o el dinámico).
  for (const [field, values] of Object.entries(KNOWN_FACTORY_VALUES)) {
    const value = (result as Record<string, unknown>)[field];
    if (typeof value === 'string' && values?.includes(value)) delete (result as Record<string, unknown>)[field];
  }
  if (result.companyRnc === '1-31-12345-6') result.companyRnc = company.rncOrId === '1-31-12345-6' ? '' : company.rncOrId;
  return result;
}
