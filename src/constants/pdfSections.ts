export type PDFSectionId =
  | 'cover'
  | 'tableOfContents'
  | 'aboutUs'
  | 'benefits'
  | 'techIntro'
  | 'projectDescription'
  | 'energy'
  | 'quotation'
  | 'roi'
  | 'cashFlow'
  | 'costMatrix';

export interface PDFSectionMeta {
  id: PDFSectionId;
  title: string;
  subtitle: string;
  category: 'intro' | 'technical';
  toggleKey: string;
  defaultNumberLabel?: string;
}

export const DEFAULT_PDF_SECTION_ORDER: PDFSectionId[] = [
  'cover',
  'tableOfContents',
  'aboutUs',
  'benefits',
  'techIntro',
  'projectDescription',
  'energy',
  'quotation',
  'roi',
  'cashFlow',
  'costMatrix',
];

export const PDF_SECTIONS_META: Record<PDFSectionId, PDFSectionMeta> = {
  cover: {
    id: 'cover',
    title: 'Portada Ejecutiva',
    subtitle: 'Imagen hero, cliente y datos del proyecto',
    category: 'intro',
    toggleKey: 'showCover',
  },
  tableOfContents: {
    id: 'tableOfContents',
    title: 'Índice del Dossier',
    subtitle: 'Estructura ejecutiva y numeración dinámica',
    category: 'intro',
    toggleKey: 'showTableOfContents',
  },
  aboutUs: {
    id: 'aboutUs',
    title: '1. ¿Quiénes Somos? & Servicios',
    subtitle: 'Visión, experiencia y 4 tarjetas de servicio',
    category: 'intro',
    toggleKey: 'showAboutUs',
    defaultNumberLabel: '1',
  },
  benefits: {
    id: 'benefits',
    title: '2. Beneficios Solares & Ley 57-07',
    subtitle: 'Pilares y marco fiscal dominicano',
    category: 'intro',
    toggleKey: 'showBenefits',
    defaultNumberLabel: '2',
  },
  techIntro: {
    id: 'techIntro',
    title: '3. ¿Qué es FV? & Flujo Técnico',
    subtitle: 'Render 3D y diagrama de flujo técnico',
    category: 'intro',
    toggleKey: 'showTechIntro',
    defaultNumberLabel: '3',
  },
  projectDescription: {
    id: 'projectDescription',
    title: '4. Resumen & Normativa SIE',
    subtitle: 'Narrativa técnica y Res. SIE-007',
    category: 'intro',
    toggleKey: 'showProjectDescription',
    defaultNumberLabel: '4',
  },
  energy: {
    id: 'energy',
    title: 'Análisis de Energía y Balance',
    subtitle: 'Generación Solar Estimada vs Demanda Mensual',
    category: 'technical',
    toggleKey: 'showPage1',
    defaultNumberLabel: '5',
  },
  quotation: {
    id: 'quotation',
    title: 'Cotización de Sistema',
    subtitle: 'Equipos Tier-1, Inversión y Términos de Garantías',
    category: 'technical',
    toggleKey: 'showPageQuotation',
    defaultNumberLabel: '6',
  },
  roi: {
    id: 'roi',
    title: 'Retorno de Inversión',
    subtitle: 'Payback, VAN, TIR y Ahorro Estimado',
    category: 'technical',
    toggleKey: 'showPage2',
    defaultNumberLabel: '7',
  },
  cashFlow: {
    id: 'cashFlow',
    title: 'Flujo de Caja 25 Años',
    subtitle: 'Análisis Financiero Acumulado y Rendimiento Anual',
    category: 'technical',
    toggleKey: 'showPage3',
    defaultNumberLabel: '8',
  },
  costMatrix: {
    id: 'costMatrix',
    title: 'Matriz de Costos Internos',
    subtitle: 'Desglose Confidencial de Proveedores y Margen Comercial',
    category: 'technical',
    toggleKey: 'showPageCostMatrix',
    defaultNumberLabel: '9',
  },
};
