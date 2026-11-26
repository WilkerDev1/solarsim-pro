/**
 * Etiquetas fijas de la hoja A4 de la cotización y formatos deterministas (sin Intl ni relojes). No pertenecen al
 * registro `shared/documentTexts/`: ese registro es el del documento de propuesta (sus textos se guardan en la
 * propuesta y su prefijo `quotation.` ya lo usa la página de cotización de la propuesta). Lo editable de una
 * cotización son sus campos (`QuotationContent`), no estas etiquetas (docs/QUOTATION_EDITOR.md).
 */
import { ITBIS_RATE } from '../financialRules.js';
import { roundHalfUp } from './money.js';
import type { QuotationCurrency } from './types.js';

/** Porcentaje de ITBIS derivado de `ITBIS_RATE` (p. ej. 'NN%'), con hasta dos decimales si los tuviera. */
export function itbisPercentLabel(rate: number = ITBIS_RATE): string {
  const hundredths = roundHalfUp(rate * 10000);
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  return `${whole}${fraction ? `.${String(fraction).padStart(2, '0').replace(/0$/, '')}` : ''}%`;
}

export const QUOTATION_SHEET_TEXTS = {
  title: 'Cotización',
  draftNumber: 'Borrador',
  issueDate: 'Fecha de emisión',
  validUntil: 'Válida hasta',
  noValidity: 'Sin fecha',
  currency: 'Moneda',
  seller: 'Vendedor',
  from: 'De',
  to: 'Para',
  attention: 'Atención',
  taxId: 'RNC',
  clientTaxId: 'RNC / Cédula',
  phone: 'Tel.',
  columnNumber: '#',
  columnDescription: 'Descripción',
  columnUnitPrice: 'Precio unit.',
  columnQuantity: 'Cant.',
  columnTotal: 'Total',
  lineDiscount: 'Desc.',
  subtotal: 'Subtotal',
  discount: 'Descuento',
  itbis: `ITBIS ${itbisPercentLabel()}`,
  total: 'Total general',
  paymentTerms: 'Condiciones de pago',
  project: 'Proyecto',
  notes: 'Notas',
  continued: '(continuación)',
  quotedBy: 'Cotizado por',
  receivedBy: 'Recibido por',
} as const;

const CURRENCY_SYMBOL: Record<QuotationCurrency, string> = { DOP: 'RD$', USD: 'US$' };
export const currencySymbol = (currency: QuotationCurrency): string => CURRENCY_SYMBOL[currency];

/** 'Página 2 de 3'. */
export const sheetPageLabel = (page: number, total: number): string => `Página ${page} de ${total}`;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11-23' → '23 nov 2026'; `null` o una fecha mal formada → 'Sin fecha' / el texto tal cual. */
export function formatSheetDate(iso: string | null): string {
  if (!iso) return QUOTATION_SHEET_TEXTS.noValidity;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return iso;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Cantidad con miles y hasta 3 decimales sin ceros sobrantes: 250 → '250', 1234.5 → '1,234.5'. */
export function formatQuantity(quantity: number): string {
  const thousandths = roundHalfUp(Math.abs(Number.isFinite(quantity) ? quantity : 0) * 1000);
  const whole = Math.floor(thousandths / 1000);
  const fraction = String(thousandths % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${quantity < 0 && thousandths ? '-' : ''}${group(String(whole))}${fraction ? `.${fraction}` : ''}`;
}

/** Tasa DOP por USD con 2 a 4 decimales: 60 → '60.00', 58.7525 → '58.7525'. */
export function formatExchangeRate(rate: number): string {
  const tenThousandths = roundHalfUp((Number.isFinite(rate) ? rate : 0) * 10000);
  const whole = Math.floor(tenThousandths / 10000);
  const fraction = String(tenThousandths % 10000).padStart(4, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${group(String(whole))}.${fraction}`;
}

/** 'RD$ · US$ 1 = RD$ 60.00'. */
export function sheetCurrencyLabel(currency: QuotationCurrency, exchangeRate: number): string {
  return `${CURRENCY_SYMBOL[currency]} · US$ 1 = RD$ ${formatExchangeRate(exchangeRate)}`;
}
