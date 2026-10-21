import type { DocumentTextContext } from './context';
import { FACTORY_COMPANY, FACTORY_TEXTS, KNOWN_FACTORY_VALUES } from './factoryTexts';
import {
  isPlaceholderPhone,
  projectSummaryParagraph1Default,
  projectSummaryParagraph2Default,
  regulatoryNoteDefault,
  syncProjectSummaryParagraph1,
  syncProjectSummaryParagraph2,
  validityNoteDefault,
} from './dynamicTexts';
import type { DocumentSectionId } from './sections';

export type DocumentTextFormat = 'plain' | 'rich';
export type DocumentTextSection = DocumentSectionId | 'company' | 'client' | 'header' | 'footer';

/** Campos de `client` que el editor del documento puede escribir. */
export type DocumentClientField = 'name' | 'contactPerson' | 'contactPhone' | 'contactEmail' | 'address' | 'quoteNumber' | 'quoteDate' | 'quoteValidityDays';

/** Lee otro texto ya resuelto (p. ej. el párrafo 2 incluye el alcance de ingeniería). */
export type ResolveOther = (key: string) => string;

export interface DocumentTextDefinition {
  /** Clave estable (la usan el editor, la IA, el visor web y `customization.texts`). */
  key: string;
  section: DocumentTextSection;
  label: string;
  format: DocumentTextFormat;
  multiline: boolean;
  /** Puede guardarse en la plantilla de la empresa (nunca datos de un cliente concreto). */
  templatable: boolean;
  /** Campo heredado de `DocumentCustomization` (compatibilidad con 2.6.x). Sin él, va a `customization.texts[key]`. */
  legacyField?: string;
  /** El valor vive en `project.client` (datos del cliente y de la cotización). */
  clientField?: DocumentClientField;
  /** Al escribir, también se copia en este campo de `client` (contacto, teléfono, correo). */
  mirrorsClientField?: DocumentClientField;
  /** Un valor vacío guardado se muestra vacío (datos de empresa/contacto); si no, vacío = por defecto. */
  emptyIsValue?: boolean;
  /** Se puede «Restablecer» (falso para el nombre del cliente o el número de cotización). */
  resettable?: boolean;
  maxLength: number;
  placeholders?: readonly string[];
  defaultText: string | ((ctx: DocumentTextContext, text: ResolveOther) => string);
  /** Transforma un valor guardado al mostrarlo (sincronizar números, limpiar teléfonos de ejemplo). */
  read?: (stored: string, ctx: DocumentTextContext, text: ResolveOther) => string;
  /** Un valor guardado cuenta como personalizado aunque se muestre igual que el predeterminado (fecha fija). */
  customWhenStored?: boolean;
  /** Valores guardados que equivalen a «sin personalizar». */
  knownFactoryValues?: readonly string[];
}

const SHORT = 300;
const PARAGRAPH = 3000;
const NOTE = 6000;

const legacy = (field: keyof typeof FACTORY_TEXTS) => ({ legacyField: field, knownFactoryValues: KNOWN_FACTORY_VALUES[field] });

const companyDefault = (field: keyof typeof FACTORY_COMPANY, profile: keyof NonNullable<DocumentTextContext['company']>) =>
  (ctx: DocumentTextContext) => ctx.company?.[profile] ?? FACTORY_COMPANY[field];

const company = (key: string, field: keyof typeof FACTORY_COMPANY, profile: keyof NonNullable<DocumentTextContext['company']>, label: string, extra: Partial<DocumentTextDefinition> = {}): DocumentTextDefinition => ({
  key,
  section: 'company',
  label,
  format: 'plain',
  multiline: false,
  templatable: true,
  legacyField: field,
  emptyIsValue: true,
  maxLength: SHORT,
  defaultText: companyDefault(field, profile),
  ...extra,
});

/** El teléfono de ejemplo de versiones antiguas se sustituye por el de fábrica. */
const companyPhone = (phone: string) => (phone.includes('555-0199') || phone.includes('5550199') ? FACTORY_COMPANY.companyPhone : phone);

const transitionPhrase = FACTORY_TEXTS.aboutUsTransitionText;

