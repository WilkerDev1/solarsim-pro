import type { CompanyProfile, DocumentCustomization } from '../types';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../constants/defaultDocumentCustomization';
import { companyDocumentSnapshot } from './companyDocumentSnapshot';

/** Keep reusable document settings, excluding private data from a particular proposal. */
export function reusableDocumentTemplate(customization: DocumentCustomization): DocumentCustomization {
  const { contactName, clientPhone, clientEmail, quoteDate, attachedPdfs, extraTocItems, ...template } = customization;
  return structuredClone(template);
}

export function companyDocumentCustomization(
  company: CompanyProfile,
  legacyTemplate: DocumentCustomization,
  templates: Record<string, DocumentCustomization>,
): DocumentCustomization {
  // Once company-scoped templates exist, the compatibility mirror is never another
  // company's fallback. Older global templates retain their reusable text settings.
  const base = Object.keys(templates).length ? DEFAULT_DOCUMENT_CUSTOMIZATION : legacyTemplate;
  return {
    ...DEFAULT_DOCUMENT_CUSTOMIZATION,
    ...reusableDocumentTemplate(base),
    ...companyDocumentSnapshot(company, base),
    ...reusableDocumentTemplate(templates[company.id] || {}),
  };
}
