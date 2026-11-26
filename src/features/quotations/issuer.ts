import type { CompanyProfile } from '../../types/companyProfile';
import type { QuotationIssuer } from '../../types/quotation';

/** RNC de ejemplo de los perfiles antiguos: nunca se copia a un documento (mismo criterio que las propuestas). */
const EXAMPLE_RNC = '1-31-12345-6';

export const EMPTY_QUOTATION_ISSUER: QuotationIssuer = { name: '', taxId: '', address: '', phone: '', email: '', website: '', logo: '' };

/**
 * Emisor de una cotización nueva, copiado del membrete (docs/COMPANY_CENTER.md): identidad, contacto y logo tal como
 * los tenga. Sin membrete queda vacío; editar el membrete después no reescribe cotizaciones existentes.
 */
export function issuerFromCompany(company: CompanyProfile | null | undefined): QuotationIssuer {
  if (!company) return { ...EMPTY_QUOTATION_ISSUER };
  return {
    name: company.name ?? '',
    taxId: company.rncOrId && company.rncOrId !== EXAMPLE_RNC ? company.rncOrId : '',
    address: company.address ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    website: company.website ?? '',
    logo: company.logoBase64 ?? '',
  };
}

/** El membrete que usarían las propuestas nuevas (el activo; si no existe, el primero), sin inventar uno de fábrica. */
export function newDocumentCompany(state: { companies: readonly CompanyProfile[]; activeCompanyId: string }): CompanyProfile | undefined {
  return state.companies.find((c) => c.id === state.activeCompanyId) ?? state.companies[0];
}
