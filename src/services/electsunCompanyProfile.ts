import type { CompanyProfile } from '../types';
import { ELECTSUN_LOGO_COLOR_BASE64, ELECTSUN_EMBLEM_WATERMARK_BASE64 } from '../assets/electsunLogo';

/** Reviewed repository identity. Apply explicitly to a verified organization; never by matching a name. */
export const ELECTSUN_COMPANY_PROFILE: Partial<CompanyProfile> = {
  name: 'Electsun Dominicana S.R.L.',
  commercialName: 'ELECTSUN',
  rncOrId: '', // The repository's sample RNC is not verified legal data.
  phone: '+1 (809) 378-6590',
  email: 'info@electsun.com.do',
  address: 'Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD',
  website: 'electsun.com.do',
  slogan: 'El sol a tu favor',
  instagram: 'Electsunrd',
  logoBase64: ELECTSUN_LOGO_COLOR_BASE64,
  watermarkLogoBase64: ELECTSUN_EMBLEM_WATERMARK_BASE64,
  primaryColor: '#059669',
  accentColor: '#0284c7',
};
