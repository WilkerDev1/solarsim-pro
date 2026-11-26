/** Importes en centavos enteros: redondeo half-up, formato determinista y conversión DOP↔USD. */
import type { QuotationCurrency } from './types.js';

/** Redondeo half-up (mitades se alejan de cero) tolerante al ruido de coma flotante: 1.005 × 100 = 100.49999999999999. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clean = Number(Math.abs(value).toPrecision(15));
  const rounded = Math.floor(clean + 0.5);
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/** round(numerator × factor / denominator) en aritmética entera cuando cabe; los enteros seguros no acumulan error. */
export function mulDivRound(numerator: number, factor: number, denominator: number): number {
  const product = numerator * factor;
  if (Number.isSafeInteger(product * 2 + denominator)) return Math.floor((product * 2 + denominator) / (denominator * 2));
  return roundHalfUp(product / denominator);
}

/** Importe en unidades de moneda → centavos enteros. */
export function toCents(amount: number): number {
  return roundHalfUp(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

const CURRENCY_PREFIX: Record<QuotationCurrency, string> = { DOP: 'RD$', USD: 'US$' };

/** '35,966.40'; negativos con signo delante ('-10.00'). Sin Intl: no depende del idioma del sistema. */
export function formatAmount(cents: number): string {
  const value = roundHalfUp(cents);
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${value < 0 ? '-' : ''}${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

/** 'RD$ 35,966.40', 'US$ 18,450.00', '-RD$ 10.00'. */
export function formatMoney(cents: number, currency: QuotationCurrency): string {
  const text = formatAmount(cents);
  return text.startsWith('-') ? `-${CURRENCY_PREFIX[currency]} ${text.slice(1)}` : `${CURRENCY_PREFIX[currency]} ${text}`;
}

/** DOP↔USD con `exchangeRate` = DOP por 1 USD; misma moneda devuelve el mismo importe. */
export function convertCents(cents: number, from: QuotationCurrency, to: QuotationCurrency, exchangeRate: number): number {
  if (from === to) return cents;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return 0;
  return from === 'USD' ? roundHalfUp(cents * exchangeRate) : roundHalfUp(cents / exchangeRate);
}
