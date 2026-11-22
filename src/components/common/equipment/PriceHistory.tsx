// Vista «Historial» del modal de ofertas (ADR 0006 §6). Alterna con la lista y el editor en el mismo cuerpo: nunca
// abre otro modal. El historial se pide al servidor al abrirse (paginado con «Cargar más») y se le suma lo pendiente
// del usuario actual; nada de esto se guarda localmente. Sin sesión no se muestra.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { priceHistoryStats, type PriceObservationSource } from '../../../../shared/equipmentPrices';
import { statsInput } from '../../../../shared/agentTools/priceHistory';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { canPriceEquipment, effectiveGenericPrice, priceFeatureActive } from '../../../store/slices/equipmentPriceSlice';
import { SyncService } from '../../../services/syncService';
import {
  PRICE_KIND_LABELS,
  PRICE_SOURCE_LABELS,
  applyFirstPage,
  currentHistoryGenericId,
  holdSettled,
  mergePriceHistory,
  settledRows,
  voidHistoryRecord,
  type PriceHistoryRecord,
} from '../../../features/equipmentPrices/priceHistory';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { confirmAction } from '../confirmAction';
import { formatGenericDate, formatGenericUSD } from './GenericPrice';

const PAGE_SIZE = 100;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export type PriceHistoryStatus = 'loading' | 'ready' | 'offline' | 'unsupported' | 'error';

const SERIES_COLORS: Record<PriceObservationSource | 'generic', [light: string, dark: string]> = {
  supplier_offer: ['#087b58', '#6be0b5'],
  ai_scan: ['#647f9d', '#8ba6c3'],
  proposal: ['#9a6700', '#e3b341'],
  manual: ['#6b5fb5', '#b3a9f0'],
  agent: ['#0e7490', '#67d4e8'],
  generic: ['#182230', '#f1f3f5'],
};

