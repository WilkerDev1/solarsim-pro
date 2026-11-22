// Formato del precio genérico (ADR 0006), sin dependencias del store: lo usan el catálogo y la fila de costo del dock.
export const formatGenericUSD = (value: number) =>
  `US$ ${value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatGenericDate = (iso: string) => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('es-DO') : '';
};
