export type PDFSectionId =
  | 'cover'
  | 'tableOfContents'
  | 'executiveSummary'
  | 'aboutUs'
  | 'benefits'
  | 'techIntro'
  | 'projectDescription'
  | 'energy'
  | 'quotation'
  | 'roi'
  | 'cashFlow'
  | 'costMatrix';

export const DEFAULT_PDF_SECTION_ORDER: PDFSectionId[] = [
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
];
