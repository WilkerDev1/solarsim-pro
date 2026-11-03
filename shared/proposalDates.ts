const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const MIN_PROPOSAL_DATE_MS = Date.UTC(2000, 0, 1);

/**
 * Fecha de una propuesta en forma canónica (ISO UTC), con la misma regla en la app y en la API.
 * Acepta un instante ISO estricto con zona o un día "AAAA-MM-DD" (ese día a las 12:00Z, que conserva
 * el día en RD), válido en el calendario y desde el año 2000; ignora espacios alrededor.
 * Cualquier otro valor devuelve null: la app no lo muestra y la API usa su reloj.
 */
export function canonicalProposalDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const parts = ISO_DATE_TIME.exec(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  // Date.parse normaliza fechas imposibles (2026-02-30 → 2 de marzo): se comprueba el calendario antes.
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (parts[9] !== undefined && (Number(parts[9]) > 23 || Number(parts[10]) > 59))
  )
    return null;
  const ms = Date.parse(parts[0]);
  if (!Number.isFinite(ms) || ms < MIN_PROPOSAL_DATE_MS) return null;
  return new Date(ms).toISOString();
}