const DEFINITIONS: DocumentTextDefinition[] = [
  // Empresa emisora (cabecera, pie y portada).
  company('company.name', 'companyName', 'name', 'Nombre de la empresa'),
  company('company.slogan', 'companySlogan', 'slogan', 'Eslogan'),
  company('company.footer', 'companyFooterText', 'footer', 'Dirección (pie de página)', { maxLength: 500 }),
  company('company.phone', 'companyPhone', 'phone', 'Teléfono de la empresa', {
    defaultText: (ctx) => companyPhone(ctx.company?.phone ?? FACTORY_COMPANY.companyPhone),
    read: companyPhone,
  }),
  company('company.email', 'companyEmail', 'email', 'Correo de la empresa'),
  company('company.rnc', 'companyRnc', 'rnc', 'RNC'),
  company('company.website', 'companyWebsite', 'website', 'Sitio web'),
  company('company.instagram', 'companyInstagram', 'instagram', 'Instagram'),

  // Cliente y cotización.
  { key: 'client.name', section: 'client', label: 'Nombre del cliente', format: 'plain', multiline: false, templatable: false, clientField: 'name', resettable: false, maxLength: SHORT, defaultText: 'Cliente' },
  {
    key: 'client.contact', section: 'client', label: 'Contacto (Atención a)', format: 'plain', multiline: false, templatable: false,
    legacyField: 'contactName', mirrorsClientField: 'contactPerson', emptyIsValue: true, maxLength: SHORT,
    defaultText: (ctx) => ctx.clientContactPerson,
  },
  {
    key: 'client.phone', section: 'client', label: 'Teléfono del cliente', format: 'plain', multiline: false, templatable: false,
    legacyField: 'clientPhone', mirrorsClientField: 'contactPhone', emptyIsValue: true, maxLength: SHORT,
    defaultText: (ctx) => (isPlaceholderPhone(ctx.clientPhone) ? '' : ctx.clientPhone),
    read: (stored) => (isPlaceholderPhone(stored) ? '' : stored),
  },
  {
    key: 'client.email', section: 'client', label: 'Correo del cliente', format: 'plain', multiline: false, templatable: false,
    legacyField: 'clientEmail', mirrorsClientField: 'contactEmail', emptyIsValue: true, maxLength: SHORT,
    defaultText: (ctx) => ctx.clientEmail,
  },
  {
    key: 'client.address', section: 'client', label: 'Dirección del cliente', format: 'plain', multiline: false, templatable: false, clientField: 'address', maxLength: 500,
    defaultText: (ctx) => `${ctx.clientProvince || 'Santo Domingo'}, República Dominicana`,
  },
  { key: 'quote.number', section: 'client', label: 'N° de cotización', format: 'plain', multiline: false, templatable: false, clientField: 'quoteNumber', resettable: false, maxLength: 80, defaultText: 'C-0001' },
  {
    key: 'quote.date', section: 'client', label: 'Fecha de emisión', format: 'plain', multiline: false, templatable: false, clientField: 'quoteDate', maxLength: 80,
    placeholders: ['DD/MM/AAAA'],
    defaultText: (ctx) => ctx.currentDateStr,
    customWhenStored: true,
    // La fecha guardada se muestra ya formateada (currentDateStr se calcula a partir de ella).
    read: (_stored, ctx) => ctx.currentDateStr,
  },
  {
    key: 'quote.validityDays', section: 'client', label: 'Días de validez', format: 'plain', multiline: false, templatable: false, clientField: 'quoteValidityDays', maxLength: 4,
    defaultText: '7',
  },

  // 1. Quiénes somos.
  {
    key: 'aboutUs.intro', section: 'aboutUs', label: 'Texto ¿Quiénes Somos?', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('aboutUsIntroText'),
    defaultText: (ctx) => `En ${ctx.companyName.toUpperCase()}, transformamos la energía solar en una solución inteligente, sostenible y accesible para todos. Creemos en un futuro más limpio y eficiente, y estamos aquí para hacerlo posible.`,
  },
  { key: 'aboutUs.transition', section: 'aboutUs', label: 'Texto de transición', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('aboutUsTransitionText'), defaultText: transitionPhrase },
  {
    key: 'aboutUs.whyChooseUs', section: 'aboutUs', label: 'Texto ¿Por Qué Elegirnos?', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('whyChooseUsText'),
    defaultText: (ctx) => FACTORY_TEXTS.whyChooseUsText.replace('ELECTSUN', ctx.companyName.toUpperCase()),
  },

  // 2. Beneficios.
  { key: 'benefits.ley5707Intro', section: 'benefits', label: 'Objetivos Ley 57-07 (intro)', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('ley5707ObjectivesIntroText'), defaultText: FACTORY_TEXTS.ley5707ObjectivesIntroText },

  // 3. Qué es un sistema FV.
  { key: 'techIntro.whatIs', section: 'techIntro', label: '¿Qué es un sistema FV?', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('techIntroWhatIsText'), defaultText: FACTORY_TEXTS.techIntroWhatIsText },
  { key: 'techIntro.howItWorks1', section: 'techIntro', label: '¿Cómo funciona? (párrafo 1)', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('techIntroHowItWorksParagraph1'), defaultText: FACTORY_TEXTS.techIntroHowItWorksParagraph1 },
  { key: 'techIntro.howItWorks2', section: 'techIntro', label: '¿Cómo funciona? (párrafo 2)', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('techIntroHowItWorksParagraph2'), defaultText: FACTORY_TEXTS.techIntroHowItWorksParagraph2 },

  // 4. Descripción del proyecto.
  {
    key: 'projectDescription.subtitle', section: 'projectDescription', label: 'Subtítulo del resumen técnico', format: 'rich', multiline: false, templatable: true, legacyField: 'projectSummarySubtitle', maxLength: SHORT,
    placeholders: ['{clientName}'],
    defaultText: (ctx) => `Criterios de dimensionamiento técnico para ${ctx.clientName}`,
  },
  {
    key: 'projectDescription.paragraph1', section: 'projectDescription', label: 'Párrafo 1 (consumo y producción)', format: 'rich', multiline: true, templatable: true, legacyField: 'customProjectSummaryParagraph1', maxLength: PARAGRAPH,
    placeholders: ['{clientName}', '{panelCount}', '{panelModel}', '{systemCapacityKWp}', '{annualProductionKWh}', '{annualConsumptionKWh}', '{energyCoveragePct}'],
    defaultText: (ctx) => projectSummaryParagraph1Default(ctx),
    read: (stored, ctx) => syncProjectSummaryParagraph1(stored, ctx),
  },
  {
    key: 'projectDescription.engineeringScope', section: 'projectDescription', label: 'Alcance de ingeniería', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('projectEngineeringScopeText'),
    defaultText: FACTORY_TEXTS.projectEngineeringScopeText,
    read: (stored) => stored.trim(),
  },
  {
    key: 'projectDescription.paragraph2', section: 'projectDescription', label: 'Párrafo 2 (equipos y alcance)', format: 'rich', multiline: true, templatable: true, legacyField: 'customProjectSummaryParagraph2', maxLength: PARAGRAPH,
    placeholders: ['{inverterCount}', '{inverterModel}', '{batteryCount}', '{batteryModel}', '{scopeText}'],
    defaultText: (ctx, text) => projectSummaryParagraph2Default(ctx, text('projectDescription.engineeringScope')),
    read: (stored, ctx, text) => syncProjectSummaryParagraph2(stored, ctx, text('projectDescription.engineeringScope')),
  },
  {
    key: 'projectDescription.regulatoryNote', section: 'projectDescription', label: 'Marco regulatorio SIE', format: 'rich', multiline: true, templatable: true, maxLength: NOTE, ...legacy('regulatoryNote'),
    defaultText: (ctx) => regulatoryNoteDefault(ctx),
  },

  // Cotización.
  { key: 'quotation.warranty.panel', section: 'quotation', label: 'Garantía de paneles', format: 'rich', multiline: false, templatable: true, maxLength: SHORT, ...legacy('panelWarrantyText'), defaultText: FACTORY_TEXTS.panelWarrantyText },
  { key: 'quotation.warranty.inverter', section: 'quotation', label: 'Garantía del inversor', format: 'rich', multiline: false, templatable: true, maxLength: SHORT, ...legacy('inverterWarrantyText'), defaultText: FACTORY_TEXTS.inverterWarrantyText },
  { key: 'quotation.warranty.battery', section: 'quotation', label: 'Garantía de baterías', format: 'rich', multiline: false, templatable: true, maxLength: SHORT, ...legacy('batteryWarrantyText'), defaultText: FACTORY_TEXTS.batteryWarrantyText },
  { key: 'quotation.warranty.workmanship', section: 'quotation', label: 'Garantía de mano de obra', format: 'rich', multiline: false, templatable: true, maxLength: SHORT, ...legacy('workmanshipWarrantyText'), defaultText: FACTORY_TEXTS.workmanshipWarrantyText },
  {
    key: 'quotation.servicesIncluded', section: 'quotation', label: 'Servicios gestionados', format: 'rich', multiline: true, templatable: true, maxLength: PARAGRAPH, ...legacy('servicesIncludedText'),
    defaultText: FACTORY_TEXTS.servicesIncludedText,
  },
  {
    key: 'quotation.validityNote', section: 'quotation', label: 'Nota legal y términos', format: 'rich', multiline: false, templatable: true, maxLength: 600, ...legacy('validityNote'),
    placeholders: ['{validityDays}'],
    defaultText: (ctx) => validityNoteDefault(ctx),
  },
];

export const DOCUMENT_TEXT_DEFINITIONS: readonly DocumentTextDefinition[] = DEFINITIONS;

const BY_KEY = new Map(DEFINITIONS.map((definition) => [definition.key, definition]));
const BY_LEGACY_FIELD = new Map(DEFINITIONS.filter((d) => d.legacyField).map((definition) => [definition.legacyField!, definition]));

export const DOCUMENT_TEXT_KEYS: readonly string[] = DEFINITIONS.map((d) => d.key);

export function getDocumentTextDefinition(key: string): DocumentTextDefinition | undefined {
  return BY_KEY.get(key);
}

export function isDocumentTextKey(key: unknown): key is string {
  return typeof key === 'string' && BY_KEY.has(key);
}

/** Definición que guarda en un campo heredado (para migrar o publicar campos sueltos). */
export function definitionForLegacyField(field: string): DocumentTextDefinition | undefined {
  return BY_LEGACY_FIELD.get(field);
}

export function documentTextsForSection(section: DocumentTextSection): DocumentTextDefinition[] {
  return DEFINITIONS.filter((definition) => definition.section === section);
}
