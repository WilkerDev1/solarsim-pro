/** Número de cotización 'COT-2026-0147'. Lo asigna la API; aquí solo formato y lectura. */

export const QUOTATION_NUMBER_PREFIX = 'COT';

export function formatQuotationNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new RangeError('Año de cotización inválido');
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError('Secuencia de cotización inválida');
  return `${QUOTATION_NUMBER_PREFIX}-${year}-${String(sequence).padStart(4, '0')}`;
}

/** Lectura estricta: solo acepta lo que `formatQuotationNumber` produce. */
export function parseQuotationNumber(text: string): { year: number; sequence: number } | null {
  if (typeof text !== 'string') return null;
  const match = /^COT-(\d{4})-(\d{4,})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const sequence = Number(match[2]);
  if (year < 1000 || !Number.isSafeInteger(sequence) || sequence < 1) return null;
  return formatQuotationNumber(year, sequence) === text ? { year, sequence } : null;
}

/** Año de la secuencia: el de la fecha de emisión ('YYYY-MM-DD'). */
export function quotationNumberYear(issueDate: string): number {
  const match = typeof issueDate === 'string' ? /^(\d{4})-\d{2}-\d{2}$/.exec(issueDate) : null;
  if (!match) throw new RangeError('Fecha de emisión inválida');
  return Number(match[1]);
}
