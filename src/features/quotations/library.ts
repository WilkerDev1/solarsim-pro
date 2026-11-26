import { defaultQuotationSignature, defaultQuotationTemplate, type QuotationDesign } from '../../../shared/quotations';
import type { QuotationSignature, QuotationTemplate } from '../../types/quotationLibrary';

/**
 * Firma que imprime una cotización: la elegida en su diseño (`signatureId`) o, sin elección o si ya no existe, la
 * predeterminada. Con `showSignature` apagado, ninguna. La imagen puede ser una referencia: la resuelve quien dibuja.
 */
export function quotationSignatureFor(design: QuotationDesign, signatures: readonly QuotationSignature[]): QuotationSignature | null {
  if (!design.showSignature) return null;
  const chosen = design.signatureId ? signatures.find((s) => s.id === design.signatureId && s.kind === 'signature') : undefined;
  return chosen ?? defaultQuotationSignature(signatures, 'signature') ?? null;
}

/**
 * Sello que imprime una cotización con `showStamp`: el predeterminado de la organización (p. ej. el logo de Electsun
 * importado como sello) o, si no hay, el del membrete que la emitió (`stampForIssuer`).
 */
export function quotationStampFor(design: QuotationDesign, signatures: readonly QuotationSignature[], issuerSeal: string | null): string | null {
  if (!design.showStamp) return null;
  return defaultQuotationSignature(signatures, 'stamp')?.image ?? issuerSeal ?? null;
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
