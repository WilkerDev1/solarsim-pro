import React from 'react';
import type { QuotationCurrency } from '../../../types/quotation';

export const CURRENCY_NAMES: Record<QuotationCurrency, string> = { DOP: 'Peso dominicano (RD$)', USD: 'Dólar estadounidense (US$)' };
const FLAG_LABELS: Record<QuotationCurrency, string> = { DOP: 'Bandera de República Dominicana', USD: 'Bandera de Estados Unidos' };

/** Bandera de la moneda del documento, dibujada en línea (sin emoji ni imágenes externas). */
export const CurrencyFlag: React.FC<{ currency: QuotationCurrency; width?: number; className?: string }> = ({ currency, width = 22, className }) => (
  <svg role="img" aria-label={FLAG_LABELS[currency]} width={width} height={(width * 15) / 22} viewBox="0 0 22 15" className={className}>
    <rect width="22" height="15" rx="2" fill="#ffffff" />
    {currency === 'DOP' ? (
      <>
        <rect width="9.5" height="6" fill="#002d62" />
        <rect x="12.5" width="9.5" height="6" fill="#ce1126" />
        <rect y="9" width="9.5" height="6" fill="#ce1126" />
        <rect x="12.5" y="9" width="9.5" height="6" fill="#002d62" />
      </>
    ) : (
      <>
        <path d="M0 1.5h22M0 4.5h22M0 7.5h22M0 10.5h22M0 13.5h22" stroke="#b22234" strokeWidth="1.5" />
        <rect width="10" height="8" fill="#3c3b6e" />
      </>
    )}
    <rect width="22" height="15" rx="2" fill="none" stroke="#dce2e8" />
  </svg>
);
