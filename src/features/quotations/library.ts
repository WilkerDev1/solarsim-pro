import {
  defaultQuotationSignature, defaultQuotationTemplate, isQuotationContentLocked, selectedQuotationSignature,
  type QuotationContent, type QuotationDesign, type QuotationPrintedSignature,
} from '../../../shared/quotations';
import type { QuotationSignature, QuotationTemplate } from '../../types/quotationLibrary';

/** Firma de la biblioteca que imprimiría un borrador (la elegida o la predeterminada), solo con `showSignature`. */
export function quotationSignatureFor(design: QuotationDesign, signatures: readonly QuotationSignature[]): QuotationSignature | null {
  return selectedQuotationSignature(design, signatures);
}

/**
 * Sello que imprimiría un borrador con `showStamp`: el predeterminado de la organización (p. ej. el logo de Electsun
 * importado como sello) o, si no hay, el del membrete que la emitió (`stampForIssuer`).
 */
export function quotationStampFor(design: QuotationDesign, signatures: readonly QuotationSignature[], issuerSeal: string | null): string | null {
  if (!design.showStamp) return null;
  return defaultQuotationSignature(signatures, 'stamp')?.image ?? issuerSeal ?? null;
}

/**
 * Firma que imprime la cotización. Un borrador sigue la selección en la biblioteca; una bloqueada (emitida, aceptada…)
 * solo su copia fija `design.signature` y, sin copia, ninguna (bajo la raya, el vendedor, como antes de las firmas).
 */
export function printedSignature(content: Pick<QuotationContent, 'status' | 'design'>, signatures: readonly QuotationSignature[]): QuotationPrintedSignature | null {
  if (!content.design.showSignature) return null;
  if (isQuotationContentLocked(content.status)) return content.design.signature ?? null;
  const signer = quotationSignatureFor(content.design, signatures);
  return signer ? { name: signer.name, role: signer.role, image: signer.image } : null;
}

/** Sello que imprime la cotización: en borrador, el de la biblioteca o el del membrete; bloqueada, su copia o el del membrete. */
export function printedStamp(content: Pick<QuotationContent, 'status' | 'design'>, signatures: readonly QuotationSignature[], issuerSeal: string | null): string | null {
  if (!content.design.showStamp) return null;
  if (isQuotationContentLocked(content.status)) return content.design.stampImage || issuerSeal || null;
  return quotationStampFor(content.design, signatures, issuerSeal);
}

/** Plantilla que reciben las cotizaciones nuevas. */
export function newQuotationTemplate(templates: readonly QuotationTemplate[]): QuotationTemplate | undefined {
  return defaultQuotationTemplate(templates);
}

export const ACCENT_SWATCHES: readonly { value: string; label: string }[] = [
  { value: '#087b58', label: 'Verde Electsun' },
  { value: '#1f3fb4', label: 'Azul' },
  { value: '#182230', label: 'Grafito' },
  { value: '#b4541f', label: 'Terracota' },
  { value: '#6d28d9', label: 'Violeta' },
];
