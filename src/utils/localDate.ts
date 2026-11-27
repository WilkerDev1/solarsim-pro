/** Fecha de calendario local 'YYYY-MM-DD' (la del equipo del usuario, no UTC). `shared/` la recibe como argumento. */
export function localIsoDate(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
