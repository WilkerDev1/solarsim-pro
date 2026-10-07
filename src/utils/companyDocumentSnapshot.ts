import { DEFAULT_DOCUMENT_CUSTOMIZATION } from "../constants/defaultDocumentCustomization";
import type { CompanyProfile, DocumentCustomization } from "../types";
/** Copy issuer data at creation; later profile edits never rewrite an existing proposal. */
export function companyDocumentSnapshot(
  company: CompanyProfile,
  template?: DocumentCustomization,
): Partial<DocumentCustomization> {
  return {
    companyName: company.name,
    companyPhone: company.phone,
    companyEmail: company.email,
    companyRnc: company.rncOrId,
    companyFooterText: company.address,
    companyWebsite: company.website || "",
    companySlogan:
      template?.companySlogan !== DEFAULT_DOCUMENT_CUSTOMIZATION.companySlogan
        ? template?.companySlogan || ""
        : "",
    coverLogoBase64: company.logoBase64 || "",
    headerLogoBase64: company.logoBase64 || "",
    watermarkLogoBase64: "",
  };
}
