import type { DocumentTextContext } from './context';
import { getDocumentTextDefinition } from './registry';
import { resolveDocumentText, type DocumentTextClient, type DocumentTextSource } from './resolve';

/**
 * Propuesta web: el Worker solo acepta textos como strings en `customization`, así que cada texto del
 * documento que el visor muestra se publica ya resuelto (valor guardado, sincronizado con los números
 * de la simulación y con los marcadores sustituidos) bajo la clave `doc:<clave del registro>`.
 */
export const DOC_TEXT_PREFIX = 'doc:';

/** Textos del documento que el visor web dibuja. */
export const VIEWER_TEXT_KEYS: readonly string[] = [
  'aboutUs.intro',
  'aboutUs.transition',
  'aboutUs.whyChooseUs',
  'benefits.ley5707Intro',
  'techIntro.whatIs',
  'techIntro.howItWorks1',
  'techIntro.howItWorks2',
  'projectDescription.subtitle',
  'projectDescription.paragraph1',
  'projectDescription.paragraph2',
  'projectDescription.regulatoryNote',
  'quotation.warranty.panel',
  'quotation.warranty.inverter',
  'quotation.warranty.battery',
  'quotation.warranty.workmanship',
  'quotation.servicesIncluded',
  'quotation.validityNote',
];

export const docTextKey = (key: string) => `${DOC_TEXT_PREFIX}${key}`;
export const isDocTextKey = (value: string) => /^doc:[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(value) && value.length <= 80;

/** Entradas `doc:<clave>` para publicar: solo los textos personalizados que el visor muestra. */
export function publishedDocumentTexts(source: DocumentTextSource, ctx: DocumentTextContext): Record<string, string> {
  const published: Record<string, string> = {};
  for (const key of VIEWER_TEXT_KEYS) {
    const resolved = resolveDocumentText(key, source, ctx);
    if (resolved.isCustomized && resolved.text.trim()) published[docTextKey(key)] = resolved.text;
  }
  return published;
}

/**
 * Texto para el visor: primero el publicado (`doc:`), luego el campo heredado de enlaces anteriores y
 * por último el texto por defecto compartido. Los enlaces antiguos siguen renderizándose igual.
 */
export function viewerText(
  key: string,
  customization: Record<string, unknown> | undefined,
  client: DocumentTextClient | undefined,
  ctx: DocumentTextContext,
): string {
  const published = customization?.[docTextKey(key)];
  if (typeof published === 'string' && published.trim()) return published;
  if (!getDocumentTextDefinition(key)) throw new Error(`Texto del documento desconocido: ${key}`);
  return resolveDocumentText(key, { customization: customization as DocumentTextSource['customization'], client }, ctx).text;
}
