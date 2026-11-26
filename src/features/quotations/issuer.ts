import { normalizeTaxId } from '../../../shared/clients';
import { QUOTATION_LIMITS } from '../../../shared/quotations';
import type { CompanyProfile } from '../../types/companyProfile';
import type { QuotationIssuer } from '../../types/quotation';

/** RNC de ejemplo de los perfiles antiguos: nunca se copia a un documento (mismo criterio que las propuestas). */
const EXAMPLE_RNC = '1-31-12345-6';

/** Comienzo del mensaje de `validateQuotationContent` ante un logo que la cotización no admite (SVG, demasiado grande…). */
export const LOGO_REJECTED = 'El logo del emisor';

export const EMPTY_QUOTATION_ISSUER: QuotationIssuer = { name: '', taxId: '', address: '', phone: '', email: '', website: '', logo: '' };

const clip = (value: string | undefined, max: number) => (value ?? '').trim().slice(0, max);

/**
 * Emisor de una cotización nueva, copiado del membrete (docs/COMPANY_CENTER.md): identidad, contacto y logo tal como
 * los tenga. Cada texto se recorta a su límite de la cotización (`QUOTATION_LIMITS`), así un membrete con un dato muy
 * largo nunca impide crearla. Sin membrete queda vacío; editar el membrete después no reescribe cotizaciones.
 */
export function issuerFromCompany(company: CompanyProfile | null | undefined): QuotationIssuer {
  if (!company) return { ...EMPTY_QUOTATION_ISSUER };
  return {
    name: clip(company.name, QUOTATION_LIMITS.label),
    taxId: company.rncOrId && company.rncOrId !== EXAMPLE_RNC ? clip(company.rncOrId, QUOTATION_LIMITS.taxId) : '',
    address: clip(company.address, QUOTATION_LIMITS.address),
    phone: clip(company.phone, QUOTATION_LIMITS.phone),
    email: clip(company.email, QUOTATION_LIMITS.label),
    website: clip(company.website, QUOTATION_LIMITS.label),
    logo: company.logoBase64 ?? '',
  };
}

const nameKey = (value: string | undefined) =>
  (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim();

/**
 * Membrete que emitió la cotización: el de RNC igual (normalizado) si la cotización tiene RNC; si no, el de nombre
 * igual (normalizado). Sin coincidencia, ninguno: el sello de otra empresa nunca se imprime.
 */
export function companyForIssuer(companies: readonly CompanyProfile[], issuer: Pick<QuotationIssuer, 'name' | 'taxId'>): CompanyProfile | undefined {
  const taxId = normalizeTaxId(issuer.taxId);
  if (taxId) return companies.find((company) => company.rncOrId !== EXAMPLE_RNC && normalizeTaxId(company.rncOrId) === taxId);
  const name = nameKey(issuer.name);
  return name ? companies.find((company) => nameKey(company.name) === name) : undefined;
}

/** Sello del membrete que emitió la cotización, o `null`. */
export function stampForIssuer(companies: readonly CompanyProfile[], issuer: Pick<QuotationIssuer, 'name' | 'taxId'>): string | null {
  return companyForIssuer(companies, issuer)?.signatureSealBase64 || null;
}

/** El membrete que usarían las propuestas nuevas (el activo; si no existe, el primero), sin inventar uno de fábrica. */
export function newDocumentCompany(state: { companies: readonly CompanyProfile[]; activeCompanyId: string }): CompanyProfile | undefined {
  return state.companies.find((c) => c.id === state.activeCompanyId) ?? state.companies[0];
}
