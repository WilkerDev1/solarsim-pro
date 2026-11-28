// API sintética de cotizaciones para las pruebas de compatibilidad (no es una suite: no empieza por «test»). Aplica las
// mismas reglas de escritura que `server/src/modules/quotations.ts`: CAS por `baseVersion` (409), transición de estado
// permitida (400 `invalid_transition`) y, en una guardada fuera de borrador, contenido idéntico salvo el estado (400
// `quotation_locked`, comparando con lo guardado normalizado por el validador de esa API), salvo que solo falten los
// campos «solo locales» que un cliente anterior no conoce (`withoutLocalOnlyMissingIn`): cambio de estado puro que
// conserva lo guardado. `validate` decide qué API es (la 2.10.x que descarta campos o la nueva); con la anterior esa
// regla nunca se activa porque su validador ya quitó los campos de lo guardado.
import { isDeepStrictEqual } from 'node:util';
import {
  LOCAL_ONLY_FIELDS, canTransitionQuotation, isQuotationContentLocked, withoutLocalOnlyMissingIn, type QuotationContent, type QuotationValidation,
} from '../../shared/quotations';
import { QuotationSyncService } from '../services/quotationSyncService';

export type Row = Record<string, unknown> & { version: number; number?: string; status?: string };
export interface LockingApiOptions {
  /** La API declara en el GET los campos que guarda (`localOnlyFieldsStored`), como la nueva. */
  declares?: boolean;
  /** Descarga incremental real: con `?since=` solo devuelve lo que cambió después (incluido lo tocado con `rows.set`). */
  incremental?: boolean;
}
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
  /** Cambia el validador (p. ej. redesplegar la API nueva sobre los mismos datos) y si declara lo que guarda. */
  setValidate: (validate: (raw: unknown) => QuotationValidation, declares?: boolean) => void;
}

const withoutStatus = (value: Record<string, unknown>) => {
  const { status: _status, ...rest } = value;
  return rest;
};

/** Mapa que anota cuándo cambió cada fila (también lo que la prueba escribe a mano, como otro equipo). */
class TrackedRows extends Map<string, Row> {
  changedAt = new Map<string, number>();
  constructor(private readonly now: () => number) { super(); }
  override set(key: string, value: Row): this {
    this.changedAt?.set(key, this.now());
    return super.set(key, value);
  }
}

export function installLockingApi(initialValidate: (raw: unknown) => QuotationValidation, options: LockingApiOptions = {}): LockingApi {
  let validate = initialValidate;
  let declares = options.declares ?? false;
  let clock = Date.parse('2026-11-01T00:00:00Z');
  const tick = () => new Date(++clock).toISOString();
  const rows = new TrackedRows(() => ++clock);
  const puts: QuotationContent[] = [];
  const responses: string[] = [];
  let dropNext = false;
  let refuse: string | null = null;
  const stored = (row: Row) => {
    const result = validate(row);
    return (result.ok ? result.value : row) as unknown as QuotationContent;
  };
  QuotationSyncService.setTransportFactory(() => async (path, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET') {
      const since = new URLSearchParams(path.split('?')[1] ?? '').get('since');
      const after = options.incremental && since ? Date.parse(since) : -Infinity;
      const changed = [...rows.entries()].filter(([id]) => (rows.changedAt.get(id) ?? 0) > after).map(([, row]) => structuredClone(row));
      return Response.json({
        success: true, quotations: changed, deletedIds: [], serverTimestamp: new Date(++clock).toISOString(),
        ...(declares ? { localOnlyFieldsStored: [...LOCAL_ONLY_FIELDS] } : {}),
      });
    }
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
    let value = valid.value;
    const current = rows.get(id);
    if ((current?.version ?? 0) !== body.baseVersion) return fail(409, 'conflict', { quotation: current ?? null });
    if (current) {
      const saved = current.status as QuotationContent['status'];
      if (value.status !== saved && !canTransitionQuotation(saved, value.status)) return fail(400, 'invalid_transition');
      const kept = stored(current);
      const same = (left: QuotationContent) => isDeepStrictEqual(withoutStatus(left as never), withoutStatus(value as never));
      if (isQuotationContentLocked(saved) && !same(kept)) {
        if (!same(withoutLocalOnlyMissingIn(kept, value))) return fail(400, 'quotation_locked');
        value = { ...kept, status: value.status };
      }
    }
    const version = (current?.version ?? 0) + 1;
    const saved = { ...value, id, number: current?.number ?? 'COT-2026-0001', organizationId: 'org', version, baseVersion: version, createdById: 'owner', createdBy: 'QA', createdAt: tick(), updatedAt: tick() };
    rows.set(id, saved as unknown as Row);
    responses.push('ok');
    if (dropNext) { dropNext = false; throw new Error('respuesta perdida'); }
    return Response.json({ success: true, quotation: saved });
  });
  return {
    rows, puts, responses,
    drop: () => { dropNext = true; },
    rejectNext: (code) => { refuse = code; },
    setValidate: (next, declare) => { validate = next; if (declare !== undefined) declares = declare; },
  };
}
