/** USD con separador de miles y 2 decimales, sin símbolo. */
export const usd = (value: number): string =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
