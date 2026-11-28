// API sintética de cotizaciones para las pruebas de compatibilidad (no es una suite: no empieza por «test»). Aplica las
// mismas reglas de escritura que `server/src/modules/quotations.ts`: CAS por `baseVersion` (409), transición de estado
// permitida (400 `invalid_transition`) y, en una guardada fuera de borrador, contenido idéntico salvo el estado (400
// `quotation_locked`, comparando con lo guardado normalizado por el validador de esa API). `validate` decide qué API es
// (la 2.10.x que descarta campos o la nueva).
import { isDeepStrictEqual } from 'node:util';
import { canTransitionQuotation, isQuotationContentLocked, type QuotationContent, type QuotationValidation } from '../../shared/quotations';
import { QuotationSyncService } from '../services/quotationSyncService';

export type Row = Record<string, unknown> & { version: number; number?: string; status?: string };
export interface LockingApi {
  rows: Map<string, Row>;
  /** Contenido de cada PUT recibido. */
  puts: QuotationContent[];
  /** Código de cada respuesta de PUT (`ok` o el código de error). */
  responses: string[];
  /** El siguiente PUT se guarda pero su respuesta se pierde. */
  drop: () => void;
  /** El siguiente PUT se rechaza con este 400 sin guardarse. */
  rejectNext: (code: string) => void;
  /** Cambia el validador (p. ej. redesplegar la API nueva sobre los mismos datos). */
  setValidate: (validate: (raw: unknown) => QuotationValidation) => void;
}

const withoutStatus = (value: Record<string, unknown>) => {
  const { status: _status, ...rest } = value;
  return rest;
};

export function installLockingApi(initialValidate: (raw: unknown) => QuotationValidation): LockingApi {
  let validate = initialValidate;
  const rows = new Map<string, Row>();
  const puts: QuotationContent[] = [];
  const responses: string[] = [];
  let dropNext = false;
  let refuse: string | null = null;
  let clock = Date.parse('2026-11-01T00:00:00Z');
  const tick = () => new Date(++clock).toISOString();
  const stored = (row: Row) => {
    const result = validate(row);
    return (result.ok ? result.value : row) as unknown as Record<string, unknown>;
  };
  QuotationSyncService.setTransportFactory(() => async (path, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET') return Response.json({ success: true, quotations: [...rows.values()].map((r) => structuredClone(r)), deletedIds: [], serverTimestamp: tick() });
    const id = decodeURIComponent(path.slice(1).split('?')[0]);
    const body = JSON.parse(String(init.body));
    puts.push(body.content);
    const fail = (status: number, code: string, extra: Record<string, unknown> = {}) => {
      responses.push(code);
      return Response.json({ error: code, code, ...extra }, { status });
    };
    if (refuse) { const code = refuse; refuse = null; return fail(400, code); }
    const valid = validate(body.content);
    if (!valid.ok) return fail(400, 'invalid');
    const current = rows.get(id);
    if ((current?.version ?? 0) !== body.baseVersion) return fail(409, 'conflict', { quotation: current ?? null });
    if (current) {
      const saved = current.status as QuotationContent['status'];
      if (valid.value.status !== saved && !canTransitionQuotation(saved, valid.value.status)) return fail(400, 'invalid_transition');
      if (isQuotationContentLocked(saved) && !isDeepStrictEqual(withoutStatus(stored(current)), withoutStatus(valid.value as unknown as Record<string, unknown>)))
        return fail(400, 'quotation_locked');
    }
    const version = (current?.version ?? 0) + 1;
    const saved = { ...valid.value, id, number: current?.number ?? 'COT-2026-0001', organizationId: 'org', version, baseVersion: version, createdById: 'owner', createdBy: 'QA', createdAt: tick(), updatedAt: tick() };
    rows.set(id, saved as unknown as Row);
    responses.push('ok');
    if (dropNext) { dropNext = false; throw new Error('respuesta perdida'); }
    return Response.json({ success: true, quotation: saved });
  });
  return {
    rows, puts, responses,
    drop: () => { dropNext = true; },
    rejectNext: (code) => { refuse = code; },
    setValidate: (next) => { validate = next; },
  };
}
