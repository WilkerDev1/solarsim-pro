// Historial de precios de un equipo en la app (ADR 0006 §6): lo del servidor más lo pendiente del usuario actual.
// El historial nunca se guarda en el store; solo se fusiona al mostrarlo o al responder a un agente.
import { featureScope } from '../../../shared/applicationFeatures';
import type { GenericPriceInfo, PriceObservationKind, PriceObservationSource } from '../../../shared/equipmentPrices';
import type { PriceHistoryRecord } from '../../../shared/agentTools/priceHistory';
import { EMPTY_PRICE_QUEUE, effectiveGenericPrice, priceRecordingContext } from '../../store/slices/equipmentPriceSlice';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { SimulationStore } from '../../store/types';

export type { PriceHistoryRecord } from '../../../shared/agentTools/priceHistory';

export const PRICE_SOURCE_LABELS: Record<PriceObservationSource, string> = {
  supplier_offer: 'Oferta de proveedor',
  ai_scan: 'Importación con IA',
  proposal: 'Propuesta',
  manual: 'Manual',
  agent: 'Agente',
};
export const PRICE_KIND_LABELS: Record<PriceObservationKind, string> = {
  observation: 'Precio visto',
  generic: 'Precio genérico',
};

/**
 * Registros del servidor (más recientes primero) con lo pendiente del usuario actual en este espacio: los registros
 * en cola van primero (`pendingSync`) y una anulación en cola marca el registro (`voidPending`). Lo de otro usuario,
 * otro espacio u otro equipo nunca aparece.
 */
export function mergePriceHistory(
  server: readonly PriceHistoryRecord[],
  state: Pick<SimulationStore, 'syncSettings' | 'pricePending'>,
  equipmentId: string,
): PriceHistoryRecord[] {
  const user = state.syncSettings.currentUser;
  if (!user) return [...server];
  const scope = featureScope(state.syncSettings.serverUrl, user.organizationId);
  const owns = (entry: { scope: string; userId: string }) => entry.scope === scope && entry.userId === user.id;
  const queue = state.pricePending ?? EMPTY_PRICE_QUEUE;
  const voids = new Set(queue.voids.filter(owns).map((entry) => entry.id));
  const known = new Set(server.map((row) => row.id));
  const pending: PriceHistoryRecord[] = queue.observations
    .filter((entry) => owns(entry) && entry.equipmentId === equipmentId && !known.has(entry.id))
    .map(({ scope: _scope, userId: _user, ...entry }) => ({ ...entry, createdByName: user.name, pendingSync: true }))
    .reverse();
  return [...pending, ...server].map((row) => (voids.has(row.id) && !row.voidedAt ? { ...row, voidPending: true } : row));
}

/** Precio genérico que vuelve al anular `voidingId`: el `generic` del servidor no anulado con mayor `seq`. */
export function previousGenericPrice(rows: readonly PriceHistoryRecord[], voidingId: string): GenericPriceInfo | null {
  let best: PriceHistoryRecord | undefined;
  for (const row of rows)
    if (row.kind === 'generic' && row.id !== voidingId && !row.voidedAt && !row.voidPending && row.seq !== undefined && (!best || (best.seq as number) < row.seq)) best = row;
  return best ? { priceUSD: best.priceUSD, observedAt: best.observedAt, observationId: best.id } : null;
}

/**
 * Anula un registro desde el historial. Si era el genérico vigente del servidor, el anterior conocido pasa al mapa
 * local al momento (como hace la sincronización con un genérico recién creado): la cabecera muestra el precio que
 * vuelve, no «Sin precio genérico», hasta que la siguiente descarga lo confirme. Si el anterior no está en las páginas
 * cargadas, el mapa no se toca y la descarga lo trae.
 */
export function voidHistoryRecord(equipmentId: string, id: string, rows: readonly PriceHistoryRecord[]): boolean {
  const state = useSimulationStore.getState();
  if (!priceRecordingContext(state)) return false;
  const wasCurrent = effectiveGenericPrice(state, equipmentId)?.observationId === id;
  const serverCurrent = state.genericPrices[equipmentId]?.observationId === id;
  if (!state.voidPriceObservation(id)) return false;
  const previous = wasCurrent && serverCurrent ? previousGenericPrice(rows, id) : null;
  if (previous) useSimulationStore.setState((s) => ({ genericPrices: { ...s.genericPrices, [equipmentId]: previous } }));
  return true;
}

/**
 * Registros que salieron de la cola entre dos fusiones: un pendiente que ya no está como pendiente o una anulación en
 * cola que ya no lo está. La vista los mantiene como estaban (`holdSettled`) y vuelve a pedir la primera página: la
 * cola también suelta lo rechazado, así que solo el servidor dice si la anulación o el registro quedaron.
 */
export function settledRows(previous: readonly PriceHistoryRecord[], next: readonly PriceHistoryRecord[]): PriceHistoryRecord[] {
  const now = new Map(next.map((row) => [row.id, row]));
  return previous.filter((row) => {
    const current = now.get(row.id);
    if (row.pendingSync) return !current?.pendingSync;
    if (row.voidPending) return !current?.voidPending && !current?.voidedAt;
    return false;
  });
}

/** Mantiene lo que se está confirmando como estaba hasta que llegue la página del servidor. */
export function holdSettled(rows: readonly PriceHistoryRecord[], held: readonly PriceHistoryRecord[]): PriceHistoryRecord[] {
  if (!held.length) return [...rows];
  const present = new Set(rows.map((row) => row.id));
  const voiding = new Set(held.filter((row) => row.voidPending).map((row) => row.id));
  const restored = held.filter((row) => row.pendingSync && !present.has(row.id));
  return [...restored, ...rows].map((row) => (voiding.has(row.id) && !row.voidedAt && !row.voidPending ? { ...row, voidPending: true } : row));
}

/** Sustituye en la instantánea lo que trae una primera página nueva; las páginas más antiguas ya cargadas se quedan. */
export function applyFirstPage(snapshot: readonly PriceHistoryRecord[], page: readonly PriceHistoryRecord[]): PriceHistoryRecord[] {
  const fresh = new Set(page.map((row) => row.id));
  return [...page, ...snapshot.filter((row) => !fresh.has(row.id))];
}

/**
 * Genérico vigente entre filas fusionadas (más recientes primero): el primer `generic` pendiente vivo (el más reciente,
 * como `effectiveGenericPrice`) y, si no hay, el del servidor no anulado con mayor `seq`.
 */
export function currentHistoryGenericId(rows: readonly PriceHistoryRecord[]): string | undefined {
  const live = rows.filter((row) => row.kind === 'generic' && !row.voidedAt && !row.voidPending);
  const pending = live.find((row) => row.seq === undefined || row.seq === null);
  if (pending) return pending.id;
  let best: PriceHistoryRecord | undefined;
  for (const row of live) if (!best || (best.seq as number) < (row.seq as number)) best = row;
  return best?.id;
}
