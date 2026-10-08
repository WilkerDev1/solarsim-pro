import type { DocumentCustomization } from '../types';
import { ELECTSUN_LOGO_COLOR_BASE64, ELECTSUN_LOGO_WHITE_BASE64 } from '../assets/electsunLogo';

/** Explicit empty logos represent an unbranded issuer. Names never select images. */
export function documentLogo(customization: DocumentCustomization, position: 'cover' | 'header'): string | undefined {
  if (position === 'cover') {
    return customization.coverLogoBase64 || customization.headerLogoBase64 ||
      (customization.coverLogoBase64 === undefined && customization.headerLogoBase64 === undefined
        ? ELECTSUN_LOGO_COLOR_BASE64 : undefined);
  }
  return customization.headerLogoBase64 ||
    (customization.headerLogoBase64 === undefined ? ELECTSUN_LOGO_WHITE_BASE64 : undefined);
}
