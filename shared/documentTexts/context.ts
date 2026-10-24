import { DEFAULT_GRID_EXPORT_FEE_PCT, DEFAULT_QUOTE_VALIDITY_DAYS } from '../assumptions.js';

/**
 * Datos de la propuesta que necesitan los textos dinámicos (nombre del cliente, equipos, tarifa…).
 * Es un objeto plano: la app lo construye desde el proyecto (`src/utils/documentTextContext.ts`)
 * y el Worker desde el snapshot publicado.
 */
export interface DocumentTextContext {
  /** Nombre del cliente sin sufijos de copia; 'Cliente' si falta. */
  clientName: string;
  /** Persona de contacto: contactPerson, empresa o nombre del cliente. */
  clientContactPerson: string;
  clientPhone: string;
  clientEmail: string;
  /** Provincia o localidad (puede ser vacía). */
  clientProvince: string;
  companyName: string;
  /** Datos de la empresa emisora (perfil), usados como valor por defecto de los textos `company.*`. */
  company?: Partial<Record<'name' | 'slogan' | 'footer' | 'phone' | 'email' | 'rnc' | 'website' | 'instagram', string>>;
  currentDateStr: string;
  quoteValidityDays: number;

  distributor: string;
  tariffCode: string;
  isZeroExport: boolean;
  gridExportFeePct: number;
  hasBattery: boolean;
  /** Hay baterías con capacidad (> 0 kWh) en la propuesta. */
  hasBatteryStorage: boolean;

  annualConsumptionKWh: number;
  annualProductionKWh: number;
  systemCapacityKWp: number;
  energyCoveragePct: number;

  panelCount: number;
  /** «38 Módulos …»; con varios modelos, el principal y «y N modelo(s) más». */
  panelsSummaryText: string;
  /** Modelo usado para sincronizar un párrafo personalizado (resumen si hay varios grupos). */
  panelModelText: string;
  inverterCount: number;
  invertersSummaryText: string;
  inverterModelText: string;
  batteryCount: number;
  /** Capacidad nominal total del banco (kWh), suma de todos los grupos. */
  batteryCapacityKWh: number;
  batteriesSummaryText: string;
  batteryModelText: string;
}

const EMPTY_CONTEXT: DocumentTextContext = {
  clientName: 'Cliente',
  clientContactPerson: 'Cliente',
  clientPhone: '',
  clientEmail: '',
  clientProvince: '',
  companyName: 'electsun',
  currentDateStr: '',
  quoteValidityDays: DEFAULT_QUOTE_VALIDITY_DAYS,
  distributor: 'EDES',
  tariffCode: 'BTS2',
  isZeroExport: false,
  gridExportFeePct: DEFAULT_GRID_EXPORT_FEE_PCT,
  hasBattery: false,
  hasBatteryStorage: false,
  annualConsumptionKWh: 0,
  annualProductionKWh: 0,
  systemCapacityKWp: 0,
  energyCoveragePct: 0,
  panelCount: 0,
  panelsSummaryText: '',
  panelModelText: '',
  inverterCount: 1,
  invertersSummaryText: '',
  inverterModelText: '',
  batteryCount: 0,
  batteryCapacityKWh: 0,
  batteriesSummaryText: '',
  batteryModelText: '',
};

/** Contexto completo a partir de datos parciales (pruebas, herramientas de IA). */
export function createDocumentTextContext(partial: Partial<DocumentTextContext> = {}): DocumentTextContext {
  return { ...EMPTY_CONTEXT, ...partial };
}

const PLACEHOLDERS: Record<string, (ctx: DocumentTextContext) => string> = {
  clientname: (ctx) => ctx.clientName,
  cliente: (ctx) => ctx.clientName,
  client: (ctx) => ctx.clientName,
  contactname: (ctx) => ctx.clientContactPerson,
  clientphone: (ctx) => ctx.clientPhone,
  clientemail: (ctx) => ctx.clientEmail,
  companyname: (ctx) => ctx.companyName,
  empresa: (ctx) => ctx.companyName,
  validitydays: (ctx) => String(ctx.quoteValidityDays),
};

/** Placeholders admitidos en cualquier texto (`{cliente}` es alias de `{clientName}`). */
export const DOCUMENT_TEXT_PLACEHOLDERS = ['{clientName}', '{cliente}', '{contactName}', '{clientPhone}', '{clientEmail}', '{companyName}', '{validityDays}'] as const;

/** Sustituye los placeholders conocidos; los desconocidos quedan literales. */
export function interpolate(text: string, ctx: DocumentTextContext): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => {
    const value = PLACEHOLDERS[name.toLowerCase()];
    return value ? value(ctx) : match;
  });
}
