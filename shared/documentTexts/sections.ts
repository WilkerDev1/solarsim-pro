/** Secciones (páginas internas) de la propuesta PDF: única fuente de ids y nombres. */

export const DOCUMENT_SECTION_IDS = [
  'cover',
  'tableOfContents',
  'executiveSummary',
  'aboutUs',
  'benefits',
  'techIntro',
  'projectDescription',
  'energy',
  'quotation',
  'roi',
  'cashFlow',
  'costMatrix',
] as const;

export type DocumentSectionId = (typeof DOCUMENT_SECTION_IDS)[number];

export interface DocumentSectionMeta {
  /** Nombre corto en el dock. */
  label: string;
  /** Descripción corta en el dock. */
  description: string;
  /** Título de la cinta de cabecera de la página (texto editable `page.<id>.title`). */
  pageTitle: string;
  /** Entrada del índice (textos editables `toc.<id>.title` / `toc.<id>.subtitle`); sin ella no aparece. */
  toc?: { title: string; subtitle: string };
  /** Oculta por defecto (información interna). */
  confidential?: boolean;
}

export const DOCUMENT_SECTIONS: Record<DocumentSectionId, DocumentSectionMeta> = {
  cover: { label: 'Portada Ejecutiva', description: 'Imagen hero, cliente y datos', pageTitle: 'PORTADA' },
  tableOfContents: { label: 'Índice del Dossier', description: 'Estructura y números dinámicos', pageTitle: 'ÍNDICE DE CONTENIDO' },
  executiveSummary: {
    label: 'Cuadro Resumen Ejecutivo',
    description: 'Inversión bruta, Ley 57-07 y retorno',
    pageTitle: 'CUADRO RESUMEN DE INVERSIÓN Y RETORNO',
    toc: { title: 'Cuadro Resumen de Inversión y Retorno', subtitle: 'Pipeline Técnico, Beneficio Ley 57-07 y Payback' },
  },
  aboutUs: {
    label: '1. ¿Quiénes Somos? & Servicios',
    description: 'Visión y 4 tarjetas de servicio',
    pageTitle: '1. ¿QUIÉNES SOMOS? Y NUESTROS SERVICIOS',
    toc: { title: 'Quiénes Somos & Nuestros Servicios', subtitle: 'Por Qué Elegirnos y Pilares de Servicio' },
  },
  benefits: {
    label: '2. Beneficios Solares & Ley 57-07',
    description: 'Pilares y marco fiscal dominicano',
    pageTitle: '2. BENEFICIOS DE LA ENERGÍA SOLAR Y LEY 57-07',
    toc: { title: 'Beneficios de la Energía Solar', subtitle: 'Objetivos e Incentivos Fiscales de la Ley 57-07' },
  },
  techIntro: {
    label: '3. ¿Qué es FV? & Flujo Técnico',
    description: 'Render 3D y diagrama de flujo',
    pageTitle: '3. ¿QUÉ ES UN SISTEMA FOTOVOLTAICO? Y DESCRIPCIÓN TÉCNICA',
    toc: { title: '¿Qué es un Sistema Fotovoltaico?', subtitle: 'Funcionamiento y Diagrama de Flujo Técnico' },
  },
  projectDescription: {
    label: '4. Resumen & Normativa SIE',
    description: 'Narrativa técnica y Res. SIE-007',
    pageTitle: '4. DESCRIPCIÓN DEL PROYECTO & NORMATIVA SIE',
    toc: { title: 'Descripción del Proyecto & Normativa SIE', subtitle: 'Criterios de Dimensionamiento y Resolución SIE-007' },
  },
  energy: {
    label: 'Análisis de Energía y Balance',
    description: 'Generación vs Demanda mensual',
    pageTitle: 'ANÁLISIS DE ENERGÍA Y CONSUMO',
    toc: { title: 'Análisis de Energía y Balance', subtitle: 'Generación Solar Estimada vs Demanda Mensual' },
  },
  quotation: {
    label: 'Cotización de Sistema',
    description: 'Equipos, inversión y garantías',
    pageTitle: 'COTIZACIÓN DE SISTEMA FOTOVOLTAICO',
    toc: { title: 'Presupuesto y Cotización de Sistema', subtitle: 'Equipos Tier-1, Inversión y Términos de Garantías' },
  },
  roi: {
    label: 'Retorno de Inversión',
    description: 'Payback, VAN, TIR y Ley 57-07',
    pageTitle: 'RETORNO DE INVERSIÓN - RESUMEN',
    toc: { title: 'Cálculo de Retorno de Inversión', subtitle: 'Payback, VAN, TIR y Ahorro Estimado' },
  },
  cashFlow: {
    label: 'Flujo de Caja 25 Años',
    description: 'Proyección financiera detallada',
    pageTitle: 'FLUJO DE CAJA Y BENEFICIOS ACUMULADOS (25 AÑOS)',
    toc: { title: 'Flujo de Caja y Proyección a 25 Años', subtitle: 'Análisis Financiero Acumulado y Rendimiento Anual' },
  },
  costMatrix: {
    label: 'Costos Internos',
    description: 'Matriz de márgenes y desglose',
    pageTitle: 'ANÁLISIS DE COSTOS Y MARGEN DE GANANCIA (INFORMACIÓN CONFIDENCIAL)',
    toc: { title: 'Matriz de Costos Internos (Confidencial)', subtitle: 'Desglose Detallado de Proveedores y Margen Comercial' },
    confidential: true,
  },
};

export function isDocumentSectionId(id: unknown): id is DocumentSectionId {
  return typeof id === 'string' && (DOCUMENT_SECTION_IDS as readonly string[]).includes(id);
}

/** Nombre de una sección en el dock (y en mensajes al usuario). */
export function sectionLabel(id: DocumentSectionId | string): string {
  return isDocumentSectionId(id) ? DOCUMENT_SECTIONS[id].label : id;
}

/** Secciones visibles por defecto: todas salvo las confidenciales. */
export function defaultSectionVisibility(): Record<DocumentSectionId, boolean> {
  return Object.fromEntries(DOCUMENT_SECTION_IDS.map((id) => [id, !DOCUMENT_SECTIONS[id].confidential])) as Record<DocumentSectionId, boolean>;
}
