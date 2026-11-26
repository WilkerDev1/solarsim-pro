import type { QuotationDesign } from '../../../types/quotation';

/** Tinta y neutros de la hoja: siempre blanca, con independencia del tema de la app. */
export const SHEET_INK = '#182230';
export const SHEET_MUTED = '#536174';
export const SHEET_BODY = '#3b4758';
export const SHEET_RULE = '#dce2e8';
export const SHEET_ROW_RULE = '#e8ecf0';
export const SHEET_TINT = '#f3f6f8';
export const SHEET_STRIPE = '#f6f8fa';

export const SANS = 'Inter, "Segoe UI", Arial, sans-serif';
export const SERIF = 'Georgia, "Times New Roman", serif';

/** Variables visuales de cada disposición (clásica, banda, minimal) a partir del acento y la tipografía. */
export function sheetTheme(design: QuotationDesign) {
  const { accent, layout } = design;
  const banda = layout === 'banda';
  const minimal = layout === 'minimal';
  return {
    accent,
    banda,
    minimal,
    titleFont: design.typography === 'serif' ? SERIF : SANS,
    topBar: layout === 'clasica' ? 6 : 0,
    headPadding: banda ? '38px 56px 32px 56px' : minimal ? '56px 56px 0 56px' : '44px 56px 0 56px',
    headBackground: banda ? accent : 'transparent',
    titleColor: banda ? '#ffffff' : SHEET_INK,
    numberColor: banda ? '#ffffff' : accent,
    metaMargin: banda ? '6px 56px 0 56px' : '32px 56px 0 56px',
    metaTopBorder: banda ? 'transparent' : SHEET_RULE,
    headerCellBackground: banda ? accent : minimal ? 'transparent' : SHEET_TINT,
    headerCellColor: banda ? '#ffffff' : minimal ? SHEET_INK : SHEET_MUTED,
    headerCellRadius: minimal ? 0 : 8,
    headerCellBorder: minimal ? SHEET_INK : 'transparent',
    stripe: banda ? SHEET_STRIPE : 'transparent',
    totalBorder: banda ? accent : SHEET_INK,
  };
}

export type SheetTheme = ReturnType<typeof sheetTheme>;
