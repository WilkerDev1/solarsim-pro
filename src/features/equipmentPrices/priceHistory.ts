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