const formatChange = (value: number | null) =>
  value === null ? 'sin dato' : `${value > 0 ? '+' : ''}${value.toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const formatAmount = (value: number) => value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (time: number) => new Date(time).toLocaleDateString('es-DO', { month: 'short', year: '2-digit' });

/** Proveedor o propuesta de un registro; una propuesta que la API ya no resuelve es «Propuesta eliminada». */
function provenance(row: PriceHistoryRecord): string {
  if (row.source === 'proposal' || row.projectId) {
    const label = [row.projectCode, row.projectName].filter(Boolean).join(' · ');
    if (label) return label;
    return row.projectId ? 'Propuesta eliminada' : '—';
  }
  return row.supplierName || '—';
}

function rowStatus(row: PriceHistoryRecord, currentId: string | undefined): string {
  if (row.voidedAt) return `Anulado ${formatGenericDate(row.voidedAt)}`.trim();
  if (row.voidPending) return 'Anulación pendiente de sincronizar';
  const base = row.kind === 'generic' && row.id === currentId ? 'Genérico vigente' : 'Activo';
  return row.pendingSync ? `${base} · pendiente de sincronizar` : base;
}

function PriceChart({ rows, currentId, now, dark }: { rows: PriceHistoryRecord[]; currentId: string | undefined; now: Date; dark: boolean }) {
  const live = rows.filter((row) => !row.voidedAt && !row.voidPending && row.priceUSD > 0 && Number.isFinite(Date.parse(row.observedAt)));
  if (!live.length) return null;
  const points: Record<string, number>[] = live
    .map((row) => ({ time: Date.parse(row.observedAt), [row.kind === 'generic' ? 'generic' : row.source]: row.priceUSD }))
    .sort((a, b) => a.time - b.time);
  const current = live.find((row) => row.kind === 'generic' && row.id === currentId);
  // The step keeps today's generic price to the right edge: it is the current value, not an invented one.
  if (current && now.getTime() > points[points.length - 1].time) points.push({ time: now.getTime(), generic: current.priceUSD });
  const sources = [...new Set(live.filter((row) => row.kind === 'observation').map((row) => row.source))];
  const color = (key: PriceObservationSource | 'generic') => SERIES_COLORS[key][dark ? 1 : 0];
  const first = formatGenericDate(new Date(points[0].time).toISOString());
  const last = formatGenericDate(new Date(points[points.length - 1].time).toISOString());
  const summary = `Precio en el tiempo: ${live.length} registros desde ${first} hasta ${last}${current ? `; precio genérico vigente ${formatGenericUSD(current.priceUSD)}` : '; sin precio genérico'}. Resumen mensual y tabla de registros disponibles debajo.`;
  return (
    <div className="offers-history-chart" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? '#363b43' : '#dce2e8'} />
          <XAxis
            dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: dark ? '#abb4c0' : '#536174' }} axisLine={false} tickLine={false}
          />
          <YAxis width={56} tick={{ fontSize: 11, fill: dark ? '#abb4c0' : '#536174' }} axisLine={false} tickLine={false} />
          <Tooltip
            labelFormatter={(value) => formatGenericDate(new Date(Number(value)).toISOString())}
            formatter={(value) => formatGenericUSD(Number(value))}
            contentStyle={{ background: dark ? '#1c1f23' : '#fff', borderColor: dark ? '#363b43' : '#dce2e8', color: dark ? '#f1f3f5' : '#182230', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {sources.map((source) => (
            <Line key={source} dataKey={source} name={PRICE_SOURCE_LABELS[source]} stroke={color(source)} type="linear" connectNulls dot={{ r: 3 }} isAnimationActive={false} />
          ))}
          <Line dataKey="generic" name="Precio genérico" stroke={color('generic')} strokeDasharray="5 3" type="stepAfter" connectNulls dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface PriceHistoryContentProps {
  rows: PriceHistoryRecord[];
  /** Genérico vigente (la vista pasa el de `effectiveGenericPrice`, como la cabecera). */
  currentId?: string;
  status: PriceHistoryStatus;
  message?: string;
  hasMore: boolean;
  loadingMore?: boolean;
  /** Fallo de «Cargar más»: se muestra junto al botón, que sigue disponible. */
  loadMoreError?: string;
  canVoid: boolean;
  onVoid: (row: PriceHistoryRecord) => void;
  onLoadMore: () => void;
  now?: Date;
  dark?: boolean;
}

/** Contenido de la vista (sin efectos): gráfico, variación, resumen por mes del año y tabla de registros. */
export function PriceHistoryContent({ rows, currentId: currentIdProp, status, message, hasMore, loadingMore = false, loadMoreError, canVoid, onVoid, onLoadMore, now = new Date(), dark = false }: PriceHistoryContentProps) {
  const stats = priceHistoryStats(statsInput(rows), now);
  const fallbackId = currentHistoryGenericId(rows);
  const currentId = currentIdProp && rows.some((row) => row.id === currentIdProp && !row.voidedAt && !row.voidPending) ? currentIdProp : fallbackId;
  // With older pages still on the server, figures cover only the loaded records: say so, never claim a start date.
  const partial = hasMore ? ' (registros cargados)' : '';
  const note =
    status === 'loading' ? 'Cargando historial…'
      : status === 'offline' ? 'Sin conexión con el servidor: solo se muestra lo pendiente de sincronizar.'
        : status === 'unsupported' ? 'El historial de precios no está disponible en este servidor.'
          : status === 'error' ? `No se pudo cargar el historial${message ? `: ${message}` : '.'}`
            : null;
  return (
    <div className="offers-history" data-price-history>
      {note && <p className="offers-history-note" role="status">{note}</p>}
      {status === 'ready' && !rows.length && (
        <p className="offers-history-note">Aún no hay registros de precio para este equipo. El historial empieza con el primer precio registrado.</p>
      )}
      {rows.length > 0 && (
        <>
          {stats.firstObservedAt && (
            <p className="offers-history-note">
              {hasMore ? `Registros cargados desde ${formatGenericDate(stats.firstObservedAt)}.` : `El historial empieza el ${formatGenericDate(stats.firstObservedAt)}.`}
            </p>
          )}
          <PriceChart rows={rows} currentId={currentId} now={now} dark={dark} />
          <p className="offers-history-change">
            <span className="offers-history-label">Variación del promedio mensual{partial}</span>
            {([['3 meses', stats.change.m3], ['6 meses', stats.change.m6], ['12 meses', stats.change.m12]] as const).map(([label, value]) => (
              <span key={label} className="offers-history-change-item">
                <span>{label}</span> <strong className="offers-history-num">{formatChange(value)}</strong>
              </span>
            ))}
          </p>
          <div className="offers-history-scroll">
            <table data-history-months>
              <caption>Por mes del año (todos los años): precios vistos con importe mayor que cero{partial}</caption>
              <thead>
                <tr><th scope="col">Mes</th><th scope="col">Promedio</th><th scope="col">Mínimo</th><th scope="col">Máximo</th><th scope="col">Registros</th></tr>
              </thead>
              <tbody>
                {stats.byCalendarMonth.map((month) => (
                  <tr key={month.month}>
                    <th scope="row">{MONTHS[month.month - 1]}</th>
                    {month.count ? (
                      <>
                        <td>{formatGenericUSD(month.avg as number)}</td>
                        <td>{formatGenericUSD(month.min as number)}</td>
                        <td>{formatGenericUSD(month.max as number)}</td>
                        <td>{month.count}</td>
                      </>
                    ) : (
                      <><td></td><td></td><td></td><td></td></>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="offers-history-scroll">
            <table data-history-records>
              <caption>Registros</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th><th scope="col">Precio</th><th scope="col">Tipo · fuente</th><th scope="col">Proveedor o propuesta</th>
                  <th scope="col">Autor</th><th scope="col">Estado</th>{canVoid && <th scope="col"><span className="sr-only">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} data-voided={row.voidedAt || row.voidPending ? 'true' : undefined}>
                    <td>{formatGenericDate(row.observedAt)}</td>
                    <td className="offers-history-num">
                      {formatGenericUSD(row.priceUSD)}
                      {row.originalCurrency && row.originalPrice !== undefined && (
                        <small>{row.originalCurrency} {formatAmount(row.originalPrice)}</small>
                      )}
                    </td>
                    <td>{PRICE_KIND_LABELS[row.kind]}<small>{PRICE_SOURCE_LABELS[row.source]}</small></td>
                    <td>{provenance(row)}</td>
                    <td>{row.createdByName || '—'}</td>
                    <td>{rowStatus(row, currentId)}</td>
                    {canVoid && (
                      <td>
                        {!row.voidedAt && !row.voidPending && (
                          <button type="button" className="offers-link" aria-label={`Anular registro de ${formatGenericUSD(row.priceUSD)} del ${formatGenericDate(row.observedAt)}`} onClick={() => onVoid(row)}>
                            Anular
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {hasMore && (
        <div className="offers-history-more-row">
          <button type="button" className="supplier-button offers-history-more" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </button>
          {loadMoreError && !loadingMore && (
            <span className="offers-history-note" role="status">No se pudieron cargar más registros: {loadMoreError}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Contenedor: carga bajo demanda, fusión con lo pendiente y anulación con confirmación (solo escritores). */
export function PriceHistoryView({ item, onBack }: { item: SolarEquipmentItem; onBack: () => void }) {
  const { active, serverUrl, authToken, pricePending, genericPrices, syncSettings, projects, dark, canVoid } = useSimulationStore(
    useShallow((s) => ({
      active: priceFeatureActive(s), serverUrl: s.syncSettings.serverUrl, authToken: s.syncSettings.authToken, pricePending: s.pricePending, genericPrices: s.genericPrices,
      syncSettings: s.syncSettings, projects: s.projects, dark: s.sidebarTheme === 'dark', canVoid: canPriceEquipment(s, item),
    })),
  );
  const [server, setServer] = useState<PriceHistoryRecord[]>([]);
  const [status, setStatus] = useState<PriceHistoryStatus>(authToken ? 'loading' : 'offline');
  const [message, setMessage] = useState<string | undefined>();
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | undefined>();
  // Rows that left the pending queue while the view is open: held as they were until the server page confirms them.
  const [held, setHeld] = useState<PriceHistoryRecord[]>([]);
  const previousRows = useRef<PriceHistoryRecord[]>([]);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async (before: number | null) => {
    if (!authToken) {
      setStatus('offline');
      return;
    }
    if (before !== null) {
      setLoadingMore(true);
      setLoadMoreError(undefined);
    }
    const result = await SyncService.fetchPriceHistory(serverUrl, authToken, item.id, { limit: PAGE_SIZE, before });
    if (!mounted.current) return;
    setLoadingMore(false);
    if (result.status === 'unsupported') return setStatus('unsupported');
    if (result.status === 'error') {
      // A failed «Cargar más» keeps the loaded rows and the button, so the user can retry.
      if (before !== null) return setLoadMoreError(result.error || 'error de conexión');
      setMessage(result.error);
      return setStatus('error');
    }
    setServer((rows) => {
      const seen = new Set(rows.map((row) => row.id));
      return [...(before === null ? [] : rows), ...result.observations.filter((row) => before === null || !seen.has(row.id))];
    });
    setNextBefore(result.nextBefore);
    setMessage(undefined);
    setStatus('ready');
  }, [authToken, serverUrl, item.id]);

  useEffect(() => {
    void load(null);
  }, [load]);

  // Refetch the first page (older loaded pages stay) once queued rows of this equipment are acknowledged.
  const refresh = useCallback(async (settling: PriceHistoryRecord[]) => {
    const ids = new Set(settling.map((row) => row.id));
    const release = () => setHeld((rows) => rows.filter((row) => !ids.has(row.id)));
    if (!authToken) return release();
    const result = await SyncService.fetchPriceHistory(serverUrl, authToken, item.id, { limit: PAGE_SIZE, before: null });
    if (!mounted.current) return;
    if (result.status !== 'ok') return; // unconfirmed: the held rows keep saying «pendiente de sincronizar»
    setServer((rows) => applyFirstPage(rows, result.observations));
    release();
  }, [authToken, serverUrl, item.id]);

  const merged = active ? mergePriceHistory(server, { syncSettings, pricePending }, item.id) : [];
  const flaggedKey = merged.filter((row) => row.pendingSync || row.voidPending).map((row) => `${row.id}:${row.pendingSync ? 'p' : 'v'}`).join(',');
  useEffect(() => {
    const settling = settledRows(previousRows.current, merged);
    previousRows.current = merged.filter((row) => row.pendingSync || row.voidPending);
    if (!settling.length) return;
    setHeld((rows) => [...rows.filter((row) => !settling.some((s) => s.id === row.id)), ...settling]);
    void refresh(settling);
    // merged is derived from the keyed inputs; the key captures every change that matters here.
  }, [flaggedKey, refresh]);

  if (!active) return null;
  // Pending proposal records carry no server-resolved name yet: take it from the local proposal while it exists.
  const rows = holdSettled(merged, held).map((row) => {
    if (!row.pendingSync || !row.projectId) return row;
    const project = projects.find((p) => p.id === row.projectId && !p.isDeleted);
    return project ? { ...row, projectName: project.client.name, projectCode: project.client.projectId } : { ...row, projectName: null, projectCode: null };
  });
  const voidRow = async (row: PriceHistoryRecord) => {
    const current = effectiveGenericPrice(useSimulationStore.getState(), item.id)?.observationId === row.id;
    const confirmed = await confirmAction({
      title: 'Anular registro de precio',
      message: current
        ? `¿Anular el precio genérico vigente ${formatGenericUSD(row.priceUSD)}? Vuelve el anterior, si lo hay. Las propuestas existentes no cambian.`
        : `¿Anular el registro de ${formatGenericUSD(row.priceUSD)} del ${formatGenericDate(row.observedAt)}? Deja de contar en el historial; no se borra.`,
      confirmLabel: 'Anular',
      tone: current ? 'danger' : 'default',
    });
    if (confirmed) voidHistoryRecord(item.id, row.id, rows);
  };
  const currentId = effectiveGenericPrice({ syncSettings, genericPrices, pricePending }, item.id)?.observationId;
  return (
    <section aria-labelledby="price-history-title">
      <button type="button" className="offers-back" onClick={onBack}>
        <ArrowLeft size={15} />
        Volver a ofertas
      </button>
      <h3 id="price-history-title">Historial de precios</h3>
      <PriceHistoryContent
        rows={rows} currentId={currentId} status={status} message={message} hasMore={status === 'ready' && nextBefore !== null} loadingMore={loadingMore} loadMoreError={loadMoreError}
        canVoid={canVoid} onVoid={(row) => void voidRow(row)} onLoadMore={() => void load(nextBefore)} dark={dark}
      />
    </section>
  );
}
